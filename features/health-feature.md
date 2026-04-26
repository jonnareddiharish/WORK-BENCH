# Health Feature

> Covers health event types, doctor report grouping, report group cards, edit & re-analysis flow, and Neo4j embedding lifecycle.

---

## Overview

The **Health** feature stores and displays a user's longitudinal medical history. Health records arrive from three sources:

| `source` | Description |
|----------|-------------|
| `USER` | Manually entered by the family member |
| `DOCTOR` | Parsed from a doctor's report via the LangGraph pipeline |
| `AI` | Generated or inferred by the AI agent |

Every health record is embedded into Neo4j for semantic vector search, enabling the AI agent to retrieve relevant history at inference time.

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
| `reportGroupId` | string | UUID — links all docs from one report batch |
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
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  status?: string;   // ACTIVE | COMPLETED
}
```

### `TestItem`

```typescript
{
  name: string;
  value?: string;
  unit?: string;
  normalRange?: string;
  status?: string;  // NORMAL | ABNORMAL | PENDING
  notes?: string;
}
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/users/:id/health-events` | All health events for a user |
| `POST` | `/api/users/:id/health-events` | Create a health event |
| `PUT` | `/api/users/:id/health-events/:eventId` | Edit a health event (triggers re-analysis) |
| `DELETE` | `/api/users/:id/health-events/:eventId` | Delete event + remove Neo4j embedding |

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

Located in `app.tsx` as the `RecordsBoard` component.

### Board View (default)

Cards are grouped by `reportGroupId`. Each group shows:
- A report header pill: `reportLabel` badge with coloured dot
- Up to 3 event cards in the group, side by side

#### Card colour profiles

| `eventType` | Header colour | Label |
|-------------|-------------|-------|
| `DOCTOR_VISIT` | Blue | Doctor Visit |
| `PRESCRIPTION` | Purple | Prescription |
| `TEST_RESULTS` | Emerald | Test Results |
| `DIAGNOSIS` | Rose | Diagnosis |
| `TREATMENT` | Orange | Treatment |
| `MEDICATION` | Indigo | Medication |

#### PRESCRIPTION card

Renders `details.medications` as a table:

| Column | Source |
|--------|--------|
| Medication name | `item.name` |
| Dosage | `item.dosage` |
| Frequency | `item.frequency` |
| Duration | `item.duration` |
| Instructions | `item.instructions` |
| Status badge | `item.status` |

#### TEST_RESULTS card

Renders `details.testResults` as a table with a status badge (green = NORMAL, red = ABNORMAL, slate = PENDING).

#### DOCTOR_VISIT card

Shows conditions list, symptoms, injections (clinic-only), and doctor notes.

### Timeline View

Toggled by the view-switcher button. Events are listed chronologically:
- Each event shows a coloured dot, event type label, date, and source badge
- Clicking expands the full card details inline

### Edit & Re-Analysis

Each board card has an **Edit** icon (pencil). Clicking opens an edit modal pre-populated with the existing `details` object as formatted JSON.

On save:
1. `PUT /api/users/:id/health-events/:eventId` is called with the updated details
2. The backend calls `AgentService.reanalyzeEventChanges(userId, before, after, eventType)`
3. The LangGraph pipeline computes the semantic diff between old and new
4. The AI assesses clinical significance (new conditions, changed medications, etc.)
5. `AIPatientContext` is updated with any newly detected conditions/medications
6. The Neo4j embedding for the event is deleted and re-created with the updated text

This ensures a user-corrected record is treated as authoritatively as a freshly parsed report.

---

## Neo4j Embedding Lifecycle

Every health event that enters the system (via any source) is embedded and stored in Neo4j for vector similarity search.

### `embedAndStore(userId, documentId, type, text, date)`

1. Generate 384-dim embedding via HuggingFace `all-MiniLM-L6-v2` (local — no API key)
2. `MERGE` a `UserHealthChunk` node keyed by `(userId, documentId)`
3. Store embedding as a float array property
4. Index via the `user_health_vector` vector index

### `findRelevantContext(userId, queryText, limit)`

1. Embed the incoming query
2. Run Neo4j `db.index.vector.queryNodes('user_health_vector', limit, embedding)`
3. Filter results to `userId`
4. Return top-8 ranked chunks

The retrieved chunks are injected into the LLM prompt as compact context (~1 200 tokens vs 4 000–6 000 for a full profile dump).

### Delete

`deleteEmbedding(userId, documentId)` deletes the `UserHealthChunk` node:

```cypher
MATCH (c:UserHealthChunk { userId: $userId, documentId: $documentId })
DETACH DELETE c
```

This is called by:
- `HealthEventsService.remove(eventId)`
- `DietLogsService.remove(logId)`
- `LifestyleService.remove(recordId)`
- `AgentService.reanalyzeEventChanges` (before re-embedding the edited record)

---

## Re-Analysis Pipeline (`reanalyzeEventChanges`)

```
1. Build diff text: "Changed PRESCRIPTION: before=<old JSON>, after=<new JSON>"
2. classifyIntent  → likely MEDICAL_REPORT or GENERAL_HEALTH
3. retrieveContext → top-8 relevant chunks for userId
4. LLM prompt:
     "Given this user's profile and this edit, assess clinical significance.
      Return: { newConditions[], removedConditions[], changedMedications[], summary }"
5. Merge detected newConditions into AIPatientContext.conditions[]
6. Merge changedMedications into AIPatientContext.medications[]
7. deleteEmbedding(userId, eventId)
8. embedAndStore(userId, eventId, 'HEALTH_EVENT', updatedText, date)
9. Return assessment text → streamed back to UI as SSE response
```

The UI displays the re-analysis response in the same streaming chat area used for normal agent messages.
