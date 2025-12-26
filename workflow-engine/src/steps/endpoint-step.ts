// steps/endpoint-step.ts - Endpoint instruction handler

import type { EndpointInstruction, EndpointResponse, StepContext } from "../types";

/**
 * Call an endpoint worker to make an external API call
 */
export async function callEndpoint(
	endpointUrl: string,
	apiUrl: string,
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
	headers?: Record<string, string>,
	body?: unknown,
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

	const result = await response.json<EndpointResponse>();

	if (!result.success) {
		throw new Error(
			`API call failed after ${result.attempts} attempts: ${result.error || result.statusText}`,
		);
	}

	// Convert response body to string for consistency with LLM results
	if (typeof result.body === "string") {
		return result.body;
	}
	return JSON.stringify(result.body);
}

/**
 * Execute an endpoint instruction step
 * Calls external APIs through endpoint worker proxies
 */
export async function executeEndpointStep(
	instruction: EndpointInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	const desc = instruction.description || `Call ${instruction.apiUrl}`;

	ctx.addLog(
		"info",
		`Endpoint step calling ${instruction.apiUrl}`,
		ctx.stepNumber,
		{
			method: instruction.method || "GET",
			retries: instruction.retries || 3,
		},
	);

	try {
		const result = await callEndpoint(
			instruction.endpointUrl,
			instruction.apiUrl,
			instruction.method || "GET",
			instruction.headers,
			instruction.body,
			instruction.retries || 3,
			instruction.retryDelay || 1000,
			instruction.timeout || 30000,
		);
		ctx.addLog("info", `Endpoint call successful`, ctx.stepNumber);
		return { instruction: desc, result };
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		ctx.addLog("error", `Endpoint call failed: ${errMsg}`, ctx.stepNumber);
		ctx.addError(
			ctx.stepNumber,
			ctx.stepIndex,
			errMsg,
			"endpoint",
			`Endpoint ${instruction.apiUrl} failed`,
		);
		throw error;
	}
}

