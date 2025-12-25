# Backend Overview - Workflow Station

## Executive Summary

The Workflow Station backend consists of **three main components** that work together to provide a comprehensive workflow orchestration system:

1. **Cloudflare Workers Workflow Engine** (TypeScript) - LLM-based multi-step processing with conditional logic
2. **Python Workflow Engine** (Modal) - DAG-based pipeline execution for ObjSpace blocks
3. **Endpoint Workers** (Cloudflare Workers) - External API call handlers with retry logic

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Station Backend                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐ │
│  │  Cloudflare Workers      │    │  Python/Modal Engine     │ │
│  │  Workflow Engine         │    │  (DAG Executor)          │ │
│  │                          │    │                          │ │
│  │ • TypeScript             │    │ • Python 3.11+           │ │
│  │ • Cloudflare Workflows   │    │ • Modal Serverless       │ │
│  │ • LLM Processing         │    │ • DAG Execution           │ │
│  │ • Conditional Branching   │    │ • Step Processor         │ │
│  │ • Endpoint Integration   │    │ • Redis State Storage    │ │
│  │ • Thread Collection      │    │ • Webhook Notifications  │ │
│  │ • Router Logic           │    │                          │ │
│  └──────────────────────────┘    └──────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Endpoint Workers (Cloudflare Workers)            │  │
│  │                                                          │  │
│  │ • endpoint-1, endpoint-2, endpoint-3                   │  │
│  │ • External API call handlers                            │  │
│  │ • Retry logic with exponential backoff                  │  │
│  │ • CORS support                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Cloudflare Workers Workflow Engine

**Location:** `workflow-engine/`

### Technology Stack
- **Runtime:** Cloudflare Workers (Edge Computing)
- **Language:** TypeScript
- **Framework:** Cloudflare Workflows API
- **LLM Providers:** OpenAI, Anthropic
- **Deployment:** Wrangler CLI

### Core Features

#### 1. Multi-Step LLM Processing
- Sequential instruction execution
- Each step processes only the previous step's result (workflow independence)
- Supports multiple LLM providers (OpenAI, Anthropic)
- Model selection per workflow (default: `gpt-5-nano` for OpenAI, `claude-haiku-4-5` for Anthropic)

#### 2. Instruction Types

**a) Standard LLM Instructions**
```typescript
"Summarize this text"
```

**b) Conditional Instructions**
```typescript
{
  instruction: "Check if result contains 'error'",
  condition: {
    evaluateAfterStep: 1,
    expression: "result contains 'error'",
    ifTrue: [1],   // Step indices (0-indexed)
    ifFalse: [2]
  }
}
```

**c) Endpoint Instructions**
```typescript
{
  type: "endpoint",
  endpointUrl: "https://endpoint-1.workers.dev",
  apiUrl: "https://api.example.com/data",
  method: "GET",
  retries: 3,
  retryDelay: 1000,
  timeout: 30000
}
```

**d) Thread Instructions** (Collect results from multiple steps)
```typescript
{
  type: "thread",
  collectFromSteps: [1, 2, 3],
  outputFormat: "json" | "markdown" | "numbered",
  completionCheck: {
    mode: "deterministic" | "llm",
    expression?: string
  }
}
```

**e) Router Instructions** (LLM-driven endpoint selection)
```typescript
{
  type: "router",
  description: "Select data source",
  evaluationPrompt: "Which API should be called?",
  options: [
    {
      id: "weather",
      name: "Weather API",
      description: "Weather forecasts",
      endpoint: { endpointUrl: "...", apiUrl: "..." }
    }
  ],
  defaultOption: "weather"
}
```

#### 3. API Endpoints

