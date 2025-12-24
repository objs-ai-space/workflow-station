import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

// Conditional instruction structure for if-else logic
type ConditionalInstruction = {
	instruction: string; // The instruction to execute
	condition?: {
		// Evaluate condition after this step completes
		evaluateAfterStep?: number; // Step number to evaluate condition against (1-indexed)
		expression: string; // Natural language condition, e.g., "result contains 'success'" or "result length is greater than 100"
		ifTrue?: number[]; // Step indices (0-indexed) to execute if condition is true
		ifFalse?: number[]; // Step indices (0-indexed) to execute if condition is false
		// If neither ifTrue nor ifFalse specified, continue sequentially
	};
};

// Endpoint instruction structure for external API calls
type EndpointInstruction = {
	type: "endpoint"; // Identifies this as an endpoint instruction
	endpointUrl: string; // URL of the endpoint worker (e.g., "https://endpoint-1.your-subdomain.workers.dev")
	apiUrl: string; // External API URL to call
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; // HTTP method (default: GET)
	headers?: Record<string, string>; // Custom headers
	body?: any; // Request body (for POST, PUT, PATCH)
	retries?: number; // Number of retry attempts (default: 3)
	retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
	timeout?: number; // Request timeout in milliseconds (default: 30000)
	description?: string; // Optional description of what this endpoint does
	condition?: {
		// Same conditional logic as ConditionalInstruction
		evaluateAfterStep?: number;
		expression: string;
		ifTrue?: number[];
		ifFalse?: number[];
	};
};

// Thread instruction structure for collecting results from multiple steps
// This allows LLM to see results from multiple previous steps, not just the immediately previous one
type ThreadInstruction = {
	type: "thread"; // Identifies this as a thread instruction
	collectFromSteps: number[]; // Step numbers (1-indexed) to collect results from
	outputFormat?: "json" | "markdown" | "numbered"; // How to format collected results (default: json)
	description?: string; // Optional description of what this thread collects
	completionCheck?: {
		// How to determine if thread is ready to output
		mode: "deterministic" | "llm"; // deterministic: check if all steps are done; llm: use LLM to evaluate
		expression?: string; // For LLM mode: natural language condition to evaluate if collection is complete
	};
	condition?: {
		// Same conditional logic as other instructions
		evaluateAfterStep?: number;
		expression: string;
		ifTrue?: number[];
		ifFalse?: number[];
	};
};

// Router instruction structure for LLM-driven dynamic endpoint selection
// This allows the LLM to choose which endpoint to call based on context analysis
type RouterInstruction = {
	type: "router"; // Identifies this as a router instruction
	description: string; // What this router step does
	evaluationPrompt: string; // Question for LLM to evaluate which option to choose
	options: Array<{
		id: string; // Unique identifier for this option (e.g., "weather", "news", "finance")
		name: string; // Human-readable name for display
		description: string; // Description for LLM to understand when to pick this option
		endpoint: {
			endpointUrl: string; // Which endpoint worker to use
			apiUrl: string; // The actual API/route to call
			method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; // HTTP method
			headers?: Record<string, string>; // Custom headers
			body?: any; // Request body for POST/PUT/PATCH
		};
	}>;
	defaultOption?: string; // ID of option to use if LLM can't decide
	retries?: number; // Number of retry attempts for the selected endpoint (default: 3)
	retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
	timeout?: number; // Request timeout in milliseconds (default: 30000)
	condition?: {
		// Same conditional logic as other instructions
		evaluateAfterStep?: number;
		expression: string;
		ifTrue?: number[];
		ifFalse?: number[];
	};
};

// User-defined params passed to your Workflow
type Params = {
	context: string; // The initial context to process
	instructions: (string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction)[]; // Array of instructions
	provider?: "openai" | "anthropic"; // AI provider (default: openai)
	model?: string; // Model name (default: gpt-5-nano for OpenAI, claude-haiku-4-5 for Anthropic)
	// Legacy support for backward compatibility
	firstInstruction?: string;
	secondInstruction?: string;
};

// Helper function to call OpenAI API - optimized for speed
async function callOpenAI(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	// GPT-5-nano only supports default temperature (1), not custom values
	const isGPT5Nano = model.includes("gpt-5-nano");
	
	// Pre-build request body for faster execution
	const requestBody: {
		model: string;
		messages: Array<{ role: string; content: string }>;
		temperature?: number;
	} = {
		model,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
	};

	// Only include temperature for models that support it
	if (!isGPT5Nano) {
		requestBody.temperature = 0.7;
	}

	// Make API call immediately - no delays
	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${error}`);
	}

	// Parse response immediately
	const data = await response.json<{
		choices: Array<{ message: { content: string } }>;
	}>();

	// Return result immediately - no post-processing delays
	return data.choices[0]?.message?.content || "";
}

// Helper function to call Anthropic API
async function callAnthropic(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	// Anthropic Messages API format
	const requestBody = {
		model,
		max_tokens: 4096,
		system: systemPrompt,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: userPrompt }],
			},
		],
	};

	// Make API call immediately - no delays
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic API error: ${response.status} - ${error}`);
	}

	// Parse response immediately
	const data = await response.json<{
		content: Array<{ type: string; text: string }>;
	}>();

	// Extract text from Anthropic response format
	return data.content[0]?.text || "";
}

