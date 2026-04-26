# LangGraph Agent Architecture — Optimised Design

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

---

## Goal

Replace the flat-context, sequential flow with a **LangGraph graph** where:
1. **User health data is embedded** into Neo4j at write-time.
2. **Every agent invocation runs a semantic RAG step** that retrieves only the records relevant to the user's current message.
3. **Token usage drops 70–85%** because the LLM sees ~1 000 targeted tokens instead of a full dump.

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
    ┌────┴────┐   Conditional edges on intent[]
    │  router  │
    └──┬──┬──┬──┬──┬──┘
       │  │  │  │  │
       │  │  │  │  └─── QUERY / OTHER
       │  │  │  └─────── LIFESTYLE_LOG
       │  │  └─────────── DIET_LOG
       │  └───────────── HEALTH_RECORD
       └──────────────── MEDICAL_REPORT
       │
       ▼ (each action node)
┌──────────────────┐
│  storeAndEmbed   │  Write to MongoDB → embed text → upsert Neo4j vector node
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  synthesizeResponse  │  Claude Sonnet — compact context only
└────────┬─────────────┘
         │
        END
```

---

## State Schema

```typescript
// apps/api/src/app/agent/agent.state.ts

import { BaseMessage } from '@langchain/core/messages';

export interface RetrievedChunk {
  type: 'PROFILE' | 'HEALTH_EVENT' | 'DIET_LOG' | 'LIFESTYLE' | 'MEAL_PLAN';
  text: string;           // pre-formatted, ready to paste into prompt
  similarity: number;     // cosine score from Neo4j
  date?: string;
}

export interface ParsedHealthData {
  healthEvents?: { eventType: string; titles: string[]; description: string; status: string }[];
  dietAdvice?:   { description: string; mealTypes: string[] }[];
  lifestyleAdvice?: { description: string; categories: string[] }[];
}

export interface AgentState {
  // ── inputs ──────────────────────────────────────────
  userId:              string;
  userProfile:         UserProfileSnapshot; // always small — name + allergies + conditions
  message:             string;
  conversationHistory: BaseMessage[];       // bounded to last 6 messages

  // ── intermediate ─────────────────────────────────────
  intent:          string[];          // e.g. ['MEDICAL_REPORT', 'HEALTH_RECORD']
  retrievedContext: RetrievedChunk[]; // top-8 RAG results
  parsedData?:     ParsedHealthData;
  storageFeedback: string;            // human-readable "I've saved your …"

  // ── output ───────────────────────────────────────────
  response: string;
}

export interface UserProfileSnapshot {
  name:              string;
  knownAllergies:    string[];
  medicalConditions: string[];
  medications:       string[];
  biologicalSex?:    string;
  bloodType?:        string;
}
```

---

## Neo4j Vector Schema

Every piece of user health data becomes a `UserHealthChunk` node. Embeddings are produced locally by HuggingFace `all-MiniLM-L6-v2` (384-dim, no API key required, ~90 MB cached on first use).

```cypher
-- Node label
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

