# Workbench v3 — Change Log

**Date**: April 2026  
**Theme**: Optimised LangGraph Agent with Embedding-Based RAG

---

## Summary

Replaced the flat, sequential AI agent with a full **LangGraph graph pipeline** and a **semantic retrieval layer**. User health data is now embedded into Neo4j at write-time; every agent call retrieves only the records relevant to the current message instead of dumping all history into the prompt. Estimated **70–80% reduction in token consumption** for health-history-rich users.

---

## Backend Changes

### `apps/api/src/app/agent/agent.service.ts` — Complete rewrite

**Before**: `chat()` was a sequential function that:
- Called Claude once to classify intent
- Constructed a single flat context string (name, allergies, conditions only)
- Passed a crude `dietLogs.slice(0, 3)` JSON dump to the LLM
- `generateHealthPlan()` had its own separate 2-node LangGraph

**After**: A **single compiled LangGraph** shared across all calls with these nodes:

```
START → classifyIntent → retrieveContext → [router] → …action nodes… → synthesizeResponse → END
```

| Node | Role |
|------|------|
| `classifyIntent` | Classifies message into HEALTH_RECORD / DIET_LOG / LIFESTYLE_LOG / MEDICAL_REPORT / MEAL_PLAN / QUERY / OTHER |
| `retrieveContext` | Embeds the query with OpenAI, runs Neo4j vector search, returns top-8 semantically relevant user health chunks |
| Router (conditional edge) | Routes MEDICAL_REPORT to parse pipeline; everything else to `synthesizeResponse` |
| `parseMedicalReport` | Extracts structured JSON (health events, diet advice, lifestyle advice) from free-text medical reports |
| `storeHealthEvents` | Saves extracted health events to MongoDB + embeds each into Neo4j |
| `storeDietLogs` | Saves extracted diet advice to MongoDB + embeds each into Neo4j |
| `storeLifestyle` | Saves extracted lifestyle advice to MongoDB + embeds each into Neo4j |
| `synthesizeResponse` | Generates the final response using: static profile (~100 tokens) + RAG context (~600 tokens) + last 6 messages (~250 tokens) |

**New public method** `embedAndStore(userId, sourceId, chunkType, text, date)`:
- Embeds `text` using OpenAI `text-embedding-3-small`
- Upserts a `UserHealthChunk` node in Neo4j with the vector and metadata
- Called at write-time by all domain services

**`ensureVectorIndex()`** runs on startup:
- Creates `VECTOR INDEX userHealthChunks` on `UserHealthChunk.embedding` (1536 dims, cosine similarity) if it does not already exist

**`chat()` return shape** updated:
```typescript
{ reply: string, intent: string[], retrievedCount: number, stored: boolean }
```

**Token budget** per call (target):
| Slot | Tokens |
|------|--------|
| System prompt + profile | ~250 |
| RAG context (8 chunks) | ~600 |
| Last 3 conversation turns | ~250 |
| Current message | ~100 |
| **Total** | **~1 200** |

---

### `apps/api/src/app/users/user.service.ts` — Embed hooks added

`embedAndStore` is now called (fire-and-forget) after every write:

| Method | Chunk type | Embedded text |
|--------|------------|---------------|
| `create()` | `PROFILE` | `"Patient {name}: conditions [...], allergies [...], medications [...]"` |
| `update()` | `PROFILE` | Same format, re-embedded on profile change |
| `addHealthEvent()` | `HEALTH_EVENT` | `"{eventType} on {date}: {titles} — {description} ({status})"` |
| `addDietLog()` | `DIET_LOG` | `"{mealTypes} on {date}: {foodItems with quantities}"` |
| `addLifestyle()` | `LIFESTYLE` | `"Lifestyle on {date} [{categories}]: {description}"` |

---

### `apps/api/src/app/meal-plans/meal-plan.service.ts` — Embed after generation

After a meal plan is saved, each day is embedded as a `MEAL_PLAN` chunk:
```
"Meal plan day {N} ({date}): BREAKFAST: {title}; LUNCH: {title}; ..."
```

Injected `AgentService` via `forwardRef` to call `embedAndStore`.

---

### `apps/api/src/app/meal-plans/meal-plan.module.ts` — Import AgentModule

Added `forwardRef(() => AgentModule)` to `imports` so `MealPlanService` can inject `AgentService` for embedding without a circular dependency error.

