// steps/llm-step.ts - LLM instruction handler

import type { ConditionalInstruction, StepContext } from "../types";
import { callLLM } from "../providers";

/**
 * Execute an LLM-based instruction step
 * Uses the configured provider (OpenAI/Anthropic) to process the instruction
 */
export async function executeLLMStep(
	instruction: ConditionalInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	// Pre-compute prompts for faster execution
	const systemPrompt = ctx.isFirstStep
		? "You are a helpful assistant that processes and analyzes content."
		: "You are a helpful assistant that processes and refines content based on previous results.";

	const userPrompt = ctx.isFirstStep
		? `${instruction.instruction}\n\nContext:\n${ctx.previousResult}`
		: `${instruction.instruction}\n\nPrevious Result:\n${ctx.previousResult}`;

	// Call LLM API immediately - no delays (routes to OpenAI or Anthropic)
	const result = await callLLM(
		ctx.provider,
		ctx.apiKey,
		ctx.model,
		systemPrompt,
		userPrompt,
	);

	return {
		instruction: instruction.instruction,
		result,
	};
}