-- Retrieval query (parameterised by userId and queryEmbedding)
CALL db.index.vector.queryNodes(
  'userHealthChunks', 20, $queryVector
) YIELD node AS c, score
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
const classifyIntent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const res = await llm.invoke([
    new SystemMessage(
      'Classify the user message into one or more of: HEALTH_RECORD, DIET_LOG, LIFESTYLE_LOG, MEDICAL_REPORT, MEAL_PLAN, QUERY, OTHER. Return comma-separated labels only.'
    ),
    new HumanMessage(state.message)
  ]);
  return { intent: (res.content as string).split(',').map(s => s.trim()) };
};
```

---

### 2. `retrieveContext`

**Input used**: `message`, `userId`, `userProfile`  
**Tokens added to downstream nodes**: ~600 (8 chunks × ~75 tokens each)

```typescript
const retrieveContext = async (state: AgentState): Promise<Partial<AgentState>> => {
  // 1. Embed the user's message
  const queryVector = await embeddings.embedQuery(state.message);

  // 2. Vector search in Neo4j — scoped to this user
  const session = neo4jService.getDriver().session();
  const result = await session.run(
    `CALL db.index.vector.queryNodes('userHealthChunks', 8, $queryVector)
     YIELD node AS c, score
     WHERE c.userId = $userId
     RETURN c.chunkType AS type, c.text AS text, c.date AS date, score
     ORDER BY score DESC`,
    { queryVector, userId: state.userId }
  );
  await session.close();

  const chunks: RetrievedChunk[] = result.records.map(r => ({
    type:       r.get('type'),
    text:       r.get('text'),
    similarity: r.get('score'),
    date:       r.get('date'),
  }));

  return { retrievedContext: chunks };
};
```

---

### 3. Router (conditional edge)

The live router uses a single branch point: medical report parsing vs. direct synthesis. All other intents (HEALTH_RECORD, DIET_LOG, LIFESTYLE_LOG, MEAL_PLAN, QUERY) are handled by `synthesizeResponse` with the retrieved context.

```typescript
const routeByIntent = (state: AgentState): string =>
  state.intent.includes('MEDICAL_REPORT') ? 'parseMedicalReport' : 'synthesizeResponse';
```

> _(Planned)_ The full multi-branch router (per-intent store nodes) shown in the High-Level Graph above is not yet wired. The current graph only branches on `MEDICAL_REPORT`.

---

### 4. Action nodes

Each action node writes to MongoDB and then calls `storeAndEmbed` to keep the vector store current.

```typescript
// Shared embed-and-upsert utility
const embedAndStore = async (
  userId: string,
  sourceId: string,
  chunkType: string,
  text: string,
  date: string
) => {
  const vector = await embeddings.embedQuery(text);
  const session = neo4jService.getDriver().session();
  await session.run(
    `MERGE (c:UserHealthChunk {id: $sourceId})
     SET c.userId    = $userId,
         c.chunkType = $chunkType,
         c.text      = $text,
         c.date      = $date,
         c.embedding = $vector`,
    { sourceId, userId, chunkType, text, date, vector }
  );
  await session.close();
};

// Example: storeHealthEvent
const storeHealthEvent = async (state: AgentState): Promise<Partial<AgentState>> => {
  // parsedData already set by parseMedicalReport, or construct from intent
  for (const event of state.parsedData?.healthEvents ?? []) {
    const doc = await new healthEventModel({ ...event, userId: state.userId, source: 'AI', date: new Date() }).save();
    const text = `${event.eventType} on ${doc.date.toISOString().slice(0,10)}: ${event.titles.join(', ')} — ${event.description} (${event.status})`;
    await embedAndStore(state.userId, doc._id.toString(), 'HEALTH_EVENT', text, doc.date.toISOString());
  }
  return { storageFeedback: "I've saved the health record to your profile." };
};
```

---

### 5. `parseMedicalReport`

**Input used**: `message` only — no user context needed for extraction  
**Output**: structured `parsedData`

```typescript
const parseMedicalReport = async (state: AgentState): Promise<Partial<AgentState>> => {
  const res = await llm.invoke([
    new SystemMessage('Extract structured medical data from the report. Return JSON only:\n{"healthEvents":[...],"dietAdvice":[...],"lifestyleAdvice":[...]}'),
    new HumanMessage(state.message)
  ]);
  const parsedData: ParsedHealthData = JSON.parse(res.content as string);
  return { parsedData };
};
// Edges: parseMedicalReport → storeHealthEvent → storeDietLog → storeLifestyle → synthesizeResponse
```

---

### 6. `synthesizeResponse`

**Token budget** (target < 1 200 tokens total):

| Slot | Content | Tokens |
|------|---------|--------|
| System prompt | Role + instructions | ~150 |
| Static profile | name, allergies, conditions, meds | ~100 |
| Retrieved context | 8 chunks × ~75 tokens | ~600 |
| Conversation history | Last 3 exchanges (bounded) | ~250 |
| Current message | User input | ~100 |
| **Total** | | **~1 200** |

```typescript
const synthesizeResponse = async (state: AgentState): Promise<Partial<AgentState>> => {
  const profile  = formatProfile(state.userProfile);           // ~100 tokens
  const context  = state.retrievedContext.map(c => `[${c.type}] ${c.text}`).join('\n'); // ~600
  const history  = state.conversationHistory.slice(-6);        // last 3 exchanges

  const res = await llm.invoke([
    new SystemMessage(
      `You are a personal health advisor for ${state.userProfile.name}.\n\n` +
      `PATIENT PROFILE:\n${profile}\n\n` +
      `RELEVANT HEALTH HISTORY (retrieved by semantic search):\n${context}\n\n` +
      `Answer helpfully and concisely. Cite specific records when relevant.`
    ),
    ...history,
    new HumanMessage(`${state.message}${state.storageFeedback ? '\n\n' + state.storageFeedback : ''}`)
  ]);

  return { response: res.content as string };
};
```

---

## Full Graph Assembly

```typescript
// apps/api/src/app/agent/agent.graph.ts

