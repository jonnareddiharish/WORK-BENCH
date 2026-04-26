# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered Family Health Tracker. Families can track individual members' health events, diet logs, lifestyle habits, and receive AI-driven meal plans and health insights. Uses an "AI-First Database Architecture" where a materialized `AIPatientContext` collection keeps a denormalized per-user context document ready to feed directly into LLM prompts.

## Tech Stack

- **Frontend**: React 19 + TypeScript, TailwindCSS v4, React Router 6, Framer Motion, Lucide React, React Force Graph 2D
- **Backend**: NestJS 11, MongoDB 9.5 + Mongoose, Neo4j 6 + neo4j-driver, LangChain + LangGraph, Claude Sonnet 4.6 (chat/synthesis), HuggingFace `all-MiniLM-L6-v2` (local embeddings, no API key required)
- **Monorepo**: NX 22.6.5 with Webpack, Biome (lint/format), Jest, Playwright (E2E)
- **Runtime**: Node.js 22+, npm 10+

## Commands

```bash
npm install                # Install all dependencies

# Development
npm run dev                # Start both API (port 3000) and UI (port 4200)
npm run start:api          # NestJS API only
npm run start:ui           # React UI only

# Build
npm run build:all          # Production build for both apps

# Test
npm run test:all           # Run all Jest tests
# Run a single test file:
npx nx test api --testFile=path/to/spec.ts
npx nx test ui --testFile=path/to/spec.tsx

# Lint & Format
npm run lint               # Biome lint check
npm run format             # Biome auto-format
```

**Environment**: copy `apps/api/.env.example` to `apps/api/.env` and set:
- `MONGODB_URI` (default: `mongodb://localhost:27017/workbench`)
- `ANTHROPIC_API_KEY` (Claude Sonnet — agent chat, synthesis, vision for image uploads)
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` (optional, for graph features)

## Architecture

### Monorepo layout

```
work-bench/
├── apps/
│   ├── api/               # NestJS backend
│   ├── ui/                # React frontend
│   └── ui-e2e/            # Playwright E2E tests
├── libs/                  # Shared libs (planned, currently empty)
├── biome.json             # Lint + format (100-char lines, 2-space indent, single quotes)
└── nx.json                # NX workspace config
```

### Backend (`apps/api/src/`)

NestJS modules, one per domain:

| Module | Role |
|--------|------|
| `users` | CRUD + stores medical conditions, allergies, medications |
| `health-events` | Polymorphic health records (DOCTOR_VISIT, DIAGNOSIS, TREATMENT, MEDICATION) |
| `diet-logs` | Meal tracking (BREAKFAST/LUNCH/DINNER/SNACK/CRAVINGS/PILLS) + water intake |
| `lifestyle` | Sleep, exercise, stress logging |
| `meal-plans` | AI-generated meal plans, delegates to agent |
| `recipes` | Recipe storage with multilingual (Telugu/Tamil) ingredient labels |
| `agent` | LangGraph multi-step AI orchestration — chat, report parsing, meal generation |
| `neo4j` | Graph DB connection; family trees, disease-symptom maps, ingredient embeddings |

**AI-First pattern**: every write to users/health-events/diet-logs/lifestyle also updates `AIPatientContext` (a denormalized materialized view per user). The `agent` module reads this single document to build LLM prompts without multi-collection joins.

### Frontend (`apps/ui/src/`)

React SPA with sidebar navigation:

- **Layout** — collapsible sidebar + user selector (global current-user state)
- **FamilyDashboard** — member cards, add/delete family members
- **UserDashboard** — health summary for selected user
- **HealthRecords** — log/view health events (source: USER / DOCTOR / AI)
- **DietLogs** — meal entry and history
- **LifestyleRecords** — activity and habit logging
- **MealPlanDashboard** — request and display AI meal plans
- **Graph/FamilyTree** — Neo4j-backed force-graph visualization

### Key API routes

```
POST   /api/users                              Create user
GET    /api/users/:id/health-events            Health history
POST   /api/users/:id/diet-logs               Log meal
POST   /api/users/:userId/meal-plans/generate  AI meal plan
POST   /api/agent/:userId/chat                Chat with AI health agent
GET    /api/users/graph                       Family graph data
```

### Database design

- **MongoDB**: normalized operational collections (`User`, `HealthEvent`, `DietLog`, `Lifestyle`, `MealPlan`, `Recipe`, `AIPatientContext`)
- **Neo4j**: relationships (family tree), disease→symptom graph, ingredient→health-property graph, vector similarity search
- **AIPatientContext**: denormalized snapshot (demographics + active conditions + medications + recent diet + recent visits) — the single source of truth for LLM context; kept current via service-layer triggers

## Coding conventions

- Biome enforces formatting — run `npm run format` before committing
- All health data carries a `source` field: `USER | DOCTOR | AI`
- Status fields use `ACTIVE | RESOLVED | ONGOING`
- Multilingual ingredient labels stored as `{ en, te, ta }` objects
