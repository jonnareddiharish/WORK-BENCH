# User Feature

> Covers family management, user profiles, Neo4j relationship linking, and family graph visualization.

---

## Overview

The **User** feature is the foundation of the Family Health Tracker. Every health record, diet log, lifestyle entry, and AI-generated insight is scoped to a specific `User`. Users are organized into families, and their relationships are stored both in MongoDB (flat) and Neo4j (graph with typed edges).

---

## Data Model

### `User` (MongoDB)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `name` | string | Full name |
| `dateOfBirth` | Date | Used for age calculation |
| `gender` | string | |
| `relation` | string | e.g. `Father`, `Mother`, `Son`, `Daughter` |
| `bloodType` | string | |
| `height` | number | cm |
| `weight` | number | kg |
| `medicalConditions` | string[] | Active diagnoses |
| `allergies` | string[] | |
| `medications` | string[] | Current medications |
| `familyId` | ObjectId (ref `Family`) | Optional family grouping |
| `createdAt` | Date | Auto-managed by Mongoose timestamps |

### `AIPatientContext` (MongoDB — materialized view)

A denormalized document kept in sync with every write to `User`, `HealthEvent`, `DietLog`, and `Lifestyle`. Contains:

- User demographics (age, gender, blood type, height/weight)
- Active medical conditions and current medications
- Allergies
- Recent health events (last 5)
- Recent diet logs (last 7 days)
- Recent lifestyle records (last 7 days)

The `agent` module reads this single document to build LLM prompts without multi-collection joins. It is updated synchronously by each domain service after every write.

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create a user |
| `GET` | `/api/users/:id` | Get single user |
| `PUT` | `/api/users/:id` | Update user profile |
| `DELETE` | `/api/users/:id` | Delete user + all associated data |
| `GET` | `/api/users/graph` | Family relationship graph (Neo4j) |

---

## Neo4j Family Graph

When a user is created or linked, a Neo4j node is created or updated:

```cypher
MERGE (u:User { userId: $userId })
SET u.name = $name, u.relation = $relation
```

Family relationships are stored as typed edges:

```cypher
MATCH (a:User { userId: $fromId }), (b:User { userId: $toId })
MERGE (a)-[:RELATED_TO { relation: $relation }]->(b)
```

### `GET /api/users/graph` response shape

```json
{
  "nodes": [
    { "id": "userId", "name": "Rajesh", "relation": "Father", "color": "#3b82f6" }
  ],
  "links": [
    { "source": "userId1", "target": "userId2", "label": "Father of" }
  ]
}
```

This is consumed by **React Force Graph 2D** in the `FamilyTree` page — nodes are coloured by relation type, links show the relationship label.

---

## Frontend: Family Dashboard

Located in `app.tsx` as `FamilyDashboard`.

### Member Cards

Each user is displayed as a card showing:
- Name and relation badge
- Age (computed from `dateOfBirth`)
- Blood type
- Active conditions count and first 2 conditions
- Quick-action: select as current user, delete

### Add Family Member

Modal form with fields: name, date of birth, gender, relation, blood type, height, weight. On save, `POST /api/users` is called and the user list is refreshed.

### Global User Selector

A top-bar dropdown in the sidebar allows switching the active user. All subsequent dashboard views (health, diet, lifestyle, AI chat) operate on the selected user's data.

---

## Frontend: Family Graph (`FamilyTree` page)

Uses `react-force-graph-2d` to render the Neo4j graph data:

- Nodes are circles coloured by relation type
- Hovering a node shows the user's name and relation
- Links are labelled with the relationship type
- The graph auto-centres and applies force simulation on load

---

## User Deletion

Deleting a user triggers a cascade:

1. `HealthEvent` records deleted
2. `DietLog` records deleted
3. `Lifestyle` records deleted
4. `Reminder` records deleted
5. `AIPatientContext` document deleted
6. Neo4j `UserHealthChunk` embeddings deleted (`deleteEmbedding(userId)`)
7. Neo4j `User` node and all its edges removed

---

## `AIPatientContext` Update Triggers

| Action | Trigger |
|--------|---------|
| Create / update user profile | `UsersService.create` / `update` |
| New health event | `HealthEventsService.create` |
| New diet log | `DietLogsService.create` |
| New lifestyle record | `LifestyleService.create` |
| Edit health event (re-analysis) | `AgentService.reanalyzeEventChanges` |

The context document is updated (upserted by `userId`) after every write so the LLM always sees fresh data without additional queries at inference time.
