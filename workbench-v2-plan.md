# Workbench V2 Architecture and Implementation Plan

## 1. Architecture Overview

### Tech Stack Evaluation
*   **MongoDB (Document Store):** Perfect for unstructured or highly variable data like user profiles, detailed health records, and daily diet logs. It allows fast writes and flexible schemas.
*   **Neo4j (GraphDB):** Ideal for modeling family relationships (the family tree graph), disease-to-symptom maps, ingredient-health properties, and recommendations. Relationships in a graph database are first-class citizens, making queries like "Find all ancestors with a history of diabetes" extremely efficient.
*   **LangGraph / AI Agent Layer:** Great choice for orchestrating multi-step AI reasoning. We can use it to build the Agent that generates embeddings for graph nodes (e.g., ingredients, diseases) using vector indexing, and then queries them using LangChain or direct Cypher queries.

### High-Level Components
1.  **Frontend (UI):** React-based (Nx `ui` app), styled dynamically for a premium user experience. Includes dashboards, collapsible sidebars, and graph visualization (e.g., using `react-flow` or `vis-network` for the family tree).
2.  **Backend (API):** NestJS (Nx `api` app).
    *   `Users Module`: Connects to MongoDB to manage auth and user data.
    *   `Health/Diet Module`: Connects to MongoDB for logs.
    *   `Family/Graph Module`: Connects to Neo4j to build family trees and manage relationships.
    *   **New Module: `Agent Module` (LangGraph):** Orchestrates AI logic, embedding generation, meal planning, and queries Neo4j/Vector stores.

---

## 2. Implementation Phases

### Phase 1: Foundation & Data Modeling
1.  **Database Setup:**
    *   Configure MongoDB schemas (`User`, `HealthRecord`, `DietLog`).
    *   Set up Neo4j Aura cloud connection in the NestJS API.
2.  **Auth & Onboarding:**
    *   Implement Signup/Login (Family ID + Password, Email/Phone).
    *   Create base MongoDB user documents and sync the core identity to a Neo4j Node (`User` node with `Family` relationship).

### Phase 2: Core Dashboards (UI & API)
1.  **Layout:** Create the main layout with a collapsible sidebar (Dashboard, Users, Reports, Settings).
2.  **Family Manager:**
    *   Implement Table View of family members.
    *   Implement Graph View of the family tree using a library like `react-force-graph` or `react-flow`, pulling data directly from Neo4j.
3.  **User Dashboard:**
    *   Implement Health Records & Diet Logs input components.
    *   Top display for medical conditions, allergies, etc.

### Phase 3: The AI Agent & LangGraph Module
1.  **Agent Service Creation:**
    *   Create the `agent` module in NestJS.
    *   Integrate LangChain/LangGraph.
2.  **Knowledge Graph & Embeddings:**
    *   Agent extracts foods from diet logs and populates `Ingredient` nodes in Neo4j.
    *   Agent generates vector embeddings for health properties of ingredients and diseases (using OpenAI or similar embeddings), storing them either in Neo4j's vector index or a dedicated vector store.
3.  **Suggestion Engine (Main Feature 1 & 2):**
    *   Implement the dynamic AI suggestion system (reasoning over recent logs, graph relationships, and clinical tests).
    *   Implement Meal Plan generation.

### Phase 4: Future Enhancements (MCP Server)
1.  **Conversational Agent:** Allow users to chat with the agent to input diet/health logs naturally.
2.  **MCP Server:** Expose the health/graph capabilities as an MCP (Model Context Protocol) server so other local AI assistants or IDEs can interact with the family data securely.
