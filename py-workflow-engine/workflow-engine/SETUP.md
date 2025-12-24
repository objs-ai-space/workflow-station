# ObjSpace Workflow Engine - Complete Setup Guide

This guide walks you through setting up the Python-based DAG workflow execution engine for ObjSpace.

---

## **Prerequisites**

1. **Python 3.11+** installed
2. **Modal Account** - Sign up at https://modal.com
3. **Upstash Redis** - Free tier at https://upstash.com
4. **ObjSpace Backend** running (Cloudflare Workers)

---

## **Part 1: Python Engine Setup**

### Step 1: Install UV (Python Package Manager)

```bash
# Mac/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Verify installation
uv --version
```

### Step 2: Install Modal CLI

```bash
# Install Modal
pip install modal

# Or with uv
uv tool install modal
```

### Step 3: Create Upstash Redis Database

1. Go to https://console.upstash.com
2. Click "Create Database"
3. Choose a region close to your Modal region
4. Copy the REST URL and token

Example:
```
REST URL: https://usw1-fast-fish-12345.upstash.io
REST Token: AXlwXSomeL...
```

### Step 4: Configure Modal Secrets

```bash
# Authenticate with Modal
modal token new

# Create secret for Upstash Redis
modal secret create objspace-upstash-redis \
  UPSTASH_REST_URL=https://your-instance.upstash.io \
  UPSTASH_REST_TOKEN=your-token-here
```

Alternatively, create secrets via Modal dashboard:
1. Go to https://modal.com/secrets
2. Click "New Secret"
3. Name: `objspace-upstash-redis`
4. Add keys: `UPSTASH_REST_URL` and `UPSTASH_REST_TOKEN`

### Step 5: Install Dependencies

```bash
cd workflow-engine

# Install dependencies with uv
uv sync

# This creates .venv and installs all packages from pyproject.toml
```

### Step 6: Deploy to Modal

```bash
# Test locally first
uv run modal serve workflow_engine.py

# Once working, deploy to production
uv run modal deploy workflow_engine.py
```

After deployment, Modal will give you a URL like:
```
✓ App deployed successfully
✓ Web endpoint: https://your-username--objspace-workflow-engine-execute.modal.run
```

**Copy this URL!** You'll need it for the backend configuration.

---

## **Part 2: ObjSpace Backend Integration**

### Step 1: Add Environment Variable

Add to `workspace-backend/.dev.vars`:

```bash
# Workflow Engine URL (from Modal deployment)
WORKFLOW_ENGINE_URL=https://your-username--objspace-workflow-engine-execute.modal.run
```

Also add to `workspace-backend/wrangler.toml` under `[vars]`:

```toml
[vars]
# ... existing vars ...
WORKFLOW_ENGINE_URL = "https://your-username--objspace-workflow-engine-execute.modal.run"
```

### Step 2: Routes are Already Registered

The setup has already added these routes to your backend:
- `POST /namespaces/:namespace/workflows/:workflowId/execute` - Execute workflow
- `POST /api/workflows/webhook/:workflowId` - Webhook for progress

---

## **Part 3: Testing the System**

### Test 1: Python Engine Health Check

```bash
curl https://your-modal-url/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "objspace-workflow-engine",
  "version": "0.1.0"
}
```

### Test 2: Simple Echo Workflow

```bash
cd workflow-engine

curl -X POST https://your-modal-url/execute \
  -H "Content-Type: application/json" \
  -d @payloads/simple-echo.json
```

Expected: Successful execution with echo result

### Test 3: Sequential Steps

```bash
curl -X POST https://your-modal-url/execute \
  -H "Content-Type: application/json" \
  -d @payloads/sequential-steps.json
```

Expected: Steps execute in order (1→2→3)

### Test 4: Parallel DAG

```bash
curl -X POST https://your-modal-url/execute \
  -H "Content-Type: application/json" \
  -d @payloads/parallel-dag.json
```

Expected: Steps 1 and 2 run in parallel, step 3 waits for both

---

## **Part 4: Using with ObjSpace Workflows**

### Step 1: Create a Workflow in ObjSpace

Via frontend UI:
1. Go to workspace
2. Click "New Workflow"
3. Add blocks (these will become workflow steps)
4. Configure each block with API call settings

### Step 2: Configure Blocks as API Steps

Each block should have content structured like:

```json
{
  "type": "api_config",
  "data": {
    "service_url": "https://api.openai.com/v1/chat/completions",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer sk-...",
      "Content-Type": "application/json"
    },
    "body_template": {
      "model": "gpt-4",
      "messages": [
        {
          "role": "user",
          "content": "{{original_input}}"
        }
      ]
    }
  }
}
```

