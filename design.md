# Family Health Tracker — Architecture & Design

> **Implementation status**: Reflects the live codebase as of Round 5. Sections marked _(planned)_ describe future work not yet built.

---

## Project Overview

AI-powered Family Health Tracker where families track individual members' health events, diet logs, lifestyle habits, and receive AI-driven insights. The backend uses an **AI-First Database Architecture** where a materialized `AIPatientContext` collection and a Neo4j vector index keep per-user context ready to feed directly into LLM prompts without expensive multi-collection joins.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, TailwindCSS v4, Framer Motion, React Router 6 |
| Backend | NestJS 11, MongoDB 9.5 + Mongoose |
| Graph DB | Neo4j 6 + neo4j-driver (relationships + vector search) |
| AI Orchestration | LangChain + LangGraph |
| LLM (chat/synthesis/vision) | Claude Sonnet 4.6 (primary), GPT-4o Mini, Llama 3.3, Gemini Flash |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` — local, no API key |
| Monorepo | NX 22.6.5, Webpack, Biome, Jest, Playwright |

---

## Monorepo Layout

```
work-bench/
├── apps/
│   ├── api/                     # NestJS backend
│   │   └── src/app/
│   │       ├── agent/           # LangGraph orchestration
│   │       ├── users/           # User + all health sub-resources
│   │       ├── health-events/   # Health event schema
│   │       ├── diet-logs/       # Diet log schema
│   │       ├── lifestyle/       # Lifestyle schema
│   │       ├── reminders/       # Reminders schema + CRUD
│   │       ├── meal-plans/      # AI meal plan generation
│   │       ├── recipes/         # Recipe storage
│   │       ├── neo4j/           # Graph DB connection
│   │       ├── ai-context/      # Materialized AI context
│   │       └── families/        # Family grouping
│   ├── ui/                      # React frontend (single app.tsx)
│   └── ui-e2e/                  # Playwright E2E tests
├── features/                    # Feature documentation
│   ├── user-feature.md
│   ├── health-feature.md
│   └── diet-feature.md
├── design.md                    # This file
└── CLAUDE.md                    # AI coding instructions
```

---

## Problems Solved (Cumulative)

| Issue | Solution |
|-------|---------|
| Flat context string | RAG: embed query → Neo4j vector search → top-8 relevant chunks |
| Token bloat | ~1 200 targeted tokens vs 4 000–6 000 full dump |
| No streaming | SSE streaming via POST + ReadableStream |
| Single model | 4 LLM providers, live model switching, per-model graph caching |
| Fragile JSON extraction | `_extractJson` strips fences, finds outermost `{…}` |
| Stale embeddings | `deleteEmbedding` wired into all three delete methods |
| Flat report storage | 3-card grouped output (`DOCTOR_VISIT`, `PRESCRIPTION`, `TEST_RESULTS`) |
| Many scattered diet cards | Max 3 diet cards per report (`MEDICATION`, `SUGGESTIONS`, `MANDATORY_FOOD`) |
| No medication details | Per-drug side effects, avoid list, start/end dates in `medicationItems[]` |
| No reminders | Automated reminder creation for appointments, tests, and medication end dates |
| No re-analysis on edit | `reanalyzeEventChanges` computes diff → LLM assessment → re-embed → profile update |
| No detail view before editing | `RecordDetailPanel`: view → edit → save & analyze for health, diet, and lifestyle |
| Inconsistent edit entry point | All board and timeline cards clickable → opens unified `RecordDetailPanel` in view mode |
| No diet / lifestyle re-analysis | `reanalyzeDietChanges` and `reanalyzeLifestyleChanges` — diff + LLM + re-embed for both types |

---

## LangGraph Pipeline

```
START
  │
  ▼
┌─────────────────┐
│  classifyIntent  │  Fast ~200 token classification
└────────┬────────┘
         ▼
┌─────────────────┐
│ retrieveContext  │  Embed query → Neo4j vector search → top-8 chunks
└────────┬────────┘
         ▼
    ┌────┴────┐   Conditional edge on intent[]
    │  router  │
    └────┬────┘
         │
  ┌──────┴──────────────────┐
  │                         │
  ▼                         ▼
MEDICAL_REPORT         all other intents
  │                         │
  ▼                         │
