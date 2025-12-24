# Conditional Logic (If-Else) Usage Guide

## Overview
The workflow now supports conditional branching using if-else logic. Conditions are evaluated using LLM, allowing for natural language expressions.

## Basic Structure

### Simple String Instructions (Sequential)
```json
{
  "context": "Your input text here",
  "instructions": [
    "First instruction",
    "Second instruction",
    "Third instruction"
  ]
}
```

### Conditional Instructions
```json
{
  "context": "Your input text here",
  "instructions": [
    {
      "instruction": "Check if the text contains 'error'",
      "condition": {
        "expression": "result contains 'error'",
        "ifTrue": [1],  // Execute step at index 1 if true
        "ifFalse": [2]  // Execute step at index 2 if false
      }
    },
    "Handle error case",
    "Handle success case"
  ]
}
```

## Condition Object Structure

```typescript
{
  condition: {
    evaluateAfterStep?: number;  // Optional: which step (1-indexed) to evaluate against
                                  // Default: current step
    expression: string;           // Natural language condition
    ifTrue?: number[];            // Step indices (0-indexed) to execute if true
    ifFalse?: number[];           // Step indices (0-indexed) to execute if false
  }
}
```

## Examples

### Example 1: Simple If-Else
```json
{
  "context": "Analyze this code: function test() { return true; }",
  "instructions": [
    {
      "instruction": "Check if the code contains a function definition",
      "condition": {
        "expression": "result contains 'function'",
        "ifTrue": [1],   // If true, execute step 1 (extract function name)
        "ifFalse": [2]   // If false, execute step 2 (report no function found)
      }
    },
    "Extract the function name from the code",
    "Report that no function was found"
  ]
}
```

### Example 2: Evaluating Previous Step
```json
{
  "context": "Process this data: [1, 2, 3, 4, 5]",
  "instructions": [
    "Count the number of items in the array",
    {
      "instruction": "Check if count is greater than 3",
      "condition": {
        "evaluateAfterStep": 1,  // Evaluate condition against step 1's result
        "expression": "result contains a number greater than 3",
        "ifTrue": [2],   // If true, execute step 2 (process large array)
        "ifFalse": [3]   // If false, execute step 3 (process small array)
      }
    },
    "Process as large array",
    "Process as small array"
  ]
}
```

### Example 3: Sequential Fallback
```json
{
  "context": "User input: 'hello world'",
  "instructions": [
    {
      "instruction": "Check if input is a greeting",
      "condition": {
        "expression": "result indicates this is a greeting",
        "ifTrue": [1],   // If true, execute step 1
        // If false, no ifFalse specified - continues sequentially to step 1
      }
    },
    "Respond with appropriate greeting"
  ]
}
```

## Condition Expression Examples

The `expression` field accepts natural language conditions that are evaluated by the LLM:

- `"result contains 'success'"`
- `"result length is greater than 100"`
- `"result indicates an error occurred"`
- `"result is a valid JSON object"`
- `"result contains numbers"`
- `"result is empty or null"`
- `"result matches pattern '^[A-Z]'"`

## Important Notes

1. **Step Indices**: `ifTrue` and `ifFalse` use 0-indexed array positions
   - Step at index 0 is the first instruction
   - Step at index 1 is the second instruction, etc.

2. **Sequential Execution**: If neither `ifTrue` nor `ifFalse` is specified, execution continues sequentially to the next step.

3. **Infinite Loop Prevention**: The workflow tracks executed steps to prevent infinite loops.

4. **Condition Evaluation**: Conditions are evaluated using the LLM, so they can be flexible but may have slight latency.

5. **Backward Compatibility**: Simple string arrays still work exactly as before.

## Response Format

The workflow response includes condition evaluation metadata:

```json
{
  "originalContext": "...",
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "...",
      "result": "...",
      "processedAt": "2024-01-01T00:00:00.000Z",
      "duration": 1.23,
      "conditionEvaluated": true,
      "conditionResult": true,
      "branchTaken": "true"
    }
  ],
  "finalizedAt": "2024-01-01T00:00:00.000Z"
}
```

## Best Practices

1. **Clear Expressions**: Write condition expressions that are unambiguous
2. **Test Conditions**: Verify your condition expressions work as expected
3. **Handle All Cases**: Always specify both `ifTrue` and `ifFalse` for complete control flow
4. **Avoid Circular Dependencies**: Don't create conditions that loop back to already-executed steps

