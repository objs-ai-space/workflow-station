// providers/index.ts - Unified LLM provider interface

import { callOpenAI } from "./openai";
import { callAnthropic } from "./anthropic";

export { callOpenAI, callAnthropic };

/**
 * Unified LLM call function that routes to the correct provider
 */
export async function callLLM(
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

