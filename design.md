# LangGraph Agent Architecture — Design & Implementation

> **Implementation status**: The design below reflects the current, live implementation in `apps/api/src/app/agent/`. Sections marked _(planned)_ describe intended future work not yet built.

## Original Problems (Now Solved)

| Issue | Detail |
|-------|--------|
| Flat context string | `chat()` passed only name, allergies, conditions — ignored all health history |
| Crude truncation | `generateHealthPlan()` passed `dietLogs.slice(0, 3)` as raw JSON |
| LangGraph underused | Graph only existed in `generateHealthPlan`; the main `chat()` flow was sequential |
| No semantic retrieval | Impossible to answer "what did I eat last Tuesday?" intelligently |
| Token bloat | Any attempt to add full history dumped 2 000–5 000+ tokens per call |
| Embeddings wasted | Embeddings existed only for ingredients/diseases — never for the user's own records |
| No streaming | Every response blocked until the full LangGraph execution completed |
| Single model | No way to switch providers; API credit exhaustion broke the whole agent |
| Fragile report parsing | Medical report JSON extraction broke when models wrapped output in prose |
| Stale embeddings | Deleted/updated records left stale vectors in Neo4j; re-analysis not triggered on edits |
| Flat report storage | Each medical condition and medication was stored as a separate card, creating clutter |

---

## Goal

Replace the flat-context, sequential flow with a **LangGraph graph** where:
1. **User health data is embedded** into Neo4j at write-time.
2. **Every agent invocation runs a semantic RAG step** that retrieves only the records relevant to the user's current message.
3. **Token usage drops 70–85%** because the LLM sees ~1 000 targeted tokens instead of a full dump.
4. **Multiple LLM providers** are supported with live model switching and per-model graph caching.
5. **Medical reports produce exactly three grouped cards** (visit, prescription, tests) all linked by a shared `reportGroupId`.
6. **Manual corrections trigger AI re-analysis** so the health profile stays accurate.

---

## High-Level Graph

```
START
  │
  ▼
┌─────────────────┐
│  classifyIntent  │  Fast classification — no user context needed
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ retrieveContext  │  Embed query → Neo4j vector search → top-8 relevant chunks
└────────┬────────┘
         │
         ▼
    ┌────┴────┐   Conditional edge on intent[]
    │  router  │
    └────┬────┘
         │
  ┌──────┴────────────────────┐
  │                           │
  ▼                           ▼
MEDICAL_REPORT           all other intents
  │                           │
  ▼                           │
parseMedicalReport            │
  │                           │
  ▼                           │
storeReportData               │
  │                           │
  └──────────┬────────────────┘
             ▼
   ┌──────────────────────┐
   │  synthesizeResponse  │  Chosen LLM — compact context only
   └────────┬─────────────┘
            │
           END
```

> _(Planned)_ Additional branches for `HEALTH_RECORD`, `DIET_LOG`, `LIFESTYLE_LOG`, and `MEAL_PLAN` intents are not yet wired — all non-MEDICAL_REPORT paths go directly to `synthesizeResponse`.

---

## Multi-Model Support

### Available Models

Four LLM providers are supported and can be switched per message in the chat UI:

| ID | Label | Provider | Free tier |
|----|-------|----------|-----------|
| `claude-sonnet-4-6` | Claude | Anthropic | No — requires API credits |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI | No — requires API credits |
| `llama-3.3-70b-versatile` | Llama 3.3 | Groq | Yes — console.groq.com |
| `gemini-1.5-flash` | Gemini Flash | Google | Yes — aistudio.google.com |

```typescript
// apps/api/src/app/agent/agent.service.ts
export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6',       label: 'Claude',       provider: 'anthropic', note: 'Best quality'            },
  { id: 'gpt-4o-mini',             label: 'GPT-4o Mini',  provider: 'openai',    note: 'Fast & affordable'       },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3',    provider: 'groq',      note: 'Free — console.groq.com' },
  { id: 'gemini-1.5-flash',        label: 'Gemini Flash', provider: 'google',    note: 'Free — aistudio.google.com' },
] as const;
```

### LLM Factory & Caching

Each model is instantiated once on first use and cached by model ID. A separate compiled LangGraph is also cached per model so the graph doesn't rebuild on every message.