**POST /** - Create workflow instance
- Accepts `context`, `instructions[]`, `provider`, `model`
- Returns `instanceId` and initial status
- Supports legacy format (`firstInstruction`, `secondInstruction`)

**POST /batch** - Batch workflow creation
- Creates 1-20 concurrent workflow instances
- Useful for testing concurrent processing

**GET /?instanceId=<id>** - Status polling
- Returns workflow status and intermediate results
- Supports real-time step result tracking

#### 4. Execution Model
- **Queue-based execution:** Uses execution queue to manage step order
- **Step tracking:** Prevents infinite loops with `executedSteps` Set
- **Branch targets:** Tracks steps only reachable via conditionals
- **Retry logic:** Built into Cloudflare Workflows API (3 retries, exponential backoff)
- **Timeout handling:** 5-minute step timeout, 2-minute condition timeout
- **Error tracking:** Comprehensive error logging with step-level error details

### Key Functions

- `callLLM()` - Unified LLM call routing (OpenAI/Anthropic)
- `callOpenAI()` - OpenAI API integration
- `callAnthropic()` - Anthropic API integration
- `evaluateCondition()` - LLM-based condition evaluation
- `callEndpoint()` - Endpoint worker integration
- `MyWorkflow.run()` - Main workflow execution logic

---

## Component 2: Python Workflow Engine

**Location:** `py-workflow-engine/workflow-engine/`

### Technology Stack
- **Runtime:** Modal (Serverless Python)
- **Language:** Python 3.11+
- **State Storage:** Upstash Redis
- **Dependencies:** FastAPI, httpx, pydantic, upstash-redis
- **Package Manager:** uv

### Architecture

#### Core Modules

**1. `workflow_engine.py`** - Modal Application Entry Point
- FastAPI endpoints (`/execute`, `/health`)
- Modal function configuration
- Payload validation
- Redis initialization

**2. `dag_executor.py`** - DAG Execution Orchestrator
- Topological sort for dependency resolution
- Step execution ordering
- Selection dependency handling (conditional execution)
- Workflow state management
- Notification integration

**3. `step_processor.py`** - Individual Step Execution
- HTTP request handling (GET, POST, PUT, PATCH, DELETE)
- Variable substitution (`{{variable}}` syntax)
- Response parsing (OpenAI, Anthropic, generic JSON)
- Retry logic with exponential backoff
- Timeout management

**4. `notification_handler.py`** - Webhook Notifications
- Workflow lifecycle events (started, completed, failed)
- Step-level notifications (started, completed, failed, aborted)
- Progress tracking
- Integration with ObjSpace backend

**5. `utils.py`** - Utility Functions
- Dependency graph building
- Topological sorting
- Variable substitution (nested field access)
- Payload validation
- Selection dependency detection

### Key Features

#### 1. DAG-Based Execution
- **Dependency Resolution:** Topological sort ensures correct execution order
- **Parallel Execution:** Steps without dependencies execute concurrently
- **Cycle Detection:** Validates workflow for circular dependencies

#### 2. Variable Substitution System
```python
# Supports nested access:
{{step_1_result}}                    # Direct variable
{{step_1_result.field}}              # Nested field
{{step_1_result.array[0]}}           # Array indexing
{{step_1_result.content[0].text}}   # Complex nested access
```

#### 3. Selection Dependencies (Conditional Execution)
- Steps can depend on `selection_*` outputs stored in Redis
- If step's USID not in selection list, step is aborted
- Enables dynamic workflow branching

#### 4. Error Handling & Resilience
- **Retry Logic:** Configurable max retries with exponential backoff
- **Timeout Management:** Per-step timeouts (default 45s)
- **Error Propagation:** Failed steps stop workflow execution
- **Partial Results:** Returns completed steps even on failure

#### 5. Notification System
- Real-time webhook notifications to ObjSpace backend
- Step-level progress tracking
- Workflow completion/failure notifications
- Aborted step notifications

### API Endpoints

**POST /execute** - Execute workflow
- Accepts workflow payload with `STEPS_CONFIG`, `PIPELINE_SETTINGS`
- Returns execution results with step outputs

**GET /health** - Health check
- Returns service status

### Payload Format
```json
{
  "workflow_id": "workflow-123",
  "namespace": "my-workspace",
  "original_input": "Input data",
  "input_data": {
    "input_1": "content",
    "input_2": "content"
  },
  "STEPS_CONFIG": [
    {
      "step_name": "step_1",
      "usid": "a1b2c3d4",
      "service_url": "https://api.openai.com/chat/completions",
      "method": "POST",
      "dependencies": [],
      "outputs": ["result_1"],
      "headers": {},
      "input_prep_config": {}
    }
  ],
  "PIPELINE_SETTINGS": {
    "error_handling": {
      "max_retries": 2,
      "retry_delay": 3
    },
    "timeouts": {
      "step_timeout": 45
    },
    "notifications": {
      "webhook_url": "https://backend.objs.space/api/workflows/webhook"
    }
  }
}
```

---

## Component 3: Endpoint Workers

**Location:** `endpoints-workers/`

### Overview
Three Cloudflare Workers (`endpoint-1`, `endpoint-2`, `endpoint-3`) that handle external API calls with retry logic.

### Features
- External API call support (GET, POST, PUT, PATCH, DELETE)
- Configurable retry logic with exponential backoff
- Request timeout handling
- Error handling and response parsing
- CORS support

### Request Format
```json
{
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {},
  "body": {},
  "retries": 3,
  "retryDelay": 1000,
  "timeout": 30000
}
```

### Response Format
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": {},
  "body": {},
  "attempts": 1,
  "duration": 123
}
```

### Integration
- Called by Cloudflare Workflow Engine when endpoint instructions are encountered
- Results converted to strings for consistency with LLM results
- Supports conditional logic (can have conditions like LLM instructions)

---

## Data Flow

### Cloudflare Workflow Engine Flow

```
User/UI Request
    ↓
POST / (Cloudflare Worker)
    ↓
Create Workflow Instance
    ↓
Execute Steps Sequentially
    ├─→ Step 1: LLM Call / Endpoint Call / Router / Thread
    ├─→ Step 2: Process Step 1 Result
    ├─→ Conditional Evaluation (if present)
    ├─→ Branch Execution (ifTrue/ifFalse)
    └─→ Final Result
    ↓
Status Polling (GET /?instanceId=...)
    ↓
Return Results
```

### Python Workflow Engine Flow

```
ObjSpace Backend
    ↓ Transform blocks → JSON payload
    ↓ POST /execute
Modal Workflow Engine
    ↓ Validate Payload
    ↓ Build Dependency Graph
    ↓ Topological Sort (Execution Order)
    ↓ Execute Steps in Order
    ├─→ Check Selection Dependencies
    ├─→ Check Data Dependencies
    ├─→ Execute Step (HTTP Request)
    ├─→ Variable Substitution
    ├─→ Store Outputs in Redis
    └─→ Send Notifications
    ↓
Return Final Result
    ↓
ObjSpace Backend (Create Result Block)
```

---

## Technology Stack Summary

### Cloudflare Workers Engine
- **Cloudflare Workers** - Edge runtime
- **Cloudflare Workflows** - Long-running workflows
- **TypeScript** - Language
- **Wrangler** - Deployment tool
- **OpenAI API** - LLM provider
- **Anthropic API** - LLM provider

### Python Engine
- **Modal** - Serverless platform
- **FastAPI** - Web framework
- **httpx** - HTTP client
- **Upstash Redis** - State storage
- **Pydantic** - Data validation
- **uv** - Package manager

### Endpoint Workers
- **Cloudflare Workers** - Edge runtime
- **TypeScript** - Language
- **Wrangler** - Deployment tool

---

## Key Design Patterns

### 1. Queue-Based Execution (Cloudflare)
- Uses execution queue to manage step order
- Prevents infinite loops with executed steps tracking
- Supports conditional branching

### 2. DAG Execution (Python)
- Topological sort for dependency resolution
- Parallel execution of independent steps
- Cycle detection

### 3. Variable Substitution
- Template-based variable replacement (`{{variable}}`)
- Nested field access support
- Smart primitive handling

### 4. Retry Logic
- Exponential backoff
- Configurable retry limits
- Error classification (4xx vs 5xx)

### 5. Notification Pattern
- Event-driven webhook notifications
- Progress tracking
- Lifecycle events

---

## Strengths

1. **Dual Architecture:** Two complementary workflow engines for different use cases
2. **LLM Integration:** Native support for multiple LLM providers
3. **Advanced Features:** Conditional logic, DAG execution, routing, threading
4. **Real-time Monitoring:** Status polling and webhook notifications
5. **Error Handling:** Robust retry and error handling mechanisms
6. **Modularity:** Well-separated concerns in Python engine
7. **Backward Compatibility:** Legacy format support
8. **Edge Computing:** Cloudflare Workers for low-latency execution

---

## Use Cases

### Cloudflare Workflow Engine
- **LLM Processing Pipelines:** Multi-step text processing
- **Content Generation:** Sequential content creation
- **Data Transformation:** Step-by-step data processing
- **Conditional Workflows:** Branching based on LLM evaluation
- **API Orchestration:** Combining LLM calls with external APIs
- **Dynamic Routing:** LLM-driven endpoint selection

### Python Workflow Engine
- **ObjSpace Block Execution:** Execute complex block workflows
- **API Orchestration:** Coordinate multiple API calls
- **Data Pipelines:** ETL-style data processing
- **Conditional Execution:** Selection-based branching
- **Enterprise Workflows:** Complex multi-step business processes

---

## Deployment

### Cloudflare Workers Engine
```bash
cd workflow-engine
npm run deploy
```

### Python Engine
```bash
cd py-workflow-engine/workflow-engine
uv run modal deploy workflow_engine.py
```

### Endpoint Workers
```bash
cd endpoints-workers
./deploy-all.sh
```

---

## Environment Variables

### Cloudflare Workers Engine
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key

### Python Engine (Modal Secrets)
- `UPSTASH_REST_URL` - Upstash Redis URL
- `UPSTASH_REST_TOKEN` - Upstash Redis token

---

## Conclusion

The Workflow Station backend is a **production-ready, multi-platform workflow orchestration system** that provides:

- ✅ **Dual engines** for different use cases (LLM-focused vs DAG-based)
- ✅ **Advanced features** (conditional logic, DAG execution, routing, threading)
- ✅ **Modern tech stack** (Cloudflare, Modal, TypeScript, Python)
- ✅ **Robust error handling** and retry logic
- ✅ **Real-time monitoring** and notifications
- ✅ **Scalable architecture** with edge computing and serverless platforms

The architecture is designed to handle both simple LLM workflows and complex enterprise-grade DAG-based pipelines with dependencies, conditional execution, and parallel processing.

