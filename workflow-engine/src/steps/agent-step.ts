// steps/agent-step.ts - Agent instruction handler
// Allows LLM to decide IF it needs to call an API, and if so, which one

import type { AgentInstruction, StepContext } from "../types";
import { callLLM } from "../providers";
import { callEndpoint } from "./endpoint-step";

// Special ID that indicates no tool should be used
const NO_TOOL_ID = "none";

/**
 * Execute an agent instruction step
 * Uses LLM to decide whether external data is needed, and if so, which tool to use
 */
export async function executeAgentStep(
	instruction: AgentInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	const desc = instruction.description || `Agent: ${instruction.decisionPrompt}`;

	ctx.addLog(
		"info",
		`Agent step started with ${instruction.availableTools.length} available tools`,
		ctx.stepNumber,
		{
			tools: instruction.availableTools.map((t) => t.id),
			fallbackBehavior: instruction.fallbackBehavior,
		},
	);

	// Build the tools list for LLM, including "none" option
	const toolsText = [
		`0. ${NO_TOOL_ID}: I don't need external data - I can answer with my existing knowledge`,
		...instruction.availableTools.map(
			(tool, idx) => `${idx + 1}. ${tool.id}: ${tool.description}`,
		),
	].join("\n");

	// Build the decision prompt
	const decisionPrompt = `You are an intelligent assistant deciding whether you need to fetch external data to complete a task.

CONTEXT/PREVIOUS RESULT:
${ctx.previousResult}

TASK: ${instruction.decisionPrompt}

AVAILABLE OPTIONS:
${toolsText}

INSTRUCTIONS:
- If you can answer the question or complete the task with your existing knowledge, respond with "${NO_TOOL_ID}"
- If you need real-time or external data that you don't have, respond with the appropriate tool ID
- Consider: Do I need current/live data? Is this about recent events? Do I need to look something up?

IMPORTANT: Respond with ONLY the option ID (e.g., "${NO_TOOL_ID}" or "${instruction.availableTools[0]?.id || "tool1"}"). 
Do not include any other text, explanation, or punctuation. Just the ID.`;

	ctx.addLog("debug", "Sending decision prompt to LLM", ctx.stepNumber, {
		promptLength: decisionPrompt.length,
	});

	// Ask LLM to decide
	let decisionResponse: string;
	try {
		decisionResponse = await callLLM(
			ctx.provider,
			ctx.apiKey,
			ctx.model,
			"You are a decision-making assistant. Analyze the context and decide if you need external data or can answer with your knowledge. Respond with ONLY the option ID, nothing else.",
			decisionPrompt,
		);
		ctx.addLog(
			"info",
			`LLM decision: "${decisionResponse.trim()}"`,
			ctx.stepNumber,
		);
	} catch (llmError: unknown) {
		const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
		ctx.addLog("error", `LLM decision failed: ${errMsg}`, ctx.stepNumber);
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"agent-llm",
			"LLM failed to make decision",
		);
		throw new Error(`Agent LLM decision failed: ${errMsg}`);
	}

	// Clean up the response
	const cleanedDecision = decisionResponse.trim().toLowerCase().replace(/['"]/g, "");

	// Check if LLM decided no tool is needed
	const needsNoTool =
		cleanedDecision === NO_TOOL_ID ||
		cleanedDecision === "no" ||
		cleanedDecision === "none" ||
		cleanedDecision.includes("don't need") ||
		cleanedDecision.includes("no tool") ||
		cleanedDecision.includes("existing knowledge");

	if (needsNoTool) {
		ctx.addLog(
			"info",
			`Agent decided no external data needed, using fallback: ${instruction.fallbackBehavior}`,
			ctx.stepNumber,
		);

		// Handle fallback based on configuration
		if (instruction.fallbackBehavior === "skip") {
			// Just pass through the previous result
			const result = JSON.stringify(
				{
					agentDecision: {
						selectedTool: null,
						reason: "No external data needed",
						llmResponse: decisionResponse.trim(),
					},
					data: ctx.previousResult,
				},
				null,
				2,
			);
			return { instruction: desc, result };
		} else {
			// Use LLM to generate a response
			const fallbackPrompt =
				instruction.llmFallbackPrompt ||
				"Based on the context provided, please provide a helpful response.";

			ctx.addLog("info", "Using LLM fallback to generate response", ctx.stepNumber);

			let llmResponse: string;
			try {
				llmResponse = await callLLM(
					ctx.provider,
					ctx.apiKey,
					ctx.model,
					"You are a helpful assistant. Answer based on your knowledge.",
					`${fallbackPrompt}\n\nContext:\n${ctx.previousResult}`,
				);
			} catch (llmError: unknown) {
				const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
				ctx.addLog("error", `LLM fallback failed: ${errMsg}`, ctx.stepNumber);
				ctx.addError(
					ctx.stepNumber,
					ctx.stepIndex,
					errMsg,
					"agent-llm-fallback",
					"LLM fallback response failed",
				);
				throw new Error(`Agent LLM fallback failed: ${errMsg}`);
			}

			const result = JSON.stringify(
				{
					agentDecision: {
						selectedTool: null,
						reason: "No external data needed - answered with LLM",
						llmResponse: decisionResponse.trim(),
					},
					data: llmResponse,
				},
				null,
				2,
			);
			return { instruction: desc, result };
		}
	}

	// LLM decided to use a tool - find which one
	let selectedTool = instruction.availableTools.find(
		(tool) => tool.id.toLowerCase() === cleanedDecision,
	);

	// If not found by exact match, try partial match
	if (!selectedTool) {
		ctx.addLog(
			"warn",
			`Exact match not found for "${cleanedDecision}", trying partial match`,
			ctx.stepNumber,
		);
		selectedTool = instruction.availableTools.find(
			(tool) =>
				cleanedDecision.includes(tool.id.toLowerCase()) ||
				tool.id.toLowerCase().includes(cleanedDecision),
		);
	}

	// If still not found, use first tool as fallback (since LLM indicated it needs data)
	if (!selectedTool && instruction.availableTools.length > 0) {
		ctx.addLog(
			"warn",
			`No matching tool found, using first available tool: ${instruction.availableTools[0].id}`,
			ctx.stepNumber,
		);
		selectedTool = instruction.availableTools[0];
	}

	if (!selectedTool) {
		const errMsg = `Agent has no available tools but LLM requested external data. LLM returned: "${decisionResponse}"`;
		ctx.addLog("error", errMsg, ctx.stepNumber);
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"agent-no-tools",
			"No tools available for agent",
		);
		throw new Error(errMsg);
	}

	ctx.addLog(
		"info",
		`Selected tool: ${selectedTool.id} (${selectedTool.name})`,
		ctx.stepNumber,
		{
			endpoint: selectedTool.endpoint.apiUrl,
		},
	);

	// Call the selected endpoint
	let endpointResult: string;
	try {
		const apiUrl = selectedTool.endpoint.apiUrl;
		const endpointUrl = selectedTool.endpoint.endpointUrl;
		const method = selectedTool.endpoint.method || "GET";

		// Check if this is a mock endpoint
		const isMockEndpoint = apiUrl.includes("/mock/");

		if (isMockEndpoint) {
			ctx.addLog(
				"info",
				`Calling mock endpoint directly: ${apiUrl}`,
				ctx.stepNumber,
			);

			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				instruction.timeout || 30000,
			);

			const fetchOptions: RequestInit = {
				method,
				headers: {
					"Content-Type": "application/json",
					...selectedTool.endpoint.headers,
				},
				signal: controller.signal,
			};

			if (
				selectedTool.endpoint.body &&
				["POST", "PUT", "PATCH"].includes(method)
			) {
				fetchOptions.body =
					typeof selectedTool.endpoint.body === "string"
						? selectedTool.endpoint.body
						: JSON.stringify(selectedTool.endpoint.body);
			}

			const response = await fetch(apiUrl, fetchOptions);
			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(
					`Mock endpoint returned ${response.status}: ${response.statusText}`,
				);
			}

			const responseData = await response.json();
			endpointResult = JSON.stringify(responseData);
		} else {
			// Use proxy for external APIs
			endpointResult = await callEndpoint(
				endpointUrl,
				apiUrl,
				method,
				selectedTool.endpoint.headers,
				selectedTool.endpoint.body,
				instruction.retries || 3,
				instruction.retryDelay || 1000,
				instruction.timeout || 30000,
			);
		}
		ctx.addLog(
			"info",
			`Tool call successful for ${selectedTool.id}`,
			ctx.stepNumber,
		);
	} catch (endpointError: unknown) {
		const errMsg =
			endpointError instanceof Error
				? endpointError.message
				: String(endpointError);
		ctx.addLog("error", `Tool call failed: ${errMsg}`, ctx.stepNumber, {
			endpoint: selectedTool.endpoint.apiUrl,
		});
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"agent-endpoint",
			`Tool ${selectedTool.id} endpoint failed`,
		);
		throw new Error(`Agent tool call failed: ${errMsg}`);
	}

	// Format the result
	const result = JSON.stringify(
		{
			agentDecision: {
				selectedTool: selectedTool.id,
				selectedName: selectedTool.name,
				reason: "External data needed",
				llmResponse: decisionResponse.trim(),
				endpoint: selectedTool.endpoint.apiUrl,
			},
			data: JSON.parse(endpointResult),
		},
		null,
		2,
	);

	return { instruction: desc, result };
}

