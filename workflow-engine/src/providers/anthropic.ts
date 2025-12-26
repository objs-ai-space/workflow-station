// providers/anthropic.ts - Anthropic API integration

export async function callAnthropic(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
): Promise<string> {
	// Anthropic Messages API format
	const requestBody = {
		model,
		max_tokens: 4096,
		system: systemPrompt,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: userPrompt }],
			},
		],
	};

	// Make API call immediately - no delays
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic API error: ${response.status} - ${error}`);
	}

	// Parse response immediately
	const data = await response.json<{
		content: Array<{ type: string; text: string }>;
	}>();

	// Extract text from Anthropic response format
	return data.content[0]?.text || "";
}

