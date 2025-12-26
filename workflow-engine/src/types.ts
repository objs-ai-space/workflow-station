// types.ts - All type definitions for the workflow engine

// Conditional instruction structure for if-else logic
export type ConditionalInstruction = {
	instruction: string; // The instruction to execute
	condition?: {
		// Evaluate condition after this step completes
		evaluateAfterStep?: number; // Step number to evaluate condition against (1-indexed)
		expression: string; // Natural language condition, e.g., "result contains 'success'" or "result length is greater than 100"
		ifTrue?: number[]; // Step indices (0-indexed) to execute if condition is true
		ifFalse?: number[]; // Step indices (0-indexed) to execute if condition is false
		// If neither ifTrue nor ifFalse specified, continue sequentially
	};
};

// Endpoint instruction structure for external API calls
export type EndpointInstruction = {
	type: "endpoint"; // Identifies this as an endpoint instruction
	endpointUrl: string; // URL of the endpoint worker (e.g., "https://endpoint-1.your-subdomain.workers.dev")
	apiUrl: string; // External API URL to call
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; // HTTP method (default: GET)
	headers?: Record<string, string>; // Custom headers
	body?: unknown; // Request body (for POST, PUT, PATCH)
	retries?: number; // Number of retry attempts (default: 3)
	retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
	timeout?: number; // Request timeout in milliseconds (default: 30000)
	description?: string; // Optional description of what this endpoint does
	condition?: ConditionalInstruction["condition"];
};

// Thread instruction structure for collecting results from multiple steps
// This allows LLM to see results from multiple previous steps, not just the immediately previous one
export type ThreadInstruction = {
	type: "thread"; // Identifies this as a thread instruction
	collectFromSteps: number[]; // Step numbers (1-indexed) to collect results from
	outputFormat?: "json" | "markdown" | "numbered"; // How to format collected results (default: json)
	description?: string; // Optional description of what this thread collects
	completionCheck?: {
		// How to determine if thread is ready to output
		mode: "deterministic" | "llm"; // deterministic: check if all steps are done; llm: use LLM to evaluate
		expression?: string; // For LLM mode: natural language condition to evaluate if collection is complete
	};
	condition?: ConditionalInstruction["condition"];
};

// Router instruction structure for LLM-driven dynamic endpoint selection
// This allows the LLM to choose which endpoint to call based on context analysis
export type RouterInstruction = {
	type: "router"; // Identifies this as a router instruction
	description: string; // What this router step does
	evaluationPrompt: string; // Question for LLM to evaluate which option to choose
	options: Array<{
		id: string; // Unique identifier for this option (e.g., "weather", "news", "finance")
		name: string; // Human-readable name for display
		description: string; // Description for LLM to understand when to pick this option
		endpoint: {
			endpointUrl: string; // Which endpoint worker to use
			apiUrl: string; // The actual API/route to call
			method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; // HTTP method
			headers?: Record<string, string>; // Custom headers
			body?: unknown; // Request body for POST/PUT/PATCH
		};
	}>;
	defaultOption?: string; // ID of option to use if LLM can't decide
	retries?: number; // Number of retry attempts for the selected endpoint (default: 3)
	retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
	timeout?: number; // Request timeout in milliseconds (default: 30000)
	condition?: ConditionalInstruction["condition"];
};

// Agent instruction structure for LLM-driven decision on whether to call an API
// This allows the LLM to decide IF it needs external data, and if so, which tool to use
export type AgentInstruction = {
	type: "agent"; // Identifies this as an agent instruction
	description: string; // What this agent step does
	decisionPrompt: string; // Question for LLM to decide if external data is needed
	availableTools: Array<{
		id: string; // Unique identifier for this tool (e.g., "weather", "search", "database")
		name: string; // Human-readable name for display
		description: string; // Description for LLM to understand when to use this tool
		endpoint: {
			endpointUrl: string; // Which endpoint worker to use
			apiUrl: string; // The actual API/route to call
			method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; // HTTP method
			headers?: Record<string, string>; // Custom headers
			body?: unknown; // Request body for POST/PUT/PATCH
		};
	}>;
	fallbackBehavior: "llm" | "skip"; // What to do if no tool is needed: "llm" = use LLM to answer, "skip" = pass through previous result
	llmFallbackPrompt?: string; // Prompt to use if LLM decides no API needed (for fallbackBehavior: "llm")
	retries?: number; // Number of retry attempts for the selected endpoint (default: 3)
	retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
	timeout?: number; // Request timeout in milliseconds (default: 30000)
	condition?: ConditionalInstruction["condition"];
};

// Union type for all normalized instructions
export type NormalizedInstruction =
	| ConditionalInstruction
	| EndpointInstruction
	| ThreadInstruction
	| RouterInstruction
	| AgentInstruction;

// User-defined params passed to your Workflow
export type Params = {
	context: string; // The initial context to process
	instructions: (string | NormalizedInstruction)[]; // Array of instructions
	provider?: "openai" | "anthropic"; // AI provider (default: openai)
	model?: string; // Model name (default: gpt-5-nano for OpenAI, claude-haiku-4-5 for Anthropic)
	// Legacy support for backward compatibility
	firstInstruction?: string;
	secondInstruction?: string;
};

// Step result structure
export type StepResult = {
	stepNumber: number;
	instruction: string;
	result: string;
	processedAt: string;
	duration: number; // Duration in seconds
	conditionEvaluated?: boolean; // Whether condition was evaluated
	conditionResult?: boolean; // Result of condition evaluation
	branchTaken?: "true" | "false" | "sequential"; // Which branch was taken
	error?: string; // Error message if step failed
	errorType?: string; // Type of error (e.g., "router", "endpoint", "llm")
};

// Error entry structure
export type ErrorEntry = {
	stepNumber: number;
	stepIndex: number;
	error: string;
	errorType: string;
	timestamp: string;
	context?: string;
};

// Log entry structure
export type LogEntry = {
	level: "info" | "warn" | "error" | "debug";
	message: string;
	timestamp: string;
	stepNumber?: number;
	data?: unknown;
};

// Complete workflow result structure
export type WorkflowResult = {
	originalContext: string;
	steps: StepResult[];
	finalizedAt: string;
	errors?: ErrorEntry[];
	logs?: LogEntry[];
};

// Context passed to step handlers
export type StepContext = {
	provider: "openai" | "anthropic";
	apiKey: string;
	model: string;
	previousResult: string;
	isFirstStep: boolean;
	stepNumber: number;
	stepIndex: number;
	currentResult: WorkflowResult;
	addLog: (
		level: "info" | "warn" | "error" | "debug",
		message: string,
		stepNumber?: number,
		data?: unknown,
	) => void;
	addError: (
		stepNumber: number,
		stepIndex: number,
		error: string,
		errorType: string,
		context?: string,
	) => void;
};

// Endpoint worker response structure
export type EndpointResponse = {
	success: boolean;
	status: number;
	statusText: string;
	headers: Record<string, string>;
	body: unknown;
	attempts: number;
	duration: number;
	error?: string;
};