```typescript
private readonly _llmCache  = new Map<string, BaseChatModel>();
private readonly _graphCache = new Map<string, any>();

getLLM(modelId: string): BaseChatModel {
  if (this._llmCache.has(modelId)) return this._llmCache.get(modelId)!;
  let llm: BaseChatModel;
  if (modelId.startsWith('claude'))  llm = new ChatAnthropic({ model: modelId, temperature: 0 });
  else if (modelId.startsWith('gpt')) llm = new ChatOpenAI({ model: modelId, temperature: 0 });
  else if (modelId.startsWith('gemini')) {
    const apiKey = (process.env.GOOGLE_API_KEY ?? '').trim();
    llm = new ChatGoogleGenerativeAI({ model: modelId, temperature: 0, apiKey, apiVersion: 'v1' } as any);
  } else {
    llm = new ChatGroq({ model: modelId, temperature: 0 }); // llama, gemma, mixtral, qwen, deepseek
  }
  this._llmCache.set(modelId, llm);
  return llm;
}
```

### Model Selector UI

The chat header exposes a pill-button selector. Each pill shows a tooltip with the provider note. The selector is disabled while a request is in-flight. The selected model ID is sent in the request body for both streaming and file-upload endpoints and echoed back in the `done` SSE event. Completed AI messages display a small model badge.

---

## State Schema

```typescript
interface UserProfileSnapshot {
  name:              string;
  knownAllergies:    string[];
  medicalConditions: string[];
  medications:       string[];
  biologicalSex?:    string;
  bloodType?:        string;
}

interface RetrievedChunk {
  type:       string;   // 'HEALTH_EVENT' | 'DIET_LOG' | 'LIFESTYLE' | 'PROFILE' | 'MEAL_PLAN'
  text:       string;
  similarity: number;
  date?:      string;
}

interface DoctorInfo {
  name?: string; hospital?: string; address?: string; specialty?: string;
}

interface MedicationItem {
  name: string; dosage: string; frequency: string; duration?: string;
  route: string;    // ORAL | INJECTION | TOPICAL | IV | OTHER
  isDaily: boolean; // true → tablets/tonics taken at home; false → clinic injections
  instructions?: string;
}

interface TestItem {
  testName: string; value?: string; referenceRange?: string;
  interpretation?: string;
  status: string; // NORMAL | ABNORMAL | BORDERLINE
}

interface ParsedHealthData {
  visitDate?: string;
  doctorInfo?: DoctorInfo;
  // ONE card: all diagnoses from this visit
  visitSummary?: {
    description: string;
    conditions: string[];
    symptoms?: string[];
    injections?: string[];  // given at the visit, NOT for home use
    notes?: string;
    status: string;
  };
  // ONE card: all prescribed medications
  prescriptions?: {
    items: MedicationItem[];
    status: string;
  };
  // ONE card: all test results
  testResults?: {
    items: TestItem[];
    status: string;
  };
  dietAdvice?: { description: string; mealTypes: string[] }[];
  lifestyleAdvice?: { description: string; categories: string[] }[];
  newConditions?: string[];
  newMedications?: string[];
}

interface AgentState {
  userId:              string;
  userProfile:         UserProfileSnapshot;
  message:             string;
  conversationHistory: BaseMessage[];
  intent:              string[];
  retrievedContext:    RetrievedChunk[];
  parsedData:          ParsedHealthData | null;
  storageFeedback:     string;
  response:            string;
}
```

---

## Medical Report Grouping (`reportGroupId` / `reportLabel`)

When a medical report is processed, `_storeReport` generates a single UUID `reportGroupId` (via `randomUUID()` from Node.js crypto) and stamps it on **every** MongoDB document created in that run:

| Document type | Fields added |
|---------------|-------------|
| `HealthEvent` (all 3 cards) | `reportGroupId`, `source: 'DOCTOR'` |
| `DietLog` (daily meds + diet advice) | `reportGroupId`, `reportLabel`, `source: 'DOCTOR'` |
| `Lifestyle` (lifestyle advice) | `reportGroupId`, `reportLabel`, `source: 'DOCTOR'` |

`reportLabel` is a human-readable string derived from the doctor name and visit date — e.g. `"Dr. Smith · Apr 26 2026"`. It is stored directly on each document so diet and lifestyle records can display their origin without joins.

### Three-card output per report

| Card | `eventType` | Contents |
|------|-------------|---------|
| Visit | `DOCTOR_VISIT` | All diagnoses, symptoms, injections given at clinic, doctor notes |
| Prescription | `PRESCRIPTION` | All medications — `MedicationItem[]` stored in `details.medications` |
| Tests | `TEST_RESULTS` | All lab results — `TestItem[]` stored in `details.testResults` |

