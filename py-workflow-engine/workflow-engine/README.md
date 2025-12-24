# ObjSpace Workflow Engine

**DAG-based pipeline execution system for ObjSpace blocks**

This is a Python-based serverless workflow engine that executes complex multi-step workflows with dependencies, conditional execution, and parallel processing.

## Architecture

```
ObjSpace Backend (Cloudflare Workers)
    ↓ Transform blocks → JSON payload
    ↓ POST /api/execute
Modal Workflow Engine (Python)
    ↓ Execute DAG pipeline
    ↓ Return results + intermediate steps
ObjSpace Backend
    ↓ Create result block
    ↓ Store step history
```

## Setup

### Prerequisites

```bash
# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Modal CLI
pip install modal
```

### Installation

```bash
cd workflow-engine

# Install dependencies
uv sync

# Authenticate with Modal
uv run modal token new

# Deploy to Modal
uv run modal deploy workflow_engine.py
```

### Environment Variables

Create `.env` file:

```env
UPSTASH_REST_URL=https://your-upstash-instance.upstash.io
UPSTASH_REST_TOKEN=your-upstash-token
```

Set Modal secrets at: https://modal.com/secrets/

Required secrets:
- `UPSTASH_REST_URL`
- `UPSTASH_REST_TOKEN`

## Usage

### From ObjSpace Backend

```typescript
// Transform blocks to workflow payload
const payload = await workflowExecutionService.transformBlocksToPayload(
  namespace,
  workflowId,
  blocks
);

// Execute workflow
const result = await workflowExecutionService.executeWorkflow(payload);

// Create result block
await workflowExecutionService.createResultBlock(
  namespace,
  workflowId,
  result
);
```

### Direct API Call

```bash
curl -X POST https://your-modal-url/api/execute \
  -H "Content-Type: application/json" \
  -d @payloads/example.json
```

## Payload Format

```json
{
  "workflow_id": "workflow-123",
  "namespace": "my-workspace",
  "original_input": "Input data",
  "STEPS_CONFIG": [
    {
      "step_name": "step_1",
      "usid": "a1b2c3d4",
      "service_url": "https://api.openai.com/chat/completions",
      "method": "POST",
      "dependencies": [],
      "outputs": ["result_1"],
      "headers": { ... },
      "input_prep_config": { ... }
    }
  ],
  "PIPELINE_SETTINGS": {
    "error_handling": { ... },
    "timeouts": { ... },
    "notifications": {
      "webhook_url": "https://backend.objs.space/api/workflows/webhook"
    }
  }
}
```

## Features

- ✅ **DAG Execution**: Parallel & sequential step execution
- ✅ **Conditional Branches**: Selection dependencies for if/else logic
- ✅ **Error Handling**: Retries, timeouts, cascading aborts
- ✅ **Progress Tracking**: Real-time step completion notifications
- ✅ **Result Storage**: Upstash Redis for intermediate results
- ✅ **Webhook Notifications**: Progress updates to ObjSpace backend

## Block Transformation

ObjSpace blocks are transformed into workflow steps:

```typescript
// Block metadata → Step config
{
  blockId: "block-123",
  title: "Sentiment Analysis",
  content: {
    type: "api_config",
    data: {
      service_url: "https://api.openai.com/...",
      method: "POST",
      headers: { ... },
      body_template: { ... }
    }
  },
  labels: {
    "workflow:analysis:1": "workflow:analysis:1",
    "depends_on": "workflow:analysis:0"
  }
}

// Becomes →

{
  "step_name": "sentiment_analysis",
  "usid": "block-123",
  "service_url": "https://api.openai.com/...",
  "dependencies": ["workflow:analysis:0"],
  "outputs": ["sentiment_result"],
  ...
}
```

## Development

```bash
# Run locally
uv run modal serve workflow_engine.py

# Test with example payload
curl -X POST http://localhost:8000/api/execute \
  -H "Content-Type: application/json" \
  -d @payloads/example.json

# Deploy to Modal
uv run modal deploy workflow_engine.py
```

## Files

- `workflow_engine.py` - Main Modal application
- `dag_executor.py` - DAG execution logic
- `step_processor.py` - Individual step execution
- `notification_handler.py` - Webhook notifications
- `utils.py` - Helper functions
- `payloads/` - Example workflow payloads

