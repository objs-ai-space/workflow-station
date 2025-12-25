# Step Configuration Reference

This document provides a comprehensive reference for all step types available in the Workflow Engine UI and their configuration options.

## Table of Contents

1. [Simple Step](#1-simple-step)
2. [Conditional Step](#2-conditional-step)
3. [Endpoint Step](#3-endpoint-step)
4. [Thread Step](#4-thread-step)
5. [Router Step](#5-router-step)
6. [Conditional Logic (Common)](#conditional-logic-common-to-multiple-steps)
7. [Quick Reference Table](#quick-reference-table)

---

## 1. Simple Step

The simplest step type - a text instruction that the LLM executes.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `instruction` | `string` | ✅ Yes | - | The text instruction/prompt for the LLM to execute |

### Example

```json
"Extract the number from the input. Output ONLY the number, nothing else."
```

### Use Cases

- Basic LLM processing tasks
- Text transformation
- Data extraction
- Simple analysis tasks

---

## 2. Conditional Step

A step with conditional branching logic that routes to different steps based on LLM-evaluated conditions.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `instruction` | `string` | ✅ Yes | - | The text instruction/prompt for the LLM |
| `condition` | `object` | ✅ Yes | - | Conditional logic configuration |
| `condition.expression` | `string` | ✅ Yes | - | Natural language condition (e.g., "result contains YES") |
| `condition.ifTrue` | `number[]` | ❌ No | `[]` | Step indices to execute if condition is TRUE (0-indexed) |
| `condition.ifFalse` | `number[]` | ❌ No | `[]` | Step indices to execute if condition is FALSE (0-indexed) |
| `condition.evaluateAfterStep` | `number` | ❌ No | Current step | Which step's result to evaluate (1-indexed) |

### Example

```json
{
  "instruction": "Check if the previous number is divisible by 5. Answer only YES or NO.",
  "condition": {
    "expression": "result contains YES or says yes",
    "ifTrue": [5],
    "ifFalse": [6],
    "evaluateAfterStep": 4
  }
}
```

### Use Cases

- Decision branching in workflows
- Approval/rejection flows
- Conditional processing paths
- Validation and routing

### Notes

- Step indices in `ifTrue` and `ifFalse` are **0-indexed** (first step is 0)
- `evaluateAfterStep` is **1-indexed** (first step is 1)
- If `evaluateAfterStep` is not specified, the condition evaluates the current step's result
- The condition expression uses natural language and is evaluated by an LLM

---

## 3. Endpoint Step

Makes HTTP API calls to external endpoints through Cloudflare Workers.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"endpoint"` | ✅ Yes | - | Must be `"endpoint"` |
| `endpointUrl` | `string` | ✅ Yes | - | Cloudflare Worker URL (selected from dropdown) |
| `apiUrl` | `string` | ✅ Yes | - | External API URL to call |
| `method` | `string` | ❌ No | `"GET"` | HTTP method: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"` |
| `headers` | `Record<string, string>` | ❌ No | `{}` | Custom HTTP headers |
| `body` | `string \| Record<string, unknown>` | ❌ No | - | Request body (shown for POST/PUT/PATCH) |
| `retries` | `number` | ❌ No | `3` | Number of retry attempts (0-10) |
| `retryDelay` | `number` | ❌ No | `1000` | Delay between retries in milliseconds (min: 100) |
| `timeout` | `number` | ❌ No | `30000` | Request timeout in milliseconds (min: 1000) |
| `description` | `string` | ❌ No | - | Human-readable description |
| `condition` | `object` | ❌ No | - | Conditional logic (see [Conditional Logic](#conditional-logic-common-to-multiple-steps)) |

### Example

```json
{
  "type": "endpoint",
  "endpointUrl": "https://endpoint-1.developer-f79.workers.dev",
  "apiUrl": "https://jsonplaceholder.typicode.com/users/1",
  "method": "GET",
  "retries": 3,
  "retryDelay": 1000,
  "timeout": 30000,
  "description": "Fetch user data from JSONPlaceholder API"
}
```

### POST/PUT/PATCH Example

```json
{
  "type": "endpoint",
  "endpointUrl": "https://endpoint-1.developer-f79.workers.dev",
  "apiUrl": "https://jsonplaceholder.typicode.com/posts",
  "method": "POST",
  "body": {
    "title": "My Test Post",
    "body": "This is a test post",
    "userId": 1
  },
  "retries": 2,
  "description": "Create a new post"
}
```

### Use Cases

- Fetching data from external APIs
- Creating/updating resources via API
- Integrating with third-party services
- Data retrieval before LLM processing

### Notes

- `endpointUrl` is the Cloudflare Worker that proxies the request
- `apiUrl` is the actual external API endpoint
- Request body is only shown/required for POST, PUT, and PATCH methods
- Retries use exponential backoff with the specified delay
- Timeout applies to each individual request attempt

---

## 4. Thread Step

Collects results from multiple previous steps and aggregates them into a single output.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"thread"` | ✅ Yes | - | Must be `"thread"` |
| `collectFromSteps` | `number[]` | ✅ Yes | - | Step numbers to collect from (1-indexed, comma-separated) |
| `outputFormat` | `string` | ❌ No | `"json"` | Output format: `"json"`, `"markdown"`, `"numbered"` |
| `description` | `string` | ❌ No | - | Human-readable description |
| `completionCheck` | `object` | ❌ No | `{ mode: "deterministic" }` | Completion check configuration |
| `completionCheck.mode` | `string` | ❌ No | `"deterministic"` | Mode: `"deterministic"` or `"llm"` |
| `completionCheck.expression` | `string` | ❌ No | - | Required if mode is `"llm"` - Natural language condition |
| `condition` | `object` | ❌ No | - | Conditional logic (see [Conditional Logic](#conditional-logic-common-to-multiple-steps)) |

### Example

```json
{
  "type": "thread",
  "collectFromSteps": [1, 2, 3],
  "outputFormat": "json",
  "description": "Collect results from Steps 1, 2, and 3",
  "completionCheck": {
    "mode": "deterministic"
  }
}
```

### LLM Completion Check Example

```json
{
  "type": "thread",
  "collectFromSteps": [1, 2, 3],
  "outputFormat": "json",
  "completionCheck": {
    "mode": "llm",
    "expression": "all results contain valid data"
  }
}
```

### Use Cases

- Aggregating results from parallel API calls
- Combining multiple LLM outputs
- Collecting data from different sources
- Merging step results for further processing

### Notes

- `collectFromSteps` uses **1-indexed** step numbers (first step is 1)
- `outputFormat` determines how collected results are formatted:
  - `"json"`: Structured JSON object
  - `"markdown"`: Markdown-formatted text
  - `"numbered"`: Numbered list format
- `completionCheck.mode`:
  - `"deterministic"`: Waits for all specified steps to complete
  - `"llm"`: Uses LLM to evaluate if collection is complete based on `expression`
- The collected results are passed as input to the next step

---

## 5. Router Step

Uses an LLM to intelligently select which endpoint to call from a list of options.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"router"` | ✅ Yes | - | Must be `"router"` |
| `description` | `string` | ✅ Yes | - | Human-readable description of the router |
| `evaluationPrompt` | `string` | ✅ Yes | - | Prompt/question for LLM to evaluate options |
| `options` | `RouterOption[]` | ✅ Yes | - | Array of endpoint options |
| `options[].id` | `string` | ✅ Yes | - | Unique identifier for the option |
| `options[].name` | `string` | ✅ Yes | - | Display name |
| `options[].description` | `string` | ✅ Yes | - | Description of what this option provides |
| `options[].endpoint.endpointUrl` | `string` | ✅ Yes | - | Cloudflare Worker URL |
| `options[].endpoint.apiUrl` | `string` | ✅ Yes | - | External API URL |
| `options[].endpoint.method` | `string` | ❌ No | `"GET"` | HTTP method |
| `options[].endpoint.headers` | `Record<string, string>` | ❌ No | - | Custom headers |
| `options[].endpoint.body` | `unknown` | ❌ No | - | Request body |
| `defaultOption` | `string` | ❌ No | First option | ID of default option if LLM can't decide |
| `retries` | `number` | ❌ No | `3` | Number of retry attempts (0-10) |
| `retryDelay` | `number` | ❌ No | - | Delay between retries in milliseconds |
| `timeout` | `number` | ❌ No | - | Request timeout in milliseconds |
| `condition` | `object` | ❌ No | - | Conditional logic (see [Conditional Logic](#conditional-logic-common-to-multiple-steps)) |

### Example

```json
{
  "type": "router",
  "description": "Smart Data Source Router",
  "evaluationPrompt": "Based on the user's question, which data source would provide the most relevant information?",
  "options": [
    {
      "id": "weather",
      "name": "Weather API",
      "description": "Weather forecasts, outdoor conditions, temperature data",
      "endpoint": {
        "endpointUrl": "https://endpoint-1.developer-f79.workers.dev",
        "apiUrl": "https://endpoint-1.developer-f79.workers.dev/mock/weather",
        "method": "GET"
      }
    },
    {
      "id": "news",
      "name": "News API",
      "description": "Current events, trending topics, news articles",
      "endpoint": {
        "endpointUrl": "https://endpoint-2.developer-f79.workers.dev",
        "apiUrl": "https://endpoint-2.developer-f79.workers.dev/mock/news",
        "method": "GET"
      }
    }
  ],
  "defaultOption": "weather",
  "retries": 3
}
```

### Use Cases

- Dynamic endpoint selection based on user query
- Intelligent routing to different data sources
- Context-aware API selection
- Multi-source data retrieval

### Notes

- The LLM evaluates all options based on the `evaluationPrompt` and context
- The selected option's endpoint is called automatically
- If the LLM cannot decide, `defaultOption` is used
- Each option can have different endpoint configurations
- The router's result contains the selected option and its API response

---

## Conditional Logic (Common to Multiple Steps)

Conditional logic can be added to **Conditional**, **Endpoint**, **Thread**, and **Router** steps to enable branching behavior.

### Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `condition` | `object` | ❌ No | - | Conditional logic object |
| `condition.evaluateAfterStep` | `number` | ❌ No | Current step | Which step's result to evaluate (1-indexed) |
| `condition.expression` | `string` | ✅ Yes | - | Natural language condition evaluated by LLM |
| `condition.ifTrue` | `number[]` | ❌ No | `[]` | Step indices to execute if TRUE (0-indexed) |
| `condition.ifFalse` | `number[]` | ❌ No | `[]` | Step indices to execute if FALSE (0-indexed) |

### Example: Endpoint with Conditional Logic

```json
{
  "type": "endpoint",
  "endpointUrl": "https://endpoint-1.developer-f79.workers.dev",
  "apiUrl": "https://api.example.com/users/1",
  "method": "GET",
  "condition": {
    "evaluateAfterStep": 2,
    "expression": "result contains 'active' status",
    "ifTrue": [4],
    "ifFalse": [5]
  }
}
```

### Notes

- `evaluateAfterStep` is **1-indexed** (first step is 1)
- `ifTrue` and `ifFalse` arrays use **0-indexed** step numbers (first step is 0)
- The `expression` uses natural language and is evaluated by an LLM
- If `evaluateAfterStep` is not specified, the condition evaluates the current step's result
- Empty arrays mean no steps execute for that branch

---

## Quick Reference Table

| Step Type | Required Fields | Key Optional Fields | Use Case |
|-----------|----------------|---------------------|----------|
| **Simple** | `instruction` | None | Basic LLM tasks |
| **Conditional** | `instruction`, `condition.expression` | `condition.ifTrue`, `condition.ifFalse`, `condition.evaluateAfterStep` | Branching logic |
| **Endpoint** | `endpointUrl`, `apiUrl` | `method`, `body`, `retries`, `retryDelay`, `timeout`, `description`, `condition` | API calls |
| **Thread** | `collectFromSteps` | `outputFormat`, `completionCheck`, `description`, `condition` | Aggregating results |
| **Router** | `description`, `evaluationPrompt`, `options` | `defaultOption`, `retries`, `retryDelay`, `timeout`, `condition` | Smart endpoint selection |

---

## Step Type Conversion

Steps can be converted between types by clicking the mode button on each step. The conversion cycle is:

**Simple → Conditional → Endpoint → Thread → Router → Simple**

When converting:
- Simple text is preserved when converting to Conditional
- Instruction text is extracted when converting from Conditional/Endpoint/Thread/Router back to Simple
- Default values are provided for new step types

---

## Indexing Notes

⚠️ **Important**: The UI uses different indexing conventions:

- **Step numbers in UI**: 1-indexed (Step 1, Step 2, etc.)
- **Conditional `ifTrue`/`ifFalse`**: 0-indexed (0 = first step, 1 = second step)
- **Conditional `evaluateAfterStep`**: 1-indexed (1 = first step, 2 = second step)
- **Thread `collectFromSteps`**: 1-indexed (1 = first step, 2 = second step)

Always check the UI labels to confirm which indexing system is being used for each field.

---

## Best Practices

1. **Use descriptive instructions**: Clear, specific instructions produce better results
2. **Test conditional expressions**: Natural language conditions should be unambiguous
3. **Set appropriate timeouts**: API calls should have realistic timeout values
4. **Use retries wisely**: Balance between reliability and performance
5. **Document with descriptions**: Add descriptions to complex steps for clarity
6. **Validate step references**: Ensure conditional branches reference valid step indices
7. **Thread collection**: Only collect from steps that have completed
8. **Router options**: Provide clear, distinct descriptions for router options

---

## Examples

See `SAMPLE_WORKFLOWS.md` for complete workflow examples using all step types.

---

*Last updated: Based on workflow-engine-ui/app/page.tsx*