parseMedicalReport           │
  │                         │
  ▼                         │
storeReportData              │
  │                         │
  └──────────┬──────────────┘
             ▼
   ┌──────────────────────┐
   │  synthesizeResponse  │  Chosen LLM — compact context only
   └────────┬─────────────┘
            ▼
           END
```

---

## Multi-Model Support

| ID | Label | Provider | Free |
|----|-------|----------|------|
| `claude-sonnet-4-6` | Claude | Anthropic | No |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI | No |
| `llama-3.3-70b-versatile` | Llama 3.3 | Groq | Yes |
| `gemini-1.5-flash` | Gemini Flash | Google | Yes |

Each model is instantiated once and cached by ID. A compiled LangGraph is also cached per model. The UI chat panel exposes pill-button model selectors; the selected model ID is sent in the request body and echoed back in the `done` SSE event.

---

## State Schema (agent.service.ts)

```typescript
interface MedItem {
  name: string;
  dosage?: string;
  duration?: string;          // e.g. "30 days"
  instructions?: string;      // timing + how to take
  sideEffects?: string[];     // key side effects
  avoidWhileTaking?: string[]; // foods/drugs/activities to avoid
  startDate?: string;         // ISO date = visitDate
  endDate?: string;           // ISO date = visitDate + duration
}

// Max 3 diet cards per medical report
interface DietSlot {
  cardType: string;           // MEDICATION | SUGGESTIONS | MANDATORY_FOOD
  mealTypes: string[];        // PILLS for MEDICATION; BREAKFAST etc. for food cards
  medicationItems?: MedItem[];
  foodItems?: string[];
  period?: string;
}

interface ParsedHealthData {
  visitDate?: string;
  doctorInfo?: { name?; hospital?; address?; specialty? };
  visitSummary?: {
    description: string;
    conditions: string[];
    symptoms?: string[];
    injections?: string[];    // clinic-only — NOT in prescriptions
    notes?: string;
    status: string;
  };
  prescriptions?: { items: MedicationItem[]; status: string };
  testResults?: { items: TestItem[]; status: string };
  dietAdvice?: DietSlot[];           // max 3 cards
  lifestyleAdvice?: { description: string; categories: string[] }[];
  nextAppointment?: { date: string; description?: string };
  followUpTests?: string[];
  newConditions?: string[];
  newMedications?: string[];
}

interface AgentState {
  userId: string;
  userProfile: UserProfileSnapshot;
  message: string;
  conversationHistory: BaseMessage[];
  intent: string[];
  retrievedContext: RetrievedChunk[];
  parsedData: ParsedHealthData | null;
  storageFeedback: string;
  response: string;
}
```

---

## Medical Report Processing

### Report Grouping (`reportGroupId` / `reportLabel`)

When `_storeReport` runs, it generates one UUID `reportGroupId` (via `crypto.randomUUID()`) and stamps it on every MongoDB document created in that batch:

| Document | Fields added |
|----------|-------------|
| `HealthEvent` × 3 | `reportGroupId`, `source: 'DOCTOR'` |
| `DietLog` (≤3 cards) | `reportGroupId`, `reportLabel`, `source: 'DOCTOR'` |
| `Lifestyle` (1 record) | `reportGroupId`, `reportLabel`, `source: 'DOCTOR'` |
| `Reminder` (multiple) | `reportGroupId`, `reportLabel` |

`reportLabel` = `"Dr. {name} · {date}"` (or just the date). Stored directly on each document so cards can display their report origin without joins.

### Health Event Cards (3 per report)

| `eventType` | Contents |
|-------------|---------|
| `DOCTOR_VISIT` | Diagnoses, symptoms, clinic injections, doctor notes |
| `PRESCRIPTION` | All home-use medications — `MedicationItem[]` in `details.medications` |
| `TEST_RESULTS` | Lab results — `TestItem[]` in `details.testResults` |

### Diet Cards (max 3 per report)

| `cardType` | Contents |
|-----------|---------|
| `MEDICATION` | All mandatory daily medications, each with side effects, avoid list, start/end dates |
| `SUGGESTIONS` | All food advice, probiotics, general dietary tips (plain text array) |
| `MANDATORY_FOOD` | Only if doctor mandates a specific food per day with quantity |

### Lifestyle (1 record per report)

All lifestyle instructions merged into a single Lifestyle document with union of all categories (`EXERCISE | SLEEP | STRESS | GENERAL | DIET`).

### Reminders (auto-created per report)

| `reminderType` | Created when |
|---------------|-------------|
| `APPOINTMENT` | `nextAppointment.date` is present in the parsed report |
| `FOLLOW_UP_TEST` | Each entry in `followUpTests[]` |
| `MEDICATION_END` | Each `medicationItem` with a non-null `endDate` |

Reminders are exposed via `GET /api/users/:userId/reminders` and dismissed via `PATCH /api/users/:userId/reminders/:id/done`.

### `_storeReport()` Full Pipeline

```
1. reportGroupId = randomUUID()
   reportLabel   = "Dr. {name} · {date}"

