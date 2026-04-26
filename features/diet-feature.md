# Diet Feature

> Covers diet log types, LangGraph diet pipeline, card layout, the Record Detail Panel (view → edit → re-analysis), medication detail, and the Reminders widget.

---

## Overview

The **Diet** feature logs a user's meals, medications, and dietary advice. Records arrive from manual entry or the LangGraph pipeline after parsing a doctor's report. Diet logs appear in the **Daily Diet** widget on the dashboard and in the **Diet Logs** section of the Records Board, both using a card-based layout with at most 3 cards per medical report.

---

## Data Model

### `DietLog` (MongoDB)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `userId` | ObjectId (ref `User`) | Owning user |
| `mealType` | string | `BREAKFAST \| LUNCH \| DINNER \| SNACK \| CRAVINGS \| PILLS` |
| `cardType` | string | `MEDICATION \| SUGGESTIONS \| MANDATORY_FOOD` or legacy values |
| `date` | Date | Log date |
| `source` | string | `USER \| DOCTOR \| AI` |
| `reportGroupId` | string | UUID — links all documents from one report batch |
| `reportLabel` | string | `"Dr. {name} · {date}"` — displayed on the card |
| `items` | string[] | Food items or general text items |
| `medicationItems` | MedItem[] | Populated only for `MEDICATION` card type |
| `description` | string | Formatted text (medications or food items) |
| `calories` | number | Optional calorie estimate |
| `notes` | string | Free-text note |
| `createdAt` | Date | Auto |

### `MedItem`

```typescript
interface MedItem {
  name: string;
  dosage?: string;
  duration?: string;           // "30 days", "2 weeks"
  instructions?: string;       // timing + how to take
  sideEffects?: string[];      // key side effects to watch for
  avoidWhileTaking?: string[]; // foods, drugs, activities to avoid
  startDate?: string;          // ISO date — equals visitDate
  endDate?: string;            // ISO date — equals visitDate + duration
}
```

---

## Card Types (max 3 per medical report)

| `cardType` | `mealType` | Contents | When created |
|-----------|-----------|---------|-------------|
| `MEDICATION` | `PILLS` | All mandatory daily medications, each as a full `MedItem` with side effects, avoid list, start/end dates | Always if prescriptions with `isDaily=true` exist |
| `SUGGESTIONS` | `BREAKFAST` etc. | Food advice, probiotics, general dietary tips as a plain text array | Always if dietary advice exists |
| `MANDATORY_FOOD` | `BREAKFAST` etc. | Doctor-mandated specific foods with exact quantities | Only if doctor explicitly mandates a food per day |

### Legacy card types (backward-compatible)

| Legacy `cardType` | Visual treatment |
|-------------------|-----------------|
| `PRE_MEAL_MEDICATION` | Indigo — medication |
| `POST_MEAL_MEDICATION` | Indigo — medication |
| `MEAL` | Teal — suggestions |
| `DIETARY_ADVICE` | Teal — suggestions |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/users/:id/diet-logs` | All diet logs for a user |
| `POST` | `/api/users/:id/diet-logs` | Create a diet log entry |
| `PUT` | `/api/users/:id/diet-logs/:logId` | Update a diet log (returns updated document) |
| `DELETE` | `/api/users/:id/diet-logs/:logId` | Delete entry + remove Neo4j embedding |
| `GET` | `/api/users/:userId/reminders` | Active (not done) reminders sorted by dueDate |
| `PATCH` | `/api/users/:userId/reminders/:id/done` | Dismiss a reminder |
| `POST` | `/api/agent/:userId/reanalyze-diet` | Diff old vs new diet log → LLM → re-embed |

---

## LangGraph Diet Pipeline

Diet cards are produced inside `_storeReport()` in `agent.service.ts`. The LLM system prompt instructs the model to output a `dietAdvice` array capped at 3 slots.

### LLM output format

```json
{
  "dietAdvice": [
    {
      "cardType": "MEDICATION",
      "mealTypes": ["PILLS"],
      "medicationItems": [
        {
          "name": "Metformin",
          "dosage": "500mg",
          "duration": "30 days",
          "instructions": "Take after breakfast and dinner",
          "sideEffects": ["Nausea", "Diarrhoea"],
          "avoidWhileTaking": ["Alcohol", "High-sugar foods"],
          "startDate": "2026-04-26",
          "endDate": "2026-05-26"
        }
      ]
    },
    {
      "cardType": "SUGGESTIONS",
      "mealTypes": ["BREAKFAST", "DINNER"],
      "foodItems": [
        "Take a probiotic (Lactobacillus) after breakfast",
        "Include leafy greens with every meal",
        "Drink 2–3 L water per day"
      ]
    }
  ]
}
```

### `_storeReport()` diet section

```
For each DietSlot in dietAdvice (max 3):
  1. Build DietLog document
  2. Save to MongoDB
  3. embedAndStore(userId, id, 'DIET_LOG', serialized text, visitDate)
