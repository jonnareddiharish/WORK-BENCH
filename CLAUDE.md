# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered Family Health Tracker. Families can track individual members' health events, diet logs, lifestyle habits, and receive AI-driven meal plans and health insights. Uses an "AI-First Database Architecture" where a materialized `AIPatientContext` collection keeps a denormalized per-user context document ready to feed directly into LLM prompts.

## Tech Stack

- **Frontend**: React 19 + TypeScript, TailwindCSS v4, React Router 6, Framer Motion, Lucide React, React Force Graph 2D
- **Backend**: NestJS 11, MongoDB 9.5 + Mongoose, Neo4j 6 + neo4j-driver, LangChain + LangGraph, Claude Sonnet 4.6 (chat/synthesis), HuggingFace `all-MiniLM-L6-v2` (local embeddings, no API key required)
- **Workers**: NestJS 11, `camunda-external-task-client-js` 3.x (Camunda 7 external task protocol)
- **Shared libs**: Zod 4 (schema-first types in `@work-bench/types`), Camunda worker infrastructure (`@work-bench/camunda-worker`)
- **Monorepo**: NX 22.6.5 with Webpack, Biome (lint/format), Jest, Playwright (E2E)
- **Runtime**: Node.js 22+, npm 10+

## Commands

```bash
npm install                # Install all dependencies

# Development
npm run dev                # Start both API (port 3000) and UI (port 4200)
npm run start:api          # NestJS API only (port 3000)
npm run start:ui           # React UI only (port 4200)
npm run start:workers      # Camunda agent-workers only
npm run start:streamer     # Camunda SSE streamer only (port 3001)

# Build
npm run build:all          # Production build for API + UI
npm run build:workers      # Production build for agent-workers
npm run build:streamer     # Production build for camunda-streamer

# Test
npm run test:all           # Run all Jest tests
npx nx test api --testFile=path/to/spec.ts
npx nx test ui --testFile=path/to/spec.tsx

# Lint & Format
npm run lint               # Biome lint check
npm run format             # Biome auto-format
```

**Environment — API** (`apps/api/.env`, copy from `apps/api/.env.example`):
- `MONGODB_URI` (default: `mongodb://localhost:27017/workbench`)
- `ANTHROPIC_API_KEY` (Claude Sonnet — agent chat, synthesis, vision for image uploads)
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` (optional, for graph features)

**Environment — agent-workers** (`apps/agent-workers/.env`, copy from `apps/agent-workers/.env.example`):
- `CAMUNDA_URI` (Camunda 7 REST engine, e.g. `http://localhost:8080/engine-rest`)
- `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` (optional Basic Auth)
- `CAMUNDA_APP_WORKER_ID` (optional; auto-generated as `app-<random>` if unset)
- `CAMUNDA_STREAMER_URL` (default: `http://localhost:3001`) — where workers POST SSE events
- `INTERNAL_AUTH_HEADER` — shared secret for `x-internal-secret` header; must match `camunda-streamer` value
- `API_BASE_URL` (default: `http://localhost:3000/api`) — backend API used by save-* workers
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `GOOGLE_API_KEY` (at least one required)

**Environment — camunda-streamer** (`apps/camunda-streamer/.env`, copy from `apps/camunda-streamer/.env.example`):
- `PORT` (default: `3001`)
- `MONGODB_URI` (default: `mongodb://localhost:27017/workbench`) — native driver, no Mongoose
- `CAMUNDA_URI` (Camunda 7 REST engine) — used to start process instances
- `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` (optional Basic Auth)
- `API_BASE_URL` (default: `http://localhost:3000/api`)
- `INTERNAL_AUTH_HEADER` — shared secret validated on `/internal/*` endpoints

---

## Architecture

### Monorepo layout