**Daily oral medications** (where `MedicationItem.isDaily === true`) additionally create a `DietLog` entry with `mealType: ['PILLS']` so the pill schedule appears in the diet log alongside meals.

**Clinic injections** appear only in `visitSummary.injections` (not in the prescription card) because they are one-off, not home-use.

### Frontend grouping

The RecordsBoard and UserDashboard compact panels both read `reportGroupId` to group cards visually:
- An indigo header with doctor name, specialty, and address (MapPin icon) ties the group together.
- DOCTOR_VISIT renders conditions as rose pills + symptoms + injections.
- PRESCRIPTION renders a medication table with `DAILY` / `ORAL` / `INJECTION` badges.
- TEST_RESULTS renders a test table with `NORMAL` / `ABNORMAL` / `BORDERLINE` coloured badges.
- Diet and lifestyle cards from the same report show a `Link2` pill with the `reportLabel`.

---

## Edit & Re-Analysis Flow

Users can correct health records returned from report parsing. The flow:

1. Click the edit (pencil) button on a doctor-report group card in RecordsBoard.
2. A modal opens showing editable fields for each sub-event:
   - **DOCTOR_VISIT**: conditions (comma-separated), visit description, doctor notes, status.
   - **PRESCRIPTION**: per-medication name, dosage, frequency (inline row editing, deletable).
   - **TEST_RESULTS**: per-test value and status dropdown (`NORMAL` / `ABNORMAL` / `BORDERLINE`).
3. On **Save & Analyse**:
   - Each changed sub-event is `PUT` to `users/:userId/health-events/:eventId`.
   - `user.service.ts` `updateHealthEvent` now also calls `agentService.embedAndStore` after the MongoDB update so semantic search immediately reflects the correction.
   - `POST /api/agent/:userId/reanalyze` is called with the old and new event snapshots.
   - The backend computes a structured diff and asks the LLM to assess clinical significance, then updates the user profile if conditions/medications changed.
4. The AI analysis is shown inline in the modal. A **"Profile Updated"** badge indicates when `medicalConditions` or `medications` were changed.

### `reanalyzeEventChanges` pipeline

```
1. _computeEventDiff(oldEvent, newEvent)
   → identifies: conditionsAdded, conditionsRemoved,
                 medicationsAdded, medicationsRemoved,
                 testStatusChanges, descriptionChanged, statusChanged

2. _buildDiffPrompt(diff, oldEvent, newEvent)
   → compact bullet list of every change, asking for 2-3 sentence clinical assessment

3. getLLM(modelId).invoke(systemPrompt + diffPrompt)
   → returns analysis string

4. embedAndStore(userId, newEvent._id, 'HEALTH_EVENT', eventText, date)
   → overwrites the stale Neo4j UserHealthChunk node

5. if conditionsAdded/Removed or medicationsAdded:
   → userService.update(userId, { medicalConditions, medications })
   → profileUpdated: true

6. return { analysis, profileUpdated }
```

---

## Embedding Lifecycle

### Write (create)

Every write path calls `embedAndStore` after the MongoDB `.save()`:

| Source | Collection | Called by |
|--------|------------|-----------|
| Agent report store | `HealthEvent`, `DietLog`, `Lifestyle` | `_storeReport` |
| Direct REST (user-logged) | `HealthEvent` | `user.service.addHealthEvent` |
| Direct REST | `DietLog` | `user.service.addDietLog` |
| Direct REST | `Lifestyle` | `user.service.addLifestyle` |
| User profile create/update | `User` | `user.service.create` / `user.service.update` |

### Update (re-embed)

`user.service.updateHealthEvent` calls `agentService.embedAndStore` after the MongoDB update, ensuring the vector index always reflects the latest content. Re-analysis via `/reanalyze` also calls `embedAndStore` as part of its pipeline.

### Delete (remove embedding)

All three delete methods in `user.service` now call `agentService.deleteEmbedding(id)` **before** removing the MongoDB document, then also delete Neo4j structural nodes:

```typescript
// Removes the UserHealthChunk vector node from Neo4j
async deleteEmbedding(sourceId: string): Promise<void> {
  const session = driver.session();
  await session.run(
    `MATCH (c:UserHealthChunk {id: $sourceId}) DETACH DELETE c`,
    { sourceId }
  );
}
```