### Step 3: Execute Workflow via API

```bash
curl -X POST https://backend.objs.space/namespaces/my-workspace/workflows/workflow-123/execute \
  -H "Authorization: Bearer your-session-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userInput": "Analyze this content",
    "blockIds": ["block-1", "block-2", "block-3"]
  }'
```

### Step 4: View Results

Results are automatically created as a new block in your workspace with:
- Execution time
- All step outputs
- Final result
- Any errors

---

## **Troubleshooting**

### Modal Deployment Issues

**Error: "No secrets found"**
```bash
# Create secrets first
modal secret create objspace-upstash-redis \
  UPSTASH_REST_URL=... \
  UPSTASH_REST_TOKEN=...
```

**Error: "Modal CLI not found"**
```bash
# Install Modal
pip install modal

# Or with uv
uv tool install modal
```

### Python Engine Issues

**Error: "Redis connection failed"**
- Verify Upstash credentials in Modal secrets
- Check Redis instance is active in Upstash console

**Error: "Timeout after 300s"**
- Increase timeout in `workflow_engine.py`:
  ```python
  @app.function(timeout=600)  # 10 minutes
  ```

### ObjSpace Backend Issues

**Error: "Workflow engine URL not configured"**
- Set `WORKFLOW_ENGINE_URL` in `.dev.vars`
- Redeploy backend with `wrangler deploy`

**Error: "Failed to transform blocks"**
- Ensure blocks have proper API configuration
- Check block content structure matches expected format

---

## **Development Workflow**

### Local Development

```bash
# Terminal 1: Run Python engine locally
cd workflow-engine
uv run modal serve workflow_engine.py

# Terminal 2: Run ObjSpace backend
cd workspace-backend
wrangler dev

# Terminal 3: Run ObjSpace frontend
cd frontend
npm run dev
```

### Testing Changes

```bash
# Test Python changes
cd workflow-engine
uv run modal serve workflow_engine.py

# In another terminal, test with curl
curl -X POST http://localhost:8000/execute \
  -H "Content-Type: application/json" \
  -d @payloads/simple-echo.json
```

### Deploying Updates

```bash
# Deploy Python engine
cd workflow-engine
uv run modal deploy workflow_engine.py

# Deploy ObjSpace backend
cd workspace-backend
wrangler deploy

# Deploy frontend
cd frontend
vercel --prod --scope objs
```

---

## **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                     ObjSpace Frontend                        │
│  User creates workflow → Adds blocks → Executes workflow    │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /execute
                       ↓
┌─────────────────────────────────────────────────────────────┐
│               ObjSpace Backend (Cloudflare Workers)          │
│  • Transform blocks → workflow payload                       │
│  • Call Python engine API                                    │
│  • Receive results & create result block                     │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /execute (JSON payload)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Python Workflow Engine (Modal)                  │
│  • Validate payload                                          │
│  • Build DAG from dependencies                               │
│  • Execute steps (parallel + sequential)                     │
│  • Handle conditional branching                              │
│  • Send progress webhooks                                    │
│  • Return final results                                      │
└──────────────────────┬───────────────────────────────────────┘
                       │ Store intermediate results
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Upstash Redis                             │
│  • Step outputs for dependencies                             │
│  • Selection lists for conditional execution                 │
│  • TTL: 1 hour                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## **Next Steps**

1. ✅ Python engine deployed
2. ✅ Backend routes registered
3. ✅ Test with sample payloads
4. 🔄 **Create frontend UI for workflow execution** (button in workflow dropdown)
5. 🔄 **Add real-time progress tracking** (WebSocket updates)
6. 🔄 **Build workflow template library** (pre-configured API integrations)
7. 🔄 **Add workflow history/logs** (store execution history in D1)

---

## **Monitoring & Logs**

### Modal Logs

```bash
# View live logs
modal app logs objspace-workflow-engine

# View specific function logs
modal function logs objspace-workflow-engine.execute
```

### ObjSpace Backend Logs

```bash
# Cloudflare Workers logs
wrangler tail --format=pretty
```

---

## **Cost Estimates**

**Modal (Python Engine):**
- Free tier: 30 free credits/month
- After free tier: ~$0.000025 per second
- Typical workflow (30s): ~$0.00075

**Upstash Redis:**
- Free tier: 10,000 commands/day
- After free tier: $0.20 per 100k commands

**Total:** Essentially free for development and small-scale use

---

## **Support**

- Modal Docs: https://modal.com/docs
- Upstash Docs: https://docs.upstash.com
- ObjSpace Issues: [Your repo issues]

