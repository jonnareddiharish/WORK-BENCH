# Setup and Running

## Prerequisites

- Node.js 22+, npm 10+
- MongoDB 6+ running locally on port 27017
- Camunda 7 (for full workflow execution — optional for development without AI)
- At least one LLM API key (Anthropic, OpenAI, Groq, or Google)

## 1. Install dependencies

```bash
npm install
```

## 2. Environment files

Copy the examples and fill in real values:

```bash
cp apps/api/.env.example            apps/api/.env
cp apps/agent-workers/.env.example  apps/agent-workers/.env
cp apps/camunda-streamer/.env.example apps/camunda-streamer/.env
```

### `apps/api/.env`

```env
MONGODB_URI=mongodb://localhost:27017/workbench
ANTHROPIC_API_KEY=sk-ant-...
# Optional
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### `apps/agent-workers/.env`

```env
CAMUNDA_URI=http://localhost:8080/engine-rest
CAMUNDA_USERNAME=demo
CAMUNDA_PASSWORD=demo

CAMUNDA_STREAMER_URL=http://localhost:3001
INTERNAL_AUTH_HEADER=change-me-secret

API_BASE_URL=http://localhost:3000/api

# At least one required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=...
```

### `apps/camunda-streamer/.env`

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/workbench
CAMUNDA_URI=http://localhost:8080/engine-rest
CAMUNDA_USERNAME=demo
CAMUNDA_PASSWORD=demo
API_BASE_URL=http://localhost:3000/api
INTERNAL_AUTH_HEADER=change-me-secret
```

`INTERNAL_AUTH_HEADER` must be the same string in both `agent-workers` and `camunda-streamer`.

## 3. Start Camunda 7

```bash
docker run -p 8080:8080 camunda/camunda-bpm-platform:latest
```

Wait for the engine to be ready:

```bash
curl http://localhost:8080/engine-rest/engine
# → [{"name":"default"}]
```

## 4. Deploy the BPMN

```bash
curl -X POST http://localhost:8080/engine-rest/deployment/create \
  -F "deployment-name=health-ai-workflow" \
  -F "deploy-changed-only=true" \
  -F "data=@workflow-v2.bpmn"
```

Verify deployment:

```bash
curl http://localhost:8080/engine-rest/process-definition?key=health-ai-workflow
```

## 5. Start all services

Open four terminals:

```bash
# Terminal 1 — NestJS API (port 3000)
npm run start:api

# Terminal 2 — SSE streamer (port 3001)
npm run start:streamer

# Terminal 3 — Camunda external task workers
npm run start:workers

# Terminal 4 — React UI (port 4200)
npm run start:ui
```

Or start API + UI together:

```bash
npm run dev            # API + UI
npm run start:streamer # in separate terminal
npm run start:workers  # in separate terminal
```

## 6. Verify the SSE pipeline (without Camunda)

You can test `camunda-streamer` independently without a running Camunda engine:

```bash
# 1. Start a chat session
curl -X POST http://localhost:3001/stream/FAKE_USER_ID/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test message","inputType":"TEXT"}'
# → { "sessionId": "6631abc...", "processInstanceId": null }

# 2. Open SSE stream in another terminal (stays open)
curl -N http://localhost:3001/stream/6631abc.../sse

# 3. Push events manually
curl -X POST http://localhost:3001/internal/sessions/6631abc.../event \
  -H "x-internal-secret: change-me-secret" \
  -H "Content-Type: application/json" \
  -d '{"type":"step","label":"Fetching profile...","status":"processing"}'

curl -X POST http://localhost:3001/internal/sessions/6631abc.../event \
  -H "x-internal-secret: change-me-secret" \
  -H "Content-Type: application/json" \
  -d '{"type":"token","content":"Hello, "}'

curl -X POST http://localhost:3001/internal/sessions/6631abc.../event \
  -H "x-internal-secret: change-me-secret" \
  -H "Content-Type: application/json" \
  -d '{"type":"done","content":"Hello, this is a test.","intent":["TEST"],"userId":"FAKE_USER_ID"}'

# → SSE stream in terminal 2 prints each event and then closes on 'done'
```

## 7. Full end-to-end test

With all services running and the BPMN deployed:

```bash
# Send a health report message
curl -X POST http://localhost:3001/stream/USER_OBJECT_ID/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I visited Dr. Smith today. Diagnosed with hypertension. Prescribed Amlodipine 5mg once daily.",
    "inputType": "TEXT"
  }'
# → { "sessionId": "...", "processInstanceId": "..." }

# Watch the SSE stream
curl -N http://localhost:3001/stream/SESSION_ID/sse
```

