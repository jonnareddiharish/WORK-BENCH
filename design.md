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

---

## Goal

Replace the flat-context, sequential flow with a **LangGraph graph** where:
1. **User health data is embedded** into Neo4j at write-time.
2. **Every agent invocation runs a semantic RAG step** that retrieves only the records relevant to the user's current message.
3. **Token usage drops 70–85%** because the LLM sees ~1 000 targeted tokens instead of a full dump.
4. **Multiple LLM providers** are supported with live model switching and per-model graph caching.

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
  ┌──────┴──────────────────┐
  │                         │
  ▼                         ▼
MEDICAL_REPORT         all other intents
  │                         │
  ▼                         │
parseMedicalReport          │
  │                         │
  ▼                         │
storeHealthEvents           │
  │                         │
  ▼                         │
storeDietLogs               │
  │                         │
  ▼                         │
storeLifestyle              │
  │                         │
  └──────────┬──────────────┘
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
| `llama-3.3-70b-versatile` | Llama 3.3 | Groq | Yes — [console.groq.com](https://console.groq.com/keys) |
| `gemini-1.5-flash` | Gemini Flash | Google | Yes — [aistudio.google.com](https://aistudio.google.com/apikey) |

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
// Per-model singleton caches
private readonly _llmCache  = new Map<string, BaseChatModel>();
private readonly _graphCache = new Map<string, any>();

getLLM(modelId: string): BaseChatModel {
  if (this._llmCache.has(modelId)) return this._llmCache.get(modelId)!;
  let llm: BaseChatModel;

  if (modelId.startsWith('claude'))  llm = new ChatAnthropic({ model: modelId, temperature: 0 });
  else if (modelId.startsWith('gpt')) llm = new ChatOpenAI({ model: modelId, temperature: 0 });
  else if (modelId.startsWith('gemini')) {
    // Pass key explicitly — dotenv may leave surrounding spaces
    const apiKey = (process.env.GOOGLE_API_KEY ?? '').trim();
    llm = new ChatGoogleGenerativeAI({ model: modelId, temperature: 0, apiKey, apiVersion: 'v1' } as any);
  } else {
    // Groq: llama-*, gemma-*, mixtral-*, qwen-*, deepseek-*
    llm = new ChatGroq({ model: modelId, temperature: 0 });
  }
  this._llmCache.set(modelId, llm);
  return llm;
}

private getGraph(modelId: string): any {
  if (!this._graphCache.has(modelId))
    this._graphCache.set(modelId, this.buildGraph(this.getLLM(modelId)));
  return this._graphCache.get(modelId);
}
```

### Model Selector UI

The chat header exposes a pill-button selector. Each pill shows a tooltip with the model's provider note. The selector is disabled while a request is in-flight.

```
[ Claude ] [ GPT-4o Mini ] [ Llama 3.3 ] [ Gemini Flash ]
  violet      emerald         orange          blue
```

The selected model is sent in the request body for both streaming and file-upload endpoints and is echoed back in the `done` SSE event. Completed AI messages display a small model badge.

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
  text:       string;   // pre-formatted, ready to paste into prompt
  similarity: number;   // cosine score from Neo4j
  date?:      string;
}

interface ParsedHealthData {
  healthEvents?: {
    eventType:   string;       // DOCTOR_VISIT | DISEASE_DIAGNOSIS | MEDICATION | TREATMENT_START
    titles:      string[];
    description: string;
    status:      string;       // ACTIVE | RESOLVED | ONGOING
    details?: {
      doctorName?:    string;
      medicationName?: string;
      dosage?:        string;
      symptoms?:      string[];
      doctorNotes?:   string;
    };
  }[];
  dietAdvice?:      { description: string; mealTypes: string[] }[];
  lifestyleAdvice?: { description: string; categories: string[] }[];
  newConditions?:   string[];   // merged into user.medicalConditions
  newMedications?:  string[];   // merged into user.medications
}

interface AgentState {
  // ── inputs ──────────────────────────────────────────
  userId:              string;
  userProfile:         UserProfileSnapshot;
  message:             string;
  conversationHistory: BaseMessage[];       // bounded to last 6 messages

  // ── intermediate ─────────────────────────────────────
  intent:          string[];          // e.g. ['MEDICAL_REPORT']
  retrievedContext: RetrievedChunk[]; // top-8 RAG results
  parsedData:      ParsedHealthData | null;
  storageFeedback: string;            // human-readable "Saved 5 records…"

  // ── output ───────────────────────────────────────────
  response: string;
}
```

---

## Neo4j Vector Schema

Every piece of user health data becomes a `UserHealthChunk` node. Embeddings are produced locally by HuggingFace `all-MiniLM-L6-v2` (384-dim, no API key required, ~90 MB cached on first use).

```cypher
(:UserHealthChunk {
  id:        string,    -- MongoDB _id of the source document
  userId:    string,
  chunkType: string,    -- 'HEALTH_EVENT' | 'DIET_LOG' | 'LIFESTYLE' | 'PROFILE' | 'MEAL_PLAN'
  text:      string,    -- the text that was embedded
  date:      string,    -- ISO date for time-aware retrieval
  embedding: float[]    -- 384-dim vector (all-MiniLM-L6-v2)
})

-- Vector index (created once at AgentService startup)
CREATE VECTOR INDEX userHealthChunks IF NOT EXISTS
FOR (c:UserHealthChunk) ON c.embedding
OPTIONS { indexConfig: { `vector.dimensions`: 384, `vector.similarity_function`: 'cosine' } }

-- Retrieval query (top-8, scoped to user)
CALL db.index.vector.queryNodes('userHealthChunks', 20, $queryVector)
YIELD node AS c, score
WHERE c.userId = $userId
RETURN c.chunkType, c.text, c.date, score
ORDER BY score DESC
LIMIT 8
```

### Text templates for each chunk type

| Type | Embedded text |
|------|---------------|
| `HEALTH_EVENT` | `"{eventType} on {date}: {titles.join(', ')} — {description} ({status})"` |
| `DIET_LOG` | `"Meal on {date} ({mealType}): {foodItems.map(i => i.name + ' ' + i.quantity).join(', ')}"` |
| `LIFESTYLE` | `"Lifestyle on {date} [{categories.join('/')}]: {description}"` |
| `PROFILE` | `"Patient {name}: conditions [{conditions}], allergies [{allergies}], medications [{meds}]"` |
| `MEAL_PLAN` | `"Meal plan day {dayNumber}: {meals.map(m => m.mealType + ': ' + m.title).join('; ')}"` |

---

## Node Implementations

### 1. `classifyIntent`

**Input used**: `message` only  
**Tokens**: ~200 (system + message)

```typescript
private async _classifyIntent(message: string, llm: BaseChatModel): Promise<string[]> {
  const res = await llm.invoke([
    new SystemMessage(
      'Classify the user message into one or more of: HEALTH_RECORD, DIET_LOG, LIFESTYLE_LOG, ' +
      'MEDICAL_REPORT, MEAL_PLAN, QUERY, OTHER. ' +
      'MEDICAL_REPORT means the message IS a medical report/lab result/doctor notes to be parsed and stored. ' +
      'Return ONLY comma-separated labels, nothing else.'
    ),
    new HumanMessage(message),
  ]);
  return (res.content as string).split(',').map(s => s.trim().toUpperCase());
}
```

---

### 2. `retrieveContext`

**Input used**: `message`, `userId`  
**Tokens added to downstream nodes**: ~600 (8 chunks × ~75 tokens each)

Embeds the user's message locally, runs a Neo4j vector search scoped to the user, and returns the top-8 most relevant health records.

---

### 3. Router (conditional edge)

```typescript
const routeByIntent = (state: AgentState): string =>
  state.intent?.includes('MEDICAL_REPORT') ? 'parseMedicalReport' : 'synthesizeResponse';
```

All non-MEDICAL_REPORT intents (HEALTH_RECORD, DIET_LOG, LIFESTYLE_LOG, MEAL_PLAN, QUERY) route directly to `synthesizeResponse` with the retrieved context injected.

---

### 4. `parseMedicalReport`

Extracts ALL structured data from a medical document. The extraction prompt is explicit about every event type to produce to avoid omissions, and the result is parsed with `_extractJson` which is resilient to models that wrap JSON output in prose or markdown fences.

```typescript
private async _parseMedicalReport(message: string, llm: BaseChatModel): Promise<ParsedHealthData> {
  const systemPrompt =
    'You are a medical data extraction system. Extract ALL information from the medical report.\n' +
    'Return ONLY a valid JSON object — no prose, no markdown fences, nothing else.\n\n' +
    'Required JSON shape:\n' +
    '{\n' +
    '  "healthEvents": [\n' +
    '    One DOCTOR_VISIT event for the consultation: { "eventType": "DOCTOR_VISIT", ... },\n' +
    '    One DISEASE_DIAGNOSIS event PER diagnosis/finding: { "eventType": "DISEASE_DIAGNOSIS", ... },\n' +
    '    One MEDICATION event PER prescribed medication: { "eventType": "MEDICATION", ... }\n' +
    '  ],\n' +
    '  "dietAdvice": [...],\n' +
    '  "lifestyleAdvice": [...],\n' +
    '  "newConditions": ["each diagnosis as a plain string"],\n' +
    '  "newMedications": ["each medication with dosage as a plain string"]\n' +
    '}';
  // ...
}
```

**Robust JSON extraction** — `_extractJson` strips markdown fences first, then finds the outermost `{…}` bounds in the response. This handles Llama 3.3 and other models that prefix or suffix the JSON with explanatory prose:

```typescript
private _extractJson(text: string): any {
  let s = text
    .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
```

---

### 5. Storage nodes (`storeHealthEvents`, `storeDietLogs`, `storeLifestyle`)

Each node writes parsed data to MongoDB, then calls `embedAndStore` to index the text in Neo4j.

**Supported health event types** (polymorphic `HealthEvent` collection):

| `eventType` | What it captures |
|-------------|-----------------|
| `DOCTOR_VISIT` | Consultation record with `doctorName` and `doctorNotes` in `details` |
| `DISEASE_DIAGNOSIS` | A diagnosis or clinical finding |
| `MEDICATION` | A prescribed drug with `medicationName` and `dosage` in `details` |
| `TREATMENT_START` | A procedure or treatment beginning |

The final `storeLifestyle` node also **merges new conditions and medications into the user's profile**:

```typescript
// De-duplicate and merge into user.medicalConditions and user.medications
await this.userService.update(state.userId, {
  medicalConditions: Array.from(new Set([...currentUser.medicalConditions, ...newConditions])),
  medications:       Array.from(new Set([...currentUser.medications,       ...newMedications])),
});
```

---

### 6. `synthesizeResponse`

**Token budget** (target < 1 200 tokens total):

| Slot | Content | Tokens |
|------|---------|--------|
| System prompt | Role + instructions | ~150 |
| Static profile | name, allergies, conditions, meds | ~100 |
| Retrieved context | 8 chunks × ~75 tokens | ~600 |
| Conversation history | Last 3 exchanges (6 messages bounded) | ~250 |
| Current message | User input | ~100 |
| **Total** | | **~1 200** |

When a medical report was just stored, the `storageFeedback` string is appended to the user message so the LLM knows what was saved and can acknowledge it naturally.

---

## Embedding Indexing Pipeline

### At startup (AgentService constructor)
Check if Neo4j vector index `userHealthChunks` exists; create it if not.

### At write-time (via agent)
Every agent write calls `embedAndStore` after the MongoDB `.save()`:

| Node | Collection written | Chunk type |
|------|--------------------|------------|
| `storeHealthEvents` | `HealthEvent` | `HEALTH_EVENT` |
| `storeDietLogs` | `DietLog` | `DIET_LOG` |
| `storeLifestyle` | `Lifestyle` | `LIFESTYLE` |

> _(Planned)_ Write-time embed hooks in the domain services (`HealthEventService`, `DietLogService`, `LifestyleService`, `UserService`) — records written directly via REST (not through the agent) are not yet indexed.

---

## Streaming Chat (SSE)

### Overview

Two response modes:

| Mode | Endpoint | When used |
|------|----------|-----------|
| **Blocking** | `POST /agent/:userId/chat` | Internal / batch use |
| **Streaming** | `POST /agent/:userId/chat/stream` | All text messages from the UI |
| **File upload** | `POST /agent/:userId/chat-with-file` | PDF / image medical documents |

### Why POST for SSE?

Browser `EventSource` only supports GET. Because we need to send a JSON body (message + history + model), the streaming endpoint is a `POST` that returns `Content-Type: text/event-stream`. The frontend consumes it via `fetch` + `ReadableStream`.

### SSE Event Protocol

Each event follows standard SSE wire format (`event: <type>\ndata: <json>\n\n`):

| Event | Payload | When emitted |
|-------|---------|--------------|
| `node` | `{ label: string }` | Before and after each pipeline step |
| `intent` | `{ intent: string[] }` | After classify step resolves |
| `token` | `{ token: string }` | Each streamed chunk from `llm.stream()` |
| `done` | `{ intent, retrievedCount, stored, model }` | After all tokens sent |
| `error` | `{ message: string }` | On unhandled exception |

### Backend: `chatStream()` Pipeline

`AgentService.chatStream()` runs the pipeline directly (bypassing the compiled LangGraph) so it can emit events between steps and stream individual tokens:

```
1. sendEvent('node', 'Classifying intent...')
   → _classifyIntent(message, llm)           [~200 tokens]
   → sendEvent('intent', { intent })

2. sendEvent('node', 'Searching health history...')
   → _retrieveContext(userId, message)       [embed → Neo4j]
   → sendEvent('node', `Found N relevant records`)

3. if MEDICAL_REPORT in intent:
     sendEvent('node', 'Parsing medical report...')
     → _parseMedicalReport(message, llm)    [LLM → _extractJson → ParsedHealthData]
     sendEvent('node', 'Saving records to your profile...')
     → _storeReport(userId, parsedData)     [MongoDB writes + embed + profile merge]
     → sendEvent('node', storageFeedback)

4. sendEvent('node', 'Generating response...')
   → llm.stream([systemPrompt, ...history, userMsg])
   → for each chunk: sendEvent('token', { token })

5. sendEvent('done', { intent, retrievedCount, stored, model })
```

### `_storeReport()` (streaming path)

The streaming path uses `_storeReport` rather than the individual graph store nodes. It handles all three save operations plus the user profile merge in one method:

```
_storeReport(userId, parsedData):
  1. Save all healthEvents (DOCTOR_VISIT, DISEASE_DIAGNOSIS, MEDICATION) → embed each
  2. Save all dietAdvice → embed each
  3. Save all lifestyleAdvice → embed each
  4. Merge newConditions + newMedications into user profile (Set-based dedup)
  5. Return human-readable feedback string
```

### Private Helper Methods

| Method | Parameters | Used by |
|--------|-----------|---------|
| `_classifyIntent` | `message, llm` | graph node + `chatStream` |
| `_retrieveContext` | `userId, message` | graph node + `chatStream` |
| `_parseMedicalReport` | `message, llm` | graph node + `chatStream` |
| `_extractJson` | `text` | `_parseMedicalReport` |
| `_storeReport` | `userId, parsedData` | `chatStream` only |
| `_buildProfileText` | `userProfile` | graph node + `chatStream` |
| `_chunkText` | `content` | `chatStream` token loop |

**`_chunkText`** handles the two content formats that different providers emit:
- Anthropic: `content` is an `Array<{type:'text', text:string}>`
- OpenAI/Groq/Gemini: `content` is a plain `string`

### Frontend: SSE Consumer

`handleSendMessage` in `app.tsx` opens the stream via `fetch + ReadableStream`:

```typescript
const res = await fetch(`/api/agent/${userId}/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, history, model: selectedModel }),
});
const reader = res.body!.getReader();
// Buffer bytes, split on '\n\n' for complete SSE frames,
// parse event + data, update React state incrementally.
```

**State updates per event:**

| Event | React state change |
|-------|-------------------|
| `node` | Updates `streamingStep` on the placeholder bubble (animated pill) |
| `token` | Appends to `content` of the placeholder (blinking cursor) |
| `done` | Sets `isStreaming: false`, attaches intent/retrieved-count/model fields |
| `error` | Replaces placeholder content with error text |

### Chat Message Type

```typescript
{
  role:           'user' | 'ai';
  content:        string;
  intent?:        string[];
  retrievedCount?: number;
  model?:         string;            // model ID echoed from 'done' event
  attachedFile?:  { name: string; type: string; preview?: string };
  isStreaming?:   boolean;           // true while SSE stream is open
  streamingStep?: string;            // label of the current pipeline step
}
```

### UI Behaviour During Streaming

1. User sends message → user bubble appears immediately, input field clears.
2. Empty AI placeholder added with `isStreaming: true`, `streamingStep: 'Starting...'`.
3. `node` events update the animated bouncing-dot pill with the current step label.
4. First `token` event causes the bubble content to appear; cursor blinks at the end.
5. Subsequent tokens append in-place — smooth typewriter effect, no re-mount.
6. `done` event removes streaming indicators and shows intent/retrieved-count pills and model badge.
7. `chatEndRef` scroll effect fires on every `chatHistory` update → always scrolled to bottom.

---

## API Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `GET` | `/api/agent/models` | — | Returns `AVAILABLE_MODELS` array |
| `POST` | `/api/agent/:userId/chat` | `{ message, history, model? }` | Blocking; returns `{ reply, intent, retrievedCount, stored, model }` |
| `POST` | `/api/agent/:userId/chat/stream` | `{ message, history, model? }` | SSE stream |
| `POST` | `/api/agent/:userId/chat-with-file` | `multipart/form-data` `file` + `message?` + `model?` | PDF/image → text extraction → blocking chat |

---

## Environment Variables

```env
# Required
MONGODB_URI=mongodb://localhost:27017/workbench
PORT=3000
NODE_ENV=development
API_PREFIX=/api