---

### LLM provider migration (from v2)

Both `agent.service.ts` and `meal-plan.service.ts` were already migrated from OpenAI GPT-4o to **Claude Sonnet 4.6** (`claude-sonnet-4-6`) via `@langchain/anthropic`. This is carried forward in v3 with no changes to the model selection.

`OpenAIEmbeddings` (`text-embedding-3-small`) is retained because Anthropic does not provide an embedding API.

---

## Frontend Changes

### `apps/ui/src/app/app.tsx`

#### Chat message type extended

```typescript
// Before
{ role: 'user' | 'ai', content: string }

// After
{ role: 'user' | 'ai', content: string, intent?: string[], retrievedCount?: number }
```

#### `handleSendMessage` — captures new API fields

The chat API now returns `{ reply, intent, retrievedCount, stored }`. The handler stores `intent` and `retrievedCount` on the AI message so the UI can render them.

#### AI message bubbles — intent badges + retrieved count

AI messages now show a metadata row above the bubble:

- **Intent badges** (indigo pills): one per detected intent, e.g. `MEDICAL REPORT`, `DIET LOG`  
  Filtered to exclude generic `OTHER` and `QUERY` labels.
- **Retrieved records count** (teal pill): e.g. `5 records retrieved`  
  Only shown when > 0 records were fetched from the vector store.

#### Loading indicator — graph-step hints

While the agent is processing, two animated pills appear:
- `Classifying...` 
- `Retrieving context...`

These reflect the actual LangGraph steps running server-side.

#### Typo fix

"AI Agent Agent" → **"AI Health Agent"** in the expanded chat modal header.

---

## Neo4j Schema Addition

New node label added at runtime:

```cypher
(:UserHealthChunk {
  id:        String,   -- MongoDB _id of source document (or {userId}_profile)
  userId:    String,
  chunkType: String,   -- 'PROFILE' | 'HEALTH_EVENT' | 'DIET_LOG' | 'LIFESTYLE' | 'MEAL_PLAN'
  text:      String,   -- the embedded text
  date:      String,   -- ISO date
  embedding: Float[]   -- 1536-dim OpenAI vector
})

VECTOR INDEX userHealthChunks ON UserHealthChunk.embedding
  (vector.dimensions: 1536, vector.similarity_function: 'cosine')
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 — agent chat and synthesis nodes |
| `OPENAI_API_KEY` | `text-embedding-3-small` — Neo4j vector embeddings |
| `NEO4J_URI` | Required for embeddings + vector search (skipped gracefully if absent) |
| `NEO4J_USER` | Neo4j auth |
| `NEO4J_PASSWORD` | Neo4j auth |
| `MONGODB_URI` | MongoDB (unchanged) |

---

## Files Changed

| File | Type of change |
|------|---------------|
| `apps/api/src/app/agent/agent.service.ts` | Complete rewrite — LangGraph graph + RAG |
| `apps/api/src/app/users/user.service.ts` | Added embed-and-store hooks after writes |
| `apps/api/src/app/meal-plans/meal-plan.service.ts` | Inject AgentService; embed plan days after generation |
| `apps/api/src/app/meal-plans/meal-plan.module.ts` | Import AgentModule via forwardRef |
| `apps/ui/src/app/app.tsx` | Chat type, message rendering, loading indicator, typo fix |
| `CLAUDE.md` | Updated tech stack description |
| `design.md` | New — full LangGraph architecture design document |
| `workbench-v3.md` | New — this changelog |

---

## Known Limitations / Next Steps

1. **Backfill**: Existing MongoDB records (created before v3) are not yet embedded. A one-shot backfill script should be added to embed historical data into Neo4j.
2. **Neo4j optional**: If `NEO4J_URI` is not set, `retrieveContext` returns an empty array and the agent falls back to profile-only context. No errors are thrown.
3. **MEAL_PLAN intents**: The graph currently routes only `MEDICAL_REPORT` through the store pipeline. MEAL_PLAN, HEALTH_RECORD, DIET_LOG, and LIFESTYLE_LOG intents identified in chat are used to inform the response but do not trigger automatic storage (users are expected to use the UI forms for those).
4. **Conversation history**: The `conversationHistory` is passed from the frontend on each request. For long sessions consider storing it server-side.
