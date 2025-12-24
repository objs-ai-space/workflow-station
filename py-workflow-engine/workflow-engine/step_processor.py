"""
Step processor for executing individual workflow steps
"""
import httpx
import json
import time
from typing import Dict, Any, Optional
from utils import substitute_variables, extract_error_message


class StepProcessor:
    """Processes individual workflow steps by making HTTP API calls"""
    
    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
    
    async def execute_step(
        self,
        step_config: Dict[str, Any],
        available_outputs: Dict[str, Any],
        max_retries: int = 2,
        retry_delay: int = 3
    ) -> Dict[str, Any]:
        """
        Execute a single workflow step
        
        Args:
            step_config: Step configuration from STEPS_CONFIG
            available_outputs: Outputs from previous steps
            max_retries: Maximum retry attempts
            retry_delay: Delay between retries in seconds
        
        Returns:
            Dictionary with step outputs
        
        Raises:
            Exception: If step execution fails after all retries
        """
        step_name = step_config.get("step_name", "unknown")
        usid = step_config.get("usid", "unknown")
        
        print(f"\n🚀 Executing step: {step_name} (USID: {usid})")
        
        # Prepare request
        url = step_config.get("service_url")
        method = step_config.get("method", "POST").upper()
        headers = step_config.get("headers", {})
        
        # Prepare input data with variable substitution
        input_prep = step_config.get("input_prep_config", {})
        input_type = input_prep.get("type", "json")
        mapping = input_prep.get("mapping", {})
        
        # Substitute variables in mapping
        substituted_data = substitute_variables(mapping, available_outputs)
        
        print(f"📝 Request URL: {url}")
        print(f"📝 Method: {method}")
        print(f"📝 Input type: {input_type}")
        
        # Execute with retries
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    print(f"🔄 Retry attempt {attempt}/{max_retries}")
                    await self._delay(retry_delay)
                
                start_time = time.time()
                
                # Make HTTP request
                if method == "GET":
                    response = await self.client.get(url, headers=headers, params=substituted_data)
                elif method == "POST":
                    response = await self.client.post(url, headers=headers, json=substituted_data)
                elif method == "PUT":
                    response = await self.client.put(url, headers=headers, json=substituted_data)
                elif method == "PATCH":
                    response = await self.client.patch(url, headers=headers, json=substituted_data)
                elif method == "DELETE":
                    response = await self.client.delete(url, headers=headers, json=substituted_data)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                
                execution_time = time.time() - start_time
                
                # Check response status
                if response.status_code >= 200 and response.status_code < 300:
                    print(f"✅ Step completed successfully in {execution_time:.2f}s")
                    
                    # Parse response
                    result = self._parse_response(response, step_config)
                    return result
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                    print(f"❌ Step failed: {error_msg}")
                    last_error = Exception(error_msg)
                    
                    # Don't retry on 4xx errors (client errors)
                    if 400 <= response.status_code < 500:
                        raise last_error
                    
            except httpx.TimeoutException as e:
                last_error = e
                print(f"⏱️ Request timeout: {e}")
            except httpx.RequestError as e:
                last_error = e
                print(f"🔌 Request error: {e}")
            except Exception as e:
                last_error = e
                print(f"❌ Unexpected error: {e}")
                raise  # Don't retry on unexpected errors
        
        # All retries exhausted
        error_msg = extract_error_message(last_error)
        raise Exception(f"Step {step_name} failed after {max_retries + 1} attempts: {error_msg}")
    
    def _parse_response(self, response: httpx.Response, step_config: Dict) -> Dict[str, Any]:
        """Parse response and extract outputs"""
        outputs_config = step_config.get("outputs", [])
        
        try:
            # Try to parse as JSON
            response_data = response.json()
            
            # ============================================
            # ANTHROPIC/CLAUDE API RESPONSE EXTRACTION
            # ============================================
            # Claude returns: {"content": [{"type": "text", "text": "actual content"}], ...}
            # We extract just the text so subsequent steps can use {{step_N_result}} directly
            if "content" in response_data and isinstance(response_data.get("content"), list):
                content_list = response_data["content"]
                if len(content_list) > 0:
                    first_content = content_list[0]
                    if isinstance(first_content, dict) and "text" in first_content:
                        extracted_text = first_content["text"]
                        
                        print(f"✨ Extracted Claude text: {extracted_text[:100]}...")
                        
                        # Store the extracted text directly for easy variable substitution
                        result = {}
                        for output_name in outputs_config:
                            result[output_name] = extracted_text
                        return result
            
            # ============================================
            # OPENAI API RESPONSE EXTRACTION
            # ============================================
            # OpenAI returns: {"choices": [{"message": {"content": "..."}}]}
            if "choices" in response_data and isinstance(response_data["choices"], list):
                if len(response_data["choices"]) > 0:
                    choice = response_data["choices"][0]
                    if "message" in choice:
                        content = choice["message"].get("content", "")
                        
                        print(f"✨ Extracted OpenAI text: {content[:100]}...")
                        
                        # Try to parse content as JSON
                        try:
                            response_data = json.loads(content)
                        except json.JSONDecodeError:
                            # Store as plain text for easy access
                            result = {}
                            for output_name in outputs_config:
                                result[output_name] = content
                            return result
            
            # ============================================
            # GENERIC JSON RESPONSE EXTRACTION
            # ============================================
            # For other APIs, store the full response
            result = {}
            for output_name in outputs_config:
                if output_name in response_data:
                    result[output_name] = response_data[output_name]
                else:
                    # If output not found, store entire response
                    result[output_name] = response_data
            
            return result
            
        except json.JSONDecodeError:
            # Response is not JSON, return as text
            text = response.text
            result = {}
            for output_name in outputs_config:
                result[output_name] = text
            return result
    
    async def _delay(self, seconds: int):
        """Async delay"""
        import asyncio
        await asyncio.sleep(seconds)
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

