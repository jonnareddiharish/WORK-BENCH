# camunda-streamer Service

`apps/camunda-streamer/` — NestJS process running on **port 3001**.

## Purpose

`camunda-streamer` is the bridge between the browser and the Camunda workflow engine. It:

1. Receives a chat message from the UI
2. Creates a MongoDB session record
3. Starts a Camunda process instance
4. Holds an in-memory SSE connection open for the browser
5. Accepts event pushes from workers via an internal endpoint
6. Fans those events out to the waiting browser connection
7. Persists the final AI response and marks the session complete

It does **not** poll Camunda. It does **not** run AI logic. It is a pure event hub and persistence coordinator.

## Module structure

```
src/
├── main.ts                         Port 3001, CORS for http://localhost:4200
└── app/
    ├── app.module.ts               Imports: ConfigModule, MongoModule, CamundaModule, ChatModule, InternalModule
    ├── mongo/
    │   ├── mongo-client.provider.ts  MONGO_CLIENT + MONGO_DB NestJS provider tokens
    │   ├── mongo-chat.service.ts     Collection operations (native driver, no Mongoose)
    │   └── mongo.module.ts           Exports MongoDbProvider
    ├── camunda/
    │   ├── camunda.service.ts        startProcess() → POST Camunda REST API
    │   └── camunda.module.ts
    ├── chat/
    │   ├── chat.service.ts           In-memory SSE session bus
    │   ├── chat.controller.ts        POST /stream/:userId/chat  |  GET /stream/:sessionId/sse
    │   └── chat.module.ts
    └── internal/
        ├── internal.controller.ts    POST /internal/sessions/:sessionId/event
        └── internal.module.ts
```

## HTTP endpoints

### `POST /stream/:userId/chat`

Starts a new AI chat interaction. The browser calls this once and immediately gets back identifiers.

**Request body** (validated by Zod `StartChatBodySchema`):
```json
{
  "message": "I had a doctor visit today. Diagnosed with hypertension.",
  "inputType": "TEXT",
  "fileBase64": "<optional base64>",
  "fileMimeType": "<optional mime>"
}
```

`inputType` values: `TEXT | IMAGE | PDF | VOICE`

**Processing steps** (in order):
1. `mongoChatService.createSession(userId, inputType)` → inserts into `chatsessions` with `status: PENDING`
2. `mongoChatService.saveMessage(sessionId, userId, 'USER', message, sequence=1)` → inserts into `chatmessages`
3. `chatService.getOrCreate(sessionId)` → creates in-memory `Subject<WorkflowEvent>` with 10-min TTL
4. `camundaService.startProcess('health-ai-workflow', variables)` → calls Camunda REST; captures `processInstanceId`
5. `mongoChatService.updateSessionProcess(sessionId, processInstanceId)` → stores the engine's instance ID
6. `mongoChatService.setSessionStatus(sessionId, 'ACTIVE')`

**Response**:
```json
{ "sessionId": "6631abc...", "processInstanceId": "5c3d2e1..." }
```

If Camunda is not running, the Camunda call fails gracefully (logged as warning), `processInstanceId` is `null`, and the session is still created.

---

### `GET /stream/:sessionId/sse`

SSE endpoint. The browser calls this immediately after getting `sessionId` from the POST above.

- Returns `Content-Type: text/event-stream`
- Uses NestJS `@Sse()` decorator backed by an RxJS `Observable<MessageEvent>`
- The observable is sourced from the `Subject<WorkflowEvent>` in `ChatService`
- Each emitted `WorkflowEvent` becomes an SSE frame:
  ```
  event: step
  data: {"type":"step","label":"Fetching your health profile...","status":"processing"}

  event: token
  data: {"type":"token","content":"Based on your "}

  event: done
  data: {"type":"done","content":"Based on your profile...","intent":["HEALTH_REPORT"]}
  ```
- The stream closes when `ChatService.close()` is called (triggered by `done` or `error` events)

---

### `POST /internal/sessions/:sessionId/event`

Used exclusively by `agent-workers`. Workers call this endpoint to push events into the SSE stream.

**Authentication**: `x-internal-secret` header must match `INTERNAL_AUTH_HEADER` env var. Returns `401` if the secret is wrong or missing (when `INTERNAL_AUTH_HEADER` is set).

