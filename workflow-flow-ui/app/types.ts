// Step Configuration Types based on STEP_CONFIGURATIONS.md

export type StepType = "simple" | "conditional" | "endpoint" | "thread" | "router";

export interface ConditionalLogic {
  expression: string;
  ifTrue?: number[];
  ifFalse?: number[];
  evaluateAfterStep?: number;
}

export interface SimpleStep {
  type?: "simple";
  instruction: string;
}

export interface ConditionalStep {
  type?: "conditional";
  instruction: string;
  condition: ConditionalLogic;
}

export interface EndpointStep {
  type: "endpoint";
  endpointUrl: string;
  apiUrl: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  description?: string;
  condition?: ConditionalLogic;
}

export interface ThreadStep {
  type: "thread";
  collectFromSteps: number[];
  outputFormat?: "json" | "markdown" | "numbered";
  description?: string;
  completionCheck?: {
    mode: "deterministic" | "llm";
    expression?: string;
  };
  condition?: ConditionalLogic;
}

export interface RouterOption {
  id: string;
  name: string;
  description: string;
  endpoint: {
    endpointUrl: string;
    apiUrl: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  };
}

export interface RouterStep {
  type: "router";
  description: string;
  evaluationPrompt: string;
  options: RouterOption[];
  defaultOption?: string;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  condition?: ConditionalLogic;
}

export type StepConfig = SimpleStep | ConditionalStep | EndpointStep | ThreadStep | RouterStep;

export interface NodeData {
  label: string;
  description?: string;
  stepType: StepType;
  stepConfig: StepConfig;
}

