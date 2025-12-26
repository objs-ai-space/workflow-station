// utils/condition.ts - Condition evaluation using LLM

import { callLLM } from "../providers";

/**
 * Evaluate a condition using LLM
 * Returns true or false based on natural language condition evaluation
 */
export async function evaluateCondition(
	provider: "openai" | "anthropic",
	apiKey: string,
	model: string,
	conditionExpression: string,
	stepResult: string,
	stepNumber: number,
): Promise<boolean> {
	const systemPrompt =
		"You are a logical evaluator. Evaluate the given condition and respond with ONLY 'true' or 'false' (lowercase, no punctuation).";
	const userPrompt = `Evaluate this condition: "${conditionExpression}"

Step ${stepNumber} result:
${stepResult}

Respond with only 'true' or 'false'.`;

	const response = await callLLM(
		provider,
		apiKey,
		model,
		systemPrompt,
		userPrompt,
	);
	const normalized = response.trim().toLowerCase();

	// Parse response - look for true/false
	if (normalized.includes("true") && !normalized.includes("false")) {
		return true;
	}
	if (normalized.includes("false")) {
		return false;
	}

	// Default to false if unclear
	console.warn(
		`⚠️ Unclear condition evaluation result: "${response}", defaulting to false`,
	);
	return false;
}

