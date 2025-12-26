// steps/index.ts - Step handler registry and factory

import type {
	NormalizedInstruction,
	StepContext,
	ConditionalInstruction,
	EndpointInstruction,
	ThreadInstruction,
	RouterInstruction,
	AgentInstruction,
} from "../types";
import { executeLLMStep } from "./llm-step";
import { executeEndpointStep, callEndpoint } from "./endpoint-step";
import { executeThreadStep } from "./thread-step";
import { executeRouterStep } from "./router-step";
import { executeAgentStep } from "./agent-step";

// Re-export individual step handlers for direct use
export {
	executeLLMStep,
	executeEndpointStep,
	executeThreadStep,
	executeRouterStep,
	executeAgentStep,
	callEndpoint,
};

/**
 * Get the type of an instruction
 */
export function getStepType(
	instruction: NormalizedInstruction,
): "llm" | "endpoint" | "thread" | "router" | "agent" {
	if ("type" in instruction) {
		return instruction.type as "endpoint" | "thread" | "router" | "agent";
	}
	return "llm";
}

/**
 * Check if instruction is an endpoint type
 */
export function isEndpointInstruction(
	instruction: NormalizedInstruction,
): instruction is EndpointInstruction {
	return "type" in instruction && instruction.type === "endpoint";
}

/**
 * Check if instruction is a thread type
 */
export function isThreadInstruction(
	instruction: NormalizedInstruction,
): instruction is ThreadInstruction {
	return "type" in instruction && instruction.type === "thread";
}

/**
 * Check if instruction is a router type
 */
export function isRouterInstruction(
	instruction: NormalizedInstruction,
): instruction is RouterInstruction {
	return "type" in instruction && instruction.type === "router";
}

/**
 * Check if instruction is an agent type
 */
export function isAgentInstruction(
	instruction: NormalizedInstruction,
): instruction is AgentInstruction {
	return "type" in instruction && instruction.type === "agent";
}

/**
 * Check if instruction is an LLM type (conditional instruction)
 */
export function isLLMInstruction(
	instruction: NormalizedInstruction,
): instruction is ConditionalInstruction {
	return !("type" in instruction) || !instruction.type;
}

/**
 * Execute any instruction step based on its type
 * Routes to the appropriate handler automatically
 */
export async function executeStep(
	instruction: NormalizedInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	const stepType = getStepType(instruction);

	switch (stepType) {
		case "endpoint":
			return executeEndpointStep(instruction as EndpointInstruction, ctx);
		case "thread":
			return executeThreadStep(instruction as ThreadInstruction, ctx);
		case "router":
			return executeRouterStep(instruction as RouterInstruction, ctx);
		case "agent":
			return executeAgentStep(instruction as AgentInstruction, ctx);
		case "llm":
		default:
			return executeLLMStep(instruction as ConditionalInstruction, ctx);
	}
}