2. visitSummary → ONE HealthEvent { eventType: 'DOCTOR_VISIT', details: { doctorInfo, conditions, symptoms, injections, notes } }
   embedAndStore(userId, id, 'HEALTH_EVENT', text, date)

3. prescriptions.items → ONE HealthEvent { eventType: 'PRESCRIPTION', details: { medications: MedicationItem[] } }
   embedAndStore(userId, id, 'HEALTH_EVENT', text, date)

4. testResults.items → ONE HealthEvent { eventType: 'TEST_RESULTS', details: { testResults: TestItem[] } }
   embedAndStore(userId, id, 'HEALTH_EVENT', text, date)

5. For each DietSlot (max 3):
   → Save DietLog { cardType, medicationItems (with side effects / dates), reportGroupId, reportLabel }
   → embedAndStore(userId, id, 'DIET_LOG', text, date)

6. All lifestyleAdvice items → ONE Lifestyle { categories (union), description (all bullet points) }
   embedAndStore(userId, id, 'LIFESTYLE', text, date)

7. Create Reminders:
   - APPOINTMENT from nextAppointment.date
   - FOLLOW_UP_TEST per followUpTests[]
   - MEDICATION_END per medicationItem.endDate

8. Merge newConditions + newMedications into User profile (Set dedup)

9. Return feedback string: "3 health record cards saved, 2 diet cards added, lifestyle saved, 3 reminders created."
```

---

## Edit & Re-Analysis Flow

All record cards (health, diet, lifestyle) follow a unified **view → edit → save & analyze** pattern via the `RecordDetailPanel` component.

### UX Flow

1. Click anywhere on any report card in the Records Board or Daily Diet widget → opens `RecordDetailPanel` in **view mode** displaying all AI-generated details richly formatted.
2. Click the **Edit** button in the panel header to switch to **edit mode** with inline-editable fields.
3. Click **Save & Analyse**: PUTs updated records, then POSTs to the appropriate reanalyze endpoint.
4. AI analysis rendered inline in the panel; panel returns to view mode and the record list is refreshed.
5. Closing the panel clears the analysis result — the corrected data in MongoDB is the authoritative source.

Delete and quick-edit buttons inside cards use `e.stopPropagation()` to prevent triggering the panel open.

### `RecordDetailPanel` Component

```typescript
function RecordDetailPanel({ type, evs, record, userId, onClose, onRefetch }) {
  // type: 'health' | 'diet' | 'lifestyle'
  // evs: DetailEvs[] — for health groups (DOCTOR_VISIT + PRESCRIPTION + TEST_RESULTS)
  // record: RecordItem — for diet and lifestyle single records
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // startEdit() — initializes edit state from current data
  // handleSave() — PUT → POST reanalyze → setAnalysis → setMode('view') → onRefetch
}
```

### `reanalyzeEventChanges` Pipeline (Health)

```
1. _computeEventDiff(old, new)
   → conditionsAdded/Removed, medicationsAdded/Removed, testStatusChanges, descriptionChanged, statusChanged

2. _buildDiffPrompt(diff) → compact bullet list → 2-3 sentence clinical assessment

3. getLLM(modelId).invoke(systemPrompt + diffPrompt)

4. embedAndStore(userId, newEvent._id, 'HEALTH_EVENT', text, date)  [MERGE — overwrites stale vector]

5. if conditions/medications changed → userService.update(userId, { medicalConditions, medications })