// Unified LLM call function that routes to the correct provider
async function callLLM(
	provider: "openai" | "anthropic",
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	if (provider === "anthropic") {
		return callAnthropic(apiKey, model, systemPrompt, userPrompt);
	}
	return callOpenAI(apiKey, model, systemPrompt, userPrompt);
}

// Evaluate a condition using LLM
async function evaluateCondition(
	provider: "openai" | "anthropic",
	apiKey: string,
	model: string,
	conditionExpression: string,
	stepResult: string,
	stepNumber: number,
): Promise<boolean> {
	const systemPrompt = "You are a logical evaluator. Evaluate the given condition and respond with ONLY 'true' or 'false' (lowercase, no punctuation).";
	const userPrompt = `Evaluate this condition: "${conditionExpression}"

Step ${stepNumber} result:
${stepResult}

Respond with only 'true' or 'false'.`;

	const response = await callLLM(provider, apiKey, model, systemPrompt, userPrompt);
	const normalized = response.trim().toLowerCase();
	
	// Parse response - look for true/false
	if (normalized.includes("true") && !normalized.includes("false")) {
		return true;
	}
	if (normalized.includes("false")) {
		return false;
	}
	
	// Default to false if unclear
	console.warn(`⚠️ Unclear condition evaluation result: "${response}", defaulting to false`);
	return false;
}

