# GovernIQ: Governance Graph Builder

The **Governance Graph Builder** turns AI-governance documents (Markdown, YAML, JSON) into a queryable graph of agents, models, tools, users, data sources, and policies. It enables security and compliance teams to query composition, trace data access paths, audit orphan agents, and evaluate compromised tool blast radii in one unified view.

---

## Architecture Overview

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Cytoscape.js, TanStack Query, Zustand
- **Backend**: Python 3.11+, FastAPI, Pydantic v2, Uvicorn
- **Graph Database**: Neo4j AuraDB (or local Neo4j Docker)
- **AI/LLM Layer**: Provider-agnostic OpenAI-compatible client (Groq / OpenAI) with safe Cypher validation
- **Cloud Targets**: Vercel (Frontend static SPA) + Render Web Service (FastAPI) + Neo4j AuraDB Free

---

## Project Structure

```text
GovernIQ/
├── backend/                   # FastAPI backend service
│   ├── app/
│   │   ├── api/               # Thin API routers (health, documents, query, graph)
│   │   ├── core/              # Config, auth, errors, logging
│   │   ├── graph/             # Neo4j driver, schema, read/write repositories
│   │   ├── llm/               # LLM client, prompts, Cypher safety validator
│   │   ├── parsers/           # MD/YAML/JSON to normalized document models
│   │   └── services/          # Ingestion and query orchestration
│   ├── tests/                 # Pytest test suite
│   ├── pyproject.toml         # Dependencies and tool configurations (Ruff, Mypy, Pytest)
│   └── .env.example
├── frontend/                  # React + TypeScript + Vite frontend SPA
│   ├── src/
│   │   ├── components/        # Presentational UI components (Canvas, Sidebar, ChatBar, etc.)
│   │   ├── features/          # Feature hooks and API callers
│   │   ├── lib/               # Env validation, Cytoscape styling, API client
│   │   ├── store/             # Zustand stores (UI state only)
│   │   └── types/             # Shared TypeScript types & Zod schemas
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
├── docs/                      # Architectural context and specs
│   └── context/
│       ├── ai-workflow-rules.md
│       ├── architecture.md
│       ├── code-standards.md
│       ├── project-overview.md
│       ├── ui-context.md
│       └── progress-tracker.md
├── .env.example               # Root reference environment configuration
├── .gitignore
└── README.md
```

---

## Getting Started

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\activate   # Windows PowerShell
# source .venv/bin/activate  # macOS / Linux

# Install dependencies
pip install -e ".[dev]"

# Copy environment file
cp .env.example .env

# Run development server
uvicorn app.main:app --reload --port 8000
```

Verify backend health:
```bash
curl http://localhost:8000/api/health
# Response: {"status":"ok"}
```

Run backend checks:
```bash
ruff check .
ruff format --check .
mypy app
pytest
```

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

The frontend will be accessible at `http://localhost:5173`.

Run frontend checks:
```bash
npm run typecheck
npm test
npm run build
```

---

## Invariants & Design Principles

1. **Strict Zero-AWS Policy**: No AWS SDKs (`boto3`, Bedrock SDK, Neptune) are used.
2. **Provider-Agnostic LLM**: Interacts with any OpenAI-compatible API endpoint with a read-only Cypher query validator.
3. **Idempotent Ingestion**: Documents use deterministic slug IDs (`<type>:<normalized-name>`) merged into Neo4j.
4. **Separation of Concerns**: Pure parsers, isolated graph persistence layer, presentational UI components.
