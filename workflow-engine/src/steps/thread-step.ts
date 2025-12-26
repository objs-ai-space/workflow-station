// steps/thread-step.ts - Thread instruction handler

import type { ThreadInstruction, StepContext } from "../types";
import { evaluateCondition } from "../utils/condition";

/**
 * Execute a thread instruction step
 * Collects results from multiple previous steps for combined processing
 */
export async function executeThreadStep(
	instruction: ThreadInstruction,
	ctx: StepContext,
): Promise<{ instruction: string; result: string }> {
	const desc =
		instruction.description ||
		`Collect results from steps: ${instruction.collectFromSteps.join(", ")}`;

	// Collect results from specified steps (1-indexed step numbers)
	const collectedResults: Array<{
		stepNumber: number;
		instruction: string;
		result: string;
	}> = [];
	const missingSteps: number[] = [];

	for (const stepNum of instruction.collectFromSteps) {
		const stepData = ctx.currentResult.steps.find(
			(s) => s.stepNumber === stepNum,
		);
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
	const completionCheck = instruction.completionCheck || {
		mode: "deterministic" as const,
	};
	let isComplete = false;

	if (completionCheck.mode === "deterministic") {
		// Deterministic: all specified steps must be complete
		isComplete = missingSteps.length === 0;
	} else if (completionCheck.mode === "llm" && completionCheck.expression) {
		// LLM-based: use LLM to evaluate if collection is complete
		const collectionSummary = collectedResults
			.map((r) => `Step ${r.stepNumber}: ${r.result.substring(0, 200)}...`)
			.join("\n");

		isComplete = await evaluateCondition(
			ctx.provider,
			ctx.apiKey,
			ctx.model,
			completionCheck.expression,
			collectionSummary,
			ctx.stepNumber,
		);
	}

	if (!isComplete && missingSteps.length > 0) {
		throw new Error(
			`Thread incomplete: missing results from steps ${missingSteps.join(", ")}. ` +
				`Ensure these steps execute before this thread step.`,
		);
	}

	// Format collected results based on outputFormat
	const outputFormat = instruction.outputFormat || "json";
	let result: string;

	if (outputFormat === "json") {
		result = JSON.stringify(
			{
				collectedSteps: instruction.collectFromSteps,
				results: collectedResults.map((r) => ({
					step: r.stepNumber,
					instruction: r.instruction,
					result: r.result,
				})),
			},
			null,
			2,
		);
	} else if (outputFormat === "markdown") {
		result = collectedResults
			.map(
				(r) =>
					`## Step ${r.stepNumber}\n**Instruction:** ${r.instruction}\n\n**Result:**\n${r.result}`,
			)
			.join("\n\n---\n\n");
	} else if (outputFormat === "numbered") {
		result = collectedResults
			.map((r, idx) => `${idx + 1}. [Step ${r.stepNumber}] ${r.result}`)
			.join("\n\n");
	} else {
		result = JSON.stringify(collectedResults);
	}

	return { instruction: desc, result };
}

