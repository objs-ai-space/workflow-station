"""
Notification handler for sending workflow progress updates
"""
import httpx
import json
from typing import Dict, Any, Optional
from datetime import datetime
from utils import format_timestamp, truncate_output


class NotificationHandler:
    """Handles webhook notifications for workflow progress"""
    
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def send_notification(
        self,
        event_type: str,
        workflow_id: str,
        namespace: str,
        data: Dict[str, Any]
    ) -> bool:
        """
        Send notification to webhook URL
        
        Args:
            event_type: Type of event (workflow_started, step_completed, etc.)
            workflow_id: Workflow execution ID
            namespace: Workspace namespace
            data: Event-specific data
        
        Returns:
            True if notification sent successfully, False otherwise
        """
        if not self.webhook_url:
            print(f"⚠️ No webhook URL configured, skipping notification: {event_type}")
            return False
        
        try:
            payload = {
                "event": event_type,
                "workflow_id": workflow_id,
                "namespace": namespace,
                "timestamp": format_timestamp(),
                "data": data
            }
            
            print(f"📤 Sending notification: {event_type}")
            
            response = await self.client.post(
                self.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code >= 200 and response.status_code < 300:
                print(f"✅ Notification sent: {event_type}")
                return True
            else:
                print(f"⚠️ Webhook returned {response.status_code}: {response.text[:200]}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to send notification: {e}")
            return False
    
    async def workflow_started(
        self,
        workflow_id: str,
        namespace: str,
        total_steps: int,
        workflow_name: str = None
    ):
        """Notify that workflow has started"""
        await self.send_notification(
            event_type="workflow_started",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "workflow_name": workflow_name,
                "total_steps": total_steps,
                "status": "running"
            }
        )
    
    async def step_started(
        self,
        workflow_id: str,
        namespace: str,
        step_name: str,
        usid: str,
        step_index: int,
        total_steps: int
    ):
        """Notify that a step has started"""
        await self.send_notification(
            event_type="step_started",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "step_name": step_name,
                "usid": usid,
                "step_index": step_index,
                "total_steps": total_steps,
                "status": "running"
            }
        )
    
    async def step_completed(
        self,
        workflow_id: str,
        namespace: str,
        step_name: str,
        usid: str,
        outputs: Dict[str, Any],
        execution_time: float,
        step_index: int,
        total_steps: int
    ):
        """Notify that a step has completed successfully"""
        await self.send_notification(
            event_type="step_completed",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "step_name": step_name,
                "usid": usid,
                "step_index": step_index,
                "total_steps": total_steps,
                "status": "completed",
                "execution_time_seconds": execution_time,
                "outputs": {k: truncate_output(v) for k, v in outputs.items()}
            }
        )
    
    async def step_failed(
        self,
        workflow_id: str,
        namespace: str,
        step_name: str,
        usid: str,
        error: str,
        step_index: int,
        total_steps: int
    ):
        """Notify that a step has failed"""
        await self.send_notification(
            event_type="step_failed",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "step_name": step_name,
                "usid": usid,
                "step_index": step_index,
                "total_steps": total_steps,
                "status": "failed",
                "error": error
            }
        )
    
    async def step_aborted(
        self,
        workflow_id: str,
        namespace: str,
        step_name: str,
        usid: str,
        reason: str,
        step_index: int,
        total_steps: int
    ):
        """Notify that a step was aborted (e.g., selection dependency not met)"""
        await self.send_notification(
            event_type="step_aborted",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "step_name": step_name,
                "usid": usid,
                "step_index": step_index,
                "total_steps": total_steps,
                "status": "aborted",
                "reason": reason
            }
        )
    
    async def workflow_completed(
        self,
        workflow_id: str,
        namespace: str,
        final_result: Any,
        execution_time: float,
        steps_completed: int,
        steps_failed: int,
        steps_aborted: int
    ):
        """Notify that workflow has completed"""
        await self.send_notification(
            event_type="workflow_completed",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "status": "completed",
                "execution_time_seconds": execution_time,
                "steps_completed": steps_completed,
                "steps_failed": steps_failed,
                "steps_aborted": steps_aborted,
                "final_result": truncate_output(final_result, max_length=1000)
            }
        )
    
    async def workflow_failed(
        self,
        workflow_id: str,
        namespace: str,
        error: str,
        execution_time: float,
        steps_completed: int
    ):
        """Notify that workflow has failed"""
        await self.send_notification(
            event_type="workflow_failed",
            workflow_id=workflow_id,
            namespace=namespace,
            data={
                "status": "failed",
                "error": error,
                "execution_time_seconds": execution_time,
                "steps_completed": steps_completed
            }
        )
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