import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState } from './agent.state';

export function buildAgentGraph(nodes: AgentNodes) {
  const graph = new StateGraph<AgentState>({
    channels: {
      userId:              null,
      userProfile:         null,
      message:             null,
      conversationHistory: { value: (x, y) => x.concat(y), default: () => [] },
      intent:              null,
      retrievedContext:    null,
      parsedData:          null,
      storageFeedback:     { value: (_, y) => y, default: () => '' },
      response:            null,
    }
  });

  // ── Nodes ────────────────────────────────────────────
  graph.addNode('classifyIntent',      nodes.classifyIntent);
  graph.addNode('retrieveContext',     nodes.retrieveContext);
  graph.addNode('parseMedicalReport',  nodes.parseMedicalReport);
  graph.addNode('storeHealthEvent',    nodes.storeHealthEvent);
  graph.addNode('storeDietLog',        nodes.storeDietLog);
  graph.addNode('storeLifestyle',      nodes.storeLifestyle);
  graph.addNode('generateMealPlan',    nodes.generateMealPlan);
  graph.addNode('synthesizeResponse',  nodes.synthesizeResponse);

  // ── Edges ─────────────────────────────────────────────
  graph.addEdge(START,               'classifyIntent');
  graph.addEdge('classifyIntent',    'retrieveContext');

  graph.addConditionalEdges('retrieveContext', nodes.routeByIntent, {
    parseMedicalReport: 'parseMedicalReport',
    storeHealthEvent:   'storeHealthEvent',
    storeDietLog:       'storeDietLog',
    storeLifestyle:     'storeLifestyle',
    generateMealPlan:   'generateMealPlan',
    synthesizeResponse: 'synthesizeResponse',
  });

  // Medical report → store all extracted data in sequence
  graph.addEdge('parseMedicalReport', 'storeHealthEvent');
  graph.addEdge('storeHealthEvent',   'storeDietLog');
  graph.addEdge('storeDietLog',       'storeLifestyle');
  graph.addEdge('storeLifestyle',     'synthesizeResponse');

  // Direct action → respond
  graph.addEdge('generateMealPlan',   'synthesizeResponse');
  graph.addEdge('synthesizeResponse', END);

  return graph.compile();
}
```

---

## Embedding Indexing Pipeline

### At startup (AgentService constructor)
1. Check if Neo4j vector index `userHealthChunks` exists; create it if not.
2. **Backfill job**: for each user, fetch all health events, diet logs, and lifestyle records from MongoDB that don't yet have a corresponding `UserHealthChunk` node in Neo4j and embed them.

### At write-time
Every service that saves user health data calls `embedAndStore` after the MongoDB `.save()`:

| Service | Collection written | Chunk type |
|---------|--------------------|------------|
| `UserService.update()` | `User` | `PROFILE` |
| `HealthEventService.create()` | `HealthEvent` | `HEALTH_EVENT` |
| `DietLogService.create()` | `DietLog` | `DIET_LOG` |
| `LifestyleService.create()` | `Lifestyle` | `LIFESTYLE` |
| `MealPlanService.generate()` | `MealPlan` | `MEAL_PLAN` (one chunk per day) |

### AgentService — no longer manages embeddings directly
`AgentService.storeAndEmbed()` calls the respective service method which handles both MongoDB and Neo4j. This keeps embed logic co-located with write logic.

---

## Token Budget Comparison

| Scenario | Current (tokens) | Optimised (tokens) | Saving |
|----------|------------------|--------------------|--------|
| Simple health Q&A | 800 – 1 500 | ~900 | ~40% |
| Query with full history (50 records) | 4 000 – 6 000 | ~1 200 | ~75% |
| Medical report parsing + store | 3 000 – 5 000 | ~1 800* | ~55% |
| Meal plan generation | 2 000 – 4 000 | ~1 500 | ~55% |

*Parsing node gets message only (~500 tokens); synthesize node gets RAG context (~700 tokens). Two separate LLM calls but both smaller than the current single call.

---

## Environment Variables Required

```env
ANTHROPIC_API_KEY=          # Claude Sonnet 4.6 — classify/parse/synthesize nodes + vision
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
MONGODB_URI=mongodb://localhost:27017/workbench
```

> No `OPENAI_API_KEY` needed. Embeddings run locally via HuggingFace `Xenova/all-MiniLM-L6-v2`.

---

## Streaming Chat (SSE)

### Overview

The agent supports two response modes:

| Mode | Endpoint | When used | How |
|------|----------|-----------|-----|
| **Blocking** | `POST /agent/:userId/chat` | File uploads (`chat-with-file`) | `graph.invoke()` → returns full JSON |
| **Streaming** | `POST /agent/:userId/chat/stream` | All text-only messages | SSE event stream |

### Why POST for SSE?

Browser `EventSource` only supports GET. Because we need to send a JSON body (message + history), the streaming endpoint is a `POST` that returns `Content-Type: text/event-stream`. The frontend consumes it via `fetch` + `ReadableStream`.

### SSE Event Protocol

Each event is newline-delimited in standard SSE format (`event: <type>\ndata: <json>\n\n`):

| Event | Payload | When emitted |
|-------|---------|--------------|
| `node` | `{ label: string }` | Before and after each pipeline step |
| `intent` | `{ intent: string[] }` | After classify step resolves |
| `token` | `{ token: string }` | Each streamed chunk from `llm.stream()` |
| `done` | `{ intent, retrievedCount, stored }` | After all tokens sent |
| `error` | `{ message: string }` | On unhandled exception |

### Backend: `chatStream()` Pipeline

`AgentService.chatStream()` orchestrates the pipeline directly (bypassing the LangGraph compiled graph) so it can emit events between steps and stream tokens from Claude:

```
1. sendEvent('node', 'Classifying intent...')
   → _classifyIntent(message)               [~200 tokens, single LLM call]
   → sendEvent('intent', { intent })

