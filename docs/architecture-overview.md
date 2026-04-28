# Architecture Overview

## What this system is

The AI-powered Family Health Tracker uses **Camunda 7 as an external orchestration layer** instead of an in-process state machine. Every AI interaction is modelled as a BPMN process. Each step in that process is a Camunda external task picked up by a dedicated Node.js worker. A separate NestJS service (`camunda-streamer`) bridges Camunda events and worker output to the browser via Server-Sent Events (SSE).

## System components

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React UI — port 4200)                                 │
│  POST /stream/:userId/chat         GET /stream/:sessionId/sse   │
└───────────────┬──────────────────────────────┬──────────────────┘
                │ HTTP                         │ SSE (long-lived)
                ▼                              ▼
┌──────────────────────────────────────────────────────────────── ┐
│  camunda-streamer (NestJS — port 3001)                          │
│  · Creates MongoDB chat session                                 │
│  · Starts Camunda process instance (REST)                       │
│  · Holds in-memory SSE bus per sessionId                        │
│  · /internal/sessions/:id/event ← workers push here            │
└────────────┬──────────────────────────────────────────────────── ┘
             │ POST /process-definition/key/health-ai-workflow/start
             ▼
┌────────────────────────────────────────────────────────────────┐
│  Camunda 7 Engine (port 8080)                                   │
│  · Runs workflow-v2.bpmn                                        │
│  · XOR routing by `intent` variable                             │
│  · Manages retries / incidents                                  │
└──────────────┬─────────────────────────────────────────────────┘
               │ long-poll (external task protocol)
               ▼
┌────────────────────────────────────────────────────────────────┐
│  agent-workers (NestJS — no HTTP port, polls Camunda)           │
│  · 15 external task workers                                     │
│  · LlmService — multi-model LLM factory (LangChain)             │
│  · StreamerClientService — POSTs events back to streamer        │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTP
               ▼
┌────────────────────────────────────────────────────────────────┐
│  apps/api (NestJS — port 3000)                                  │
│  · Stores health events, diet logs, lifestyle records, users    │
│  · /api/chat-model  — read-only chat history endpoints          │
└──────────────┬─────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  MongoDB (port 27017)    │
│  · All operational data  │
│  · chatsessions          │
│  · chatmessages          │
└──────────────────────────┘
```

## Design decisions

### Camunda as orchestration — not LangGraph

The previous design used LangGraph as an in-process state machine inside `apps/api`. This meant:
- The API process had to wait for the full AI graph to complete before returning a response
- All workflow state was ephemeral — no external visibility, no retry mechanism

The new design makes **Camunda 7 the sole orchestration layer**. Each BPMN task becomes a Camunda external task. Workers are single-purpose functions — they do one thing and call `taskService.complete()`. No LangGraph is used in the new workers; adding another state machine inside Camunda tasks would be redundant.

**LangChain is used** for:
- Multi-model LLM factory (`ChatAnthropic`, `ChatOpenAI`, `ChatGroq`, `ChatGoogleGenerativeAI`)
- Message types (`HumanMessage`, `SystemMessage`)
- Token streaming (`llm.stream()` async iterator in `start-ai-suggestions.worker.ts`)
- File extraction (image-to-text via LLM vision in `classify-content.worker.ts`)

### MongoDB native driver — no Mongoose in new code

The `apps/api` backend continues to use Mongoose for its existing domain models. All **new code** (`apps/camunda-streamer`, `apps/api/chat-model`) uses the raw `mongodb` driver:

```
Provider pattern:
  MongoClientProvider  → MongoClient (connects once, shared)
  MongoDbProvider      → Db (derived from MongoClient)
  Services inject Db   → call db.collection('name').insertOne(...)
```

Zod validates document shapes at HTTP boundaries before writes. There are no Mongoose schemas, decorators, or `@Schema()` annotations in the new modules.

### SSE over WebSockets

SSE (Server-Sent Events) is used rather than WebSockets because:
- The communication is strictly server → client (workers push tokens/steps to the browser)
- SSE works natively in browsers with `EventSource` and NestJS's `@Sse()` decorator
- No bidirectional messaging is needed after the initial `POST /stream/:userId/chat`

### Internal secret authentication

Workers post events to `camunda-streamer`'s `/internal/*` endpoints. These endpoints are protected by a shared secret (`INTERNAL_AUTH_HEADER` env var) validated via the `x-internal-secret` request header. This prevents external callers from injecting fake events into SSE streams.

## Shared libraries

### `@work-bench/camunda-worker`

Infrastructure for Camunda 7 external task workers:

- `CamundaWorker` — abstract base class; subclasses implement `run()`; `handler()` wraps `run()` with retry and incident logging
- `@Worker('key')` — decorator that reads `CAMUNDA_TOPICS_CONFIG` at class-load time and stamps `topic`, `options`, and retry config onto the instance (fails fast at boot if key is missing)
- `CAMUNDA_TOPICS_CONFIG` — central registry of all 15 worker topics with lock durations and retry counts
- `CamundaClientProvider` — NestJS provider that creates the `camunda-external-task-client-js` client from env vars
- `CamundaWorkersStartupService` — subscribes all workers at bootstrap, unsubscribes on shutdown

### `@work-bench/types`

Zod-based shared type library. The `chat` domain added for this architecture:

```typescript
WorkflowEventSchema   // type, label, content, status, intent, error
ChatSessionSchema     // userId, status, processInstanceId, processDefinitionKey
ChatMessageSchema     // sessionId, userId, role, content, sequence, metadata
```

## Process variable map

Every Camunda process variable is a plain string (Camunda serializes as `type: 'String'`). JSON-encoded objects are stringified before being set as variables and parsed by each worker.

| Variable | Set by | Read by |
|---|---|---|
| `sessionId` | camunda-streamer (process start) | all workers |
| `userId` | camunda-streamer (process start) | all workers |
| `userMessage` | camunda-streamer (process start) | classify, start-ai-suggestions |
| `inputType` | camunda-streamer (process start) | classify |
| `fileBase64` | camunda-streamer (optional) | classify |
| `fileMimeType` | camunda-streamer (optional) | classify |
| `userDetailsJson` | GetUserDetailsWorker | start-ai-suggestions |
| `processedContent` | ClassifyContentWorker | extraction workers, start-ai-suggestions |
| `intent` | ClassifyContentWorker | Camunda XOR gateway condition |
| `extractedHealthDataJson` | HealthReportExtractionWorker | all save-health-* workers, start-ai-suggestions |
| `analyzedDietJson` | AnalyzeDietContentWorker | SaveDietContentWorker, start-ai-suggestions |
| `analyzedLifestyleJson` | AnalyzeLifestyleWorker | SaveLifestyleWorker, start-ai-suggestions |