Expected SSE output (each on its own frame):
```
event: step
data: {"type":"step","label":"Fetching your health profile...","status":"processing"}

event: step
data: {"type":"step","label":"Fetching your health profile...","status":"done"}

event: step
data: {"type":"step","label":"Understanding your message...","status":"processing"}

event: step
data: {"type":"step","label":"Understanding your message...","status":"done"}

event: step
data: {"type":"step","label":"Analyzing your health report...","status":"processing"}

event: step
data: {"type":"step","label":"Analyzing your health report...","status":"done"}

event: step
data: {"type":"step","label":"Saving your health record...","status":"processing"}

... (parallel save steps) ...

event: step
data: {"type":"step","label":"Generating AI response...","status":"processing"}

event: token
data: {"type":"token","content":"Based on "}

event: token
data: {"type":"token","content":"your "}

... (many token frames) ...

event: done
data: {"type":"done","content":"Based on your report...","intent":["HEALTH_REPORT"]}
```

## 8. Verify MongoDB

```bash
# Connect with mongosh or Compass and check:

# Sessions collection
db.chatsessions.findOne({})
# → { _id, userId, status: "COMPLETED", processInstanceId: "...", ... }

# Messages collection
db.chatmessages.find({}).sort({ sequence: 1 })
# → [{ role: "USER", sequence: 1 }, { role: "ASSISTANT", sequence: 2, metadata: { intent: [...] } }]
```

## 9. Check Camunda Cockpit

Open `http://localhost:8080/camunda` (username: `demo`, password: `demo`).

- **Processes** → `health-ai-workflow` → should show completed instances
- **Incidents** → if any worker failed permanently, incidents appear here with the error stack trace

## Troubleshooting

### "Worker configuration not found for key: X"

The `@Worker('X')` decorator could not find `X` in `CAMUNDA_TOPICS_CONFIG`. Add the entry to `libs/camunda-worker/src/lib/camunda-topics.config.ts` before adding the worker class.

### SSE connection closes immediately

The session's `Subject` may have been completed already (TTL expired or a previous `done`/`error` event). Check that you're using the correct `sessionId` and that you open the SSE connection **before** the workflow completes.

### "Invalid internal secret" (401)

`INTERNAL_AUTH_HEADER` in `agent-workers/.env` and `camunda-streamer/.env` do not match. They must be identical strings.

### Camunda process fails to start (processInstanceId is null)

Check `camunda-streamer` logs for the warning: `Camunda process start failed (continuing without it)`. Common causes:
- Camunda engine not running
- `health-ai-workflow` process not deployed
- Wrong `CAMUNDA_URI` or credentials

### Workers poll but never pick up tasks

Check that:
1. `CAMUNDA_URI` is correct and reachable from the workers process
2. The BPMN is deployed to the right engine
3. The topic names in `CAMUNDA_TOPICS_CONFIG` match the ones in `workflow-v2.bpmn`

## Adding a new worker

1. Add an entry to `libs/camunda-worker/src/lib/camunda-topics.config.ts`:
   ```typescript
   myNewWorker: {
     topic: 'topic.health.my-new-task',
     description: 'What this worker does',
     enabled: true,
     options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
   },
   ```

2. Create the worker class in `apps/agent-workers/src/app/workers/my-new.worker.ts`:
   ```typescript
   @Injectable()
   @Worker('myNewWorker')
   export class MyNewWorker extends CamundaWorker {
     constructor(
       protected readonly logger: Logger,
       private readonly streamer: StreamerClientService,
     ) { super(); }

     async run({ task, taskService }: HandlerArgs): Promise<void> {
       const sessionId = task.variables.get('sessionId') as string;
       await this.streamer.pushStep(sessionId, 'Doing the thing...', 'processing');
       // ... logic ...
       await this.streamer.pushStep(sessionId, 'Doing the thing...', 'done');
       await taskService.complete(task, { outputVar: value });
     }
   }
   ```

3. Register in `apps/agent-workers/src/app/app.module.ts` — add to `providers` list and to the `CAMUNDA_WORKERS_TOKEN` factory.

4. Add the corresponding service task to `workflow-v2.bpmn` with `camunda:type="external"` and `camunda:topic="topic.health.my-new-task"`, then redeploy the BPMN to Camunda.