| Method | Embedding deleted | Neo4j node deleted |
|--------|-------------------|--------------------|
| `deleteHealthEvent` | `UserHealthChunk {id: eventId}` | `HealthEvent {id: eventId}` |
| `deleteDietLog` | `UserHealthChunk {id: logId}` | — |
| `deleteLifestyle` | `UserHealthChunk {id: id}` | `Lifestyle {id: id}` |

---

## Neo4j Vector Schema

Every piece of user health data becomes a `UserHealthChunk` node. Embeddings are produced locally by HuggingFace `all-MiniLM-L6-v2` (384-dim, no API key required, ~90 MB cached on first use).

```cypher
(:UserHealthChunk {
  id:        string,    -- MongoDB _id of the source document (primary key)
  userId:    string,
  chunkType: string,    -- 'HEALTH_EVENT' | 'DIET_LOG' | 'LIFESTYLE' | 'PROFILE'
  text:      string,
  date:      string,
  embedding: float[]    -- 384-dim cosine vector
})

CREATE VECTOR INDEX userHealthChunks IF NOT EXISTS
FOR (c:UserHealthChunk) ON c.embedding
OPTIONS { indexConfig: { `vector.dimensions`: 384, `vector.similarity_function`: 'cosine' } }

-- Retrieval query (top-8, scoped to user)
CALL db.index.vector.queryNodes('userHealthChunks', 20, $queryVector)
YIELD node AS c, score
WHERE c.userId = $userId
RETURN c.chunkType, c.text, c.date, score
ORDER BY score DESC LIMIT 8
```

`MERGE … SET` semantics mean an `embedAndStore` call on an existing `id` **updates** the node in-place — idempotent, no duplicate chunks.

### Text templates

| Type | Embedded text |
|------|---------------|
| `HEALTH_EVENT` | `"{eventType} on {date}: {titles.join(', ')} — {description} ({status})"` |
| `DIET_LOG` | `"(Doctor diet advice \| Meal) on {date}: {description}"` |
| `LIFESTYLE` | `"(Doctor lifestyle advice \| Lifestyle) on {date} [{categories}]: {description}"` |
| `PROFILE` | `"Patient {name}: conditions [{conditions}], allergies [{allergies}], medications [{meds}]"` |

---

## Node Implementations

### 1. `classifyIntent`

Fast 1-call classification using only the user's message (~200 tokens). Returns comma-separated labels: `HEALTH_RECORD`, `DIET_LOG`, `LIFESTYLE_LOG`, `MEDICAL_REPORT`, `MEAL_PLAN`, `QUERY`, `OTHER`.

### 2. `retrieveContext`

Embeds the user message locally → Neo4j vector search scoped to `userId` → returns top-8 chunks (~600 tokens added downstream).

### 3. Router

```typescript
const routeByIntent = (state: AgentState): string =>
  state.intent?.includes('MEDICAL_REPORT') ? 'parseMedicalReport' : 'synthesizeResponse';
```

### 4. `parseMedicalReport`

Extracts ALL structured data from a medical document into the `ParsedHealthData` shape. The system prompt enforces:
- Every condition goes in `visitSummary.conditions[]` (not individual cards).
- Clinic injections go in `visitSummary.injections[]`, never in `prescriptions`.
- `isDaily: true` for tablets/tonics taken at home; `false` for clinic-only injections.
- `prescriptions.items[]` contains only home-use medications.

**`_extractJson`** — strips markdown fences and finds the outermost `{…}` bounds, making extraction resilient to models that wrap JSON in prose:

```typescript
private _extractJson(text: string): any {
  let s = text
    .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  const start = s.indexOf('{'); const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
```

### 5. `storeReportData`

Single graph node that delegates to `_storeReport`. Replaced the old three-node sequence (`storeHealthEvents → storeDietLogs → storeLifestyle`):

```typescript
const storeReportData = async (state: AgentState): Promise<Partial<AgentState>> => {
  if (!state.parsedData) return {};
  const feedback = await this._storeReport(state.userId, state.parsedData);
  return feedback ? { storageFeedback: feedback } : {};
};
```

### `_storeReport()` — full pipeline

