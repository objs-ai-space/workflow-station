var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import {
  WorkflowEntrypoint
} from "cloudflare:workers";
async function callOpenAI(apiKey, model, systemPrompt, userPrompt) {
  const isGPT5Nano = model.includes("gpt-5-nano");
  const requestBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };
  if (!isGPT5Nano) {
    requestBody.temperature = 0.7;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}
__name(callOpenAI, "callOpenAI");
async function callAnthropic(apiKey, model, systemPrompt, userPrompt) {
  const requestBody = {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userPrompt }]
      }
    ]
  };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }
  const data = await response.json();
  return data.content[0]?.text || "";
}
__name(callAnthropic, "callAnthropic");
async function callLLM(provider, apiKey, model, systemPrompt, userPrompt) {
  if (provider === "anthropic") {
    return callAnthropic(apiKey, model, systemPrompt, userPrompt);
  }
  return callOpenAI(apiKey, model, systemPrompt, userPrompt);
}
__name(callLLM, "callLLM");
async function evaluateCondition(provider, apiKey, model, conditionExpression, stepResult, stepNumber) {
  const systemPrompt = "You are a logical evaluator. Evaluate the given condition and respond with ONLY 'true' or 'false' (lowercase, no punctuation).";
  const userPrompt = `Evaluate this condition: "${conditionExpression}"

Step ${stepNumber} result:
${stepResult}

Respond with only 'true' or 'false'.`;
  const response = await callLLM(provider, apiKey, model, systemPrompt, userPrompt);
  const normalized = response.trim().toLowerCase();
  if (normalized.includes("true") && !normalized.includes("false")) {
    return true;
  }
  if (normalized.includes("false")) {
    return false;
  }
  console.warn(`\u26A0\uFE0F Unclear condition evaluation result: "${response}", defaulting to false`);
  return false;
}
__name(evaluateCondition, "evaluateCondition");
async function callEndpoint(endpointUrl, apiUrl, method = "GET", headers, body, retries = 3, retryDelay = 1e3, timeout = 3e4) {
  const requestBody = {
    url: apiUrl,
    method,
    headers: headers || {},
    body,
    retries,
    retryDelay,
    timeout
  };
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Endpoint worker error: ${response.status} - ${error}`);
  }
  const result = await response.json();
  if (!result.success) {
    throw new Error(
      `API call failed after ${result.attempts} attempts: ${result.error || result.statusText}`
    );
  }
  if (typeof result.body === "string") {
    return result.body;
  }
  return JSON.stringify(result.body);
}
__name(callEndpoint, "callEndpoint");
var MyWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "MyWorkflow");
  }
  async run(event, step) {
    const {
      context,
      instructions,
      provider = "openai",
      model,
      firstInstruction,
      secondInstruction
    } = event.payload;
    const defaultModel = provider === "anthropic" ? "claude-haiku-4-5" : "gpt-5-nano";
    const selectedModel = model || defaultModel;
    const apiKey = provider === "anthropic" ? this.env.ANTHROPIC_API_KEY : this.env.OPENAI_API_KEY;
    if (!apiKey) {
      const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      throw new Error(
        `${keyName} environment variable is required. For local development, ensure .dev.vars file exists in the project root with ${keyName} set. For production, set it using: wrangler secret put ${keyName}`
      );
    }
    const rawInstructions = instructions && instructions.length > 0 ? instructions : firstInstruction && secondInstruction ? [firstInstruction, secondInstruction] : [];
    if (rawInstructions.length === 0) {
      throw new Error("At least one instruction is required");
    }
    const normalizedInstructions = rawInstructions.map((inst) => {
      if (typeof inst === "string") {
        return { instruction: inst };
      }
      if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "endpoint") {
        return inst;
      }
      if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "thread") {
        return inst;
      }
      if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "router") {
        return inst;
      }
      return inst;
    });
    let currentResult = {
      originalContext: context,
      steps: [],
      finalizedAt: "",
      errors: [],
      logs: []
    };
    const addLog = /* @__PURE__ */ __name((level, message, stepNumber, data) => {
      currentResult.logs?.push({
        level,
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        stepNumber,
        data
      });
    }, "addLog");
    const addError = /* @__PURE__ */ __name((stepNumber, stepIndex, error, errorType, context2) => {
      currentResult.errors?.push({
        stepNumber,
        stepIndex,
        error,
        errorType,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        context: context2
      });
    }, "addError");
    addLog("info", `Starting workflow with ${normalizedInstructions.length} instructions`, void 0, { provider, model: selectedModel });
    const executedSteps = /* @__PURE__ */ new Set();
    const executionQueue = [];
    const branchTargetSteps = /* @__PURE__ */ new Set();
    for (const inst of normalizedInstructions) {
      if ("condition" in inst && inst.condition) {
        if (inst.condition.ifTrue) {
          inst.condition.ifTrue.forEach((idx) => branchTargetSteps.add(idx));
        }
        if (inst.condition.ifFalse) {
          inst.condition.ifFalse.forEach((idx) => branchTargetSteps.add(idx));
        }
      }
    }
    executionQueue.push(0);
    while (executionQueue.length > 0) {
      const stepIndex = executionQueue.shift();
      if (executedSteps.has(stepIndex)) {
        continue;
      }
      if (stepIndex < 0 || stepIndex >= normalizedInstructions.length) {
        continue;
      }
      executedSteps.add(stepIndex);
      const instructionConfig = normalizedInstructions[stepIndex];
      const stepNumber = currentResult.steps.length + 1;
      const isFirstStep = currentResult.steps.length === 0;
      const previousResult = currentResult.steps.length > 0 ? currentResult.steps[currentResult.steps.length - 1].result : context;
      const isEndpointInstruction = "type" in instructionConfig && instructionConfig.type === "endpoint";
      const isThreadInstruction = "type" in instructionConfig && instructionConfig.type === "thread";
      const isRouterInstruction = "type" in instructionConfig && instructionConfig.type === "router";
      const instructionType = isRouterInstruction ? "router" : isThreadInstruction ? "thread" : isEndpointInstruction ? "endpoint" : "llm";
      addLog("info", `Starting step ${stepNumber} (${instructionType})`, stepNumber);
      const stepResult = await step.do(
        `process-step-${stepNumber}`,
        {
          retries: {
            limit: 3,
            delay: "1 second",
            // Reduced from 2s for faster retries
            backoff: "exponential"
          },
          timeout: "5 minutes"
        },
        async () => {
          const stepStartTime = Date.now();
          let result;
          let instruction;
          if (isThreadInstruction) {
            const threadInst = instructionConfig;
            instruction = threadInst.description || `Collect results from steps: ${threadInst.collectFromSteps.join(", ")}`;
            const collectedResults = [];
            const missingSteps = [];
            for (const stepNum of threadInst.collectFromSteps) {
              const stepData = currentResult.steps.find((s) => s.stepNumber === stepNum);
              if (stepData) {
                collectedResults.push({
                  stepNumber: stepData.stepNumber,
                  instruction: stepData.instruction,
                  result: stepData.result
                });
              } else {
                missingSteps.push(stepNum);
              }
            }
            const completionCheck = threadInst.completionCheck || { mode: "deterministic" };
            let isComplete = false;
            if (completionCheck.mode === "deterministic") {
              isComplete = missingSteps.length === 0;
            } else if (completionCheck.mode === "llm" && completionCheck.expression) {
              const collectionSummary = collectedResults.map(
                (r) => `Step ${r.stepNumber}: ${r.result.substring(0, 200)}...`
              ).join("\n");
              isComplete = await evaluateCondition(
                provider,
                apiKey,
                selectedModel,
                completionCheck.expression,
                collectionSummary,
                stepNumber
              );
            }
            if (!isComplete && missingSteps.length > 0) {
              throw new Error(`Thread incomplete: missing results from steps ${missingSteps.join(", ")}. Ensure these steps execute before this thread step.`);
            }
            const outputFormat = threadInst.outputFormat || "json";
            if (outputFormat === "json") {
              result = JSON.stringify({
                collectedSteps: threadInst.collectFromSteps,
                results: collectedResults.map((r) => ({
                  step: r.stepNumber,
                  instruction: r.instruction,
                  result: r.result
                }))
              }, null, 2);
            } else if (outputFormat === "markdown") {
              result = collectedResults.map(
                (r) => `## Step ${r.stepNumber}
**Instruction:** ${r.instruction}

**Result:**
${r.result}`
              ).join("\n\n---\n\n");
            } else if (outputFormat === "numbered") {
              result = collectedResults.map(
                (r, idx) => `${idx + 1}. [Step ${r.stepNumber}] ${r.result}`
              ).join("\n\n");
            } else {
              result = JSON.stringify(collectedResults);
            }
          } else if (isRouterInstruction) {
            const routerInst = instructionConfig;
            instruction = routerInst.description || `Router: ${routerInst.evaluationPrompt}`;
            addLog("info", `Router step started with ${routerInst.options.length} options`, stepNumber, {
              options: routerInst.options.map((o) => o.id),
              defaultOption: routerInst.defaultOption
            });
            const optionsText = routerInst.options.map(
              (opt, idx) => `${idx + 1}. ${opt.id}: ${opt.description}`
            ).join("\n");
            const selectionPrompt = `You are evaluating which data source or API to query based on the context.

CONTEXT/PREVIOUS RESULT:
${previousResult}

AVAILABLE OPTIONS:
${optionsText}

TASK: ${routerInst.evaluationPrompt}

IMPORTANT: Respond with ONLY the option ID (e.g., "${routerInst.options[0]?.id || "option1"}"). 
Do not include any other text, explanation, or punctuation. Just the ID.`;
            addLog("debug", "Sending selection prompt to LLM", stepNumber, { promptLength: selectionPrompt.length });
            let selectedOptionId;
            try {
              selectedOptionId = await callLLM(
                provider,
                apiKey,
                selectedModel,
                "You are a decision-making assistant. Your job is to analyze context and select the most appropriate option. Respond with ONLY the option ID, nothing else.",
                selectionPrompt
              );
              addLog("info", `LLM returned selection: "${selectedOptionId.trim()}"`, stepNumber);
            } catch (llmError) {
              const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
              addLog("error", `LLM selection failed: ${errMsg}`, stepNumber);
              addError(stepNumber, stepIndex, errMsg, "router-llm", "LLM failed to select option");
              throw new Error(`Router LLM selection failed: ${errMsg}`);
            }
            const cleanedSelection = selectedOptionId.trim().toLowerCase().replace(/['"]/g, "");
            let selectedOption = routerInst.options.find(
              (opt) => opt.id.toLowerCase() === cleanedSelection
            );
            if (!selectedOption) {
              addLog("warn", `Exact match not found for "${cleanedSelection}", trying partial match`, stepNumber);
              selectedOption = routerInst.options.find(
                (opt) => cleanedSelection.includes(opt.id.toLowerCase()) || opt.id.toLowerCase().includes(cleanedSelection)
              );
            }
            if (!selectedOption) {
              addLog("warn", `No match found, falling back to default option: ${routerInst.defaultOption || "first option"}`, stepNumber);
              if (routerInst.defaultOption) {
                selectedOption = routerInst.options.find((opt) => opt.id === routerInst.defaultOption);
              }
              if (!selectedOption) {
                selectedOption = routerInst.options[0];
              }
            }
            if (!selectedOption) {
              const errMsg = `Router could not select an option. LLM returned: "${selectedOptionId}"`;
              addLog("error", errMsg, stepNumber);
              addError(stepNumber, stepIndex, errMsg, "router-selection", "No valid option could be selected");
              throw new Error(errMsg);
            }
            addLog("info", `Selected option: ${selectedOption.id} (${selectedOption.name})`, stepNumber, {
              endpoint: selectedOption.endpoint.apiUrl
            });
            let endpointResult;
            try {
              const apiUrl = selectedOption.endpoint.apiUrl;
              const endpointUrl = selectedOption.endpoint.endpointUrl;
              const method = selectedOption.endpoint.method || "GET";
              const isMockEndpoint = apiUrl.includes("/mock/");
              if (isMockEndpoint) {
                addLog("info", `Calling mock endpoint directly: ${apiUrl}`, stepNumber);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), routerInst.timeout || 3e4);
                const fetchOptions = {
                  method,
                  headers: {
                    "Content-Type": "application/json",
                    ...selectedOption.endpoint.headers
                  },
                  signal: controller.signal
                };
                if (selectedOption.endpoint.body && ["POST", "PUT", "PATCH"].includes(method)) {
                  fetchOptions.body = typeof selectedOption.endpoint.body === "string" ? selectedOption.endpoint.body : JSON.stringify(selectedOption.endpoint.body);
                }
                const response = await fetch(apiUrl, fetchOptions);
                clearTimeout(timeoutId);
                if (!response.ok) {
                  throw new Error(`Mock endpoint returned ${response.status}: ${response.statusText}`);
                }
                const responseData = await response.json();
                endpointResult = JSON.stringify(responseData);
              } else {
                endpointResult = await callEndpoint(
                  endpointUrl,
                  apiUrl,
                  method,
                  selectedOption.endpoint.headers,
                  selectedOption.endpoint.body,
                  routerInst.retries || 3,
                  routerInst.retryDelay || 1e3,
                  routerInst.timeout || 3e4
                );
              }
              addLog("info", `Endpoint call successful for ${selectedOption.id}`, stepNumber);
            } catch (endpointError) {
              const errMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
              addLog("error", `Endpoint call failed: ${errMsg}`, stepNumber, {
                endpoint: selectedOption.endpoint.apiUrl
              });
              addError(stepNumber, stepIndex, errMsg, "router-endpoint", `Endpoint ${selectedOption.endpoint.apiUrl} failed`);
              throw new Error(`Router endpoint call failed: ${errMsg}`);
            }
            result = JSON.stringify({
              routerDecision: {
                selectedOption: selectedOption.id,
                selectedName: selectedOption.name,
                llmResponse: selectedOptionId.trim(),
                endpoint: selectedOption.endpoint.apiUrl
              },
              data: JSON.parse(endpointResult)
            }, null, 2);
          } else if (isEndpointInstruction) {
            const endpointInst = instructionConfig;
            instruction = endpointInst.description || `Call ${endpointInst.apiUrl}`;
            addLog("info", `Endpoint step calling ${endpointInst.apiUrl}`, stepNumber, {
              method: endpointInst.method || "GET",
              retries: endpointInst.retries || 3
            });
            try {
              result = await callEndpoint(
                endpointInst.endpointUrl,
                endpointInst.apiUrl,
                endpointInst.method || "GET",
                endpointInst.headers,
                endpointInst.body,
                endpointInst.retries || 3,
                endpointInst.retryDelay || 1e3,
                endpointInst.timeout || 3e4
              );
              addLog("info", `Endpoint call successful`, stepNumber);
            } catch (endpointError) {
              const errMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
              addLog("error", `Endpoint call failed: ${errMsg}`, stepNumber);
              addError(stepNumber, stepIndex, errMsg, "endpoint", `Endpoint ${endpointInst.apiUrl} failed`);
              throw endpointError;
            }
          } else {
            const llmInst = instructionConfig;
            instruction = llmInst.instruction;
            const systemPrompt = isFirstStep ? "You are a helpful assistant that processes and analyzes content." : "You are a helpful assistant that processes and refines content based on previous results.";
            const userPrompt = isFirstStep ? `${instruction}

Context:
${previousResult}` : `${instruction}

Previous Result:
${previousResult}`;
            result = await callLLM(provider, apiKey, selectedModel, systemPrompt, userPrompt);
          }
          const stepEndTime = Date.now();
          const duration = (stepEndTime - stepStartTime) / 1e3;
          return {
            stepNumber,
            instruction,
            result,
            processedAt: (/* @__PURE__ */ new Date()).toISOString(),
            duration
          };
        }
      );
      let conditionResult;
      let branchTaken = "sequential";
      if ("condition" in instructionConfig && instructionConfig.condition) {
        const condition = instructionConfig.condition;
        let resultToEvaluate;
        let stepNumberToEvaluate;
        if (condition.evaluateAfterStep !== void 0) {
          const stepToEvaluate = currentResult.steps.find((s) => s.stepNumber === condition.evaluateAfterStep);
          if (!stepToEvaluate) {
            throw new Error(`Cannot evaluate condition: step ${condition.evaluateAfterStep} not found`);
          }
          resultToEvaluate = stepToEvaluate.result;
          stepNumberToEvaluate = condition.evaluateAfterStep;
        } else {
          resultToEvaluate = stepResult.result;
          stepNumberToEvaluate = stepNumber;
        }
        conditionResult = await step.do(
          `evaluate-condition-${stepNumber}`,
          {
            retries: {
              limit: 2,
              delay: "1 second",
              backoff: "exponential"
            },
            timeout: "2 minutes"
          },
          async () => {
            return await evaluateCondition(
              provider,
              apiKey,
              selectedModel,
              condition.expression,
              resultToEvaluate,
              stepNumberToEvaluate
            );
          }
        );
        if (conditionResult) {
          branchTaken = "true";
          if (condition.ifTrue && condition.ifTrue.length > 0) {
            executionQueue.push(...condition.ifTrue);
          } else {
            if (stepIndex + 1 < normalizedInstructions.length) {
              executionQueue.push(stepIndex + 1);
            }
          }
        } else {
          branchTaken = "false";
          if (condition.ifFalse && condition.ifFalse.length > 0) {
            executionQueue.push(...condition.ifFalse);
          } else {
            if (stepIndex + 1 < normalizedInstructions.length) {
              executionQueue.push(stepIndex + 1);
            }
          }
        }
      } else {
        if (!branchTargetSteps.has(stepIndex) && stepIndex + 1 < normalizedInstructions.length) {
          executionQueue.push(stepIndex + 1);
        }
      }
      currentResult.steps.push({
        ...stepResult,
        conditionEvaluated: "condition" in instructionConfig && instructionConfig.condition !== void 0,
        conditionResult,
        branchTaken
      });
    }
    currentResult.finalizedAt = (/* @__PURE__ */ new Date()).toISOString();
    return currentResult;
  }
};
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    if (url.pathname.startsWith("/favicon")) {
      return Response.json({}, { status: 404 });
    }
    const instanceId = url.searchParams.get("instanceId");
    if (instanceId) {
      try {
        const instance = await env.MY_WORKFLOW.get(instanceId);
        const status = await instance.status();
        return Response.json(
          {
            instanceId,
            status
          },
          {
            headers: {
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } catch (error) {
        return Response.json(
          { error: `Instance not found: ${instanceId}` },
          { status: 404 }
        );
      }
    }
    if (url.pathname === "/batch" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.context) {
          return Response.json(
            { error: "Missing required field: context" },
            { status: 400 }
          );
        }
        if (!body.count || body.count < 1 || body.count > 20) {
          return Response.json(
            { error: "Count must be between 1 and 20" },
            { status: 400 }
          );
        }
        const hasInstructions = body.instructions && Array.isArray(body.instructions) && body.instructions.length > 0;
        if (!hasInstructions) {
          return Response.json(
            { error: "Missing required field: instructions" },
            { status: 400 }
          );
        }
        const instances = await Promise.all(
          Array.from(
            { length: body.count },
            () => env.MY_WORKFLOW.create({
              params: {
                context: body.context,
                instructions: body.instructions,
                provider: body.provider || "openai",
                model: body.model || void 0
              }
            })
          )
        );
        const results = await Promise.all(
          instances.map(async (instance) => {
            const status = await instance.status();
            return {
              instanceId: instance.id,
              status
            };
          })
        );
        return Response.json(
          {
            count: results.length,
            instances: results,
            message: `Successfully created ${results.length} workflow instance(s)`
          },
          {
            headers: {
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to create batch workflows"
          },
          { status: 500 }
        );
      }
    }
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.context) {
          return Response.json(
            {
              error: "Missing required field: context"
            },
            { status: 400 }
          );
        }
        const hasInstructions = body.instructions && Array.isArray(body.instructions) && body.instructions.length > 0;
        const hasLegacyInstructions = body.firstInstruction && body.secondInstruction;
        if (!hasInstructions && !hasLegacyInstructions) {
          return Response.json(
            {
              error: "Missing required fields: either 'instructions' array or 'firstInstruction' and 'secondInstruction'"
            },
            { status: 400 }
          );
        }
        if (hasInstructions && body.instructions.length > 0) {
          for (let i = 0; i < body.instructions.length; i++) {
            const inst = body.instructions[i];
            if (typeof inst === "object" && inst !== null && "condition" in inst) {
              const cond = inst.condition;
              if (cond && cond.ifTrue) {
                for (const idx of cond.ifTrue) {
                  if (idx < 0 || idx >= body.instructions.length) {
                    return Response.json(
                      { error: `Conditional instruction ${i}: ifTrue index ${idx} is out of bounds` },
                      { status: 400 }
                    );
                  }
                }
              }
              if (cond && cond.ifFalse) {
                for (const idx of cond.ifFalse) {
                  if (idx < 0 || idx >= body.instructions.length) {
                    return Response.json(
                      { error: `Conditional instruction ${i}: ifFalse index ${idx} is out of bounds` },
                      { status: 400 }
                    );
                  }
                }
              }
            }
          }
        }
        const instance = await env.MY_WORKFLOW.create({
          params: {
            context: body.context,
            instructions: body.instructions || void 0,
            provider: body.provider || "openai",
            model: body.model || void 0,
            // Will use default based on provider
            firstInstruction: body.firstInstruction,
            secondInstruction: body.secondInstruction
          }
        });
        const status = await instance.status();
        return Response.json(
          {
            instanceId: instance.id,
            status,
            message: "Workflow started successfully"
          },
          {
            headers: {
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to create workflow"
          },
          { status: 500 }
        );
      }
    }
    return Response.json(
      {
        message: "Multi-Provider LLM Workflow API with External Endpoint & Thread Support",
        endpoints: {
          "POST /": {
            description: "Create a new workflow instance",
            body: {
              context: "string - The initial context to process",
              instructions: "string[] | ConditionalInstruction[] | EndpointInstruction[] | ThreadInstruction[] - Array of instructions",
              provider: "string (optional) - AI provider: 'openai' or 'anthropic' (default: 'openai')",
              model: "string (optional) - Model name (default: 'gpt-5-nano' for OpenAI, 'claude-haiku-4-5' for Anthropic)",
              firstInstruction: "string (legacy) - Instruction for the first LLM call",
              secondInstruction: "string (legacy) - Instruction for the second LLM call"
            },
            threadExample: {
              description: "Thread instruction collects results from multiple steps for LLM to see all at once",
              context: "Gather data from multiple sources and analyze together",
              instructions: [
                {
                  type: "endpoint",
                  endpointUrl: "https://endpoint-1.workers.dev",
                  apiUrl: "https://api.example.com/users",
                  method: "GET",
                  description: "Fetch users data"
                },
                {
                  type: "endpoint",
                  endpointUrl: "https://endpoint-2.workers.dev",
                  apiUrl: "https://api.example.com/products",
                  method: "GET",
                  description: "Fetch products data"
                },
                {
                  type: "endpoint",
                  endpointUrl: "https://endpoint-3.workers.dev",
                  apiUrl: "https://api.example.com/orders",
                  method: "GET",
                  description: "Fetch orders data"
                },
                {
                  type: "thread",
                  collectFromSteps: [1, 2, 3],
                  outputFormat: "json",
                  description: "Collect all API responses",
                  completionCheck: {
                    mode: "deterministic"
                  }
                },
                "Analyze the collected data and provide insights on user behavior, popular products, and order patterns"
              ],
              provider: "openai"
            },
            routerExample: {
              description: "Router instruction allows LLM to decide which endpoint to call based on context",
              context: "User is asking about the weather for hiking this weekend",
              instructions: [
                "Analyze the user's question and identify the main topic and intent",
                {
                  type: "router",
                  description: "Select the most appropriate data source",
                  evaluationPrompt: "Based on the analysis, which data source would best answer this query?",
                  options: [
                    {
                      id: "weather",
                      name: "Weather API",
                      description: "Weather forecasts, outdoor conditions, temperature data",
                      endpoint: {
                        endpointUrl: "https://endpoint-1.workers.dev",
                        apiUrl: "https://endpoint-1.workers.dev/mock/weather",
                        method: "GET"
                      }
                    },
                    {
                      id: "news",
                      name: "News API",
                      description: "Current events, trending topics, news articles",
                      endpoint: {
                        endpointUrl: "https://endpoint-2.workers.dev",
                        apiUrl: "https://endpoint-2.workers.dev/mock/news",
                        method: "GET"
                      }
                    },
                    {
                      id: "finance",
                      name: "Finance API",
                      description: "Stock prices, market data, financial news",
                      endpoint: {
                        endpointUrl: "https://endpoint-3.workers.dev",
                        apiUrl: "https://endpoint-3.workers.dev/mock/finance",
                        method: "GET"
                      }
                    }
                  ],
                  defaultOption: "weather",
                  retries: 3
                },
                "Using the data retrieved, provide a helpful response to the user's question"
              ],
              provider: "openai"
            },
            endpointExample: {
              context: "Fetch data from external API",
              instructions: [
                {
                  type: "endpoint",
                  endpointUrl: "https://endpoint-1.your-subdomain.workers.dev",
                  apiUrl: "https://api.example.com/data",
                  method: "GET",
                  retries: 3,
                  retryDelay: 1e3,
                  timeout: 3e4,
                  description: "Fetch user data from external API"
                },
                "Process the fetched data using LLM"
              ],
              provider: "openai"
            },
            example: {
              context: "The quick brown fox jumps over the lazy dog.",
              instructions: [
                "Summarize this text in one sentence.",
                "Rewrite the summary to be more formal.",
                "Translate to Spanish."
              ],
              provider: "openai",
              model: "gpt-5-nano"
            },
            conditionalExample: {
              context: "Analyze this code: function test() { return true; }",
              instructions: [
                {
                  instruction: "Check if the code contains a function definition",
                  condition: {
                    evaluateAfterStep: 1,
                    expression: "result contains 'function'",
                    ifTrue: [1],
                    // Execute step 1 (index 1) if true
                    ifFalse: [2]
                    // Execute step 2 (index 2) if false
                  }
                },
                "Extract the function name",
                "List all parameters"
              ],
              provider: "openai",
              model: "gpt-5-nano"
            },
            anthropicExample: {
              context: "The quick brown fox jumps over the lazy dog.",
              instructions: [
                "Summarize this text in one sentence.",
                "Rewrite the summary to be more formal."
              ],
              provider: "anthropic",
              model: "claude-haiku-4-5"
            },
            legacyExample: {
              context: "The quick brown fox jumps over the lazy dog.",
              firstInstruction: "Summarize this text in one sentence.",
              secondInstruction: "Rewrite the summary to be more formal."
            }
          },
          "POST /batch": {
            description: "Create multiple workflow instances concurrently",
            body: {
              count: "number (1-20) - Number of workflow instances to create",
              context: "string - The initial context to process",
              instructions: "string[] | ConditionalInstruction[] - Array of instructions",
              provider: "string (optional) - AI provider: 'openai' or 'anthropic'",
              model: "string (optional) - Model name"
            },
            example: {
              count: 3,
              context: "Test concurrent processing",
              instructions: ["Process this", "Then process that"],
              provider: "openai"
            }
          },
          "GET /?instanceId=<id>": {
            description: "Get the status of an existing workflow instance"
          }
        },
        concurrency: {
          note: "Multiple workflow instances can run concurrently. Each POST creates a new isolated instance.",
          batchEndpoint: "Use POST /batch to create multiple instances at once (up to 20)."
        },
        providers: {
          openai: {
            defaultModel: "gpt-5-nano",
            models: ["gpt-5-nano", "gpt-4o-mini"],
            apiKeyEnv: "OPENAI_API_KEY"
          },
          anthropic: {
            defaultModel: "claude-haiku-4-5",
            models: ["claude-haiku-4-5"],
            apiKeyEnv: "ANTHROPIC_API_KEY"
          }
        }
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-WhCXnJ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-WhCXnJ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MyWorkflow,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
