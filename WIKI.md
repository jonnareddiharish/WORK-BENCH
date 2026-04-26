# Workbench Health Tracker: Developer Wiki & AI Context

## Project Overview
Workbench is a modern family health tracker application built inside a monorepo. It enables families to track individual members' health events (diseases, treatments, doctor visits) and daily diet logs. The primary differentiator of this application is its **AI-First Database Architecture**, designed explicitly to feed comprehensive chronological health context into Large Language Models (LLMs) to generate personalized health reports, food suggestions, and issue predictions.

## Tech Stack
- **Monorepo Management**: NX
- **Backend API**: NestJS (Node.js)
- **Database**: MongoDB (via Mongoose)
- **Frontend UI**: React + TailwindCSS (v4) + React Router

## AI-Friendly Database Architecture
The database follows a Hybrid Approach:
1. **Primary Operational DB**: Traditional normalized/polymorphic collections for UI efficiency.
2. **AI Agent DB (`AIPatientContext`)**: A strictly denormalized, flattened text-based collection updated via triggers. This single document contains the entire prompt context for an AI agent to understand a patient's history without complex joins.

### Core Schemas (MongoDB)
1. **Family**: Grouping entity.
2. **User**: Represents a family member (`name`, `dateOfBirth`, `biologicalSex`, `baseMetrics`, `knownAllergies`).
3. **HealthEvent**: Polymorphic chronological records (`eventType`: DOCTOR_VISIT, DISEASE_DIAGNOSIS, TREATMENT_START, MEDICATION). Contains dates, status, and specific details.
4. **DietLog**: Daily tracking of meals and water intake.
5. **AIPatientContext**: The AI-facing materialized view. Contains textual summaries of `demographics`, `currentActiveConditions`, `currentMedications`, `recentDietaryPatterns`, and `recentDoctorVisits`.

## Development Log
- **2026-04-22**: 
  - Fixed MongoDB connection error (switched to local DB/bypassed SRV query for cloud).
  - Fixed UI port in-use error and fixed Tailwind CSS v4 integration.
  - Built MedCare+ landing page and initial Healthcare Dashboard UI in React.
  - Formulated the hybrid AI database schema design (User, HealthEvent, DietLog, AIPatientContext).
  - Established this `WIKI.md` for context persistence.

## Guidelines for Future AI Agents
- Always consult this WIKI before making architectural changes.
- Ensure any new user-facing data input (e.g., exercise logs, sleep data) is simultaneously wired to update the `AIPatientContext` plain-text prompt field so the AI health prediction engine remains accurate.
- Maintain Tailwind CSS v4 syntax (`@import "tailwindcss";`) for UI changes.
