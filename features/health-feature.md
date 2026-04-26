# Health Feature

> Covers health event types, doctor report grouping, the Record Detail Panel (view → edit → re-analysis), and Neo4j embedding lifecycle.

---

## Overview

The **Health** feature stores and displays a user's longitudinal medical history. Records arrive from three sources:

| `source` | Description |
|----------|-------------|
| `USER` | Manually entered by the family member |
| `DOCTOR` | Parsed from a doctor's report via the LangGraph pipeline |
| `AI` | Generated or inferred by the AI agent |

Every health record is embedded into Neo4j for semantic vector search so the AI agent can retrieve relevant history without full-profile joins.

---

## Data Model

### `HealthEvent` (MongoDB)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `userId` | ObjectId (ref `User`) | Owning user |
| `eventType` | string | See table below |
| `date` | Date | Event date |
| `source` | string | `USER \| DOCTOR \| AI` |
| `reportGroupId` | string | UUID — links all documents from one report batch |
| `reportLabel` | string | `"Dr. {name} · {date}"` — displayed on cards |
| `details` | object | Polymorphic — shape varies by `eventType` |
| `status` | string | `ACTIVE \| RESOLVED \| ONGOING` |
| `createdAt` | Date | Auto |

### Event Types

| `eventType` | `details` shape |
|-------------|----------------|
| `DOCTOR_VISIT` | `{ doctorInfo, conditions[], symptoms[], injections[], notes, status }` |
| `PRESCRIPTION` | `{ medications: MedicationItem[] }` |
| `TEST_RESULTS` | `{ testResults: TestItem[] }` |
| `DIAGNOSIS` | `{ condition, severity, description }` |
| `TREATMENT` | `{ treatment, duration, provider }` |
| `MEDICATION` | `{ name, dosage, frequency, startDate, endDate }` |

### `MedicationItem`

```typescript
{
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  route: string;        // ORAL | INJECTION | TOPICAL | IV | OTHER
  isDaily: boolean;
  instructions?: string;
  status?: string;      // ACTIVE | COMPLETED
}
```

### `TestItem`

```typescript
{
  testName: string;
  value?: string;
  referenceRange?: string;
  interpretation?: string;
  status: string;       // NORMAL | ABNORMAL | BORDERLINE
}
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/users/:id/health-events` | All health events for a user |
| `POST` | `/api/users/:id/health-events` | Create a health event |
| `PUT` | `/api/users/:id/health-events/:eventId` | Edit a health event (returns updated document) |
| `DELETE` | `/api/users/:id/health-events/:eventId` | Delete event + remove Neo4j embedding |
| `POST` | `/api/agent/:userId/reanalyze` | Diff old vs new health event → LLM → re-embed → profile update |

---

## Doctor Report Grouping

When the LangGraph pipeline processes a medical report, it generates one `reportGroupId` (UUID) and stamps it on **all documents** created in that batch:

```
One report → reportGroupId = "abc-123"
  ├── HealthEvent { eventType: DOCTOR_VISIT,   reportGroupId: "abc-123" }
  ├── HealthEvent { eventType: PRESCRIPTION,   reportGroupId: "abc-123" }
  ├── HealthEvent { eventType: TEST_RESULTS,   reportGroupId: "abc-123" }
  ├── DietLog    { cardType: MEDICATION,       reportGroupId: "abc-123" }
  ├── DietLog    { cardType: SUGGESTIONS,      reportGroupId: "abc-123" }
  ├── Lifestyle  { reportGroupId: "abc-123" }
  └── Reminder[] { reportGroupId: "abc-123" }
```

`reportLabel` = `"Dr. {name} · {date}"` is stored denormalized on each document so cards can display their origin without additional queries.

---

## Health Records Board (UI)

Located in `app.tsx` as the `RecordsBoard` component (endpoint = `health-events`).

### Board View (default)

Doctor-report groups are displayed as cards with an indigo header. Each card surfaces:

- Doctor name + specialty + hospital/address
- Diagnoses as rose condition pills
- Prescription: medication names + dosages (truncated)
- Test results: test names + status badges

User-logged events are shown in a separate "My Logs" grid below with colour-coded cards.

### Timeline View

Events listed chronologically with coloured dots, date, and expandable card sections.

### Click → Record Detail Panel

