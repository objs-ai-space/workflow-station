"""
Utility functions for workflow engine
"""
import hashlib
import json
import time
from typing import Any, Dict, List
from datetime import datetime


def generate_workflow_id(namespace: str, workflow_name: str) -> str:
    """Generate a unique workflow execution ID"""
    timestamp = str(time.time())
    data = f"{namespace}:{workflow_name}:{timestamp}"
    return hashlib.sha256(data.encode()).hexdigest()[:16]


def generate_usid() -> str:
    """Generate an 8-character hex USID"""
    return hashlib.sha256(str(time.time()).encode()).hexdigest()[:8]


def is_selection_dependency(dep: str) -> bool:
    """Check if a dependency is a selection dependency"""
    return dep.startswith("selection_") and len(dep) == 18  # selection_ + 8 hex chars


def extract_selection_id(dep: str) -> str:
    """Extract selection ID from dependency name"""
    if is_selection_dependency(dep):
        return dep[10:]  # Remove "selection_" prefix
    return ""


def build_dependency_graph(steps: List[Dict]) -> Dict[str, List[str]]:
    """
    Build dependency graph from steps
    Returns: {usid: [dependent_usids]}
    """
    graph = {}
    output_to_step = {}
    
    # Map outputs to steps
    for step in steps:
        usid = step.get("usid")
        outputs = step.get("outputs", [])
        for output in outputs:
            output_to_step[output] = usid
    
    # Build dependency graph
    for step in steps:
        usid = step.get("usid")
        dependencies = step.get("dependencies", [])
        
        for dep in dependencies:
            # Skip selection dependencies (handled separately)
            if is_selection_dependency(dep):
                continue
                
            # Find step that produces this output
            if dep in output_to_step:
                dep_usid = output_to_step[dep]
                if dep_usid not in graph:
                    graph[dep_usid] = []
                graph[dep_usid].append(usid)
    
    return graph


def topological_sort(steps: List[Dict], dep_graph: Dict[str, List[str]]) -> List[str]:
    """
    Perform topological sort to determine execution order
    Returns list of USIDs in execution order
    """
    # Count incoming edges
    in_degree = {step["usid"]: 0 for step in steps}
    
    for usid in dep_graph:
        for dependent in dep_graph[usid]:
            in_degree[dependent] += 1
    
    # Queue for steps with no dependencies
    queue = [usid for usid, degree in in_degree.items() if degree == 0]
    result = []
    
    while queue:
        # Sort queue for deterministic execution order
        queue.sort()
        usid = queue.pop(0)
        result.append(usid)
        
        # Reduce in-degree for dependents
        if usid in dep_graph:
            for dependent in dep_graph[usid]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)
    
    # Check for cycles
    if len(result) != len(steps):
        raise ValueError("Cycle detected in workflow dependencies")
    
    return result