# LLM providers — add the keys for providers you want to use
ANTHROPIC_API_KEY=   # Claude Sonnet 4.6 — console.anthropic.com (requires paid credits)
OPENAI_API_KEY=      # GPT-4o Mini — platform.openai.com/api-keys
GROQ_API_KEY=        # Llama 3.3 70B (free tier) — console.groq.com/keys
GOOGLE_API_KEY=      # Gemini 1.5 Flash (free tier) — aistudio.google.com/apikey

# Neo4j (optional — graph features + semantic search)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=
```

> **Embeddings** run locally via HuggingFace `Xenova/all-MiniLM-L6-v2` — no API key required.  
> The agent gracefully falls back: if a model key is missing it returns a provider error; other models in the selector still work.

---

## Token Budget Comparison

| Scenario | Before (tokens) | After (tokens) | Saving |
|----------|-----------------|----------------|--------|
| Simple health Q&A | 800 – 1 500 | ~900 | ~40% |
| Query with full history (50 records) | 4 000 – 6 000 | ~1 200 | ~75% |
| Medical report parsing + store | 3 000 – 5 000 | ~1 800* | ~55% |
| Meal plan generation | 2 000 – 4 000 | ~1 500 | ~55% |

\* Parsing node receives message only (~500 tokens); synthesize node receives RAG context (~700 tokens). Two separate LLM calls but both smaller than the old single call.

---

## Files — Status

| File | Status | Notes |
|------|--------|-------|
| `apps/api/src/app/agent/agent.service.ts` | ✅ Done | LangGraph graph + multi-model cache + private helpers + `chat()` + `chatStream()` + `_extractJson` + `_storeReport` |
| `apps/api/src/app/agent/agent.controller.ts` | ✅ Done | `GET /models`, blocking `POST /chat`, streaming `POST /chat/stream`, `POST /chat-with-file` (all accept `model?`) |
| `apps/ui/src/app/app.tsx` | ✅ Done | Model selector pills, SSE consumer, streaming state, reasoning step pills, model badge, auto-scroll |
| `apps/api/src/app/health-events/health-event.schema.ts` | ✅ Done | Supports DOCTOR_VISIT / DISEASE_DIAGNOSIS / MEDICATION / TREATMENT_START + `details` object |
| `apps/api/src/app/neo4j/neo4j.service.ts` | ✅ Done | `ensureVectorIndex()` runs at startup |
| `apps/api/.env.example` | ✅ Done | Documents all 4 LLM keys with source URLs |
| `.gitignore` | ✅ Done | Protects `.env` files, `node_modules`, `dist`, `.nx/cache`, HuggingFace `.cache/` |
| `apps/api/src/app/agent/agent.state.ts` | _(planned)_ | Interfaces currently defined inline in `agent.service.ts` |
| `apps/api/src/app/agent/agent.graph.ts` | _(planned)_ | Graph currently built inside `AgentService.buildGraph()` |
| `apps/api/src/app/agent/agent.nodes.ts` | _(planned)_ | Nodes currently as private methods on `AgentService` |
| `apps/api/src/app/users/user.service.ts` | _(planned)_ | `embedAndStore` on profile update not yet wired |
| `apps/api/src/app/health-events/health-event.service.ts` | _(planned)_ | `embedAndStore` called from agent graph, not from the service directly |
| `apps/api/src/app/diet-logs/diet-log.service.ts` | _(planned)_ | Same — embed happens only through agent |
| `apps/api/src/app/lifestyle/lifestyle.service.ts` | _(planned)_ | Same |
| `apps/api/src/app/meal-plans/meal-plan.service.ts` | _(planned)_ | Meal plan chunks not yet embedded |

---

## Remaining Work (Planned)

1. **Write-time embed hooks** — wire `embedAndStore` into each domain service so records written directly via REST (not through the agent) are also indexed in Neo4j.
2. **Backfill script** — one-shot script to embed pre-existing MongoDB records for users who created data before the agent was introduced.
3. **Multi-branch router** — extend the conditional edge to route `HEALTH_RECORD`, `DIET_LOG`, and `LIFESTYLE_LOG` intents to dedicated store nodes (currently all non-MEDICAL_REPORT paths go straight to `synthesizeResponse`).
4. **File upload streaming** — `chat-with-file` currently blocks; could begin streaming after file extraction completes.
5. **Module extraction** — move `AgentState`, graph factory, and node functions into separate files (`agent.state.ts`, `agent.graph.ts`, `agent.nodes.ts`) for maintainability.
