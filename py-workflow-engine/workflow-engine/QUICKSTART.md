# Quick Start - 5 Minutes to Your First Workflow

This is the fastest way to get the ObjSpace Workflow Engine running.

## **1. Prerequisites (1 min)**

```bash
# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Modal
pip install modal
```

## **2. Get Upstash Redis (2 min)**

1. Go to https://console.upstash.com
2. Create account (free)
3. Click "Create Database"
4. Copy REST URL and Token

## **3. Deploy to Modal (2 min)**

```bash
cd workflow-engine

# Authenticate
modal token new

# Create secret
modal secret create objspace-upstash-redis \
  UPSTASH_REST_URL=https://your-instance.upstash.io \
  UPSTASH_REST_TOKEN=your-token-here

# Install deps
uv sync

# Deploy
uv run modal deploy workflow_engine.py
```

**Copy the URL Modal gives you!**

Example: `https://user--objspace-workflow-engine-execute.modal.run`

## **4. Test It Works**

```bash
curl https://your-modal-url/health
```

Should return:
```json
{
  "status": "healthy",
  "service": "objspace-workflow-engine"
}
```

## **5. Configure ObjSpace Backend**

Add to `workspace-backend/.dev.vars`:
```
WORKFLOW_ENGINE_URL=https://your-modal-url
```

Add to `workspace-backend/wrangler.toml` under `[vars]`:
```toml
WORKFLOW_ENGINE_URL = "https://your-modal-url"
```

## **Done!** 🎉

Your workflow engine is live. Now you can:
- Execute workflows via API
- Get real-time progress updates
- Handle parallel and sequential steps
- Use conditional branching

## **Next: Test with Example Payload**

```bash
curl -X POST https://your-modal-url/execute \
  -H "Content-Type: application/json" \
  -d @payloads/simple-echo.json
```

See **SETUP.md** for detailed configuration and usage.

