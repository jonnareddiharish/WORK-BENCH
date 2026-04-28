# Data Layer

## MongoDB usage in this architecture

The system has two distinct MongoDB connection patterns:

| Module | Driver | Connection tokens | Purpose |
|---|---|---|---|
| `apps/api` (existing modules) | Mongoose | Mongoose connection | Users, health events, diet logs, lifestyle, recipes, etc. |
| `apps/camunda-streamer` | Native `mongodb` driver | `MONGO_CLIENT` / `MONGO_DB` | Chat sessions and messages (write path) |
| `apps/api/chat-model` | Native `mongodb` driver | `CHAT_MONGO_CLIENT` / `CHAT_MONGO_DB` | Chat history (read path) |

New code never touches the Mongoose connection. Existing code never touches the native driver collections.

## Collections introduced by this architecture

### `chatsessions`

Tracks the lifecycle of a single AI chat interaction from message submission to completion.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Session identifier (returned as `sessionId` to clients) |
| `userId` | string | The user who sent the message |
| `inputType` | string | `TEXT \| IMAGE \| PDF \| VOICE` |
| `status` | string | `PENDING → ACTIVE → COMPLETED \| FAILED` |
| `processDefinitionKey` | string | Always `health-ai-workflow` |
| `processInstanceId` | string \| null | Camunda process instance ID (set after process starts) |
| `createdAt` | Date | |
| `updatedAt` | Date | Updated on every status change |

**Status transitions**:
```
PENDING  → created by POST /stream/:userId/chat (before Camunda starts)
ACTIVE   → set after Camunda process starts successfully
COMPLETED → set when 'done' event received via internal endpoint
FAILED   → set when 'error' event received via internal endpoint
```

### `chatmessages`

Stores individual messages within a session. Sequence numbers preserve ordering.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `sessionId` | ObjectId | References `chatsessions._id` |
| `userId` | string | |
| `role` | string | `USER \| ASSISTANT \| WORKER_STEP` |
| `content` | string | Message text |
| `sequence` | number | 1-based ordering within the session |
| `metadata` | object? | Optional; ASSISTANT messages include `{ intent: string[] }` |
| `createdAt` | Date | |

**When messages are written**:
- `role: USER`, `sequence: 1` — written immediately by `POST /stream/:userId/chat` before the Camunda process starts
- `role: ASSISTANT`, `sequence: N` — written by `InternalController` when a `done` event arrives; sequence is `countDocuments + 1`

## Native driver provider pattern

Both new modules use the same pattern with distinct injection tokens to avoid DI collisions:

```typescript
// camunda-streamer uses: MONGO_CLIENT, MONGO_DB
// apps/api/chat-model uses: CHAT_MONGO_CLIENT, CHAT_MONGO_DB

export const MongoClientProvider: Provider = {
  provide: MONGO_CLIENT,          // or CHAT_MONGO_CLIENT
  useFactory: async (cfg: ConfigService): Promise<MongoClient> => {
    const uri = cfg.get<string>('MONGODB_URI', 'mongodb://localhost:27017/workbench');
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  },
  inject: [ConfigService],
};

export const MongoDbProvider: Provider = {
  provide: MONGO_DB,              // or CHAT_MONGO_DB
  useFactory: (client: MongoClient): Db => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/workbench';
    const dbName = new URL(uri).pathname.slice(1) || 'workbench';
    return client.db(dbName);
  },
  inject: [MONGO_CLIENT],         // or CHAT_MONGO_CLIENT
};
```

Services receive `Db` via `@Inject(MONGO_DB)` and call collection methods directly:

```typescript
@Injectable()
export class MongoChatService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async createSession(userId: string, inputType: string): Promise<string> {
    const result = await this.db.collection('chatsessions').insertOne({
      userId, inputType, status: 'PENDING',
      processDefinitionKey: 'health-ai-workflow',
      processInstanceId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    return result.insertedId.toString();
  }
}
```

No Mongoose schemas, no `@Schema()` decorators, no `Model` injection. Zod validates shape at HTTP boundaries before writes; the database itself has no schema enforcement.

## Chat history read API (`apps/api/chat-model`)

A read-only NestJS module in `apps/api` that exposes chat history from the same MongoDB collections that `camunda-streamer` writes. It uses its own separate `MongoClient` (`CHAT_MONGO_CLIENT` token) to avoid any interaction with the Mongoose connection.

### Module structure

```
apps/api/src/app/chat-model/
├── mongo-client.provider.ts    CHAT_MONGO_CLIENT + CHAT_MONGO_DB providers
├── chat-model.service.ts       getSessions, getSession, getMessages — all read-only
├── chat-model.controller.ts    GET /api/chat-model endpoints
└── chat-model.module.ts        imports ConfigModule, exports controller/service
```

### Endpoints

All under `/api/chat-model` (served by `apps/api` on port 3000).

#### `GET /api/chat-model/:userId/sessions`

Returns all sessions for a user, sorted by `createdAt` descending (most recent first).

```json
[
  {
    "_id": "6631abc...",
    "userId": "user123",
    "inputType": "TEXT",
    "status": "COMPLETED",
    "processDefinitionKey": "health-ai-workflow",
    "processInstanceId": "5c3d2e1...",
    "createdAt": "2026-04-28T10:30:00.000Z",
    "updatedAt": "2026-04-28T10:31:45.000Z"
  }
]
```

#### `GET /api/chat-model/:userId/sessions/:sessionId`

Returns a single session document.

#### `GET /api/chat-model/:userId/sessions/:sessionId/messages`

Returns all messages for a session, sorted by `sequence` ascending.

```json
[
  { "role": "USER", "content": "I visited the doctor...", "sequence": 1, "createdAt": "..." },
  { "role": "ASSISTANT", "content": "Based on your report...", "sequence": 2,
    "metadata": { "intent": ["HEALTH_REPORT"] }, "createdAt": "..." }
]
```

## Zod types for chat domain

Defined in `libs/types/src/lib/chat/index.ts`, exported from `@work-bench/types`:

```typescript
// Session status lifecycle
ChatSessionStatusSchema = z.enum(['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED'])

// Message author
ChatMessageRoleSchema = z.enum(['USER', 'ASSISTANT', 'WORKER_STEP'])

// SSE event types
WorkflowEventTypeSchema = z.enum(['step', 'token', 'done', 'error'])

// Full event shape (validated at /internal endpoint boundary)
WorkflowEventSchema = z.object({
  type:    WorkflowEventTypeSchema,
  label:   z.string().optional(),    // used by 'step'
  content: z.string().optional(),    // used by 'token' and 'done'
  status:  z.enum(['processing', 'done', 'failed']).optional(),  // used by 'step'
  intent:  z.array(z.string()).optional(),  // used by 'done'
  error:   z.string().optional(),    // used by 'error'
})
```

## Relationship to AIPatientContext

The existing `apps/api` backend maintains an `AIPatientContext` collection — a denormalized, per-user snapshot used to build LLM prompts in the existing `agent` module. This collection is **not** used or modified by the new Camunda workflow workers. Workers that need user context call `GET /api/users/:userId` directly and receive the `User` document.