6. return { analysis, profileUpdated }
```

### `reanalyzeDietChanges` Pipeline (Diet)

```
1. Diff medicationItems[].name arrays and description field
   → medsAdded, medsRemoved, descChanged

2. if !hasChanges → return { analysis: "No significant changes." }

3. Build prompt: diet log type + medications added/removed → 2-3 sentence clinical assessment

4. getLLM(modelId).invoke(systemPrompt + prompt)

5. embedAndStore(userId, newLog._id, 'DIET_LOG', text, date)  [MERGE — overwrites stale vector]

6. return { analysis }
```

### `reanalyzeLifestyleChanges` Pipeline (Lifestyle)

```
1. Diff description field and categories[] array
   → descChanged, catsChanged

2. if !hasChanges → return { analysis: "No significant changes." }

3. Build prompt: categories changed + description → 2-3 sentence lifestyle assessment

4. getLLM(modelId).invoke(systemPrompt + prompt)

5. embedAndStore(userId, newRec._id, 'LIFESTYLE', text, date)  [MERGE — overwrites stale vector]

6. return { analysis }
```

---

## Embedding Lifecycle

### Write

Every write path calls `embedAndStore` after MongoDB `.save()`:

| Source | Called by |
|--------|-----------|
| Report parse | `_storeReport` |
| User-logged health event | `user.service.addHealthEvent` |
| User-logged diet | `user.service.addDietLog` |
| User-logged lifestyle | `user.service.addLifestyle` |
| Profile create/update | `user.service.create / update` |

### Update (re-embed)

`updateHealthEvent` calls `agentService.embedAndStore` after MongoDB update. `/reanalyze` also re-embeds as part of its pipeline.

### Delete (remove stale vector)

```typescript
async deleteEmbedding(sourceId: string): Promise<void> {
  await session.run(`MATCH (c:UserHealthChunk {id: $sourceId}) DETACH DELETE c`, { sourceId });
}
```

| Method | Embedding deleted | Neo4j node deleted |
|--------|-------------------|--------------------|
| `deleteHealthEvent` | `UserHealthChunk {id}` | `HealthEvent {id}` |
| `deleteDietLog` | `UserHealthChunk {id}` | — |
| `deleteLifestyle` | `UserHealthChunk {id}` | `Lifestyle {id}` |

---

## Neo4j Vector Schema

```cypher
(:UserHealthChunk {
  id:        string,   -- MongoDB _id (primary key)
  userId:    string,
  chunkType: string,   -- HEALTH_EVENT | DIET_LOG | LIFESTYLE | PROFILE
  text:      string,
  date:      string,
  embedding: float[]   -- 384-dim cosine vector
})

CREATE VECTOR INDEX userHealthChunks IF NOT EXISTS
FOR (c:UserHealthChunk) ON c.embedding
OPTIONS { indexConfig: { `vector.dimensions`: 384, `vector.similarity_function`: 'cosine' } }

CALL db.index.vector.queryNodes('userHealthChunks', 20, $queryVector)
YIELD node AS c, score
WHERE c.userId = $userId
RETURN c.chunkType, c.text, c.date, score ORDER BY score DESC LIMIT 8
```

`MERGE … SET` semantics → `embedAndStore` on an existing id **updates** in-place — no duplicate chunks.

---

## Streaming Chat (SSE)

### Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agent/models` | Available models list |
| `POST` | `/api/agent/:userId/chat` | Blocking |
| `POST` | `/api/agent/:userId/chat/stream` | SSE stream |
| `POST` | `/api/agent/:userId/chat-with-file` | `multipart/form-data` PDF/image |
| `POST` | `/api/agent/:userId/reanalyze` | Diff → LLM → re-embed → profile update (health) |
| `POST` | `/api/agent/:userId/reanalyze-diet` | Diff → LLM → re-embed (diet) |
| `POST` | `/api/agent/:userId/reanalyze-lifestyle` | Diff → LLM → re-embed (lifestyle) |

### SSE Event Protocol

| Event | Payload | When |
|-------|---------|------|
| `node` | `{ label }` | Before/after each pipeline step |
| `intent` | `{ intent[] }` | After classify |
| `token` | `{ token }` | Each LLM chunk |
| `done` | `{ intent, retrievedCount, stored, model }` | After all tokens |
| `error` | `{ message }` | On exception |

