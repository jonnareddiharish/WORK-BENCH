# Architecture Documentation

Complete documentation for the AI-powered Family Health Tracker — Camunda-orchestrated architecture.

## Contents

| Document | Description |
|---|---|
| [Architecture Overview](./architecture-overview.md) | System components, communication patterns, and design decisions |
| [Workflow Orchestration](./workflow-orchestration.md) | BPMN process, Camunda 7 routing, and process variables |
| [camunda-streamer Service](./camunda-streamer.md) | SSE hub, session lifecycle, and internal event API |
| [Agent Workers](./agent-workers.md) | All 15 external task workers and shared services |
| [Data Layer](./data-layer.md) | MongoDB native driver, collections, and chat-model read API |
| [Setup and Running](./setup-and-running.md) | Environment setup, service startup, and end-to-end verification |
| [Shared Logger](./logger-import.md) | `AppLoggerModule` from `@work-bench/commons` — how to use pino across all apps |

## Quick orientation

```
Browser → POST /stream/:userId/chat → camunda-streamer (port 3001)
       ← { sessionId, processInstanceId }

Browser → GET /stream/:sessionId/sse → SSE stream (stays open)

Camunda Engine → polls → agent-workers (15 workers)
agent-workers  → POST /internal/sessions/:sessionId/event → camunda-streamer
camunda-streamer → fans out → SSE stream → Browser

MongoDB (native driver, no Mongoose) ← writes by camunda-streamer
apps/api/chat-model                  → reads by chat history API (port 3000)
```
