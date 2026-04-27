# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered Family Health Tracker. Families can track individual members' health events, diet logs, lifestyle habits, and receive AI-driven meal plans and health insights. Uses an "AI-First Database Architecture" where a materialized `AIPatientContext` collection keeps a denormalized per-user context document ready to feed directly into LLM prompts.

## Tech Stack

- **Frontend**: React 19 + TypeScript, TailwindCSS v4, React Router 6, Framer Motion, Lucide React, React Force Graph 2D
- **Backend**: NestJS 11, MongoDB 9.5 + Mongoose, Neo4j 6 + neo4j-driver, LangChain + LangGraph, Claude Sonnet 4.6 (chat/synthesis), HuggingFace `all-MiniLM-L6-v2` (local embeddings, no API key required)
- **Monorepo**: NX 22.6.5 with Webpack, Biome (lint/format), Jest, Playwright (E2E)
- **Runtime**: Node.js 22+, npm 10+

## Commands

```bash
npm install                # Install all dependencies

# Development
npm run dev                # Start both API (port 3000) and UI (port 4200)
npm run start:api          # NestJS API only
npm run start:ui           # React UI only

# Build
npm run build:all          # Production build for both apps

# Test
npm run test:all           # Run all Jest tests
npx nx test api --testFile=path/to/spec.ts
npx nx test ui --testFile=path/to/spec.tsx

# Lint & Format
npm run lint               # Biome lint check
npm run format             # Biome auto-format
```

**Environment**: copy `apps/api/.env.example` to `apps/api/.env` and set:
- `MONGODB_URI` (default: `mongodb://localhost:27017/workbench`)
- `ANTHROPIC_API_KEY` (Claude Sonnet — agent chat, synthesis, vision for image uploads)
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` (optional, for graph features)

---

## Architecture

### Monorepo layout

```
work-bench/
├── apps/
│   ├── api/               # NestJS backend
│   ├── ui/                # React frontend
│   └── ui-e2e/            # Playwright E2E tests
├── libs/                  # Shared libs (planned, currently empty)
├── biome.json             # Lint + format (100-char lines, 2-space indent, single quotes)
└── nx.json                # NX workspace config
```

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