def substitute_variables(template: Any, variables: Dict[str, Any]) -> Any:
    """
    Recursively substitute {{variable}} and {{variable.path[0].to.field}} patterns in template
    Supports nested field access using dot notation and array indexing with brackets
    
    Examples:
        {{step_1_result}} - Direct variable access
        {{step_1_result.field}} - Nested field access
        {{step_1_result.array[0]}} - Array indexing
        {{step_1_result.content[0].text}} - Complex nested access
    
    Smart handling: If step_1_result is already a string and you reference
    {{step_1_result.content[0].text}}, it will return the string itself.
    """
    if isinstance(template, str):
        import re
        
        # Find all {{...}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, template)
        
        for match in matches:
            placeholder = f"{{{{{match}}}}}"
            
            # Parse the path, handling both dots and brackets
            # Convert "step_1_result.content[0].text" to ["step_1_result", "content", "0", "text"]
            path = match.replace('[', '.').replace(']', '')
            parts = [p for p in path.split('.') if p]  # Split and filter empty strings
            
            value = variables
            base_var_name = parts[0] if parts else None
            
            # Navigate through nested structure
            try:
                for i, part in enumerate(parts):
                    if value is None:
                        break
                    
                    # Try to convert to integer for array indexing
                    if part.isdigit():
                        index = int(part)
                        if isinstance(value, (list, tuple)):
                            value = value[index] if index < len(value) else None
                        else:
                            # Trying to index a non-list/tuple (e.g., a string)
                            # Check if this is the base variable and it's a primitive
                            if i == 1 and base_var_name and isinstance(variables.get(base_var_name), (str, int, float, bool)):
                                # The base variable is already a primitive, return it
                                value = variables.get(base_var_name)
                                print(f"🔄 Smart substitution: {match} → returning base variable (primitive type)")
                                break
                            else:
                                value = None
                    # Dictionary key access
                    elif isinstance(value, dict):
                        value = value.get(part)
                    # If we're trying to access a property on a primitive type
                    elif i > 0 and isinstance(value, (str, int, float, bool)):
                        # The value is already a primitive from a previous step
                        # Check if the base variable is a primitive
                        if base_var_name and isinstance(variables.get(base_var_name), (str, int, float, bool)):
                            # Return the base primitive value instead
                            value = variables.get(base_var_name)
                            print(f"🔄 Smart substitution: {match} → returning base variable (primitive type)")
                            break
                        else:
                            value = None
                    # Try attribute access as fallback
                    else:
                        try:
                            value = getattr(value, part, None)
                        except (AttributeError, TypeError):
                            value = None
                    
                    if value is None:
                        break
                
                # If value found, replace placeholder
                if value is not None:
                    # If entire string is placeholder, return value directly (preserves type)
                    if template == placeholder:
                        return value
                    # Otherwise, replace with string representation
                    if isinstance(value, (dict, list)):
                        template = template.replace(placeholder, json.dumps(value))
                    else:
                        template = template.replace(placeholder, str(value))
                        
            except (KeyError, TypeError, AttributeError, IndexError) as e:
                # Variable not found or path invalid, leave placeholder as is
                print(f"⚠️ Variable substitution failed for {match}: {e}")
                pass
        
        return template
    
    elif isinstance(template, dict):
        return {k: substitute_variables(v, variables) for k, v in template.items()}
    
    elif isinstance(template, list):
        return [substitute_variables(item, variables) for item in template]
    
    else:
        return template


def format_timestamp(dt: datetime = None) -> str:
    """Format timestamp for logging"""
    if dt is None:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def truncate_output(data: Any, max_length: int = 500) -> str:
    """Truncate output for logging"""
    text = json.dumps(data) if not isinstance(data, str) else data
    if len(text) > max_length:
        return text[:max_length] + "..."
    return text


def extract_error_message(error: Exception) -> str:
    """Extract clean error message from exception"""
    error_str = str(error)
    if len(error_str) > 200:
        error_str = error_str[:200] + "..."
    return error_str


def validate_step_config(step: Dict) -> List[str]:
    """
    Validate step configuration
    Returns list of validation errors (empty if valid)
    """
    errors = []
    
    required_fields = ["step_name", "usid", "service_url", "method", "outputs"]
    for field in required_fields:
        if field not in step:
            errors.append(f"Missing required field: {field}")
    
    # Validate USID format (8 hex chars)
    usid = step.get("usid", "")
    if len(usid) != 8:
        errors.append(f"USID must be 8 characters, got: {usid}")
    
    # Validate method
    method = step.get("method", "").upper()
    if method not in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
        errors.append(f"Invalid HTTP method: {method}")
    
    # Validate outputs (must be non-empty array)
    outputs = step.get("outputs", [])
    if not isinstance(outputs, list) or len(outputs) == 0:
        errors.append("Outputs must be a non-empty array")
    
    return errors


def validate_pipeline_payload(payload: Dict) -> List[str]:
    """
    Validate complete pipeline payload
    Returns list of validation errors (empty if valid)
    """
    errors = []
    
    # Check STEPS_CONFIG
    if "STEPS_CONFIG" not in payload:
        errors.append("Missing STEPS_CONFIG")
        return errors
    
    steps = payload["STEPS_CONFIG"]
    if not isinstance(steps, list) or len(steps) == 0:
        errors.append("STEPS_CONFIG must be a non-empty array")
        return errors
    
    # Validate each step
    usids_seen = set()
    for i, step in enumerate(steps):
        step_errors = validate_step_config(step)
        for error in step_errors:
            errors.append(f"Step {i} ({step.get('step_name', 'unknown')}): {error}")
        
        # Check for duplicate USIDs
        usid = step.get("usid")
        if usid in usids_seen:
            errors.append(f"Duplicate USID: {usid}")
        usids_seen.add(usid)
    
    return errors