```
work-bench/
├── apps/
│   ├── api/               # NestJS backend (port 3000)
│   ├── ui/                # React frontend (port 4200)
│   ├── agent-workers/     # NestJS Camunda external task workers
│   ├── camunda-streamer/  # NestJS SSE hub + Camunda bridge (port 3001)
│   └── ui-e2e/            # Playwright E2E tests
├── libs/
│   ├── camunda-worker/    # @work-bench/camunda-worker — worker base class, @Worker decorator, client provider
│   └── types/             # @work-bench/types — Zod-based shared TypeScript schemas and types
├── biome.json             # Lint + format (100-char lines, 2-space indent, single quotes)
├── workflow.bpmn          # Original Camunda BPMN process
├── workflow-v2.bpmn       # Updated BPMN — all tasks converted to Camunda external tasks
└── nx.json                # NX workspace config
```

**Path aliases** (defined in `tsconfig.base.json`):

| Alias | Resolves to |
|---|---|
| `@work-bench/camunda-worker` | `libs/camunda-worker/src/index.ts` |
| `@work-bench/types` | `libs/types/src/index.ts` |

### Backend (`apps/api/src/`)

NestJS modules, one per domain:

| Module | Role |
|--------|------|
| `users` | CRUD + stores medical conditions, allergies, medications |
| `health-events` | Polymorphic health records (DOCTOR_VISIT, DIAGNOSIS, TREATMENT, MEDICATION, LAB_TEST, SYMPTOM) |
| `diet-logs` | Meal tracking (BREAKFAST/LUNCH/DINNER/SNACK/CRAVINGS/PILLS/MEDICATION/SUGGESTIONS) + water intake |
| `lifestyle` | Sleep, exercise, stress logging |
| `meal-plans` | AI-generated meal plans, delegates to agent |
| `recipes` | Recipe storage with multilingual (Telugu/Tamil) ingredient labels |
| `agent` | LangGraph multi-step AI orchestration — chat, report parsing, meal generation |
| `neo4j` | Graph DB connection; family trees, disease-symptom maps, ingredient embeddings |

**AI-First pattern**: every write to users/health-events/diet-logs/lifestyle also updates `AIPatientContext` (a denormalized materialized view per user). The `agent` module reads this single document to build LLM prompts without multi-collection joins.

### Key API routes

```
POST   /api/users                              Create user
GET    /api/users                              List all users
GET    /api/users/graph                        Family graph data (Neo4j)
GET    /api/users/:id/health-events            Health event history
POST   /api/users/:id/health-events            Create health event
DELETE /api/users/:id/health-events/:evId      Delete health event
POST   /api/users/:id/diet-logs                Log meal/medication card
DELETE /api/users/:id/diet-logs/:logId         Delete diet log
POST   /api/users/:id/lifestyle                Log lifestyle record
DELETE /api/users/:id/lifestyle/:recId         Delete lifestyle record
POST   /api/users/:id/reminders                Create reminder
PATCH  /api/users/:id/reminders/:remId/dismiss Dismiss reminder
GET    /api/users/:id/reminders                List reminders
POST   /api/users/:userId/meal-plans/generate  AI meal plan generation
POST   /api/agent/:userId/chat/stream          SSE streaming chat with AI agent
POST   /api/agent/:userId/chat-with-file       Chat with attached image/PDF
POST   /api/users/link                         Link two users (family graph edge)
POST   /api/users/:id/health-events/reanalyze  Re-run AI analysis on a health event group
POST   /api/users/:id/diet-logs/reanalyze      Re-run AI analysis on a diet log
POST   /api/users/:id/lifestyle/reanalyze      Re-run AI analysis on a lifestyle record
```

### Database design

- **MongoDB**: normalized operational collections (`User`, `HealthEvent`, `DietLog`, `Lifestyle`, `MealPlan`, `Recipe`, `AIPatientContext`, `Reminder`)
- **Neo4j**: relationships (family tree edges), disease→symptom graph, ingredient→health-property graph, vector similarity search
- **AIPatientContext**: denormalized snapshot (demographics + active conditions + medications + recent diet + recent visits) — the single source of truth for LLM context; kept current via service-layer triggers

---

## Shared libraries

### `@work-bench/camunda-worker` (`libs/camunda-worker/`)

