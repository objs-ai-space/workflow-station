"""
DAG Executor - Orchestrates workflow execution with dependencies
"""
import time
from typing import Dict, Any, List, Set, Optional
from upstash_redis import Redis
from step_processor import StepProcessor
from notification_handler import NotificationHandler
from utils import (
    build_dependency_graph,
    topological_sort,
    is_selection_dependency,
    extract_selection_id,
    format_timestamp,
)


class DAGExecutor:
    """Executes workflow steps as a Directed Acyclic Graph (DAG)"""
    
    def __init__(
        self,
        redis: Redis,
        webhook_url: Optional[str] = None,
        step_timeout: int = 45,
        max_retries: int = 2,
        retry_delay: int = 3
    ):
        self.redis = redis
        self.step_processor = StepProcessor(timeout=step_timeout)
        self.notifier = NotificationHandler(webhook_url)
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        # Execution state
        self.completed_steps: Set[str] = set()
        self.failed_steps: Set[str] = set()
        self.aborted_steps: Set[str] = set()
        self.step_outputs: Dict[str, Any] = {}
    
    async def execute_workflow(
        self,
        workflow_id: str,
        namespace: str,
        steps_config: List[Dict],
        original_input: Any = None,
        input_data: Dict[str, str] = None,
        workflow_name: str = None
    ) -> Dict[str, Any]:
        """
        Execute complete workflow with DAG-based ordering
        
        Args:
            workflow_id: Unique workflow execution ID
            namespace: Workspace namespace
            steps_config: Array of step configurations
            original_input: Original input data
            input_data: Input blocks referenced by workflow (input_1, input_2, etc.)
            workflow_name: Optional workflow name
        
        Returns:
            Dictionary with execution results
        """
        print(f"\n{'='*60}")
        print(f"🚀 WORKFLOW EXECUTION STARTED")
        print(f"{'='*60}")
        print(f"Workflow ID: {workflow_id}")
        print(f"Namespace: {namespace}")
        print(f"Total steps: {len(steps_config)}")
        print(f"Timestamp: {format_timestamp()}")
        print(f"{'='*60}\n")
        
        start_time = time.time()
        
        # Send workflow started notification
        await self.notifier.workflow_started(
            workflow_id=workflow_id,
            namespace=namespace,
            total_steps=len(steps_config),
            workflow_name=workflow_name
        )
        
        # Initialize step outputs with original input
        if original_input:
            self.step_outputs["original_input"] = original_input
        
        # Initialize step outputs with input blocks
        if input_data:
            print(f"📥 Adding {len(input_data)} input blocks to available variables:")
            for key, value in input_data.items():
                self.step_outputs[key] = value
                preview = value[:100] + "..." if len(value) > 100 else value
                print(f"   ✓ {key}: {preview}")
        
        try:
            # Build dependency graph
            dep_graph = build_dependency_graph(steps_config)
            
            # Get execution order (topological sort)
            execution_order = topological_sort(steps_config, dep_graph)
            
            print(f"📊 Execution order: {' → '.join(execution_order)}\n")
            
            # Create step lookup
            steps_by_usid = {step["usid"]: step for step in steps_config}
            
            # Execute steps in order
            for index, usid in enumerate(execution_order):
                step_config = steps_by_usid[usid]
                step_name = step_config.get("step_name", "unknown")
                
                print(f"\n{'='*60}")
                print(f"Step {index + 1}/{len(execution_order)}: {step_name}")
                print(f"{'='*60}")
                
                # Check if step should be executed (selection dependencies)
                should_execute, abort_reason = await self._check_selection_dependencies(
                    step_config,
                    workflow_id
                )
                
                if not should_execute:
                    print(f"⏭️  Step aborted: {abort_reason}")
                    self.aborted_steps.add(usid)
                    
                    # Notify step aborted
                    await self.notifier.step_aborted(
                        workflow_id=workflow_id,
                        namespace=namespace,
                        step_name=step_name,
                        usid=usid,
                        reason=abort_reason,
                        step_index=index + 1,
                        total_steps=len(execution_order)
                    )
                    
                    continue
                
                # Check if dependencies are met (non-selection dependencies)
                dependencies_met, missing_deps = self._check_data_dependencies(step_config)
                
                if not dependencies_met:
                    error_msg = f"Missing dependencies: {missing_deps}"
                    print(f"❌ {error_msg}")
                    self.failed_steps.add(usid)
                    
                    # Notify step failed
                    await self.notifier.step_failed(
                        workflow_id=workflow_id,
                        namespace=namespace,
                        step_name=step_name,
                        usid=usid,
                        error=error_msg,
                        step_index=index + 1,
                        total_steps=len(execution_order)
                    )
                    
                    raise Exception(error_msg)
                
                # Notify step started
                await self.notifier.step_started(
                    workflow_id=workflow_id,
                    namespace=namespace,
                    step_name=step_name,
                    usid=usid,
                    step_index=index + 1,
                    total_steps=len(execution_order)
                )
                
                # Execute step
                try:
                    step_start = time.time()
                    
                    step_result = await self.step_processor.execute_step(
                        step_config=step_config,
                        available_outputs=self.step_outputs,
                        max_retries=self.max_retries,
                        retry_delay=self.retry_delay
                    )
                    
                    step_execution_time = time.time() - step_start
                    
                    # Store outputs
                    for output_name, output_value in step_result.items():
                        self.step_outputs[output_name] = output_value
                        
                        # Store in Redis for selection dependencies
                        redis_key = f"{workflow_id}:output:{output_name}"
                        await self._store_in_redis(redis_key, output_value)
                    
                    self.completed_steps.add(usid)
                    
                    # Notify step completed
                    await self.notifier.step_completed(
                        workflow_id=workflow_id,
                        namespace=namespace,
                        step_name=step_name,
                        usid=usid,
                        outputs=step_result,
                        execution_time=step_execution_time,
                        step_index=index + 1,
                        total_steps=len(execution_order)
                    )
                    
                except Exception as e:
                    error_msg = str(e)
                    print(f"❌ Step failed: {error_msg}")
                    self.failed_steps.add(usid)
                    
                    # Notify step failed
                    await self.notifier.step_failed(
                        workflow_id=workflow_id,
                        namespace=namespace,
                        step_name=step_name,
                        usid=usid,
                        error=error_msg,
                        step_index=index + 1,
                        total_steps=len(execution_order)
                    )
                    
                    raise
            
            # Workflow completed successfully
            total_time = time.time() - start_time
            
            print(f"\n{'='*60}")
            print(f"✅ WORKFLOW COMPLETED SUCCESSFULLY")
            print(f"{'='*60}")
            print(f"Total execution time: {total_time:.2f}s")
            print(f"Steps completed: {len(self.completed_steps)}")
            print(f"Steps aborted: {len(self.aborted_steps)}")
            print(f"{'='*60}\n")
            
            # Determine final result
            final_result = self._get_final_result()
            
            # Notify workflow completed
            await self.notifier.workflow_completed(
                workflow_id=workflow_id,
                namespace=namespace,
                final_result=final_result,
                execution_time=total_time,
                steps_completed=len(self.completed_steps),
                steps_failed=len(self.failed_steps),
                steps_aborted=len(self.aborted_steps)
            )
            
            return {
                "success": True,
                "workflow_id": workflow_id,
                "namespace": namespace,
                "execution_time": total_time,
                "steps_completed": len(self.completed_steps),
                "steps_aborted": len(self.aborted_steps),
                "final_result": final_result,
                "all_outputs": self.step_outputs
            }
            
        except Exception as e:
            total_time = time.time() - start_time
            error_msg = str(e)
            
            print(f"\n{'='*60}")
            print(f"❌ WORKFLOW FAILED")
            print(f"{'='*60}")
            print(f"Error: {error_msg}")
            print(f"Total execution time: {total_time:.2f}s")
            print(f"Steps completed: {len(self.completed_steps)}")
            print(f"{'='*60}\n")
            
            # Notify workflow failed
            await self.notifier.workflow_failed(
                workflow_id=workflow_id,
                namespace=namespace,
                error=error_msg,
                execution_time=total_time,
                steps_completed=len(self.completed_steps)
            )
            
            return {
                "success": False,
                "workflow_id": workflow_id,
                "namespace": namespace,
                "error": error_msg,
                "execution_time": total_time,
                "steps_completed": len(self.completed_steps),
                "steps_failed": len(self.failed_steps),
                "partial_outputs": self.step_outputs
            }
        
        finally:
            # Cleanup
            await self.step_processor.close()
            await self.notifier.close()
    
    async def _check_selection_dependencies(
        self,
        step_config: Dict,
        workflow_id: str
    ) -> tuple[bool, str]:
        """
        Check if step should execute based on selection dependencies
        
        Returns:
            (should_execute, abort_reason)
        """
        dependencies = step_config.get("dependencies", [])
        usid = step_config.get("usid")
        
        for dep in dependencies:
            if is_selection_dependency(dep):
                # Get selection list from Redis
                redis_key = f"{workflow_id}:output:{dep}"
                selection_list = await self._get_from_redis(redis_key)
                
                if selection_list is None:
                    return False, f"Selection dependency {dep} not found"
                
                if not isinstance(selection_list, list):
                    return False, f"Selection dependency {dep} is not a list"
                
                # Check if current step's USID is in selection list
                if usid not in selection_list:
                    return False, f"USID {usid} not in selection {dep}"
        
        return True, ""
    
    def _check_data_dependencies(self, step_config: Dict) -> tuple[bool, List[str]]:
        """
        Check if all data dependencies are available
        
        Returns:
            (dependencies_met, missing_dependencies)
        """
        dependencies = step_config.get("dependencies", [])
        missing = []
        
        for dep in dependencies:
            # Skip selection dependencies (handled separately)
            if is_selection_dependency(dep):
                continue
            
            # Check if output is available
            if dep not in self.step_outputs:
                missing.append(dep)
        
        return len(missing) == 0, missing
    
    def _get_final_result(self) -> Any:
        """Get final workflow result (last step's output or all outputs)"""
        if not self.step_outputs:
            return None
        
        # Try to find a "final_result" or "result" output
        if "final_result" in self.step_outputs:
            return self.step_outputs["final_result"]
        if "result" in self.step_outputs:
            return self.step_outputs["result"]
        
        # Otherwise, return all outputs
        return self.step_outputs
    
    async def _store_in_redis(self, key: str, value: Any):
        """Store value in Redis"""
        try:
            import json
            self.redis.set(key, json.dumps(value), ex=3600)  # 1 hour expiry
        except Exception as e:
            print(f"⚠️ Failed to store in Redis: {e}")
    
    async def _get_from_redis(self, key: str) -> Any:
        """Get value from Redis"""
        try:
            import json
            value = self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"⚠️ Failed to get from Redis: {e}")
            return None