**Every card is now clickable.** Clicking anywhere on a health group card (doctor-report or user-logged) opens the `RecordDetailPanel` for that group. The delete/edit buttons in the card footer use `e.stopPropagation()` to avoid triggering the panel.

---

## Record Detail Panel — Health Type

`RecordDetailPanel` is a full-overlay modal (`z-60`, max-width 3xl) with a gradient header and two modes.

### View Mode

The panel opens in **view mode** displaying all parsed data richly formatted:

| Section | Contents |
|---------|---------|
| Header | Indigo-to-violet gradient; doctor name + specialty; hospital + address; report label; formatted full date |
| Diagnoses & Findings | Condition pills (rose), symptoms list, injections at visit (amber), doctor notes in a slate block |
| Prescription table | Columns: Medication name + isDaily badge + instructions · Dosage · Frequency · Duration · Route badge |
| Test Results | Card per test: name, value, reference range, interpretation, status badge (rose/amber/emerald) |

An **Edit** button in the header switches to edit mode.

### Edit Mode

Fields become editable:

**Diagnoses & Visit section:**
- Conditions — comma-separated text input splits to array
- Visit summary — 2-row textarea
- Doctor notes — 2-row textarea
- Status selector — `ACTIVE | RESOLVED | ONGOING`

**Medications section (one row per drug):**
- Name, Dosage, Frequency, Duration, Instructions — inline text inputs
- Delete row button

**Test Results section (one row per test):**
- Test name shown read-only, Value input, Reference Range input, Status selector

### Save & Analyse Flow

```
1. User clicks "Save & Analyse" in the panel footer
2. PUT /api/users/:userId/health-events/:eventId  (for each changed event in the group)
3. POST /api/agent/:userId/reanalyze  { oldEvent, newEvent }
4. "Analysing..." spinner shown during step 3
5. AI analysis result rendered in the panel below the edit fields
   - "Profile Updated" badge shown if conditions/medications changed
6. Panel switches back to view mode; fetches fresh record list
```

After close, the **analysis result is cleared** — it is not persisted (the corrected data in MongoDB is authoritative).

---

## Re-Analysis Pipeline (`reanalyzeEventChanges`)

```
1. _computeEventDiff(oldEvent, newEvent)
   → conditionsAdded[], conditionsRemoved[]
   → medicationsAdded[], medicationsRemoved[]
   → testStatusChanges[]
   → descriptionChanged, statusChanged

2. if !hasChanges → return { analysis: "No significant changes.", profileUpdated: false }

3. _buildDiffPrompt(diff) → compact bullet list
   "CONDITIONS ADDED: X | MEDICATIONS REMOVED: Y | ..."

4. getLLM(modelId).invoke(systemPrompt + diffPrompt)
   → 2–3 sentence clinical assessment

5. embedAndStore(userId, eventId, 'HEALTH_EVENT', updatedText, date)
   [MERGE — overwrites the stale Neo4j vector in-place]

6. if conditionsAdded/Removed or medicationsAdded:
   → userService.update(userId, { medicalConditions (set-dedup), medications })
   → profileUpdated = true

7. return { analysis, profileUpdated }
```

---

## Neo4j Embedding Lifecycle

### Write

`embedAndStore(userId, sourceId, chunkType, text, date)`:
1. Generate 384-dim embedding via HuggingFace `all-MiniLM-L6-v2` (local — no API key)
2. `MERGE (c:UserHealthChunk {id: $sourceId})` — creates or updates
3. Sets `userId`, `chunkType`, `text`, `date`, `embedding`
4. Indexed by the `userHealthChunks` vector index

`MERGE` semantics mean re-embedding after an edit updates the node in-place — no duplicate chunks.

### Retrieval

```cypher
CALL db.index.vector.queryNodes('userHealthChunks', 20, $queryVector)
YIELD node AS c, score
WHERE c.userId = $userId
RETURN c.chunkType, c.text, c.date, score
ORDER BY score DESC LIMIT 8
```

Top-8 chunks injected into the LLM prompt (~1 200 tokens, vs 4 000–6 000 for a full profile dump).

### Delete

`deleteEmbedding(sourceId)` — called by all three delete paths and by `reanalyzeEventChanges` before re-embedding:

```cypher
MATCH (c:UserHealthChunk {id: $sourceId}) DETACH DELETE c
```