```

---

## `startDate` / `endDate` Computation

The LLM computes both values directly in the JSON output since it already knows `visitDate` and `duration`:

```
startDate = visitDate
endDate   = visitDate + duration  (LLM computes this)
```

The backend stores them as plain ISO strings and uses `endDate` when creating `MEDICATION_END` reminders.

---

## Record Detail Panel — Diet Type

`RecordDetailPanel` is a full-overlay modal (`z-60`, max-width 3xl) shared across all three record types. For diet logs:

### View Mode

**MEDICATION card view:**
- Indigo-to-purple gradient header with report label and visit date
- Per-drug accordion sections:
  - Drug name + dosage + duration badge (bold header row)
  - Clock icon + instructions text
  - Start date tile (teal) + End date tile (rose) side by side
  - Amber pills — one per entry in `sideEffects[]`
  - Rose pills — one per entry in `avoidWhileTaking[]`

**SUGGESTIONS / MANDATORY_FOOD card view:**
- Teal or emerald gradient header
- Each food item as a bullet row in a slate-50 card

An **Edit** button in the header switches to edit mode.

### Edit Mode

**MEDICATION card edit:**
- "Add medication" button to append a new empty `MedItem` row
- Per-medication section (delete button per row):
  - Name (full width), Dosage, Duration (2-col grid)
  - Instructions (full width)
  - Side effects — comma-separated input → splits to `string[]`
  - Avoid while taking — comma-separated input → splits to `string[]`
  - Start date picker, End date picker

**SUGGESTIONS / MANDATORY_FOOD card edit:**
- Multi-line textarea — one food item per line

### Save & Analyse Flow

```
1. User clicks "Save & Analyse"
2. PUT /api/users/:userId/diet-logs/:logId  { updated DietLog }
3. POST /api/agent/:userId/reanalyze-diet  { oldLog, newLog }
4. "Analysing..." spinner shown during step 3
5. AI analysis rendered inline in the panel
6. Panel switches back to view mode; record list refetched
```

---

## `reanalyzeDietChanges` Pipeline

```
1. Diff old vs new:
   - medsAdded   = newLog.medicationItems[].name not in oldLog
   - medsRemoved = oldLog.medicationItems[].name not in newLog
   - descChanged = oldLog.description !== newLog.description

2. if !hasChanges → return { analysis: "No significant changes." }

3. Build prompt:
   "Diet log type: MEDICATION
    Medications added: X
    Medications removed: Y
    Briefly assess clinical significance (2-3 sentences)."

4. getLLM(modelId).invoke(systemPrompt + prompt)

5. embedAndStore(userId, newLog._id, 'DIET_LOG', embedText, date)
   [MERGE — overwrites stale Neo4j vector in-place]

6. return { analysis }
```

---

## Reminders

### `Reminder` (MongoDB)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `userId` | ObjectId (ref `User`) | |
| `reminderType` | string | `APPOINTMENT \| FOLLOW_UP_TEST \| MEDICATION_END` |
| `title` | string | Human-readable label |
| `dueDate` | Date | When the reminder fires |
| `reportGroupId` | string | Links to the source report |
| `reportLabel` | string | `"Dr. {name} · {date}"` |
| `isDone` | boolean | `false` until dismissed |
| `note` | string | Optional detail |

### Auto-creation (from `_storeReport`)

| `reminderType` | Source | Default due date |
|---------------|--------|-----------------|
| `APPOINTMENT` | `parsedData.nextAppointment.date` | Exact date from report |
| `FOLLOW_UP_TEST` | Each entry in `parsedData.followUpTests[]` | `visitDate + 30 days` if no date given |
| `MEDICATION_END` | Each `MedItem` with a non-null `endDate` | `med.endDate` |

---

## Reminders Widget (UserDashboard)

Shown above the Daily Diet panel. Fetches from `GET /api/users/:userId/reminders` on load.

| Urgency | Ring/text colour | Condition |
|---------|----------------|-----------|
| Overdue | Rose | `dueDate < today` |
| Soon | Amber | `dueDate ≤ today + 7 days` |
| Later | Slate | `dueDate > today + 7 days` |

Each row: type icon · title · countdown · `reportLabel` pill · ✓ dismiss button.

Dismiss calls `PATCH .../reminders/:id/done` and removes the item from local state immediately (optimistic update).

---

## Daily Diet Widget (UserDashboard)

Compact preview panel fetching today's `DietLog` entries.

| Card type | Clickable | What happens on click |
|-----------|-----------|----------------------|
| `MEDICATION` | Yes | Opens `RecordDetailPanel` in view mode |
| `SUGGESTIONS` | Yes | Opens `RecordDetailPanel` in view mode |
| `MANDATORY_FOOD` | Yes | Opens `RecordDetailPanel` in view mode |

Previously only MEDICATION cards were clickable (opening a view-only modal). Now all cards open the full `RecordDetailPanel` with view + edit + re-analysis capability.

---

## Records Board — Diet Cards

The `RecordsBoard` component (endpoint = `diet-logs`) renders cards in board and timeline view.

**Every card is now clickable.** Clicking anywhere on a card opens the `RecordDetailPanel` for that log. Delete and quick-edit buttons in the card footer use `e.stopPropagation()` so they do not trigger the panel.

### `MedItemRow` Component

A standalone expandable row component used inside MEDICATION board cards. Each row has its own `open` state (avoids React hooks-in-map violation):

```tsx
function MedItemRow({ med, timingBg, timingText }: { med: MedLogItem; ... }) {
  const [open, setOpen] = useState(false);
  // chevron toggle → side effects / avoid list / start+end dates
}
```
