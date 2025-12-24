"""
ObjSpace Workflow Engine - Modal Application

DAG-based pipeline execution system for ObjSpace blocks
Deployed on Modal with Upstash Redis for state storage
"""
import modal
import json
import os
from typing import Dict, Any

# Modal app configuration
app = modal.App("objspace-workflow-engine")

# Modal image with dependencies and local Python modules
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi[standard]>=0.115.0",
        "httpx>=0.28.1",
        "pydantic>=2.10.6",
        "upstash-redis>=1.5.0",
        "python-dotenv>=1.0.1",
    )
    # Copy individual Python modules into the image
    .add_local_file("dag_executor.py", "/root/dag_executor.py")
    .add_local_file("step_processor.py", "/root/step_processor.py")
    .add_local_file("notification_handler.py", "/root/notification_handler.py")
    .add_local_file("utils.py", "/root/utils.py")
)


async def execute_workflow_internal(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Internal function to execute workflow
    Called by web endpoint
    """
    from upstash_redis import Redis
    from dag_executor import DAGExecutor
    from utils import validate_pipeline_payload
    
    print("\n" + "="*60)
    print("📥 WORKFLOW EXECUTION REQUEST RECEIVED")
    print("="*60)
    
    # Validate payload
    validation_errors = validate_pipeline_payload(payload)
    if validation_errors:
        error_msg = "Payload validation failed:\n" + "\n".join(validation_errors)
        print(f"❌ {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "validation_errors": validation_errors
        }
    
    # Extract configuration
    workflow_id = payload.get("workflow_id", "unknown")
    namespace = payload.get("namespace", "default")
    workflow_name = payload.get("workflow_name")
    steps_config = payload.get("STEPS_CONFIG", [])
    original_input = payload.get("original_input")
    input_data = payload.get("input_data", {})  # Input blocks: { input_1: "content", input_2: "content", ... }
    pipeline_settings = payload.get("PIPELINE_SETTINGS", {})
    
    print(f"Workflow ID: {workflow_id}")
    print(f"Namespace: {namespace}")
    print(f"Steps: {len(steps_config)}")
    print("="*60 + "\n")
    
    # Initialize Redis client
    redis_url = os.environ.get("UPSTASH_REST_URL")
    redis_token = os.environ.get("UPSTASH_REST_TOKEN")
    
    if not redis_url or not redis_token:
        return {
            "success": False,
            "error": "Redis credentials not configured"
        }
    
    redis = Redis(url=redis_url, token=redis_token)
    
    # Extract settings
    error_handling = pipeline_settings.get("error_handling", {})
    timeouts = pipeline_settings.get("timeouts", {})
    notifications = pipeline_settings.get("notifications", {})
    
    max_retries = error_handling.get("max_retries", 2)
    retry_delay = error_handling.get("retry_delay", 3)
    step_timeout = timeouts.get("step_timeout", 45)
    webhook_url = notifications.get("webhook_url")
    
    # Create DAG executor
    executor = DAGExecutor(
        redis=redis,
        webhook_url=webhook_url,
        step_timeout=step_timeout,
        max_retries=max_retries,
        retry_delay=retry_delay
    )
    
    # Execute workflow
    result = await executor.execute_workflow(
        workflow_id=workflow_id,
        namespace=namespace,
        steps_config=steps_config,
        original_input=original_input,
        input_data=input_data,
        workflow_name=workflow_name
    )
    
    return result


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("objspace-upstash-redis")],
    timeout=300,
    memory=1024,
)
@modal.fastapi_endpoint(method="POST")
async def execute(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Web endpoint for workflow execution
    POST /execute
    """
    result = await execute_workflow_internal(payload)
    return result


@app.function(image=image)
@modal.fastapi_endpoint(method="GET")
async def health() -> Dict[str, Any]:
    """
    Health check endpoint
    GET /health
    """
    return {
        "status": "healthy",
        "service": "objspace-workflow-engine",
        "version": "0.1.0"
    }


@app.local_entrypoint()
def main():
    """
    Local entrypoint for testing
    """
    # Example payload
    example_payload = {
        "workflow_id": "test-workflow-001",
        "namespace": "my-workspace",
        "workflow_name": "Test Workflow",
        "original_input": "Hello, workflow!",
        "STEPS_CONFIG": [
            {
                "step_name": "echo_step",
                "usid": "a1b2c3d4",
                "service_url": "https://httpbin.org/post",
                "service_type": "DIRECT",
                "method": "POST",
                "namespace": "my-workspace",
                "dependencies": [],
                "outputs": ["echo_result"],
                "headers": {
                    "Content-Type": "application/json"
                },
                "input_prep_config": {
                    "type": "json",
                    "mapping": {
                        "message": "{{original_input}}",
                        "timestamp": "2025-01-01T00:00:00Z"
                    }
                },
                "description": "Echo the input message"
            }
        ],
        "PIPELINE_SETTINGS": {
            "error_handling": {
                "max_retries": 2,
                "retry_delay": 3,
                "raise_on_error": True
            },
            "timeouts": {
                "step_timeout": 45,
                "http_timeout": 15,
                "total_pipeline_timeout": 120
            },
            "notifications": {
                "webhook_url": "https://backend.objs.space/api/workflows/webhook"
            }
        }
    }
    
    print("🧪 Testing workflow execution locally...")
    print(f"Payload: {json.dumps(example_payload, indent=2)}\n")
    
    # Execute workflow
    result = execute.remote(example_payload)
    
    print("\n" + "="*60)
    print("📊 EXECUTION RESULT")
    print("="*60)
    print(json.dumps(result, indent=2))
    print("="*60)