```
1. Generate reportGroupId = randomUUID()
   Build reportLabel = "Dr. {name} · {date}" (or just date if no doctor info)

2. If parsedData.visitSummary:
   → Save ONE HealthEvent { eventType: 'DOCTOR_VISIT', details: { doctorInfo, conditions, symptoms, injections, notes }, reportGroupId }
   → embedAndStore(userId, id, 'HEALTH_EVENT', text, date)

3. If parsedData.prescriptions.items.length > 0:
   → Save ONE HealthEvent { eventType: 'PRESCRIPTION', details: { doctorInfo, medications: MedicationItem[] }, reportGroupId }
   → embedAndStore(userId, id, 'HEALTH_EVENT', text, date)
   → For each medication where isDaily === true:
       Save DietLog { mealTypes: ['PILLS'], description: '{name} {dosage} — {frequency}', reportGroupId, reportLabel }

4. If parsedData.testResults.items.length > 0:
   → Save ONE HealthEvent { eventType: 'TEST_RESULTS', details: { testResults: TestItem[] }, reportGroupId }
   → embedAndStore(userId, id, 'HEALTH_EVENT', text, date)

5. For each dietAdvice item:
   → Save DietLog { reportGroupId, reportLabel, source: 'DOCTOR' }
   → embedAndStore(userId, id, 'DIET_LOG', text, date)

6. For each lifestyleAdvice item:
   → Save Lifestyle { reportGroupId, reportLabel, source: 'DOCTOR' }
   → embedAndStore(userId, id, 'LIFESTYLE', text, date)

7. Merge newConditions + newMedications into user profile (Set-based dedup)

8. Return human-readable feedback: "3 health record cards saved, 2 daily meds added to diet, 1 condition added to profile."
```

### 6. `synthesizeResponse`

**Token budget** (target < 1 200 tokens):

| Slot | ~Tokens |
|------|---------|
| System prompt (role + instructions) | 150 |
| Static profile | 100 |
| Retrieved context (8 chunks) | 600 |
| Conversation history (last 6 messages) | 250 |
| Current message | 100 |
| **Total** | **~1 200** |

---

## Streaming Chat (SSE)

### Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/agent/:userId/chat` | Blocking — returns `{ reply, intent, retrievedCount, stored, model }` |
| `POST` | `/api/agent/:userId/chat/stream` | SSE stream (POST + text/event-stream) |
| `POST` | `/api/agent/:userId/chat-with-file` | `multipart/form-data`; PDF/image → text extraction → blocking chat |

### Why POST for SSE?

Browser `EventSource` only supports GET. Because a JSON body is needed (message + history + model), the streaming endpoint is a POST returning `Content-Type: text/event-stream`, consumed by the frontend via `fetch + ReadableStream`.

### SSE Event Protocol

| Event | Payload | When emitted |
|-------|---------|--------------|
| `node` | `{ label: string }` | Before/after each pipeline step |
| `intent` | `{ intent: string[] }` | After classify step |
| `token` | `{ token: string }` | Each streamed LLM chunk |
| `done` | `{ intent, retrievedCount, stored, model }` | After all tokens |
| `error` | `{ message: string }` | On exception |

### `chatStream()` Pipeline Steps

```
1. sendEvent('node', 'Classifying intent...')
   _classifyIntent(message, llm)  →  sendEvent('intent', { intent })

2. sendEvent('node', 'Searching health history...')
   _retrieveContext(userId, message)  →  sendEvent('node', 'Found N relevant records')

3. if MEDICAL_REPORT in intent:
   sendEvent('node', 'Parsing medical report...')
   _parseMedicalReport(message, llm)
   sendEvent('node', 'Saving records to your profile...')
   _storeReport(userId, parsedData)  →  sendEvent('node', storageFeedback)

4. sendEvent('node', 'Generating response...')
   llm.stream([systemPrompt, ...history, userMsg])
   for each chunk: sendEvent('token', { token })

5. sendEvent('done', { intent, retrievedCount, stored, model })
```

### Frontend SSE Consumer

`handleSendMessage` opens the stream via `fetch + ReadableStream`, buffers bytes, splits on `\n\n` for complete SSE frames, and updates React state incrementally:

| Event | React state change |
|-------|-------------------|
| `node` | Updates `streamingStep` label on the placeholder bubble |
| `token` | Appends to `content` (blinking cursor effect) |
| `done` | Clears streaming flag, attaches intent/retrieved-count/model badge |
| `error` | Replaces placeholder with error text |

---