---

## User Dashboard — Reminders Widget

The right sidebar of `UserDashboard` fetches `GET /api/users/:userId/reminders` on load and shows a **Reminders** widget above the Daily Diet panel when any undismissed reminders exist.

| Visual | Meaning |
|--------|---------|
| Rose background | Overdue (past due date) |
| Amber background | Due within 7 days |
| Slate background | Due later |
| CalendarCheck icon | `APPOINTMENT` type |
| FlaskRound icon | `FOLLOW_UP_TEST` type |
| AlarmClock icon | `MEDICATION_END` type |

Clicking the ✓ button calls `PATCH .../reminders/:id/done` and removes the item from local state immediately.

---

## RecordDetailPanel — Universal Record Viewer

`RecordDetailPanel` is a full-overlay modal (`z-60`, max-width 3xl) shared across all three record types (health, diet, lifestyle). It implements a **view → edit → save & analyze** flow.

### View Mode

| Record type | What is shown |
|-------------|---------------|
| **Health** | Gradient header with doctor info; Diagnoses + symptoms + injections + notes; Prescription table (name, dosage, frequency, duration, route); Test results per-card with status badges |
| **Diet (MEDICATION)** | Indigo gradient header; per-drug accordion with clock + instructions, start/end date tiles, side effect pills (amber), avoid-while-taking pills (rose) |
| **Diet (SUGGESTIONS / MANDATORY_FOOD)** | Teal/emerald gradient header; each food item as a bullet row |
| **Lifestyle** | Category badges; description text block |

The **Edit** button in the header switches the panel to edit mode.

### Edit Mode

| Record type | Editable fields |
|-------------|----------------|
| **Health** | Conditions (comma-sep), visit description, doctor notes, status selector; per-medication name/dosage/frequency/duration/instructions (add/delete rows); per-test value/range/status |
| **Diet (MEDICATION)** | Per-medication name, dosage, duration, instructions, side effects (comma-sep → array), avoid list (comma-sep → array), start/end date pickers; add/delete rows |
| **Diet (SUGGESTIONS / MANDATORY_FOOD)** | Multi-line textarea — one item per line |
| **Lifestyle** | Description textarea; categories multi-select |

### Medication Board Cards — Expandable Row Detail

Each `MedItemRow` inside a MEDICATION board card can be expanded (via chevron) to reveal:
- **Start date** (= visit date)
- **End date** (= visit date + duration)
- **Side Effects** — amber pills
- **Avoid While Taking** — rose pills

`MedItemRow` is a standalone React component so each row carries its own `open` state independently (avoids React hooks-in-map violation).

---

## API Endpoints — Full Table

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/users` | Create user |
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user + all data + embeddings |
| `GET` | `/api/users/graph` | Family graph (MongoDB nodes + Neo4j edges) |
| `POST` | `/api/users/link` | Create Neo4j relationship between two users |
| `POST` | `/api/users/:id/health-events` | Log health event |
| `GET` | `/api/users/:id/health-events` | List health events |
| `PUT` | `/api/users/:id/health-events/:eid` | Update + re-embed |
| `DELETE` | `/api/users/:id/health-events/:eid` | Delete + remove embedding |
| `POST` | `/api/users/:id/diet-logs` | Log meal |
| `GET` | `/api/users/:id/diet-logs` | List diet logs |
| `PUT` | `/api/users/:id/diet-logs/:lid` | Update |
| `DELETE` | `/api/users/:id/diet-logs/:lid` | Delete + remove embedding |
| `POST` | `/api/users/:id/lifestyle` | Log lifestyle |
| `GET` | `/api/users/:id/lifestyle` | List lifestyle |
| `PUT` | `/api/users/:id/lifestyle/:lid` | Update |
| `DELETE` | `/api/users/:id/lifestyle/:lid` | Delete + remove embedding |
| `GET` | `/api/users/:id/reminders` | Active (undone) reminders sorted by dueDate |
| `PATCH` | `/api/users/:id/reminders/:rid/done` | Mark reminder as done |
| `POST` | `/api/users/:id/meal-plans/generate` | AI meal plan |
| `GET` | `/api/users/:id/meal-plans/active` | Active meal plan |
| `POST` | `/api/agent/:id/chat` | Blocking chat |
| `POST` | `/api/agent/:id/chat/stream` | SSE streaming chat |
| `POST` | `/api/agent/:id/chat-with-file` | PDF/image upload → chat |
| `POST` | `/api/agent/:id/reanalyze` | Diff + LLM + re-embed + profile update (health) |
| `POST` | `/api/agent/:id/reanalyze-diet` | Diff + LLM + re-embed (diet) |
| `POST` | `/api/agent/:id/reanalyze-lifestyle` | Diff + LLM + re-embed (lifestyle) |
| `GET` | `/api/agent/models` | Available LLM models |

---

## Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/workbench
PORT=3000

ANTHROPIC_API_KEY=       # Claude Sonnet 4.6
OPENAI_API_KEY=          # GPT-4o Mini
GROQ_API_KEY=            # Llama 3.3 70B (free) — console.groq.com
GOOGLE_API_KEY=          # Gemini 1.5 Flash (free) — aistudio.google.com

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
```