Infrastructure for building Camunda 7 external task workers. Full documentation in `libs/camunda-worker/README.md`.

| File | Purpose |
|---|---|
| `src/lib/camunda-worker.ts` | Abstract `CamundaWorker` base class + all interfaces (`CamundaTask`, `HandlerArgs`, `SubscribeOptions`, …) |
| `src/lib/worker.decorator.ts` | `@Worker('key')` class decorator — reads `CAMUNDA_TOPICS_CONFIG` and stamps `topic`, `options`, retry config onto the instance |
| `src/lib/camunda-topics.config.ts` | Central topic registry (`CAMUNDA_TOPICS_CONFIG`) + helpers: `getWorkerConfig`, `getTopicName`, `getEnabledWorkers`, `validateWorkerConfigurations` |
| `src/lib/camunda-client.provider.ts` | `CamundaClientProvider` NestJS provider — creates the `camunda-external-task-client-js` `Client` from env vars |
| `src/lib/camunda-workers-startup.service.ts` | `CamundaWorkersStartupService` — subscribes all workers at bootstrap, unsubscribes + stops on shutdown |

**`@Worker` decorator** — apply directly below `@Injectable()`:

```ts
@Injectable()
@Worker('myTopicKey')        // key must exist in CAMUNDA_TOPICS_CONFIG.workers
export class MyWorker extends CamundaWorker {
  constructor(protected readonly logger: Logger) { super(); }
  async run({ task, taskService }: HandlerArgs): Promise<void> { ... }
}
```

The decorator resolves config at class-load time (fails fast at boot if key is missing), wraps the constructor to stamp `topic`/`options`/retry fields, and preserves all NestJS DI reflection metadata.

**Retry resolution priority** (inside `CamundaWorker.handler`):
1. `task.retries` — set by the engine on subsequent retries (`task.retries - 1`)
2. `retryCount` Camunda process variable — per-instance override
3. `CAMUNDA_TOPICS_CONFIG` entry's `options.maxRetryCount` — config default

**Adding a new worker topic**:
1. Add an entry to `CAMUNDA_TOPICS_CONFIG.workers` in `libs/camunda-worker/src/lib/camunda-topics.config.ts`
2. Create the worker class in `apps/agent-workers/src/app/workers/`
3. Register it in `apps/agent-workers/src/app/app.module.ts`

---

### `@work-bench/types` (`libs/types/`)

Zod-based shared type library. All new cross-app TypeScript types go here — never as plain interfaces. Each schema file exports both the Zod schema object and its inferred TypeScript type.

```
libs/types/src/
├── lib/
│   ├── common/    # Primitives: MongoId, IsoDate, PaginationQuery, ApiError, ApiSuccessSchema(...)
│   ├── health/    # Health domain types (add here as features are built)
│   └── agent/     # Agent/AI domain types (add here as features are built)
└── index.ts       # Public barrel
```

**Pattern for every new type**:

```ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: MongoIdSchema,
  name: z.string().min(1),
});
export type User = z.infer<typeof UserSchema>;
```

**Currently exported from `common/`**:

| Export | Description |
|---|---|
| `MongoIdSchema` / `MongoId` | 24-char hex string validated as a MongoDB ObjectId |
| `IsoDateSchema` / `IsoDate` | ISO-8601 datetime string with timezone offset |
| `PositiveIntSchema` | Integer > 0 |
| `NonEmptyStringSchema` | String with `min(1)` |
| `PaginationQuerySchema` / `PaginationQuery` | `{ page, limit }` with coercion and defaults |
| `PaginationMetaSchema` / `PaginationMeta` | `{ page, limit, total, totalPages }` |
| `ApiSuccessSchema(dataSchema)` | Generic success envelope factory |
| `ApiErrorSchema` / `ApiError` | `{ success: false, error: { code, message, details? } }` |

To add a new domain type: add it to the right domain folder, re-export from that folder's `index.ts`, then uncomment the domain line in `libs/types/src/index.ts`.

---

## agent-workers (`apps/agent-workers/`)

