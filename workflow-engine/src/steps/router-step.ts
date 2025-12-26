// steps/router-step.ts - Router instruction handler

import type { RouterInstruction, StepContext } from "../types";
import { callLLM } from "../providers";
import { callEndpoint } from "./endpoint-step";

/**
 * Execute a router instruction step
 * Uses LLM to dynamically select which endpoint to call based on context
 */
export async function executeRouterStep(
	instruction: RouterInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	const desc =
		instruction.description || `Router: ${instruction.evaluationPrompt}`;

	ctx.addLog(
		"info",
		`Router step started with ${instruction.options.length} options`,
		ctx.stepNumber,
		{
			options: instruction.options.map((o) => o.id),
			defaultOption: instruction.defaultOption,
		},
	);

	// Build the options list for LLM
	const optionsText = instruction.options
		.map((opt, idx) => `${idx + 1}. ${opt.id}: ${opt.description}`)
		.join("\n");

	// Build the selection prompt
	const selectionPrompt = `You are evaluating which data source or API to query based on the context.

CONTEXT/PREVIOUS RESULT:
${ctx.previousResult}

AVAILABLE OPTIONS:
${optionsText}

TASK: ${instruction.evaluationPrompt}

IMPORTANT: Respond with ONLY the option ID (e.g., "${instruction.options[0]?.id || "option1"}"). 
Do not include any other text, explanation, or punctuation. Just the ID.`;

	ctx.addLog("debug", "Sending selection prompt to LLM", ctx.stepNumber, {
		promptLength: selectionPrompt.length,
	});

	// Ask LLM to select an option
	let selectedOptionId: string;
	try {
		selectedOptionId = await callLLM(
			ctx.provider,
			ctx.apiKey,
			ctx.model,
			"You are a decision-making assistant. Your job is to analyze context and select the most appropriate option. Respond with ONLY the option ID, nothing else.",
			selectionPrompt,
		);
		ctx.addLog(
			"info",
			`LLM returned selection: "${selectedOptionId.trim()}"`,
			ctx.stepNumber,
		);
	} catch (llmError: unknown) {
		const errMsg =
			llmError instanceof Error ? llmError.message : String(llmError);
		ctx.addLog("error", `LLM selection failed: ${errMsg}`, ctx.stepNumber);
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"router-llm",
			"LLM failed to select option",
		);
		throw new Error(`Router LLM selection failed: ${errMsg}`);
	}

	// Clean up the response (trim whitespace, remove quotes if present)
	const cleanedSelection = selectedOptionId
		.trim()
		.toLowerCase()
		.replace(/['"]/g, "");

	// Find the selected option
	let selectedOption = instruction.options.find(
		(opt) => opt.id.toLowerCase() === cleanedSelection,
	);

	// If not found by exact match, try partial match
	if (!selectedOption) {
		ctx.addLog(
			"warn",
			`Exact match not found for "${cleanedSelection}", trying partial match`,
			ctx.stepNumber,
		);
		selectedOption = instruction.options.find(
			(opt) =>
				cleanedSelection.includes(opt.id.toLowerCase()) ||
				opt.id.toLowerCase().includes(cleanedSelection),
		);
	}

	// If still not found, use default or first option
	if (!selectedOption) {
		ctx.addLog(
			"warn",
			`No match found, falling back to default option: ${instruction.defaultOption || "first option"}`,
			ctx.stepNumber,
		);
		if (instruction.defaultOption) {
			selectedOption = instruction.options.find(
				(opt) => opt.id === instruction.defaultOption,
			);
		}
		if (!selectedOption) {
			selectedOption = instruction.options[0]; // Fallback to first option
		}
	}

	if (!selectedOption) {
		const errMsg = `Router could not select an option. LLM returned: "${selectedOptionId}"`;
		ctx.addLog("error", errMsg, ctx.stepNumber);
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"router-selection",
			"No valid option could be selected",
		);
		throw new Error(errMsg);
	}

	ctx.addLog(
		"info",
		`Selected option: ${selectedOption.id} (${selectedOption.name})`,
		ctx.stepNumber,
		{
			endpoint: selectedOption.endpoint.apiUrl,
		},
	);

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
			ctx.addLog(
				"info",
				`Calling mock endpoint directly: ${apiUrl}`,
				ctx.stepNumber,
			);

			// Call mock endpoint directly
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				instruction.timeout || 30000,
			);

			const fetchOptions: RequestInit = {
				method,
				headers: {
					"Content-Type": "application/json",
					...selectedOption.endpoint.headers,
				},
				signal: controller.signal,
			};

			if (
				selectedOption.endpoint.body &&
				["POST", "PUT", "PATCH"].includes(method)
			) {
				fetchOptions.body =
					typeof selectedOption.endpoint.body === "string"
						? selectedOption.endpoint.body
						: JSON.stringify(selectedOption.endpoint.body);
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
				selectedOption.endpoint.headers,
				selectedOption.endpoint.body,
				instruction.retries || 3,
				instruction.retryDelay || 1000,
				instruction.timeout || 30000,
			);
		}
		ctx.addLog(
			"info",
			`Endpoint call successful for ${selectedOption.id}`,
			ctx.stepNumber,
		);
	} catch (endpointError: unknown) {
		const errMsg =
			endpointError instanceof Error
				? endpointError.message
				: String(endpointError);
		ctx.addLog("error", `Endpoint call failed: ${errMsg}`, ctx.stepNumber, {
			endpoint: selectedOption.endpoint.apiUrl,
		});
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"router-endpoint",
			`Endpoint ${selectedOption.endpoint.apiUrl} failed`,
		);
		throw new Error(`Router endpoint call failed: ${errMsg}`);
	}

	// Format the result to include which option was selected
	const result = JSON.stringify(
		{
			routerDecision: {
				selectedOption: selectedOption.id,
				selectedName: selectedOption.name,
				llmResponse: selectedOptionId.trim(),
				endpoint: selectedOption.endpoint.apiUrl,
			},
			data: JSON.parse(endpointResult),
		},
		null,
		2,
	);

	return { instruction: desc, result };
}