// Call an endpoint worker to make an external API call
async function callEndpoint(
	endpointUrl: string,
	apiUrl: string,
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
	headers?: Record<string, string>,
	body?: any,
	retries: number = 3,
	retryDelay: number = 1000,
	timeout: number = 30000,
): Promise<string> {
	const requestBody = {
		url: apiUrl,
		method,
		headers: headers || {},
		body,
		retries,
		retryDelay,
		timeout,
	};

	const response = await fetch(endpointUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Endpoint worker error: ${response.status} - ${error}`);
	}

	const result = await response.json<{
		success: boolean;
		status: number;
		statusText: string;
		headers: Record<string, string>;
		body: any;
		attempts: number;
		duration: number;
		error?: string;
	}>();

	if (!result.success) {
		throw new Error(
			`API call failed after ${result.attempts} attempts: ${result.error || result.statusText}`
		);
	}

	// Convert response body to string for consistency with LLM results
	if (typeof result.body === "string") {
		return result.body;
	}
	return JSON.stringify(result.body);
}

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { 
			context, 
			instructions, 
			provider = "openai",
			model, 
			firstInstruction, 
			secondInstruction 
		} = event.payload;

		// Determine default model based on provider
		const defaultModel = provider === "anthropic" ? "claude-haiku-4-5" : "gpt-5-nano";
		const selectedModel = model || defaultModel;

		// Get API key based on provider
		const apiKey = provider === "anthropic" 
			? this.env.ANTHROPIC_API_KEY 
			: this.env.OPENAI_API_KEY;

		if (!apiKey) {
			const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
			throw new Error(
				`${keyName} environment variable is required. ` +
				`For local development, ensure .dev.vars file exists in the project root with ${keyName} set. ` +
				`For production, set it using: wrangler secret put ${keyName}`
			);
		}

		// Support both new format (instructions array) and legacy format (firstInstruction/secondInstruction)
		const rawInstructions = instructions && instructions.length > 0 
			? instructions 
			: (firstInstruction && secondInstruction ? [firstInstruction, secondInstruction] : []);

		if (rawInstructions.length === 0) {
			throw new Error("At least one instruction is required");
		}

		// Normalize instructions to a unified format
		type NormalizedInstruction = ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction;
		const normalizedInstructions: NormalizedInstruction[] = rawInstructions.map((inst) => {
			if (typeof inst === "string") {
				return { instruction: inst };
			}
			// Check if it's an endpoint instruction
			if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "endpoint") {
				return inst as EndpointInstruction;
			}
			// Check if it's a thread instruction
			if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "thread") {
				return inst as ThreadInstruction;
			}
			// Check if it's a router instruction
			if (typeof inst === "object" && inst !== null && "type" in inst && inst.type === "router") {
				return inst as RouterInstruction;
			}
			return inst as ConditionalInstruction;
		});

		// Initialize result object with error and log tracking
		let currentResult: {
			originalContext: string;
			steps: Array<{
				stepNumber: number;
				instruction: string;
				result: string;
				processedAt: string;
				duration: number; // Duration in seconds
				conditionEvaluated?: boolean; // Whether condition was evaluated
				conditionResult?: boolean; // Result of condition evaluation
				branchTaken?: "true" | "false" | "sequential"; // Which branch was taken
				error?: string; // Error message if step failed
				errorType?: string; // Type of error (e.g., "router", "endpoint", "llm")
			}>;
			finalizedAt: string;
			errors?: Array<{
				stepNumber: number;
				stepIndex: number;
				error: string;
				errorType: string;
				timestamp: string;
				context?: string;
			}>;
			logs?: Array<{
				level: "info" | "warn" | "error" | "debug";
				message: string;
				timestamp: string;
				stepNumber?: number;
				data?: unknown;
			}>;
		} = {
			originalContext: context,
			steps: [],
			finalizedAt: "",
			errors: [],
			logs: [],
		};
		
		// Helper to add log entry
		const addLog = (level: "info" | "warn" | "error" | "debug", message: string, stepNumber?: number, data?: unknown) => {
			currentResult.logs?.push({
				level,
				message,
				timestamp: new Date().toISOString(),
				stepNumber,
				data,
			});
		};
		
		// Helper to add error entry
		const addError = (stepNumber: number, stepIndex: number, error: string, errorType: string, context?: string) => {
			currentResult.errors?.push({
				stepNumber,
				stepIndex,
				error,
				errorType,
				timestamp: new Date().toISOString(),
				context,
			});
		};
		
		addLog("info", `Starting workflow with ${normalizedInstructions.length} instructions`, undefined, { provider, model: selectedModel });

		// Track which steps have been executed to avoid infinite loops
		const executedSteps = new Set<number>();
		// Queue of step indices to execute
		const executionQueue: number[] = [];
		
		// Build set of branch target steps (steps that are only reachable via ifTrue/ifFalse)
		// These steps should NOT auto-continue to the next step when they complete
		const branchTargetSteps = new Set<number>();
		for (const inst of normalizedInstructions) {
			if ("condition" in inst && inst.condition) {
				if (inst.condition.ifTrue) {
					inst.condition.ifTrue.forEach(idx => branchTargetSteps.add(idx));
				}
				if (inst.condition.ifFalse) {
					inst.condition.ifFalse.forEach(idx => branchTargetSteps.add(idx));
				}
			}
		}
		
		// Initialize queue with first step
		executionQueue.push(0);

		// Process instructions with conditional branching support
		while (executionQueue.length > 0) {
			const stepIndex = executionQueue.shift()!;
			
			// Skip if already executed (prevents infinite loops)
			if (executedSteps.has(stepIndex)) {
				continue;
			}
			
			// Skip if out of bounds
			if (stepIndex < 0 || stepIndex >= normalizedInstructions.length) {
				continue;
			}

			executedSteps.add(stepIndex);
			const instructionConfig = normalizedInstructions[stepIndex];
			const stepNumber = currentResult.steps.length + 1;
			const isFirstStep = currentResult.steps.length === 0;
			
			// Get previous result immediately - no delay
			const previousResult = currentResult.steps.length > 0 
				? currentResult.steps[currentResult.steps.length - 1].result 
				: context;

			// Check instruction type
			const isEndpointInstruction = "type" in instructionConfig && instructionConfig.type === "endpoint";
			const isThreadInstruction = "type" in instructionConfig && instructionConfig.type === "thread";
			const isRouterInstruction = "type" in instructionConfig && instructionConfig.type === "router";
			
			const instructionType = isRouterInstruction ? "router" : isThreadInstruction ? "thread" : isEndpointInstruction ? "endpoint" : "llm";
			addLog("info", `Starting step ${stepNumber} (${instructionType})`, stepNumber);
			
			// Start next step immediately after previous completes
			const stepResult = await step.do(
				`process-step-${stepNumber}`,
				{
					retries: {
						limit: 3,
						delay: "1 second", // Reduced from 2s for faster retries
						backoff: "exponential",
					},
					timeout: "5 minutes",
				},
				async () => {
					// Record start time for this step (inside callback for accurate timing)
					const stepStartTime = Date.now();

					let result: string;
					let instruction: string;

					if (isThreadInstruction) {
						// Handle thread instruction - collect results from specified steps
						const threadInst = instructionConfig as ThreadInstruction;
						instruction = threadInst.description || `Collect results from steps: ${threadInst.collectFromSteps.join(", ")}`;
						
						// Collect results from specified steps (1-indexed step numbers)
						const collectedResults: Array<{stepNumber: number; instruction: string; result: string}> = [];
						const missingSteps: number[] = [];
						
						for (const stepNum of threadInst.collectFromSteps) {
							const stepData = currentResult.steps.find(s => s.stepNumber === stepNum);
							if (stepData) {
								collectedResults.push({
									stepNumber: stepData.stepNumber,
									instruction: stepData.instruction,
									result: stepData.result,
								});
							} else {
								missingSteps.push(stepNum);
							}
						}
						
						// Check completion based on mode
						const completionCheck = threadInst.completionCheck || { mode: "deterministic" as const };
						let isComplete = false;
						
						if (completionCheck.mode === "deterministic") {
							// Deterministic: all specified steps must be complete
							isComplete = missingSteps.length === 0;
						} else if (completionCheck.mode === "llm" && completionCheck.expression) {
							// LLM-based: use LLM to evaluate if collection is complete
							const collectionSummary = collectedResults.map(r => 
								`Step ${r.stepNumber}: ${r.result.substring(0, 200)}...`
							).join("\n");
							
							isComplete = await evaluateCondition(
								provider,
								apiKey,
								selectedModel,
								completionCheck.expression,
								collectionSummary,
								stepNumber,
							);
						}
						
						if (!isComplete && missingSteps.length > 0) {
							throw new Error(`Thread incomplete: missing results from steps ${missingSteps.join(", ")}. ` +
								`Ensure these steps execute before this thread step.`);
						}
						
						// Format collected results based on outputFormat
						const outputFormat = threadInst.outputFormat || "json";
						
						if (outputFormat === "json") {
							result = JSON.stringify({
								collectedSteps: threadInst.collectFromSteps,
								results: collectedResults.map(r => ({
									step: r.stepNumber,
									instruction: r.instruction,
									result: r.result,
								})),
							}, null, 2);
						} else if (outputFormat === "markdown") {
							result = collectedResults.map(r => 
								`## Step ${r.stepNumber}\n**Instruction:** ${r.instruction}\n\n**Result:**\n${r.result}`
							).join("\n\n---\n\n");
						} else if (outputFormat === "numbered") {
							result = collectedResults.map((r, idx) => 
								`${idx + 1}. [Step ${r.stepNumber}] ${r.result}`
							).join("\n\n");
						} else {
							result = JSON.stringify(collectedResults);
						}
						
					} else if (isRouterInstruction) {
						// Handle router instruction - LLM decides which endpoint to call
						const routerInst = instructionConfig as RouterInstruction;
						instruction = routerInst.description || `Router: ${routerInst.evaluationPrompt}`;
						
						addLog("info", `Router step started with ${routerInst.options.length} options`, stepNumber, {
							options: routerInst.options.map(o => o.id),
							defaultOption: routerInst.defaultOption,
						});
						
						// Build the options list for LLM
						const optionsText = routerInst.options.map((opt, idx) => 
							`${idx + 1}. ${opt.id}: ${opt.description}`
						).join("\n");
						
						// Build the selection prompt
						const selectionPrompt = `You are evaluating which data source or API to query based on the context.

CONTEXT/PREVIOUS RESULT:
${previousResult}

AVAILABLE OPTIONS:
${optionsText}

TASK: ${routerInst.evaluationPrompt}

IMPORTANT: Respond with ONLY the option ID (e.g., "${routerInst.options[0]?.id || 'option1'}"). 
Do not include any other text, explanation, or punctuation. Just the ID.`;
						
						addLog("debug", "Sending selection prompt to LLM", stepNumber, { promptLength: selectionPrompt.length });
						
						// Ask LLM to select an option
						let selectedOptionId: string;
						try {
							selectedOptionId = await callLLM(
								provider,
								apiKey,
								selectedModel,
								"You are a decision-making assistant. Your job is to analyze context and select the most appropriate option. Respond with ONLY the option ID, nothing else.",
								selectionPrompt,
							);
							addLog("info", `LLM returned selection: "${selectedOptionId.trim()}"`, stepNumber);
						} catch (llmError: unknown) {
							const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
							addLog("error", `LLM selection failed: ${errMsg}`, stepNumber);
							addError(stepNumber, stepIndex, errMsg, "router-llm", "LLM failed to select option");
							throw new Error(`Router LLM selection failed: ${errMsg}`);
						}
						
						// Clean up the response (trim whitespace, remove quotes if present)
						const cleanedSelection = selectedOptionId.trim().toLowerCase().replace(/['"]/g, '');
						
						// Find the selected option
						let selectedOption = routerInst.options.find(
							opt => opt.id.toLowerCase() === cleanedSelection
						);
						
						// If not found by exact match, try partial match
						if (!selectedOption) {
							addLog("warn", `Exact match not found for "${cleanedSelection}", trying partial match`, stepNumber);
							selectedOption = routerInst.options.find(
								opt => cleanedSelection.includes(opt.id.toLowerCase()) || opt.id.toLowerCase().includes(cleanedSelection)
							);
						}
						
						// If still not found, use default or first option
						if (!selectedOption) {
							addLog("warn", `No match found, falling back to default option: ${routerInst.defaultOption || 'first option'}`, stepNumber);
							if (routerInst.defaultOption) {
								selectedOption = routerInst.options.find(opt => opt.id === routerInst.defaultOption);
							}
							if (!selectedOption) {
								selectedOption = routerInst.options[0]; // Fallback to first option
							}
						}
						
						if (!selectedOption) {
							const errMsg = `Router could not select an option. LLM returned: "${selectedOptionId}"`;
							addLog("error", errMsg, stepNumber);
							addError(stepNumber, stepIndex, errMsg, "router-selection", "No valid option could be selected");
							throw new Error(errMsg);
						}
						
						addLog("info", `Selected option: ${selectedOption.id} (${selectedOption.name})`, stepNumber, {
							endpoint: selectedOption.endpoint.apiUrl,
						});
						
						// Call the selected endpoint
						let endpointResult: string;
						try {
							const apiUrl = selectedOption.endpoint.apiUrl;
							const endpointUrl = selectedOption.endpoint.endpointUrl;
							const method = selectedOption.endpoint.method || "GET";
							
							// Check if this is a mock endpoint (apiUrl contains /mock/ path on the endpoint worker)
							// Mock endpoints should be called directly to avoid Cloudflare subrequest limitations
							const isMockEndpoint = apiUrl.includes("/mock/");
							
							if (isMockEndpoint) {
								addLog("info", `Calling mock endpoint directly: ${apiUrl}`, stepNumber);
								
								// Call mock endpoint directly
								const controller = new AbortController();
								const timeoutId = setTimeout(() => controller.abort(), routerInst.timeout || 30000);
								
								const fetchOptions: RequestInit = {
									method,
									headers: {
										"Content-Type": "application/json",
										...selectedOption.endpoint.headers,
									},
									signal: controller.signal,
								};
								
								if (selectedOption.endpoint.body && ["POST", "PUT", "PATCH"].includes(method)) {
									fetchOptions.body = typeof selectedOption.endpoint.body === "string" 
										? selectedOption.endpoint.body 
										: JSON.stringify(selectedOption.endpoint.body);
								}
								
								const response = await fetch(apiUrl, fetchOptions);
								clearTimeout(timeoutId);
								
								if (!response.ok) {
									throw new Error(`Mock endpoint returned ${response.status}: ${response.statusText}`);
								}
								
								const responseData = await response.json();
								endpointResult = JSON.stringify(responseData);
							} else {
								// Use proxy for external APIs
								endpointResult = await callEndpoint(
									endpointUrl,
									apiUrl,
									method,
									selectedOption.endpoint.headers,
									selectedOption.endpoint.body,
									routerInst.retries || 3,
									routerInst.retryDelay || 1000,
									routerInst.timeout || 30000,
								);
							}
							addLog("info", `Endpoint call successful for ${selectedOption.id}`, stepNumber);
						} catch (endpointError: unknown) {
							const errMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
							addLog("error", `Endpoint call failed: ${errMsg}`, stepNumber, {
								endpoint: selectedOption.endpoint.apiUrl,
							});
							addError(stepNumber, stepIndex, errMsg, "router-endpoint", `Endpoint ${selectedOption.endpoint.apiUrl} failed`);
							throw new Error(`Router endpoint call failed: ${errMsg}`);
						}
						
						// Format the result to include which option was selected
						result = JSON.stringify({
							routerDecision: {
								selectedOption: selectedOption.id,
								selectedName: selectedOption.name,
								llmResponse: selectedOptionId.trim(),
								endpoint: selectedOption.endpoint.apiUrl,
							},
							data: JSON.parse(endpointResult),
						}, null, 2);
						
					} else if (isEndpointInstruction) {
						// Handle endpoint instruction
						const endpointInst = instructionConfig as EndpointInstruction;
						instruction = endpointInst.description || `Call ${endpointInst.apiUrl}`;
						
						addLog("info", `Endpoint step calling ${endpointInst.apiUrl}`, stepNumber, {
							method: endpointInst.method || "GET",
							retries: endpointInst.retries || 3,
						});
						
						// Call endpoint worker
						try {
							result = await callEndpoint(
								endpointInst.endpointUrl,
								endpointInst.apiUrl,
								endpointInst.method || "GET",
								endpointInst.headers,
								endpointInst.body,
								endpointInst.retries || 3,
								endpointInst.retryDelay || 1000,
								endpointInst.timeout || 30000,
							);
							addLog("info", `Endpoint call successful`, stepNumber);
						} catch (endpointError: unknown) {
							const errMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
							addLog("error", `Endpoint call failed: ${errMsg}`, stepNumber);
							addError(stepNumber, stepIndex, errMsg, "endpoint", `Endpoint ${endpointInst.apiUrl} failed`);
							throw endpointError;
						}
					} else {
						// Handle LLM instruction
						const llmInst = instructionConfig as ConditionalInstruction;
						instruction = llmInst.instruction;

						// Pre-compute prompts for faster execution
						const systemPrompt = isFirstStep
							? "You are a helpful assistant that processes and analyzes content."
							: "You are a helpful assistant that processes and refines content based on previous results.";

						const userPrompt = isFirstStep
							? `${instruction}\n\nContext:\n${previousResult}`
							: `${instruction}\n\nPrevious Result:\n${previousResult}`;

						// Call LLM API immediately - no delays (routes to OpenAI or Anthropic)
						result = await callLLM(provider, apiKey, selectedModel, systemPrompt, userPrompt);
					}

					// Calculate duration (time spent in this step)
					const stepEndTime = Date.now();
					const duration = (stepEndTime - stepStartTime) / 1000; // Convert to seconds

					// Return immediately - step.do will store this and make it available for next step
					return {
						stepNumber,
						instruction,
						result,
						processedAt: new Date().toISOString(),
						duration,
					};
				},
			);

			// Evaluate condition if present (works for both LLM and endpoint instructions)
			let conditionResult: boolean | undefined;
			let branchTaken: "true" | "false" | "sequential" = "sequential";
			
			if ("condition" in instructionConfig && instructionConfig.condition) {
				const condition = instructionConfig.condition;
				
				// Determine which step result to evaluate against
				// If evaluateAfterStep is specified, use that step's result; otherwise use current step
				let resultToEvaluate: string;
				let stepNumberToEvaluate: number;
				
				if (condition.evaluateAfterStep !== undefined) {
					// Find the step result to evaluate against (1-indexed step number)
					const stepToEvaluate = currentResult.steps.find(s => s.stepNumber === condition.evaluateAfterStep);
					if (!stepToEvaluate) {
						throw new Error(`Cannot evaluate condition: step ${condition.evaluateAfterStep} not found`);
					}
					resultToEvaluate = stepToEvaluate.result;
					stepNumberToEvaluate = condition.evaluateAfterStep;
				} else {
					// Default: evaluate against current step result
					resultToEvaluate = stepResult.result;
					stepNumberToEvaluate = stepNumber;
				}
				
				// Evaluate condition using LLM
				conditionResult = await step.do(
					`evaluate-condition-${stepNumber}`,
					{
						retries: {
							limit: 2,
							delay: "1 second",
							backoff: "exponential",
						},
						timeout: "2 minutes",
					},
					async () => {
						return await evaluateCondition(
							provider,
							apiKey,
							selectedModel,
							condition.expression,
							resultToEvaluate,
							stepNumberToEvaluate,
						);
					},
				);

				// Determine which branch to take
				if (conditionResult) {
					branchTaken = "true";
					// Add true path steps to queue
					if (condition.ifTrue && condition.ifTrue.length > 0) {
						executionQueue.push(...condition.ifTrue);
					} else {
						// If no true path specified, continue sequentially
						if (stepIndex + 1 < normalizedInstructions.length) {
							executionQueue.push(stepIndex + 1);
						}
					}
				} else {
					branchTaken = "false";
					// Add false path steps to queue
					if (condition.ifFalse && condition.ifFalse.length > 0) {
						executionQueue.push(...condition.ifFalse);
					} else {
						// If no false path specified, continue sequentially
						if (stepIndex + 1 < normalizedInstructions.length) {
							executionQueue.push(stepIndex + 1);
						}
					}
				}
			} else {
				// No condition - continue sequentially ONLY if this step is NOT a branch target
				// Branch target steps (those in ifTrue/ifFalse) should terminate their branch
				if (!branchTargetSteps.has(stepIndex) && stepIndex + 1 < normalizedInstructions.length) {
					executionQueue.push(stepIndex + 1);
				}
			}

			// Store result with condition metadata
			currentResult.steps.push({
				...stepResult,
				conditionEvaluated: "condition" in instructionConfig && instructionConfig.condition !== undefined,
				conditionResult,
				branchTaken,
			});
		}

		// Mark as finalized
		currentResult.finalizedAt = new Date().toISOString();

		// Return the final result
		return currentResult;
	}
}
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		// Handle CORS preflight
		if (req.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		if (url.pathname.startsWith("/favicon")) {
			return Response.json({}, { status: 404 });
		}

		// Get the status of an existing instance
		// GET /?instanceId=<id here>
		const instanceId = url.searchParams.get("instanceId");
		if (instanceId) {
			try {
				const instance = await env.MY_WORKFLOW.get(instanceId);
				const status = await instance.status();
				return Response.json(
					{
						instanceId,
						status,
					},
					{
						headers: {
							"Access-Control-Allow-Origin": "*",
						},
					},
				);
			} catch (error) {
				return Response.json(
					{ error: `Instance not found: ${instanceId}` },
					{ status: 404 },
				);
			}
		}

		// POST /batch - Create multiple workflow instances concurrently
		if (url.pathname === "/batch" && req.method === "POST") {
			try {
				const body = await req.json<{
					count: number;
					context: string;
					instructions: string[] | ConditionalInstruction[];
					provider?: "openai" | "anthropic";
					model?: string;
				}>();

				if (!body.context) {
					return Response.json(
						{ error: "Missing required field: context" },
						{ status: 400 },
					);
				}

				if (!body.count || body.count < 1 || body.count > 20) {
					return Response.json(
						{ error: "Count must be between 1 and 20" },
						{ status: 400 },
					);
				}

				const hasInstructions = body.instructions && Array.isArray(body.instructions) && body.instructions.length > 0;
				if (!hasInstructions) {
					return Response.json(
						{ error: "Missing required field: instructions" },
						{ status: 400 },
					);
				}

				// Create multiple workflow instances concurrently
				const instances = await Promise.all(
					Array.from({ length: body.count }, () =>
						env.MY_WORKFLOW.create({
							params: {
								context: body.context,
								instructions: body.instructions,
								provider: body.provider || "openai",
								model: body.model || undefined,
							},
						})
					)
				);

				const results = await Promise.all(
					instances.map(async (instance) => {
						const status = await instance.status();
						return {
							instanceId: instance.id,
							status,
						};
					})
				);

				return Response.json(
					{
						count: results.length,
						instances: results,
						message: `Successfully created ${results.length} workflow instance(s)`,
					},
					{
						headers: {
							"Access-Control-Allow-Origin": "*",
						},
					},
				);
			} catch (error) {
				return Response.json(
					{
						error: error instanceof Error ? error.message : "Failed to create batch workflows",
					},
					{ status: 500 },
				);
			}
		}

		// POST / - Create a new workflow instance with context and instructions
		if (req.method === "POST") {
			try {
				const body = await req.json<Params>();

				// Validate required fields
				if (!body.context) {
					return Response.json(
						{
							error: "Missing required field: context",
						},
						{ status: 400 },
					);
				}

				// Support both new format (instructions array) and legacy format
				const hasInstructions = body.instructions && Array.isArray(body.instructions) && body.instructions.length > 0;
				const hasLegacyInstructions = body.firstInstruction && body.secondInstruction;

				if (!hasInstructions && !hasLegacyInstructions) {
					return Response.json(
						{
							error: "Missing required fields: either 'instructions' array or 'firstInstruction' and 'secondInstruction'",
						},
						{ status: 400 },
					);
				}

				// Validate conditional instructions if provided
				if (hasInstructions && body.instructions.length > 0) {
					for (let i = 0; i < body.instructions.length; i++) {
						const inst = body.instructions[i];
						if (typeof inst === "object" && inst !== null && "condition" in inst) {
							const cond = (inst as any).condition;
							if (cond && cond.ifTrue) {
								for (const idx of cond.ifTrue) {
									if (idx < 0 || idx >= body.instructions.length) {
										return Response.json(
											{ error: `Conditional instruction ${i}: ifTrue index ${idx} is out of bounds` },
											{ status: 400 },
										);
									}
								}
							}
							if (cond && cond.ifFalse) {
								for (const idx of cond.ifFalse) {
									if (idx < 0 || idx >= body.instructions.length) {
										return Response.json(
											{ error: `Conditional instruction ${i}: ifFalse index ${idx} is out of bounds` },
											{ status: 400 },
										);
									}
								}
							}
						}
					}
				}

				// Create workflow instance with params
				const instance = await env.MY_WORKFLOW.create({
					params: {
						context: body.context,
						instructions: body.instructions || undefined,
						provider: body.provider || "openai",
						model: body.model || undefined, // Will use default based on provider
						firstInstruction: body.firstInstruction,
						secondInstruction: body.secondInstruction,
					},
				});

				const status = await instance.status();

				return Response.json(
					{
						instanceId: instance.id,
						status,
						message: "Workflow started successfully",
					},
					{
						headers: {
							"Access-Control-Allow-Origin": "*",
						},
					},
				);
			} catch (error) {
				return Response.json(
					{
						error: error instanceof Error ? error.message : "Failed to create workflow",
					},
					{ status: 500 },
				);
			}
		}

		// GET / - Show usage instructions
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
							secondInstruction: "string (legacy) - Instruction for the second LLM call",
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
									description: "Fetch users data",
								},
								{
									type: "endpoint",
									endpointUrl: "https://endpoint-2.workers.dev",
									apiUrl: "https://api.example.com/products",
									method: "GET",
									description: "Fetch products data",
								},
								{
									type: "endpoint",
									endpointUrl: "https://endpoint-3.workers.dev",
									apiUrl: "https://api.example.com/orders",
									method: "GET",
									description: "Fetch orders data",
								},
								{
									type: "thread",
									collectFromSteps: [1, 2, 3],
									outputFormat: "json",
									description: "Collect all API responses",
									completionCheck: {
										mode: "deterministic",
									},
								},
								"Analyze the collected data and provide insights on user behavior, popular products, and order patterns",
							],
							provider: "openai",
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
												method: "GET",
											},
										},
										{
											id: "news",
											name: "News API",
											description: "Current events, trending topics, news articles",
											endpoint: {
												endpointUrl: "https://endpoint-2.workers.dev",
												apiUrl: "https://endpoint-2.workers.dev/mock/news",
												method: "GET",
											},
										},
										{
											id: "finance",
											name: "Finance API",
											description: "Stock prices, market data, financial news",
											endpoint: {
												endpointUrl: "https://endpoint-3.workers.dev",
												apiUrl: "https://endpoint-3.workers.dev/mock/finance",
												method: "GET",
											},
										},
									],
									defaultOption: "weather",
									retries: 3,
								},
								"Using the data retrieved, provide a helpful response to the user's question",
							],
							provider: "openai",
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
									retryDelay: 1000,
									timeout: 30000,
									description: "Fetch user data from external API",
								},
								"Process the fetched data using LLM",
							],
							provider: "openai",
						},
						example: {
							context: "The quick brown fox jumps over the lazy dog.",
							instructions: [
								"Summarize this text in one sentence.",
								"Rewrite the summary to be more formal.",
								"Translate to Spanish.",
							],
							provider: "openai",
							model: "gpt-5-nano",
						},
						conditionalExample: {
							context: "Analyze this code: function test() { return true; }",
							instructions: [
								{
									instruction: "Check if the code contains a function definition",
									condition: {
										evaluateAfterStep: 1,
										expression: "result contains 'function'",
										ifTrue: [1], // Execute step 1 (index 1) if true
										ifFalse: [2], // Execute step 2 (index 2) if false
									},
								},
								"Extract the function name",
								"List all parameters",
							],
							provider: "openai",
							model: "gpt-5-nano",
						},
						anthropicExample: {
							context: "The quick brown fox jumps over the lazy dog.",
							instructions: [
								"Summarize this text in one sentence.",
								"Rewrite the summary to be more formal.",
							],
							provider: "anthropic",
							model: "claude-haiku-4-5",
						},
						legacyExample: {
							context: "The quick brown fox jumps over the lazy dog.",
							firstInstruction: "Summarize this text in one sentence.",
							secondInstruction: "Rewrite the summary to be more formal.",
						},
					},
					"POST /batch": {
						description: "Create multiple workflow instances concurrently",
						body: {
							count: "number (1-20) - Number of workflow instances to create",
							context: "string - The initial context to process",
							instructions: "string[] | ConditionalInstruction[] - Array of instructions",
							provider: "string (optional) - AI provider: 'openai' or 'anthropic'",
							model: "string (optional) - Model name",
						},
						example: {
							count: 3,
							context: "Test concurrent processing",
							instructions: ["Process this", "Then process that"],
							provider: "openai",
						},
					},
					"GET /?instanceId=<id>": {
						description: "Get the status of an existing workflow instance",
					},
				},
				concurrency: {
					note: "Multiple workflow instances can run concurrently. Each POST creates a new isolated instance.",
					batchEndpoint: "Use POST /batch to create multiple instances at once (up to 20).",
				},
				providers: {
					openai: {
						defaultModel: "gpt-5-nano",
						models: ["gpt-5-nano", "gpt-4o-mini"],
						apiKeyEnv: "OPENAI_API_KEY",
					},
					anthropic: {
						defaultModel: "claude-haiku-4-5",
						models: ["claude-haiku-4-5"],
						apiKeyEnv: "ANTHROPIC_API_KEY",
					},
				},
			},
			{
				headers: {
					"Access-Control-Allow-Origin": "*",
				},
			},
		);
	},
};