Standalone NestJS process that polls a Camunda 7 engine and processes external service tasks.

```
apps/agent-workers/src/
├── main.ts                          # Bootstrap — NestFactory.create + app.init()
└── app/
    ├── app.module.ts                # Imports ConfigModule; registers client, workers, CamundaWorkersStartupService
    └── workers/
        ├── health-summary.worker.ts        # @Worker('healthSummaryAnalysis')
        └── meal-plan-generation.worker.ts  # @Worker('mealPlanGeneration')
```

**Registered topics** (in `CAMUNDA_TOPICS_CONFIG`):

| Worker key | Topic | Lock duration |
|---|---|---|
| `healthSummaryAnalysis` | `topic.agent.health-summary-analysis` | 30 s |
| `mealPlanGeneration` | `topic.agent.meal-plan-generation` | 60 s |
| `getUserDetails` | `topic.health.get-user-details` | 10 s |
| `classifyContent` | `topic.health.classify-content` | 30 s |
| `extractHealthReport` | `topic.health.report.extract` | 60 s |
| `saveHealthEvent` | `topic.health.report.save-health-event` | 15 s |
| `saveMedicationsDiet` | `topic.health.report.save-medications-diet` | 15 s |
| `saveHealthLifestyle` | `topic.health.report.save-lifestyle` | 15 s |
| `saveTestResults` | `topic.health.report.save-test-results` | 15 s |
| `analyzeDietContent` | `topic.health.diet.analyze` | 30 s |
| `saveDietContent` | `topic.health.diet.save` | 15 s |
| `analyzeLifestyle` | `topic.health.lifestyle.analyze` | 30 s |
| `saveLifestyle` | `topic.health.lifestyle.save` | 15 s |
| `saveForReview` | `topic.health.others.save` | 10 s |
| `startAiSuggestions` | `start-ai-suggestor-topic` | 90 s |

Shared services in `apps/agent-workers/src/app/services/`:
- `LlmService` — multi-model LLM factory (`ChatAnthropic`, `ChatOpenAI`, `ChatGroq`, `ChatGoogleGenerativeAI`); `getLLM(modelId?)` + `chunkText(chunk)`
- `StreamerClientService` — `pushEvent(sessionId, event)` / `pushStep(sessionId, label, status)` via `x-internal-secret` to `camunda-streamer`

**Module wiring pattern** — each new worker must be added to `app.module.ts` in two places:

```ts
providers: [
  Logger,
  CamundaClientProvider,
  MyWorker,                          // 1. as a provider so NestJS can inject its deps
  {
    provide: CAMUNDA_WORKERS_TOKEN,
    useFactory: (..., w: MyWorker) => [..., w],   // 2. collected into the workers array
    inject: [..., MyWorker],
  },
  CamundaWorkersStartupService,
],
```

---

## camunda-streamer (`apps/camunda-streamer/`)

Standalone NestJS process (port 3001) that bridges Camunda process events to the UI via Server-Sent Events and persists chat sessions in MongoDB using the **native driver** (no Mongoose).

**Purpose:** receives a chat message from the UI → creates a MongoDB session → starts a Camunda process instance → returns `{ sessionId, processInstanceId }`. Workers then POST events back to the internal endpoint, which fans them out to the SSE connection held by the browser.

```
apps/camunda-streamer/src/app/
├── mongo/
│   ├── mongo.module.ts            # exports MongoDbProvider (MONGO_DB token)
│   └── mongo-chat.service.ts      # createSession, saveMessage, setSessionStatus, getNextSequence
├── camunda/
│   ├── camunda.module.ts
│   └── camunda.service.ts         # startProcess(key, variables) → POST Camunda REST
├── chat/
│   ├── chat.module.ts
│   ├── chat.service.ts            # in-memory SSE bus: Map<sessionId, Subject<WorkflowEvent>>, 10-min TTL
│   └── chat.controller.ts         # POST /stream/:userId/chat  |  GET /stream/:sessionId/sse (SSE)
└── internal/
    ├── internal.module.ts
    └── internal.controller.ts     # POST /internal/sessions/:sessionId/event  (x-internal-secret auth)
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stream/:userId/chat` | Create session, start Camunda process, return `{ sessionId, processInstanceId }` |
| `GET` | `/stream/:sessionId/sse` | SSE stream — emits `WorkflowEvent` objects until `done` or `error` |
| `POST` | `/internal/sessions/:sessionId/event` | Worker → streamer event push (requires `x-internal-secret` header) |

