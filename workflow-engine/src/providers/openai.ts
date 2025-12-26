// providers/openai.ts - OpenAI API integration

export async function callOpenAI(
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