> Embeddings run locally via `Xenova/all-MiniLM-L6-v2` — no API key required.

---

## Files — Status

| File | Status | Notes |
|------|--------|-------|
| `apps/api/src/app/agent/agent.service.ts` | ✅ Done | LangGraph · multi-model cache · `_storeReport` (3 health cards + max 3 diet cards + reminders) · `deleteEmbedding` · `reanalyzeEventChanges` · `reanalyzeDietChanges` · `reanalyzeLifestyleChanges` |
| `apps/api/src/app/agent/agent.controller.ts` | ✅ Done | All 7 endpoints (chat, stream, file, reanalyze × 3, models) |
| `apps/api/src/app/users/user.service.ts` | ✅ Done | All write paths embed · update re-embeds · deletes remove embeddings |
| `apps/api/src/app/reminders/reminder.schema.ts` | ✅ Done | `APPOINTMENT \| FOLLOW_UP_TEST \| MEDICATION_END` · `dueDate`, `isDone` |
| `apps/api/src/app/reminders/reminder.service.ts` | ✅ Done | `createMany`, `findByUser`, `markDone` |
| `apps/api/src/app/reminders/reminder.controller.ts` | ✅ Done | `GET reminders` · `PATCH :id/done` |
| `apps/api/src/app/health-events/health-event.schema.ts` | ✅ Done | `reportGroupId` · rich `details` |
| `apps/api/src/app/diet-logs/diet-log.schema.ts` | ✅ Done | `reportGroupId` · `reportLabel` · `cardType` (MEDICATION/SUGGESTIONS/MANDATORY_FOOD) · `medicationItems` with `sideEffects`, `avoidWhileTaking`, `startDate`, `endDate` |
| `apps/api/src/app/lifestyle/lifestyle.schema.ts` | ✅ Done | `reportGroupId` · `reportLabel` |
| `apps/ui/src/app/app.tsx` | ✅ Done | All card types · `MedItemRow` expandable · Reminders widget · `RecordDetailPanel` (view → edit → save & analyze for health, diet, lifestyle) · all board and timeline cards clickable |
| `apps/api/src/app/neo4j/neo4j.service.ts` | ✅ Done | `ensureVectorIndex()` at startup |
| `apps/api/src/app/agent/agent.state.ts` | _(planned)_ | Interfaces inline in agent.service.ts |
| `apps/api/src/app/agent/agent.graph.ts` | _(planned)_ | Graph inline in `buildGraph()` |
| `apps/api/src/app/meal-plans/meal-plan.service.ts` | _(planned)_ | Meal plan chunks not embedded |

---

## Remaining Work

1. **Backfill script** — embed pre-existing MongoDB records created before the agent.
2. **Multi-branch router** — route `HEALTH_RECORD`, `DIET_LOG`, `LIFESTYLE_LOG` to dedicated store nodes.
3. **File upload streaming** — `chat-with-file` currently blocks; stream after extraction.
4. **Module extraction** — move interfaces, graph factory, and node functions into separate files.
5. **Reminder notifications** — push/browser notifications when a reminder comes due.
6. **Reminder delete by report group** — when a health event group is deleted, cascade-delete its reminders.