**Request body** (`WorkflowEventSchema` + optional `userId`):
```json
{
  "type": "step",
  "label": "Analyzing your health report...",
  "status": "processing"
}
```

**Type-specific side effects**:

| `type` | Side effect |
|---|---|
| `step` | Forwarded to SSE; no DB write |
| `token` | Forwarded to SSE; no DB write |
| `done` | Saves ASSISTANT message to `chatmessages`; sets session `COMPLETED`; closes SSE subject |
| `error` | Sets session `FAILED`; closes SSE subject |

**Returns**: `204 No Content`

## ChatService — SSE session bus

`chat.service.ts` manages the in-memory event bus:

```typescript
private readonly sessions = new Map<string, Subject<WorkflowEvent>>();
private readonly timers   = new Map<string, ReturnType<typeof setTimeout>>();
private readonly TTL_MS   = 10 * 60 * 1000; // 10 minutes
```

- `getOrCreate(sessionId)` — creates a new `Subject` if none exists; starts a 10-minute TTL timer; returns `Observable`
- `emit(sessionId, event)` — calls `subject.next(event)`; if the session is unknown (e.g. browser reconnected after streamer restart) the call is silently ignored
- `close(sessionId)` — calls `subject.complete()` (closes all SSE subscribers), removes entries from both maps, clears the TTL timer

The 10-minute TTL ensures memory is reclaimed even if a Camunda process hangs or the browser disconnects without triggering a `done`/`error`.

## CamundaService — process start

`camunda.service.ts` calls the Camunda 7 REST API to start a new process instance:

```
POST {CAMUNDA_URI}/process-definition/key/health-ai-workflow/start
```

All variables are serialised as `{ value, type }` pairs. String values use `type: 'String'`; numeric values use `type: 'Integer'`. This is required by the Camunda REST API.

Optional Basic Auth is constructed from `CAMUNDA_USERNAME`/`CAMUNDA_PASSWORD` env vars at startup.

## MongoChatService — collection operations

`mongo-chat.service.ts` — all operations use the raw MongoDB driver injected via `@Inject(MONGO_DB)`.

| Method | Collection | Operation |
|---|---|---|
| `createSession(userId, inputType)` | `chatsessions` | `insertOne` → returns `insertedId.toString()` |
| `updateSessionProcess(sessionId, processInstanceId)` | `chatsessions` | `updateOne $set processInstanceId` |
| `setSessionStatus(sessionId, status)` | `chatsessions` | `updateOne $set status` |
| `saveMessage(sessionId, userId, role, content, sequence, metadata?)` | `chatmessages` | `insertOne` |
| `getNextSequence(sessionId)` | `chatmessages` | `countDocuments` + 1 |

`sessionId` strings are converted to `ObjectId` for `_id` lookups:
```typescript
{ _id: new ObjectId(sessionId) }
```

## MongoDB provider pattern

```typescript
// MONGO_CLIENT: connects once at startup
export const MongoClientProvider: Provider = {
  provide: MONGO_CLIENT,
  useFactory: async (cfg: ConfigService): Promise<MongoClient> => {
    const uri = cfg.get<string>('MONGODB_URI', 'mongodb://localhost:27017/workbench');
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  },
  inject: [ConfigService],
};

// MONGO_DB: derives the Db handle from the connected client
export const MongoDbProvider: Provider = {
  provide: MONGO_DB,
  useFactory: (client: MongoClient): Db => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/workbench';
    const dbName = new URL(uri).pathname.slice(1) || 'workbench';
    return client.db(dbName);
  },
  inject: [MONGO_CLIENT],
};
```

Services receive `Db` directly via `@Inject(MONGO_DB)` and call `db.collection('name')` inline.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `MONGODB_URI` | `mongodb://localhost:27017/workbench` | MongoDB connection string |
| `CAMUNDA_URI` | `http://localhost:8080/engine-rest` | Camunda 7 REST engine base URL |
| `CAMUNDA_USERNAME` | — | Optional Basic Auth username |
| `CAMUNDA_PASSWORD` | — | Optional Basic Auth password |
| `API_BASE_URL` | `http://localhost:3000/api` | Backend API base (reserved for future use) |
| `INTERNAL_AUTH_HEADER` | — | Shared secret; must match `agent-workers` value |