2. sendEvent('node', 'Searching health history...')
   → _retrieveContext(userId, message)      [embed query → Neo4j vector search]
   → sendEvent('node', `Found N relevant records`)

3. if MEDICAL_REPORT in intent:
     sendEvent('node', 'Parsing medical report...')
     → _parseMedicalReport(message)         [LLM → structured JSON]
     → sendEvent('node', 'Saving records...')
     → _storeReport(userId, parsedData)     [MongoDB writes + embed]
     → sendEvent('node', storageFeedback)

4. sendEvent('node', 'Generating response...')
   → llm.stream([systemPrompt, ...history, userMsg])
   → for each chunk: sendEvent('token', { token })

5. sendEvent('done', { intent, retrievedCount, stored })
```

### Private Helper Methods

To avoid duplicating the node logic between the graph and `chatStream`, the node functions have been extracted into private methods on `AgentService`. The LangGraph nodes delegate to these methods; `chatStream` calls them directly.

| Method | Used by |
|--------|---------|
| `_classifyIntent(message)` | `classifyIntent` graph node + `chatStream` |
| `_retrieveContext(userId, message)` | `retrieveContext` graph node + `chatStream` |
| `_parseMedicalReport(message)` | `parseMedicalReport` graph node + `chatStream` |
| `_storeReport(userId, parsedData)` | `chatStream` (graph uses separate store nodes) |
| `_buildProfileText(userProfile)` | `synthesizeResponse` graph node + `chatStream` |

### Frontend: SSE Consumer

`handleSendMessage` in `app.tsx` uses `fetch` + `ReadableStream` to consume the stream:

```typescript
const res = await fetch(`/api/agent/${userId}/chat/stream`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, history }),
});
const reader = res.body.getReader();
// Buffer incoming bytes, split on '\n\n' to get complete SSE messages,
// parse event type + data, update React state incrementally.
```

**State updates per event type:**

- `node` → updates `streamingStep` on the last chat message (shown as an animated pill)
- `token` → appends to `content` of the last chat message (triggers re-render with blinking cursor)
- `done` → sets `isStreaming: false`, attaches `intent` pills and retrieved-count badge
- `error` → replaces placeholder with error text

### Chat Message Type

```typescript
{
  role: 'user' | 'ai';
  content: string;
  intent?: string[];
  retrievedCount?: number;
  attachedFile?: { name: string; type: string; preview?: string };
  isStreaming?: boolean;    // true while SSE stream is open
  streamingStep?: string;   // label of the current pipeline step
}
```

### UI Behaviour During Streaming

1. User sends message → user bubble appears immediately, input clears.
2. Empty AI placeholder added with `isStreaming: true, streamingStep: 'Starting...'`.
3. `node` events update the step pill (animated bouncing dots + label).
4. First `token` event causes the message bubble to appear; cursor blinks at end.
5. Subsequent tokens append in place — no re-mount, smooth typewriter effect.
6. `done` event removes streaming indicators and shows final intent/retrieved-count pills.
7. `chatEndRef` scroll effect fires on every `chatHistory` state update → always scrolled to bottom.

---

## Files — Status

| File | Status | Notes |
|------|--------|-------|
| `apps/api/src/app/agent/agent.service.ts` | ✅ Done | LangGraph graph + private helpers + `chat()` + `chatStream()` |
| `apps/api/src/app/agent/agent.controller.ts` | ✅ Done | Blocking `POST /chat`, streaming `POST /chat/stream`, file `POST /chat-with-file` |
| `apps/ui/src/app/app.tsx` | ✅ Done | SSE consumer, streaming state, reasoning step pills, auto-scroll |
| `apps/api/src/app/neo4j/neo4j.service.ts` | ✅ Done | `ensureVectorIndex()` runs at startup |
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
2. **Backfill script** — one-shot script to embed pre-existing MongoDB records into Neo4j for users who created data before the agent was introduced.
3. **Multi-branch router** — extend the conditional edge to route `HEALTH_RECORD`, `DIET_LOG`, `LIFESTYLE_LOG` intents to dedicated store nodes (currently all non-MEDICAL_REPORT paths go straight to `synthesizeResponse`).
4. **File upload streaming** — `chat-with-file` currently blocks; could stream after file extraction completes.
5. **Module extraction** — move `AgentState`, graph factory, and node functions into separate files (`agent.state.ts`, `agent.graph.ts`, `agent.nodes.ts`) for maintainability.
