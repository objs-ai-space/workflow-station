// index.ts - Main entry point for the Cloudflare Workflow engine

import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

// Import types
import type {
	Params,
	NormalizedInstruction,
	WorkflowResult,
	StepContext,
	ConditionalInstruction,
	EndpointInstruction,
	ThreadInstruction,
	RouterInstruction,
	AgentInstruction,
} from "./types";

// Import step handlers
import { executeStep, getStepType } from "./steps";

// Import condition evaluation
import { evaluateCondition } from "./utils/condition";

// Re-export types for external use
export type {
	Params,
	NormalizedInstruction,
	WorkflowResult,
	StepContext,
	ConditionalInstruction,
	EndpointInstruction,
	ThreadInstruction,
	RouterInstruction,
	AgentInstruction,
};

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const {
			context,
			instructions,
			provider = "openai",
			model,
			firstInstruction,
			secondInstruction,
		} = event.payload;

		// Determine default model based on provider
		const defaultModel =
			provider === "anthropic" ? "claude-haiku-4-5" : "gpt-5-nano";
		const selectedModel = model || defaultModel;

		// Get API key based on provider
		const apiKey =
			provider === "anthropic"
				? this.env.ANTHROPIC_API_KEY
				: this.env.OPENAI_API_KEY;

		if (!apiKey) {
			const keyName =
				provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
			throw new Error(
				`${keyName} environment variable is required. ` +
					`For local development, ensure .dev.vars file exists in the project root with ${keyName} set. ` +
					`For production, set it using: wrangler secret put ${keyName}`,
			);
		}

		// Support both new format (instructions array) and legacy format (firstInstruction/secondInstruction)
		const rawInstructions =
			instructions && instructions.length > 0
				? instructions
				: firstInstruction && secondInstruction
					? [firstInstruction, secondInstruction]
					: [];

		if (rawInstructions.length === 0) {
			throw new Error("At least one instruction is required");
		}

		// Normalize instructions to a unified format
		const normalizedInstructions: NormalizedInstruction[] = rawInstructions.map(
			(inst) => {
				if (typeof inst === "string") {
					return { instruction: inst };
				}
				// Check if it's an endpoint instruction
				if (
					typeof inst === "object" &&
					inst !== null &&
					"type" in inst &&
					inst.type === "endpoint"
				) {
					return inst as EndpointInstruction;
				}
				// Check if it's a thread instruction
				if (
					typeof inst === "object" &&
					inst !== null &&
					"type" in inst &&
					inst.type === "thread"
				) {
					return inst as ThreadInstruction;
				}
				// Check if it's a router instruction
				if (
					typeof inst === "object" &&
					inst !== null &&
					"type" in inst &&
					inst.type === "router"
				) {
					return inst as RouterInstruction;
				}
				// Check if it's an agent instruction
				if (
					typeof inst === "object" &&
					inst !== null &&
					"type" in inst &&
					inst.type === "agent"
				) {
					return inst as AgentInstruction;
				}
				return inst as ConditionalInstruction;
			},
		);

		// Initialize result object with error and log tracking
		const currentResult: WorkflowResult = {
			originalContext: context,
			steps: [],
			finalizedAt: "",
			errors: [],
			logs: [],
		};

		// Helper to add log entry
		const addLog = (
			level: "info" | "warn" | "error" | "debug",
			message: string,
			stepNumber?: number,
			data?: unknown,
		) => {
			currentResult.logs?.push({
				level,
				message,
				timestamp: new Date().toISOString(),
				stepNumber,
				data,
			});
		};

		// Helper to add error entry
		const addError = (
			stepNumber: number,
			stepIndex: number,
			error: string,
			errorType: string,
			errorContext?: string,
		) => {
			currentResult.errors?.push({
				stepNumber,
				stepIndex,
				error,
				errorType,
				timestamp: new Date().toISOString(),
				context: errorContext,
			});
		};

		addLog(
			"info",
			`Starting workflow with ${normalizedInstructions.length} instructions`,
			undefined,
			{ provider, model: selectedModel },
		);

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
					inst.condition.ifTrue.forEach((idx) => branchTargetSteps.add(idx));
				}
				if (inst.condition.ifFalse) {
					inst.condition.ifFalse.forEach((idx) => branchTargetSteps.add(idx));
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
			const previousResult =
				currentResult.steps.length > 0
					? currentResult.steps[currentResult.steps.length - 1].result
					: context;

			// Get instruction type for logging
			const instructionType = getStepType(instructionConfig);
			addLog("info", `Starting step ${stepNumber} (${instructionType})`, stepNumber);

			// Build step context for handlers
			const stepContext: StepContext = {
				provider,
				apiKey,
				model: selectedModel,
				previousResult,
				isFirstStep,
				stepNumber,
				stepIndex,
				currentResult,
				addLog,
				addError,
			};

			// Start next step immediately after previous completes
			const stepResult = await step.do(
				`process-step-${stepNumber}`,
				{
					retries: {
						limit: 3,
						delay: "1 second",
						backoff: "exponential",
					},
					timeout: "5 minutes",
				},
				async () => {
					// Record start time for this step (inside callback for accurate timing)
					const stepStartTime = Date.now();

					// Execute the step using the appropriate handler
					const { instruction, result } = await executeStep(
						instructionConfig,
						stepContext,
					);

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
					const stepToEvaluate = currentResult.steps.find(
						(s) => s.stepNumber === condition.evaluateAfterStep,
					);
					if (!stepToEvaluate) {
						throw new Error(
							`Cannot evaluate condition: step ${condition.evaluateAfterStep} not found`,
						);
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
				if (
					!branchTargetSteps.has(stepIndex) &&
					stepIndex + 1 < normalizedInstructions.length
				) {
					executionQueue.push(stepIndex + 1);
				}
			}

			// Store result with condition metadata
			currentResult.steps.push({
				...stepResult,
				conditionEvaluated:
					"condition" in instructionConfig &&
					instructionConfig.condition !== undefined,
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
			} catch {
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
					instructions: (string | NormalizedInstruction)[];
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

				const hasInstructions =
					body.instructions &&
					Array.isArray(body.instructions) &&
					body.instructions.length > 0;
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
						}),
					),
				);

				const results = await Promise.all(
					instances.map(async (instance) => {
						const status = await instance.status();
						return {
							instanceId: instance.id,
							status,
						};
					}),
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
						error:
							error instanceof Error
								? error.message
								: "Failed to create batch workflows",
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
				const hasInstructions =
					body.instructions &&
					Array.isArray(body.instructions) &&
					body.instructions.length > 0;
				const hasLegacyInstructions =
					body.firstInstruction && body.secondInstruction;

				if (!hasInstructions && !hasLegacyInstructions) {
					return Response.json(
						{
							error:
								"Missing required fields: either 'instructions' array or 'firstInstruction' and 'secondInstruction'",
						},
						{ status: 400 },
					);
				}

				// Validate conditional instructions if provided
				if (hasInstructions && body.instructions.length > 0) {
					for (let i = 0; i < body.instructions.length; i++) {
						const inst = body.instructions[i];
						if (typeof inst === "object" && inst !== null && "condition" in inst) {
							const cond = (inst as ConditionalInstruction).condition;
							if (cond && cond.ifTrue) {
								for (const idx of cond.ifTrue) {
									if (idx < 0 || idx >= body.instructions.length) {
										return Response.json(
											{
												error: `Conditional instruction ${i}: ifTrue index ${idx} is out of bounds`,
											},
											{ status: 400 },
										);
									}
								}
							}
							if (cond && cond.ifFalse) {
								for (const idx of cond.ifFalse) {
									if (idx < 0 || idx >= body.instructions.length) {
										return Response.json(
											{
												error: `Conditional instruction ${i}: ifFalse index ${idx} is out of bounds`,
											},
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
						model: body.model || undefined,
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
						error:
							error instanceof Error ? error.message : "Failed to create workflow",
					},
					{ status: 500 },
				);
			}
		}

		// GET / - Show usage instructions
		return Response.json(
			{
				message:
					"Multi-Provider LLM Workflow API with External Endpoint & Thread Support",
				endpoints: {
					"POST /": {
						description: "Create a new workflow instance",
						body: {
							context: "string - The initial context to process",
							instructions:
								"string[] | ConditionalInstruction[] | EndpointInstruction[] | ThreadInstruction[] | AgentInstruction[] - Array of instructions",
							provider:
								"string (optional) - AI provider: 'openai' or 'anthropic' (default: 'openai')",
							model:
								"string (optional) - Model name (default: 'gpt-5-nano' for OpenAI, 'claude-haiku-4-5' for Anthropic)",
							firstInstruction:
								"string (legacy) - Instruction for the first LLM call",
							secondInstruction:
								"string (legacy) - Instruction for the second LLM call",
						},
						threadExample: {
							description:
								"Thread instruction collects results from multiple steps for LLM to see all at once",
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
							description:
								"Router instruction allows LLM to decide which endpoint to call based on context",
							context: "User is asking about the weather for hiking this weekend",
							instructions: [
								"Analyze the user's question and identify the main topic and intent",
								{
									type: "router",
									description: "Select the most appropriate data source",
									evaluationPrompt:
										"Based on the analysis, which data source would best answer this query?",
									options: [
										{
											id: "weather",
											name: "Weather API",
											description:
												"Weather forecasts, outdoor conditions, temperature data",
											endpoint: {
												endpointUrl: "https://endpoint-1.workers.dev",
												apiUrl: "https://endpoint-1.workers.dev/mock/weather",
												method: "GET",
											},
										},
										{
											id: "news",
											name: "News API",
											description:
												"Current events, trending topics, news articles",
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
						agentExample: {
							description:
								"Agent instruction allows LLM to decide IF it needs external data, and if so, which tool to use",
							context: "What is the capital of France?",
							instructions: [
								{
									type: "agent",
									description: "Decide if external data is needed",
									decisionPrompt:
										"Do you need real-time or external data to answer this question, or can you answer with your existing knowledge?",
									availableTools: [
										{
											id: "search",
											name: "Web Search",
											description:
												"Search the web for current information, recent events, or facts you're unsure about",
											endpoint: {
												endpointUrl: "https://endpoint-1.workers.dev",
												apiUrl: "https://endpoint-1.workers.dev/mock/search",
												method: "GET",
											},
										},
										{
											id: "weather",
											name: "Weather API",
											description:
												"Get current weather data for a specific location",
											endpoint: {
												endpointUrl: "https://endpoint-2.workers.dev",
												apiUrl: "https://endpoint-2.workers.dev/mock/weather",
												method: "GET",
											},
										},
									],
									fallbackBehavior: "llm",
									llmFallbackPrompt:
										"Answer the user's question using your knowledge",
								},
								"Format the response in a helpful and conversational way",
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
										ifTrue: [1],
										ifFalse: [2],
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
							instructions:
								"string[] | ConditionalInstruction[] - Array of instructions",
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
					batchEndpoint:
						"Use POST /batch to create multiple instances at once (up to 20).",
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
