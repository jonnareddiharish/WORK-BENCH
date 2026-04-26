# Diet Feature

> Covers diet log types, LangGraph diet pipeline, card layout, medication detail expansion (side effects, dates, avoid list), and the Reminders widget.

---

## Overview

The **Diet** feature logs a user's meals, medications, and dietary advice. Records arrive from manual entry or from the LangGraph pipeline after parsing a doctor's report. Diet logs rendered in the **Daily Diet** widget and the **Diet Logs** section of the Records Board use a card-based layout with at most 3 cards per medical report.

---

## Data Model

### `DietLog` (MongoDB)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `userId` | ObjectId (ref `User`) | Owning user |
| `mealType` | string | `BREAKFAST \| LUNCH \| DINNER \| SNACK \| CRAVINGS \| PILLS` |
| `cardType` | string | `MEDICATION \| SUGGESTIONS \| MANDATORY_FOOD` (new) or legacy values |
| `date` | Date | Log date |
| `source` | string | `USER \| DOCTOR \| AI` |
| `reportGroupId` | string | UUID — links all docs from one report batch |
| `reportLabel` | string | `"Dr. {name} · {date}"` — displayed on the card |
| `items` | string[] | Food items or general text items |
| `medicationItems` | MedItem[] | Populated only for `MEDICATION` card type |
| `calories` | number | Optional calorie estimate |
| `notes` | string | Free-text note |
| `createdAt` | Date | Auto |

### `MedItem`

```typescript
interface MedItem {
  name: string;
  dosage?: string;
  duration?: string;          // "30 days", "2 weeks"
  instructions?: string;      // timing + how to take
  sideEffects?: string[];     // key side effects to watch for
  avoidWhileTaking?: string[]; // foods, drugs, activities to avoid
  startDate?: string;         // ISO date — equals visitDate
  endDate?: string;           // ISO date — equals visitDate + duration
}
```

---

## Card Types (max 3 per medical report)

| `cardType` | `mealType` | Contents | When created |
|-----------|-----------|---------|-------------|
| `MEDICATION` | `PILLS` | All mandatory daily medications, each as a full `MedItem` with side effects, avoid list, and start/end dates | Always if prescriptions exist |
| `SUGGESTIONS` | `BREAKFAST` / etc. | Food advice, probiotics, general dietary tips as a plain text array | Always if dietary advice exists |
| `MANDATORY_FOOD` | `BREAKFAST` / etc. | Specific foods the doctor mandates per day with exact quantities | Only if doctor explicitly mandates a food |

Before Round 4, cards were created per-timing-slot (BEFORE_BREAKFAST, AFTER_BREAKFAST, etc.) producing 6–10 scattered cards per report. The max-3 constraint collapses all medications into a single `MEDICATION` card and all food advice into a single `SUGGESTIONS` card.

### Legacy card types (backward-compatible)

The UI handles these for records created before Round 4:

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
| `DELETE` | `/api/users/:id/diet-logs/:logId` | Delete entry + remove Neo4j embedding |
| `GET` | `/api/users/:userId/reminders` | Active (not done) reminders for a user |
| `PATCH` | `/api/users/:userId/reminders/:id/done` | Dismiss a reminder |

---

## LangGraph Diet Pipeline

The diet cards are produced inside `_storeReport()` in `agent.service.ts` after the LLM parses the medical report. The LLM system prompt instructs the model to output a `dietAdvice` array capped at 3 slots.

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
  1. Build DietLog document:
     { userId, mealType: slot.mealTypes[0], cardType: slot.cardType,
       date: visitDate, items: slot.foodItems ?? [],
       medicationItems: slot.medicationItems ?? [],
       reportGroupId, reportLabel, source: 'DOCTOR' }
  2. Save to MongoDB
  3. embedAndStore(userId, id, 'DIET_LOG', serialized text, visitDate)
```

After all diet cards are saved, the reminder creation block runs (see Reminders section).

---

## `startDate` / `endDate` Computation

Rather than computing these in the backend service, the LLM is instructed to compute them directly inside the JSON output because it already knows both `visitDate` and `duration`:

```
startDate = visitDate
endDate   = visitDate + duration (computed by the LLM)
```

The backend stores these as plain ISO strings and uses `endDate` when creating `MEDICATION_END` reminders.

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

| `reminderType` | Created from | Default due date |
|---------------|-------------|-----------------|
| `APPOINTMENT` | `parsedData.nextAppointment.date` | Exact date from report |
| `FOLLOW_UP_TEST` | Each entry in `parsedData.followUpTests[]` | `visitDate + 30 days` if no date given |
| `MEDICATION_END` | Each `MedItem` with a non-null `endDate` | `med.endDate` |

---

## Reminders Widget (UI — UserDashboard)

Shown above the Daily Diet panel. Fetches from `GET /api/users/:userId/reminders`.

### Urgency colouring

| Condition | Ring/text colour | Label |
|-----------|----------------|-------|
| `dueDate < today` | Rose | Overdue |
| `dueDate ≤ today + 7 days` | Amber | Due in N days |
| `dueDate > today + 7 days` | Slate | Future date |

### Reminder row

Each reminder shows:
- Icon by type: `CalendarCheck` (APPOINTMENT), `FlaskRound` (FOLLOW_UP_TEST), `AlarmClock` (MEDICATION_END)
- Title and countdown text
- `reportLabel` pill (links back to source report)
- Dismiss button (`✓`) — calls `PATCH .../done`, removes from list optimistically

---

## Daily Diet Widget (UI — UserDashboard)

Fetches today's `DietLog` entries. Cards are grouped by `reportGroupId` where applicable.

### MEDICATION card

- Clickable — opens the **Medication Detail Modal**
- Shows inline: list of medication names with dosage and duration
- Accent colour: indigo

### SUGGESTIONS card

- Non-clickable
- Shows food items as a bullet list
- Accent colour: teal

### MANDATORY_FOOD card

- Non-clickable
- Shows mandated foods with quantities
- Accent colour: emerald

---

## Medication Detail Modal

Triggered when the user clicks a `MEDICATION` diet card. Full-screen-overlay modal with:

### Header

Gradient banner showing the report label and visit date.

### Per-drug tiles

Each `MedItem` rendered as an expandable section:

| Section | Contents |
|---------|---------|
| Dosage & instructions | `dosage` · `instructions` |
| Duration | `duration` text |
| Start date tile (teal) | `startDate` formatted |
| End date tile (rose) | `endDate` formatted |
| Side effects | Amber pill tags: one per entry in `sideEffects[]` |
| Avoid while taking | Rose pill tags: one per entry in `avoidWhileTaking[]` |

---

## `MedItemRow` Component (Records Board)

An extracted standalone component used inside the Records Board's board card renderer for `MEDICATION`-type diet log cards. It has its own `open` state (expandable) and renders:

- Medication name + dosage
- `▼` chevron to expand
- Expanded: instructions, start/end date pills, side effects tags, avoid-list tags

This component was extracted to fix a React hooks violation — `useState` cannot be called inside a `.map()` callback, so each row must be a proper function component.

```tsx
function MedItemRow({ med, timingBg, timingText }: {
  med: MedLogItem;
  timingBg: string;
  timingText: string;
}) {
  const [open, setOpen] = useState(false);
  // ...
}
```