## API Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `GET` | `/api/agent/models` | — | Returns `AVAILABLE_MODELS` array |
| `POST` | `/api/agent/:userId/chat` | `{ message, history, model? }` | Blocking chat |
| `POST` | `/api/agent/:userId/chat/stream` | `{ message, history, model? }` | SSE stream |
| `POST` | `/api/agent/:userId/chat-with-file` | `multipart/form-data` | PDF/image → text → chat |
| `POST` | `/api/agent/:userId/reanalyze` | `{ oldEvent, newEvent, model? }` | Diff → LLM analysis → re-embed → profile update |

---

## Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/workbench
PORT=3000
NODE_ENV=development
API_PREFIX=/api

ANTHROPIC_API_KEY=   # Claude Sonnet 4.6
OPENAI_API_KEY=      # GPT-4o Mini
GROQ_API_KEY=        # Llama 3.3 70B (free tier) — console.groq.com
GOOGLE_API_KEY=      # Gemini 1.5 Flash (free tier) — aistudio.google.com

NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=
```

> **Embeddings** run locally via `Xenova/all-MiniLM-L6-v2` — no API key required.

---

## Token Budget Comparison

| Scenario | Before (tokens) | After (tokens) | Saving |
|----------|-----------------|----------------|--------|
| Simple health Q&A | 800 – 1 500 | ~900 | ~40% |
| Query with full history (50 records) | 4 000 – 6 000 | ~1 200 | ~75% |
| Medical report parsing + store | 3 000 – 5 000 | ~1 800 | ~55% |
| Meal plan generation | 2 000 – 4 000 | ~1 500 | ~55% |

---

## Files — Status

| File | Status | Notes |
|------|--------|-------|
| `apps/api/src/app/agent/agent.service.ts` | ✅ Done | LangGraph graph · multi-model cache · `_storeReport` (3-card grouping + `reportGroupId`/`reportLabel`) · `deleteEmbedding` · `reanalyzeEventChanges` · `_computeEventDiff` · `_buildDiffPrompt` |
| `apps/api/src/app/agent/agent.controller.ts` | ✅ Done | `GET /models` · `POST /chat` · `POST /chat/stream` · `POST /chat-with-file` · `POST /reanalyze` |
| `apps/api/src/app/users/user.service.ts` | ✅ Done | All write paths call `embedAndStore` · `updateHealthEvent` re-embeds · `deleteHealthEvent`/`deleteDietLog`/`deleteLifestyle` call `deleteEmbedding` |
| `apps/api/src/app/health-events/health-event.schema.ts` | ✅ Done | `reportGroupId` (indexed) · rich `details` object (doctorInfo / conditions / medications / testResults) |
| `apps/api/src/app/diet-logs/diet-log.schema.ts` | ✅ Done | `reportGroupId` (indexed) · `reportLabel` |
| `apps/api/src/app/lifestyle/lifestyle.schema.ts` | ✅ Done | `reportGroupId` (indexed) · `reportLabel` |
| `apps/ui/src/app/app.tsx` | ✅ Done | 3-card grouped display · edit modal with AI re-analysis · `reportLabel` pills on diet/lifestyle cards (compact panels + RecordsBoard board + timeline) |
| `apps/api/src/app/neo4j/neo4j.service.ts` | ✅ Done | `ensureVectorIndex()` runs at startup |
| `apps/api/.env.example` | ✅ Done | Documents all 4 LLM keys with source URLs |
| `.gitignore` | ✅ Done | Protects `.env`, `node_modules`, `dist`, `.nx/cache`, HuggingFace `.cache/` |
| `apps/api/src/app/agent/agent.state.ts` | _(planned)_ | Interfaces currently inline in `agent.service.ts` |
| `apps/api/src/app/agent/agent.graph.ts` | _(planned)_ | Graph currently built inside `AgentService.buildGraph()` |
| `apps/api/src/app/meal-plans/meal-plan.service.ts` | _(planned)_ | Meal plan chunks not yet embedded |

---

## Remaining Work (Planned)

1. **Backfill script** — one-shot script to embed pre-existing MongoDB records created before the agent was introduced.
2. **Multi-branch router** — extend the conditional edge to route `HEALTH_RECORD`, `DIET_LOG`, and `LIFESTYLE_LOG` intents to dedicated store nodes.
3. **File upload streaming** — `chat-with-file` currently blocks; streaming could begin after extraction completes.
4. **Module extraction** — move `AgentState`, graph factory, and node functions into `agent.state.ts` / `agent.graph.ts` / `agent.nodes.ts`.
5. **Reanalyze for all sub-events** — current `/reanalyze` endpoint runs diff on the first changed sub-event only; extend to diff all three cards and aggregate the analysis.