`WorkflowEvent` types: `step` (progress label), `token` (streaming LLM token), `done` (final response), `error`.

MongoDB collections used: `chatsessions`, `chatmessages`. Zod validates all documents at write time. No Mongoose — raw `Db` from `MONGO_DB` injection token.

---

## chat-model (`apps/api/src/app/chat-model/`)

Read-only NestJS module in `apps/api` that exposes chat history endpoints. Uses the **native MongoDB driver** (`mongodb` package) with its own `CHAT_MONGO_CLIENT`/`CHAT_MONGO_DB` provider tokens — completely separate from any Mongoose connection.

**Endpoints** (under `/api/chat-model`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chat-model/:userId/sessions` | List sessions sorted by `createdAt` desc |
| `GET` | `/api/chat-model/:userId/sessions/:sessionId` | Get one session |
| `GET` | `/api/chat-model/:userId/sessions/:sessionId/messages` | Get messages sorted by `sequence` asc |

All writes are owned by `camunda-streamer`. This module is strictly read-only.

---

## Frontend (`apps/ui/src/app/`)

### File structure

```
app/
├── app.tsx                          # Thin router (no BrowserRouter — owned by main.tsx)
├── types/index.ts                   # All shared TypeScript types
├── lib/
│   ├── api.ts                       # All fetch helpers (API_BASE = http://localhost:3000/api)
│   ├── utils.ts                     # formatDate, formatDateLong, getDaysUntil, getInitials
│   └── modelPreference.ts           # localStorage helper for default AI model
├── hooks/
│   ├── useDashboardData.ts          # Fetches user + healthEvents + dietLogs + lifestyle + mealPlan + reminders
│   └── useUsers.ts                  # Fetches all users list
├── pages/
│   ├── DashboardPage.tsx            # Family member grid + add-member form
│   ├── UserProfilePage.tsx          # Per-user profile with 70/30 header + records + collapsible sidebar
│   ├── RecordDetailPage.tsx         # Full-page detail view for health/diet/lifestyle records
│   ├── AIChatPage.tsx               # Full-page AI chat (wraps ChatPanel)
│   ├── AIInsightsPage.tsx           # Split page: left = all insights, right = ChatPanel
│   ├── FamilyGraphPage.tsx          # Neo4j-backed force-graph visualization
│   ├── ReportsPage.tsx              # Reports placeholder
│   └── SettingsPage.tsx             # Settings: default AI model picker + future preferences
├── components/
│   ├── layout/
│   │   └── AppLayout.tsx            # Sidebar nav (collapsed by default) + top bar + user selector
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx                # Uses `open: boolean` prop (not `isOpen`)
│   │   ├── Spinner.tsx              # PageSpinner + SkeletonCard
│   │   ├── Tabs.tsx
│   │   └── EmptyState.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx            # Reusable chat UI (header + model settings + messages + input)
│   │   └── AIChatPanel.tsx          # Legacy modal chat (kept for reference)
│   ├── records/
│   │   ├── RecordsBoard.tsx         # Board + timeline view; card clicks navigate to RecordDetailPage
│   │   └── RecordDetailPanel.tsx    # Legacy panel (superseded by RecordDetailPage)
│   ├── family/
│   │   └── FamilyMemberCard.tsx
│   ├── diet/
│   │   └── MedItemRow.tsx
│   ├── meal-plan/
│   │   └── MealPlanWidget.tsx       # Compact meal plan card + full modal with day tabs
│   ├── reminders/
│   │   └── RemindersWidget.tsx
│   └── widgets/
│       ├── AIInsightsWidget.tsx     # Paginated insight card; exports buildInsights(user, ..., limit)
│       ├── TodayMedicationsWidget.tsx  # Active medications from diet logs + prescriptions
│       └── AppointmentsCalendar.tsx    # Reminders grouped by month with urgency colours
```

### Routes (`app.tsx`)

| Path | Component | Notes |
|------|-----------|-------|
| `/` | → `/dashboard` | Redirect |
| `/dashboard` | `DashboardPage` | Family member grid |
| `/dashboard/:id` | `UserProfilePage` | Per-user profile |
| `/dashboard/:id/:type` | `RecordDetailPage` | Full-page record detail; `type` = `health`, `diet`, `lifestyle` |
| `/chat/:userId` | `AIChatPage` | Full-page AI chat |
| `/insights/:userId` | `AIInsightsPage` | All insights (left) + chat (right) split view |
| `/graph` | `FamilyGraphPage` | Force-graph family tree |
| `/reports` | `ReportsPage` | Reports (placeholder) |
| `/settings` | `SettingsPage` | App preferences |

Query params used by `RecordDetailPage`:
- `?group=<reportGroupId>` — open a health event group (doctor report)
- `?record=<id>` — open a single diet or lifestyle record

### Navigation patterns

- **No popup modals for record details** — clicking any record card navigates to `/dashboard/:id/:type` as a full page
- **Health records**: `navigate('/dashboard/${userId}/health?group=${groupId}')`
- **Diet logs**: `navigate('/dashboard/${userId}/diet?record=${logId}')`
- **Lifestyle**: `navigate('/dashboard/${userId}/lifestyle?record=${recId}')`
- **AI chat**: `navigate('/chat/${userId}')` — full page
- **AI insights + chat split**: `navigate('/insights/${userId}')` — full page

### `UserProfilePage` layout

```
┌──────────────────────────────────────────┬─────────────────┐
│  AI Health Insights (col-span-2, ~67%)   │ User card       │
│  Gradient panel showing up to 3 insights │ Name / DOB /    │
│  Clickable → /insights/:userId           │ Conditions only │
│  "Ask AI Health Agent" → /chat/:userId   │ (col-span-1)    │
│  ⊕ ExternalLink icon → /insights/:userId │                 │
└──────────────────────────────────────────┴─────────────────┘
  [Reminders widget — shown only when reminders exist]
┌─────────────────────────────────────────┬──── [▶ toggle] ──┐
│  Tab bar: Health | Diet | Lifestyle     │                  │
│  RecordsBoard (col-span-2 when open,   │  Right sidebar   │
│               col-span-3 when closed)  │  (col-span-1)    │
│                                        │  · TodayMeds     │
│                                        │  · Appointments  │
│                                        │  · MealPlan      │
│                                        │  · Quick stats   │
└────────────────────────────────────────┴──────────────────┘
```

- **Sidebar default**: open (`sidebarOpen = true`)
- **Toggle button**: rightmost element of the tab bar row; indigo when open, neutral when closed
- **Left nav sidebar** (`AppLayout`): collapsed by default (`collapsed = true`)

### `AIInsightsPage` layout

```
┌──────────────────────────────────┬────────────────────────┐
│  LEFT 45%                        │  RIGHT 55%             │
│  Gradient header (conditions)    │  ChatPanel component   │
│  ────────────────────────────    │  · Gradient header     │
│  All insight cards (scrollable)  │  · Model selector gear │
│  Health summary stats footer     │  · Messages area       │
│                                  │  · File attach + input │
└──────────────────────────────────┴────────────────────────┘
```

### `AIChatPage` layout

Full-page chat within `AppLayout`. Back button → `/dashboard/:userId`. Uses `ChatPanel` component.

### AI model preference

- Stored in `localStorage` under key `healthai_default_model`
- Helper: `lib/modelPreference.ts` → `getDefaultModel()` / `saveDefaultModel(id)`
- Default: `claude-sonnet-4-6`
- Configurable in `/settings` via model cards (star = set as default, with "Saved" confirmation)
- Also settable inline via the `⚙` gear button in `ChatPanel` header (star each card)

### Supported AI models

| ID | Label | Provider |
|----|-------|----------|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic |
| `gpt-4o-mini` | GPT-4o mini | OpenAI |
| `llama-3.3-70b-versatile` | Llama 3.3 70B | Meta · Groq |
| `gemini-1.5-flash` | Gemini 1.5 Flash | Google |

### `ChatPanel` component

`components/chat/ChatPanel.tsx` — self-contained, reusable:

- **Props**: `userId: string`, `className?: string`
- **Features**: SSE streaming, file attach (image/PDF), model selector, settings panel (gear icon), default model save
- **Used by**: `AIChatPage` (full page) and `AIInsightsPage` (right column)
- **SSE events**: `node` → streaming step label, `token` → append to content, `done` → finalize with intent/retrievedCount, `error` → show error message

### `buildInsights` function

Exported from `AIInsightsWidget.tsx`:

```ts
buildInsights(user, healthEvents, dietLogs, lifestyleRecords, limit = 3): Insight[]
```

Rule engine generates insights for:
- Diabetes (diet: low-GI foods)
- Hypertension (sodium + exercise)
- GI conditions (esophagitis, gastritis, GERD, ulcer, duodenitis)
- Medication count ≥ 3 (adherence reminder)
- Recent diet logs (logging encouragement)
- No exercise in lifestyle records
- Health event count (trend observation)
- Fallback if no data

Pass `limit = 20` (or `Infinity`) to get all insights — used by `AIInsightsPage`.

### `FamilyGraphPage` — ForceGraph2D fixes

- API may return nodes with `_id` instead of `id` — normalized to `String(n.id ?? n._id ?? i)`
- Links filtered: only kept if both `source` and `target` exist in the node set
- Prevents "node not found" crash when API schema changes

### `AppLayout` — left sidebar

- `collapsed` state defaults to `true` (icon-only strip, `w-[72px]`)
- Expand with the hamburger toggle in the top-left
- User selector dropdown in top-right header; switching user navigates to `/dashboard/:id`

---

## Coding conventions

- Biome enforces formatting — run `npm run format` before committing
- All health data carries a `source` field: `USER | DOCTOR | AI`
- Status fields use `ACTIVE | RESOLVED | ONGOING`
- Multilingual ingredient labels stored as `{ en, te, ta }` objects
- **No popup modals for record details** — always navigate to a full page route
- **Router ownership**: `main.tsx` owns `<BrowserRouter>`; `app.tsx` uses only `<Routes>` (no nested Router)
- **Modal component**: uses `open: boolean` prop, not `isOpen`
- **API base**: `http://localhost:3000/api` — exported as `API_BASE` from `lib/api.ts`

### Shared types (`@work-bench/types`)

- **All new cross-app TypeScript types go in `libs/types/`** — never as plain interfaces in individual apps
- Every type file must export the Zod schema **and** the inferred TypeScript type together:
  ```ts
  export const FooSchema = z.object({ ... });
  export type Foo = z.infer<typeof FooSchema>;
  ```
- Place types in the matching domain folder (`common/`, `health/`, `agent/`, or create a new one)
- Re-export from the domain's `index.ts`, then add the domain barrel line to `libs/types/src/index.ts`
- Use primitives from `common/` instead of re-defining: `MongoIdSchema`, `IsoDateSchema`, `PaginationQuerySchema`, etc.

### Camunda workers (`@work-bench/camunda-worker`)

- Every new Camunda topic requires an entry in `libs/camunda-worker/src/lib/camunda-topics.config.ts` **first** — the `@Worker` decorator throws at boot if the key is missing
- Decorator order is mandatory: `@Injectable()` above `@Worker('key')` on the same class
- Workers implement only `run()` — do not catch errors inside `run()`; the base class `handler()` owns retry and failure reporting
- `logger` is wired via the subclass constructor parameter (`protected readonly logger: Logger`) — do not create a new Logger inside `run()`
