# DataCrawl — Functional Requirements Document

**Version**: 1.1
**Date**: 2026-03-21
**Status**: Draft — Revised

---

## 1. Executive Summary

DataCrawl is a dataset creation and management platform that enables users — students, retail traders, investors, and institutional traders — to generate, scrape, synthesize, and merge datasets for any use case, with a focus on financial data. The platform uses a multi-agent AI architecture orchestrated by LangGraph, where a conversational orchestrator agent (powered by Google Gemini 2.5 Pro) collaborates with the user to plan data collection, then delegates execution to specialized sub-agents running on Together AI.

Users interact through a React-based dark-themed UI, authenticate via Auth0, pay via Stripe, and store datasets in Firebase Storage. Agent runs are fully asynchronous — users can trigger a run and close their browser.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  (Dark theme, no gradients, real-time agent step viewer)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + Firestore onSnapshot
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend                            │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────────────┐  │
│  │ Auth0    │ │ Stripe   │ │Firebase │ │ LangGraph      │  │
│  │ Middleware│ │ Routes  │ │ SDK     │ │ Runner         │  │
│  └──────────┘ └──────────┘ └─────────┘ └───────┬────────┘  │
│                                                 │           │
│  ┌──────────────────────────────────────────────▼────────┐  │
│  │              LangGraph State Machine                  │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │         Orchestrator Agent (Gemini 2.5 Pro)     │  │  │
│  │  │         via Google Gemini API                    │  │  │
│  │  └────────┬────────┬───────┬───────┬───────┬───────┘  │  │
│  │           │        │       │       │       │          │  │
│  │    ┌──────▼──┐ ┌───▼───┐ ┌▼─────┐ ┌▼─────┐ ┌▼──────┐ │  │
│  │    │Synthetic│ │Script │ │Norm- │ │Vali- │ │Comp- │ │  │
│  │    │Data Gen │ │Writer │ │alizer│ │dator │ │liance│ │  │
│  │    └─────────┘ └───────┘ └──────┘ └──────┘ └──────┘ │  │
│  │                    │                                  │  │
│  │              ┌─────▼──────┐                           │  │
│  │              │Web Crawler │                           │  │
│  │              │(browser-use│                           │  │
│  │              │+ Playwright│                           │  │
│  │              └────────────┘                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Firebase │ │ Together │ │ Google   │
        │ Firestore│ │ AI API   │ │ Gemini   │
        │ + Storage│ │          │ │ API      │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite + TypeScript | SPA with dark theme UI |
| Backend | FastAPI (Python 3.12) | REST API + WebSocket for agent streaming |
| Auth | Auth0 | User authentication (user-facing endpoints only) |
| Payments | Stripe | User billing, budget enforcement |
| Database | Firebase Firestore | User profiles, project metadata, agent run logs |
| File Storage | Firebase Storage | Dataset files (CSV, JSON, Parquet) |
| Agent Orchestration | LangGraph (Python) | Multi-agent state machine, async execution, HITL |
| Orchestrator LLM | Google Gemini 2.5 Pro (via Google AI API) | Planning, user conversation, task routing |
| Sub-Agent LLMs | Together AI API | Specialized agents (see model table below) |
| Browser Automation | browser-use + Playwright | Autonomous web crawling, form filling, data extraction |
| Async Execution | FastAPI BackgroundTasks + Firestore | Background agent runs with state persisted to Firestore |
| Real-Time Streaming | Firestore onSnapshot | Frontend listens to Firestore directly for live agent log updates |

### 3.1 Model Selection (Together AI Sub-Agents)

| Agent | Model | Together AI ID | Cost (In/Out per 1M tokens) | Rationale |
|-------|-------|---------------|---------------------------|-----------|
| **Orchestrator** | Gemini 2.5 Pro | *Google AI API — not Together* | ~$1.25/$10.00 | Best-in-class reasoning, planning, and conversation. User-facing agent. |
| **Script Writer** | Qwen3.5-397B-A17B | `Qwen/Qwen3.5-397B-A17B` | $0.60 / $3.60 | Top code generation, function calling, JSON mode |
| **Synthetic Data Generator** | Llama 4 Maverick | `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | $0.27 / $0.85 | Excellent structured output (JSON mode), cost-effective for high-volume generation |
| **Data Normalizer** | Qwen3.5-9B | `Qwen/Qwen3.5-9B` | $0.10 / $0.15 | Fast, cheap, JSON mode — perfect for transformation tasks |
| **Data Validator** | Qwen3-235B-A22B | `Qwen/Qwen3-235B-A22B-Instruct` | $0.20 / $0.60 | Strong reasoning at low cost for quality checks and coverage analysis |
| **Compliance Agent** | Qwen3-235B-A22B | `Qwen/Qwen3-235B-A22B-Instruct` | $0.20 / $0.60 | Needs solid reasoning for legal/TOS analysis, function calling for budget checks |
| **Web Crawler** | Llama 4 Maverick | `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | $0.27 / $0.85 | Function calling for browser-use tool invocations, cost-effective for multi-step browsing |

**Why Gemini 2.5 Pro instead of Gemini 3.1 Pro**: The spec references Gemini 3.1 Pro. As of March 2026, Google's latest stable production model is Gemini 2.5 Pro. If Gemini 3.1 Pro becomes available, it can be swapped in as a drop-in replacement since the orchestrator calls Google's API directly.

**Why not Gemini on Together AI**: Together AI hosts open-source models only. Gemini is proprietary. The orchestrator calls Google's Gemini API directly; all other agents route through Together AI for cost efficiency.

---

## 4. Agent Architecture (LangGraph)

### 4.1 LangGraph State Schema

```python
class DataCrawlState(TypedDict):
    # Conversation
    messages: Annotated[list, add_messages]

    # Plan
    plan: dict              # The finalized data collection plan
    plan_approved: bool     # Whether user has approved the plan

    # Project config
    project_id: str
    user_id: str
    budget_total: float     # User-set budget cap (USD)
    budget_spent: float     # Running total spent

    # Agent outputs
    datasets: list[dict]    # Collected dataset references {type, path, lineage}
    agent_logs: list[dict]  # Step-by-step log for UI display
    current_agent: str      # Which agent is currently active

    # Control
    status: str             # "planning" | "approved" | "running" | "paused" | "completed" | "failed" | "killed"
    error: str | None
```

### 4.2 Agent Descriptions

#### 4.2.1 Orchestrator Agent (Gemini 2.5 Pro)

**Role**: The user-facing conversational agent. It understands the user's dataset requirements, designs a data collection plan, presents it for approval, and then coordinates execution by routing tasks to sub-agents.

**Capabilities**:
- Conversational planning: asks clarifying questions about data needs (schema, volume, sources, time range, etc.)
- Generates a structured plan specifying which agents to invoke, in what order, with what parameters
- Human-in-the-loop: pauses execution via LangGraph `interrupt()` for plan approval before any data collection begins
- Budget awareness: tracks cumulative external data costs and halts if budget is approached (LLM inference costs are NOT counted toward user budget)
- Monitors sub-agent outputs and decides next steps (retry, proceed, merge)

**Plan Structure** (output by orchestrator, approved by user):
```json
{
  "plan_id": "uuid",
  "description": "Collect 5 years of S&P 500 daily OHLCV data",
  "steps": [
    {
      "step": 1,
      "agent": "compliance",
      "action": "check_source_legality",
      "params": {"source": "Yahoo Finance", "data_type": "market_data"}
    },
    {
      "step": 2,
      "agent": "script_writer",
      "action": "generate_scraping_script",
      "params": {"source": "Yahoo Finance", "target_data": "OHLCV", "ticker": "^GSPC", "range": "5Y"}
    },
    {
      "step": 3,
      "agent": "web_crawler",
      "action": "execute_script",
      "params": {"script_ref": "step_2_output"}
    },
    {
      "step": 4,
      "agent": "normalizer",
      "action": "normalize_data",
      "params": {"input_ref": "step_3_output", "target_schema": {"columns": ["date","open","high","low","close","volume"]}}
    },
    {
      "step": 5,
      "agent": "validator",
      "action": "validate_dataset",
      "params": {"input_ref": "step_4_output", "checks": ["completeness", "schema_match", "no_nulls"]}
    }
  ],
  "estimated_cost": 0.00,
  "data_sources": ["Yahoo Finance"],
  "output_format": "csv"
}
```

#### 4.2.2 Script Writer Agent (Qwen3.5-397B)

**Role**: Generates Python scraping scripts tailored to the target data source.

**Input**: Source URL/API, target data description, output schema
**Output**: Executable Python script (using requests, BeautifulSoup, or API client libraries)
**Behavior**:
- Generates scripts that output structured data (CSV/JSON)
- Handles pagination, rate limiting, and error handling in generated code
- Scripts are sandboxed — executed in a Docker container with network access but no filesystem access beyond a temp directory

#### 4.2.3 Web Crawler Agent (Llama 4 Maverick + browser-use)

**Role**: Autonomous browser agent for dynamic websites that require interaction (clicking, scrolling, form filling, login, payment).

**Implementation**: Uses `browser-use` library wrapping Playwright. The LLM controls the browser through browser-use's action space (click, type, scroll, extract, navigate).

**Capabilities**:
- Navigate multi-page flows (pagination, infinite scroll)
- Fill forms and handle CAPTCHAs (via human interrupt if needed)
- Extract structured data from rendered DOM
- Handle payment flows when authorized (budget-checked by compliance agent first)
- Screenshots saved to agent logs for auditability

**Security**:
- Payment credentials are never stored — injected at runtime from Stripe session
- All browser sessions run in isolated Playwright contexts
- Budget is checked before any payment action via the compliance agent

#### 4.2.4 Synthetic Data Generator (Llama 4 Maverick)

**Role**: Generates synthetic datasets when real data is unavailable, insufficient, or too expensive to obtain.

**Input**: Schema definition, statistical properties, sample size, domain context
**Output**: Dataset file (CSV/JSON) + lineage metadata

**Behavior**:
- Generates data in batches (e.g., 1000 rows per LLM call) to manage context window
- Ensures statistical coherence (distributions, correlations) based on user-specified or inferred properties
- Outputs lineage metadata: `{"source": "synthetic", "model": "llama-4-maverick", "generation_params": {...}, "timestamp": "..."}`

#### 4.2.5 Data Normalizer Agent (Qwen3.5-9B)

**Role**: Transforms raw scraped/generated data into a consistent target schema.

**Input**: Raw dataset + target schema
**Output**: Normalized dataset + transformation log

**Transformations**:
- Column renaming/reordering
- Data type casting (string dates → datetime, string numbers → float)
- Unit conversions (e.g., pence → dollars)
- Deduplication
- Null handling (drop, fill, interpolate — based on orchestrator instructions)

**Lineage**: Records every transformation applied as a list: `[{"operation": "rename_column", "from": "Close*", "to": "close"}, ...]`

#### 4.2.6 Data Validator Agent (Qwen3-235B)

**Role**: Validates datasets for quality, completeness, and fitness for the user's stated purpose.

**Checks**:
- **Schema validation**: columns, types, constraints match specification
- **Completeness**: missing value percentage, date range gaps, expected row count vs actual
- **Statistical sanity**: outlier detection, distribution checks, correlation checks against known benchmarks
- **Coverage analysis**: does this dataset sufficiently cover the user's use case? (e.g., "you requested 5 years but only 3.5 years of data was found")
- **Cross-source consistency**: when merging datasets, checks for conflicting values

**Output**: Validation report with pass/fail per check + recommendations

**Lineage tracking**: Maintains a full lineage record per dataset:
```json
{
  "dataset_id": "uuid",
  "sources": [
    {"type": "scraped", "url": "https://...", "scraped_at": "2026-03-21T10:00:00Z"},
    {"type": "synthetic", "model": "llama-4-maverick", "rows_generated": 500}
  ],
  "transformations": [
    {"agent": "normalizer", "operation": "rename_columns", "details": {...}},
    {"agent": "normalizer", "operation": "cast_types", "details": {...}}
  ],
  "validation": {
    "passed": true,
    "checks": {"completeness": "pass", "schema": "pass", "coverage": "warn:3.5y/5y"}
  },
  "version": 1
}
```

#### 4.2.7 Compliance Agent (Qwen3-235B)

**Role**: Legal and budget gatekeeper. Called before any scraping or payment action.

**Checks**:
- **robots.txt compliance**: Fetches and parses robots.txt for target domain
- **Terms of Service**: Analyzes TOS pages for scraping restrictions (best-effort — flags uncertainty for human review)
- **Rate limiting**: Recommends request delays based on site policies
- **Budget enforcement**: Calculates cost of proposed action, checks against remaining budget, blocks if insufficient
- **Data licensing**: Flags if scraped data has restrictive licensing (e.g., non-commercial only)

**Output**: `{"allowed": true/false, "reason": "...", "recommended_delay_ms": 1000, "budget_remaining": 45.00}`

**Budget enforcement flow**:
1. Orchestrator proposes an action that may cost money
2. Compliance agent checks `budget_spent + estimated_cost <= budget_total`
3. If over budget: blocks the action, returns to orchestrator with alternatives
4. If under budget: approves, logs the estimated cost

---

## 5. LangGraph Workflow

### 5.1 Graph Structure

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         ▼
                ┌────────────────┐
            ┌──>│  Orchestrator  │<──────────────────┐
            │   │  (Gemini 2.5)  │                   │
            │   └───┬──┬──┬──┬──┬┘                   │
            │       │  │  │  │  │                    │
     user   │       │  │  │  │  └──────────┐         │
     reply  │       ▼  ▼  ▼  ▼             ▼         │
            │    ┌───┐┌───┐┌───┐┌────┐ ┌────────┐    │
            │    │SW ││SDG││Nor││Val │ │Complnc│    │
            │    └─┬─┘└─┬─┘└─┬─┘└─┬──┘ └───┬────┘    │
            │      │    │    │    │        │         │
            │      └────┴────┴────┴────────┘         │
            │              │                          │
            │              ▼                          │
            │     ┌────────────────┐                  │
            │     │  Web Crawler   │                  │
            │     │  (browser-use) │                  │
            │     └───────┬────────┘                  │
            │             │                           │
            │             ▼                           │
            │     ┌────────────────┐                  │
            └─────│ Human Review   │──────────────────┘
                  │ (interrupt())  │
                  └────────────────┘
```

### 5.2 Execution Phases

**Phase 1 — Planning (synchronous, conversational)**
1. User describes their dataset needs in chat
2. Orchestrator asks clarifying questions (data type, volume, sources, schema, time range, budget)
3. Orchestrator generates a structured plan
4. Plan is presented to user via `interrupt()` — user approves, edits, or rejects
5. Loop until plan is approved (`plan_approved = True`)

**Phase 2 — Execution (asynchronous, background)**
1. Plan approval triggers a FastAPI background task that runs the LangGraph execution subgraph
2. Orchestrator invokes sub-agents per the plan steps
3. Each agent logs its actions to Firestore `agent_logs` array (frontend sees updates via `onSnapshot`)
4. Budget is checked before every external-cost action
5. If a step fails, orchestrator decides: retry, skip, or abort
6. User can kill the run at any time → sets `status = "killed"` in Firestore, background task checks this flag between steps

**Phase 3 — Delivery**
1. Final datasets uploaded to Firebase Storage under `users/{user_id}/projects/{project_id}/datasets/`
2. Lineage metadata saved to Firestore
3. Run status set to `"completed"` — frontend sees it instantly via `onSnapshot`

---

## 6. Backend API Design (FastAPI)

### 6.1 Authentication

All endpoints require a valid Auth0 JWT in the `Authorization: Bearer <token>` header. The FastAPI middleware validates the token against Auth0's JWKS endpoint.

### 6.2 Endpoints

#### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create a new project (name, description, budget) |
| GET | `/api/projects` | List user's projects |
| GET | `/api/projects/{id}` | Get project details |
| PATCH | `/api/projects/{id}` | Update project (name, budget) |
| DELETE | `/api/projects/{id}` | Delete project and associated data |

#### Agent Runs
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects/{id}/runs` | Start a new agent run (triggers planning phase) |
| GET | `/api/projects/{id}/runs` | List runs for a project |
| GET | `/api/projects/{id}/runs/{run_id}` | Get run status, plan, agent logs |
| POST | `/api/projects/{id}/runs/{run_id}/message` | Send a message to the orchestrator (planning phase) |
| POST | `/api/projects/{id}/runs/{run_id}/approve` | Approve the plan → triggers execution |
| POST | `/api/projects/{id}/runs/{run_id}/kill` | Kill a running agent run |

Real-time streaming is handled by Firestore `onSnapshot` on the client side — no WebSocket endpoint needed.

#### Datasets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/{id}/datasets` | List datasets for a project |
| GET | `/api/projects/{id}/datasets/{dataset_id}` | Get dataset metadata + lineage |
| GET | `/api/projects/{id}/datasets/{dataset_id}/download` | Get signed download URL |
| POST | `/api/projects/{id}/datasets/upload` | Upload a user dataset (for hybrid merging) |
| DELETE | `/api/projects/{id}/datasets/{dataset_id}` | Delete a dataset |

#### Payments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/setup-intent` | Create Stripe SetupIntent for adding payment method |
| GET | `/api/billing/payment-methods` | List user's saved payment methods |
| DELETE | `/api/billing/payment-methods/{pm_id}` | Remove a payment method |

#### User
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/profile` | Get user profile |
| PATCH | `/api/user/profile` | Update profile |

---

## 7. Frontend Design

### 7.1 Theme

- **Dark mode only** — no light mode toggle needed
- **No gradients** — flat, solid colors
- **Color palette**: Dark charcoal background (#0d1117), slightly lighter card backgrounds (#161b22), bright accent color for interactive elements (electric blue #58a6ff or teal #3fb950), white text (#e6edf3), muted secondary text (#8b949e)
- **Typography**: Monospace for data displays, Inter/system sans-serif for UI text
- **Inspiration**: "Data-like" aesthetic — think terminal/dashboard feel

### 7.2 Pages

1. **Login/Signup** — Auth0 Universal Login (redirect flow)
2. **Dashboard** — List of projects, each showing status, budget, dataset count
3. **Project View** — Project details, runs list, datasets list
4. **Agent Chat** — Split view:
   - Left: Chat interface with orchestrator (planning phase)
   - Right: Agent activity log (execution phase) — shows which agent is running, what it's doing, step-by-step with timestamps
5. **Dataset Viewer** — Preview dataset (first 100 rows), view lineage tree, download
6. **Billing** — Stripe payment method management, usage history

### 7.3 Real-Time Agent Viewer

The agent activity panel shows:
- Current agent name and status (running/waiting/completed)
- Each step as a collapsible card:
  - Agent name + icon
  - Action description
  - Input summary
  - Output summary (or "running..." spinner)
  - Duration
  - Cost incurred (if any)
- A "Kill Run" button (red, with confirmation dialog)
- Budget meter showing spent vs. total

Connection: Firestore `onSnapshot` listener on the run document. Each agent log entry is appended to the `agent_logs` array in Firestore and received instantly by the frontend. Log entry structure:
```json
{
  "agent": "script_writer",
  "action": "generate_scraping_script",
  "status": "completed",
  "duration_ms": 3200,
  "cost_usd": 0.002,
  "summary": "Generated Yahoo Finance scraper for ^GSPC OHLCV data",
  "output_preview": "...",
  "timestamp": "2026-03-21T10:05:32Z"
}
```

---

## 8. Data Storage Schema (Firestore)

### Collections

```
users/{user_id}
  ├── email: string
  ├── name: string
  ├── auth0_id: string
  ├── stripe_customer_id: string
  ├── created_at: timestamp

users/{user_id}/projects/{project_id}
  ├── name: string
  ├── description: string
  ├── budget: number (USD)
  ├── budget_spent: number
  ├── status: string
  ├── created_at: timestamp
  ├── updated_at: timestamp

users/{user_id}/projects/{project_id}/runs/{run_id}
  ├── status: string ("planning"|"approved"|"running"|"completed"|"failed"|"killed")
  ├── plan: map (the approved plan JSON)
  ├── agent_logs: array of maps
  ├── total_cost: number
  ├── started_at: timestamp
  ├── completed_at: timestamp

users/{user_id}/projects/{project_id}/datasets/{dataset_id}
  ├── name: string
  ├── format: string ("csv"|"json"|"parquet")
  ├── storage_path: string (Firebase Storage path)
  ├── size_bytes: number
  ├── row_count: number
  ├── columns: array of strings
  ├── lineage: map (full lineage object)
  ├── source_type: string ("scraped"|"synthetic"|"uploaded"|"hybrid")
  ├── version: number
  ├── created_at: timestamp
```

### Firebase Storage Structure

```
datasets/
  {user_id}/
    {project_id}/
      {dataset_id}/
        data.csv          (or .json, .parquet)
        lineage.json
        validation_report.json
```

---

## 9. Hybrid Dataset Creation

Users can merge datasets from different sources (scraped, synthetic, uploaded) into a single unified dataset.

**Flow**:
1. User has multiple datasets in a project (e.g., scraped OHLCV + synthetic sentiment scores + uploaded portfolio)
2. User tells the orchestrator to merge them: "Combine my price data with the sentiment data, join on date"
3. Orchestrator creates a plan with a merge step
4. The normalizer agent executes the merge (join strategy, key columns, conflict resolution)
5. Validator agent checks the merged output
6. New dataset is created with lineage referencing all source datasets

**Lineage for hybrid datasets**:
```json
{
  "source_type": "hybrid",
  "sources": [
    {"dataset_id": "abc", "type": "scraped"},
    {"dataset_id": "def", "type": "synthetic"},
    {"dataset_id": "ghi", "type": "uploaded"}
  ],
  "merge_strategy": "inner_join",
  "join_key": "date"
}
```

---

## 10. Budget & Cost Management

### User-Set Budgets
- Each project has a `budget` field (USD) set by the user (can be $0 for free-only sources)
- The compliance agent enforces this as a hard cap

### What Counts Toward Budget
Only **external data costs** count toward the user's project budget:
1. **API data providers** — if a source charges per request (compliance agent checks before)
2. **Paid website content** — web crawler can make payments if authorized

**NOT counted toward budget**: LLM inference costs (Together AI and Gemini API calls). These are platform operating costs, not user costs.

### Budget Enforcement
- Before any action that incurs external data costs, the orchestrator routes through compliance agent
- Compliance agent calculates: `budget_remaining = budget_total - budget_spent`
- If `estimated_cost > budget_remaining`: action blocked, orchestrator informed with remaining budget
- All external costs are logged per step in `agent_logs`

---

## 11. Security

### Auth0 Integration
- **User authentication**: Auth0 Universal Login with JWT tokens
- **API protection**: FastAPI dependency that validates Auth0 JWT on every request
- **Agent communication**: Internal agent calls are server-side (no external auth needed) — they run within the same LangGraph process. Auth0 is for user-facing endpoints only.

### Data Isolation
- Firestore security: all queries scoped to `user_id` from the JWT
- Firebase Storage: paths include `user_id`, signed URLs for downloads
- Agent runs are isolated per user — no cross-user data access

### Web Crawler Security
- Browser sessions run in headless Playwright with isolated contexts
- No persistent cookies or credentials stored
- Payment information handled via Stripe session tokens, never stored by the agent
- All crawler actions logged for auditability

---

## 12. Async Execution & Kill Switch

### Background Execution (No Celery/Redis/PostgreSQL)

To keep the stack minimal (hackathon-friendly), async execution uses **FastAPI background tasks + Firestore** instead of Celery + Redis + PostgreSQL:

1. User approves plan → FastAPI endpoint launches an `asyncio` background task via `BackgroundTasks`
2. The background task runs the LangGraph execution subgraph in-process
3. LangGraph state is checkpointed to Firestore using a custom `FirestoreCheckpointer` (stores state snapshots in `runs/{run_id}/checkpoints/` subcollection)
4. Each agent step writes its log entry directly to the Firestore `runs/{run_id}` document (appending to the `agent_logs` array)
5. The React frontend subscribes to the run document using Firestore's `onSnapshot` real-time listener — **no WebSocket or Redis needed**

**Why this works for a hackathon**: Eliminates three infrastructure dependencies (Celery, Redis, PostgreSQL). The tradeoff is that background tasks die if the server restarts — acceptable for a hackathon/demo. For production, this could be upgraded to Cloud Run Jobs or Cloud Tasks.

### Real-Time Updates via Firestore onSnapshot

Instead of WebSocket + Redis pub/sub, the frontend uses the Firebase JS SDK to listen to Firestore documents directly:

```typescript
// Frontend: subscribe to real-time agent log updates
import { doc, onSnapshot } from "firebase/firestore";

const unsubscribe = onSnapshot(
  doc(db, `users/${userId}/projects/${projectId}/runs/${runId}`),
  (snapshot) => {
    const data = snapshot.data();
    setAgentLogs(data.agent_logs);
    setStatus(data.status);
    setBudgetSpent(data.budget_spent);
  }
);
```

This gives the same real-time experience as WebSocket but with zero backend streaming infrastructure.

### Custom Firestore Checkpointer for LangGraph

```python
from langgraph.checkpoint.base import BaseCheckpointSaver

class FirestoreCheckpointer(BaseCheckpointSaver):
    """Persists LangGraph state to Firestore for durable async execution."""

    def __init__(self, db, user_id: str, project_id: str):
        self.db = db
        self.base_path = f"users/{user_id}/projects/{project_id}"

    async def aput(self, config, checkpoint, metadata):
        run_id = config["configurable"]["thread_id"]
        doc_ref = self.db.collection(f"{self.base_path}/runs/{run_id}/checkpoints")
        await doc_ref.document(checkpoint["id"]).set({
            "checkpoint": checkpoint,
            "metadata": metadata,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

    async def aget(self, config):
        run_id = config["configurable"]["thread_id"]
        docs = (self.db.collection(f"{self.base_path}/runs/{run_id}/checkpoints")
                .order_by("timestamp", direction="DESCENDING")
                .limit(1)
                .stream())
        # Return latest checkpoint or None
        ...
```

### Kill Switch
1. User clicks "Kill Run" → `POST /api/projects/{id}/runs/{run_id}/kill`
2. Backend sets `status = "killed"` in the Firestore run document
3. The background task checks the run's `status` field in Firestore before each agent step
4. If `status == "killed"`: task stops gracefully, partial results are saved
5. Any running browser-use session is terminated
6. Frontend sees the status change instantly via `onSnapshot`

### Reconnection
- No reconnection logic needed — Firestore `onSnapshot` automatically syncs when the client comes back online
- All agent logs are persisted in Firestore and loaded instantly on page open
- Run status is always queryable via REST API or directly from Firestore

---

## 13. MCP Assessment

The spec asks about MCP deployment for agent autonomy. After evaluation:

**Recommendation: MCP is not needed as a deployment layer.** Here's why:

- MCP (Model Context Protocol) is a protocol for connecting AI assistants to external tools/data sources. It's useful when an external AI client (like Claude Desktop) needs to call your tools.
- In DataCrawl, the agents run server-side within LangGraph. They don't need MCP to communicate with each other — LangGraph handles inter-agent routing natively.
- For browser automation, `browser-use` provides a direct Python integration with Playwright — no MCP intermediary needed.

**Where MCP could add value later** (not in scope for v1):
- Exposing DataCrawl as an MCP server so external AI assistants can trigger dataset generation
- Using the Microsoft Playwright MCP server as an alternative to browser-use

**For v1**: LangGraph nodes call sub-agents directly via Together AI's API and browser-use. No MCP layer.

---

## 14. Implementation Details

### 14.1 Project Structure

```
DataCrawl/
├── frontend/                    # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat/            # Orchestrator chat interface
│   │   │   ├── AgentViewer/     # Real-time agent activity panel
│   │   │   ├── DatasetViewer/   # Dataset preview + lineage
│   │   │   ├── Dashboard/       # Project list
│   │   │   └── Billing/         # Stripe integration
│   │   ├── hooks/               # Custom React hooks (useWebSocket, useAuth)
│   │   ├── services/            # API client, auth client
│   │   ├── styles/              # Global theme, CSS variables
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                     # FastAPI app
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, middleware
│   │   ├── config.py            # Environment config
│   │   ├── auth/
│   │   │   └── auth0.py         # Auth0 JWT validation dependency
│   │   ├── routers/
│   │   │   ├── projects.py
│   │   │   ├── runs.py
│   │   │   ├── datasets.py
│   │   │   ├── billing.py
│   │   │   └── user.py
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic models
│   │   ├── services/
│   │   │   ├── firebase.py      # Firestore + Storage client
│   │   │   └── stripe_service.py
│   │   └── tasks/
│   │       └── run_agent.py     # Background task that runs LangGraph
│   ├── requirements.txt
│   └── Dockerfile
│
├── agents/                      # LangGraph agent definitions
│   ├── graph.py                 # Main LangGraph StateGraph definition
│   ├── state.py                 # DataCrawlState TypedDict
│   ├── orchestrator.py          # Orchestrator node (Gemini 2.5 Pro)
│   ├── script_writer.py         # Script writer node (Qwen3.5-397B)
│   ├── synthetic_generator.py   # Synthetic data node (Llama 4 Maverick)
│   ├── normalizer.py            # Data normalizer node (Qwen3.5-9B)
│   ├── validator.py             # Data validator node (Qwen3-235B)
│   ├── compliance.py            # Compliance/budget node (Qwen3-235B)
│   ├── web_crawler.py           # Web crawler node (browser-use + Llama 4 Maverick)
│   └── tools/
│       ├── browser_tools.py     # browser-use wrapper
│       ├── data_tools.py        # Pandas/data manipulation helpers
│       └── storage_tools.py     # Firebase Storage upload/download
│   └── checkpointer.py         # Custom FirestoreCheckpointer for LangGraph
│
├── docker-compose.yml           # FastAPI + frontend (no Redis/Postgres/Celery)
├── .env.example
└── README.md
```

### 14.2 Key Implementation Details

#### LangGraph Graph Definition (agents/graph.py)

```python
from langgraph.graph import StateGraph, START, END
from agents.checkpointer import FirestoreCheckpointer

def build_graph(user_id: str, project_id: str, db):
    graph = StateGraph(DataCrawlState)

    # Add nodes
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("script_writer", script_writer_node)
    graph.add_node("synthetic_generator", synthetic_generator_node)
    graph.add_node("normalizer", normalizer_node)
    graph.add_node("validator", validator_node)
    graph.add_node("compliance", compliance_node)
    graph.add_node("web_crawler", web_crawler_node)

    # Orchestrator is the hub — all agents route back to it
    graph.add_edge(START, "orchestrator")
    graph.add_conditional_edges("orchestrator", route_from_orchestrator)

    for agent in ["script_writer", "synthetic_generator", "normalizer",
                   "validator", "compliance", "web_crawler"]:
        graph.add_edge(agent, "orchestrator")

    checkpointer = FirestoreCheckpointer(db, user_id, project_id)
    return graph.compile(checkpointer=checkpointer)
```

The `route_from_orchestrator` function reads the orchestrator's tool call output to determine which sub-agent to invoke next, or returns `END` if the plan is complete.

#### Orchestrator Node (agents/orchestrator.py)

```python
import google.generativeai as genai
from langgraph.types import interrupt, Command

async def orchestrator_node(state: DataCrawlState):
    model = genai.GenerativeModel("gemini-2.5-pro")

    # System prompt includes: role, available agents, plan format, budget rules
    response = await model.generate_content_async(
        contents=build_messages(state),
        tools=agent_tool_definitions,  # Function calling to route to sub-agents
    )

    # If plan is generated but not approved, interrupt for human review
    if has_plan(response) and not state["plan_approved"]:
        plan = extract_plan(response)
        user_decision = interrupt({"plan": plan, "message": "Please review and approve this plan."})
        # User responds via Command(resume={"approved": True/False, "edits": ...})
        return handle_user_decision(user_decision, state)

    # If tool call → route to sub-agent
    if has_tool_call(response):
        return route_to_agent(response, state)

    # Otherwise, conversational response
    return {"messages": [response.text], "agent_logs": [...]}
```

#### Web Crawler Node (agents/web_crawler.py)

```python
from browser_use import Agent as BrowserAgent
from langchain_together import ChatTogether

async def web_crawler_node(state: DataCrawlState):
    llm = ChatTogether(
        model="meta-llama/Llama-4-Maverick-17B-128E-Instruct",
        api_key=TOGETHER_API_KEY,
    )

    agent = BrowserAgent(
        task=state["current_task"]["description"],
        llm=llm,
    )

    result = await agent.run()

    return {
        "datasets": [{"type": "scraped", "data": result.extracted_data, ...}],
        "agent_logs": [{"agent": "web_crawler", "action": "crawl", "status": "completed", ...}],
    }
```

#### Background Task (backend/app/tasks/run_agent.py)

```python
from agents.graph import build_graph
from app.services.firebase import get_firestore_client

async def run_agent_execution(project_id: str, run_id: str, user_id: str):
    """Runs as a FastAPI BackgroundTask — no Celery needed."""
    db = get_firestore_client()
    graph = build_graph(user_id, project_id, db)
    config = {"configurable": {"thread_id": run_id}}
    run_ref = db.collection(f"users/{user_id}/projects/{project_id}/runs").document(run_id)

    # Run with kill-switch checking
    async for event in graph.astream(
        Command(resume={"approved": True}),
        config=config,
    ):
        # Write agent log directly to Firestore (frontend sees it via onSnapshot)
        log_entry = format_agent_log(event)
        if log_entry:
            run_ref.update({"agent_logs": firestore.ArrayUnion([log_entry])})

        # Check kill switch from Firestore
        run_doc = run_ref.get()
        if run_doc.to_dict().get("status") == "killed":
            break

    # Upload final datasets to Firebase Storage
    await finalize_run(project_id, run_id, user_id, db)
```

### 14.3 Infrastructure (docker-compose.yml)

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
```

No Redis, PostgreSQL, or Celery workers needed. Firestore handles persistence, checkpointing, and real-time streaming. This is a two-container setup.

### 14.4 Environment Variables

```
# Google Gemini
GOOGLE_API_KEY=

# Together AI
TOGETHER_API_KEY=

# Auth0
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_AUDIENCE=

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CREDENTIALS_PATH=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## 15. Deployment

For v1, deploy with minimal infrastructure:

- **Backend**: Single Docker container on GCP Cloud Run (or any cloud VM). Must support long-running requests for agent execution (set Cloud Run timeout to 60 min, or use a GCE VM).
- **Frontend**: Firebase Hosting (free, integrates with Firestore natively)
- **Database + Storage + Real-Time**: Firebase (Firestore + Storage) — fully managed, no servers to provision
- **Browser automation**: Backend container runs Playwright in headless mode (default)

---

## 16. Out of Scope (v1)

- Email/push notifications for run completion
- Team/organization accounts
- Dataset marketplace / sharing
- Scheduled/recurring data collection
- Custom agent plugins
- MCP server exposure for external AI clients
