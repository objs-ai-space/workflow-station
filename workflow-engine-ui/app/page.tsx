"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface WorkflowStatus {
  status: "queued" | "running" | "complete" | "errored" | "waiting";
  output?: WorkflowOutput | null;
  error?: string | null;
}

interface ConditionalInstruction {
  instruction: string;
  condition?: {
    evaluateAfterStep?: number;
    expression: string;
    ifTrue?: number[];
    ifFalse?: number[];
  };
}

interface EndpointInstruction {
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
  condition?: {
    evaluateAfterStep?: number;
    expression: string;
    ifTrue?: number[];
    ifFalse?: number[];
  };
}

interface ThreadInstruction {
  type: "thread";
  collectFromSteps: number[];
  outputFormat?: "json" | "markdown" | "numbered";
  description?: string;
  completionCheck?: {
    mode: "deterministic" | "llm";
    expression?: string;
  };
  condition?: {
    evaluateAfterStep?: number;
    expression: string;
    ifTrue?: number[];
    ifFalse?: number[];
  };
}

interface RouterOption {
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

interface RouterInstruction {
  type: "router";
  description: string;
  evaluationPrompt: string;
  options: RouterOption[];
  defaultOption?: string;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  condition?: {
    evaluateAfterStep?: number;
    expression: string;
    ifTrue?: number[];
    ifFalse?: number[];
  };
}

interface WorkflowStep {
  stepNumber: number;
  instruction: string;
  result: string;
  processedAt: string;
  duration?: number; // Duration in seconds
  conditionEvaluated?: boolean;
  conditionResult?: boolean;
  branchTaken?: "true" | "false" | "sequential";
}

interface WorkflowOutput {
  originalContext: string;
  steps: WorkflowStep[];
  finalizedAt: string;
  // Legacy support
  firstInstruction?: string;
  firstResult?: string;
  secondInstruction?: string;
  secondResult?: string;
  processedAt?: string;
}

interface WorkflowInstance {
  instanceId: string;
  status: WorkflowStatus;
  context: string;
  instructions: (string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction)[];
  provider: "openai" | "anthropic";
  model: string;
  createdAt: string;
}

export default function Home() {
  const [context, setContext] = useState("");
  const [instructions, setInstructions] = useState<(string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction)[]>(["", ""]);
  const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
  const [model, setModel] = useState("gpt-5-nano");
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState("http://localhost:8789");
  const [instructionModes, setInstructionModes] = useState<("simple" | "conditional" | "endpoint" | "thread" | "router")[]>(["simple", "simple"]);
  const [concurrentWorkflows, setConcurrentWorkflows] = useState<WorkflowInstance[]>([]);
  const [showConcurrentView, setShowConcurrentView] = useState(false);
  const [endpointWorkers] = useState<string[]>([
    "https://endpoint-1.developer-f79.workers.dev",
    "https://endpoint-2.developer-f79.workers.dev",
    "https://endpoint-3.developer-f79.workers.dev",
  ]);

  // JSON Payload Modal state
  const [showPayloadModal, setShowPayloadModal] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // JSON Results Modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [resultsModalPosition, setResultsModalPosition] = useState({ x: 150, y: 150 });
  const [isDraggingResultsModal, setIsDraggingResultsModal] = useState(false);
  const [resultsModalDragOffset, setResultsModalDragOffset] = useState({ x: 0, y: 0 });
  const resultsModalRef = useRef<HTMLDivElement>(null);

  // Generate the JSON payload for the current workflow configuration
  const generatePayload = useCallback(() => {
    // Filter out empty instructions
    const validInstructions = instructions
      .map((inst) => {
        if (typeof inst === "string") {
          return inst.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "endpoint") {
          return inst.apiUrl.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "thread") {
          return inst.collectFromSteps.length > 0 ? inst : null;
        } else if ("type" in inst && inst.type === "router") {
          return inst.options && inst.options.length > 0 ? inst : null;
        } else if ("instruction" in inst) {
          return inst.instruction.trim() !== "" ? inst : null;
        }
        return null;
      })
      .filter((inst): inst is string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction => inst !== null);

    return {
      context,
      instructions: validInstructions,
      provider,
      model: model || undefined,
    };
  }, [context, instructions, provider, model]);

  // Modal drag handlers
  const handleModalMouseDown = useCallback((e: React.MouseEvent) => {
    if (modalRef.current && (e.target as HTMLElement).closest('.modal-header')) {
      setIsDraggingModal(true);
      const rect = modalRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleModalMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingModal) {
      setModalPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  }, [isDraggingModal, dragOffset]);

  const handleModalMouseUp = useCallback(() => {
    setIsDraggingModal(false);
  }, []);

  // Add/remove mouse event listeners for modal dragging
  useEffect(() => {
    if (isDraggingModal) {
      window.addEventListener('mousemove', handleModalMouseMove);
      window.addEventListener('mouseup', handleModalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleModalMouseMove);
      window.removeEventListener('mouseup', handleModalMouseUp);
    };
  }, [isDraggingModal, handleModalMouseMove, handleModalMouseUp]);

  // Results Modal drag handlers
  const handleResultsModalMouseDown = useCallback((e: React.MouseEvent) => {
    if (resultsModalRef.current && (e.target as HTMLElement).closest('.results-modal-header')) {
      setIsDraggingResultsModal(true);
      const rect = resultsModalRef.current.getBoundingClientRect();
      setResultsModalDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleResultsModalMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingResultsModal) {
      setResultsModalPosition({
        x: e.clientX - resultsModalDragOffset.x,
        y: e.clientY - resultsModalDragOffset.y,
      });
    }
  }, [isDraggingResultsModal, resultsModalDragOffset]);

  const handleResultsModalMouseUp = useCallback(() => {
    setIsDraggingResultsModal(false);
  }, []);

  // Add/remove mouse event listeners for results modal dragging
  useEffect(() => {
    if (isDraggingResultsModal) {
      window.addEventListener('mousemove', handleResultsModalMouseMove);
      window.addEventListener('mouseup', handleResultsModalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleResultsModalMouseMove);
      window.removeEventListener('mouseup', handleResultsModalMouseUp);
    };
  }, [isDraggingResultsModal, handleResultsModalMouseMove, handleResultsModalMouseUp]);

  // Copy JSON to clipboard with feedback
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyPayloadToClipboard = useCallback(() => {
    const payload = generatePayload();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [generatePayload]);

  // Copy results to clipboard with feedback
  const [copyResultsFeedback, setCopyResultsFeedback] = useState(false);
  const copyResultsToClipboard = useCallback(() => {
    if (workflowStatus?.output) {
      navigator.clipboard.writeText(JSON.stringify(workflowStatus.output, null, 2));
      setCopyResultsFeedback(true);
      setTimeout(() => setCopyResultsFeedback(false), 2000);
    }
  }, [workflowStatus]);

  // Update model when provider changes
  useEffect(() => {
    if (provider === "anthropic") {
      setModel("claude-haiku-4-5");
    } else {
      setModel("gpt-5-nano");
    }
  }, [provider]);

  const addInstruction = () => {
    setInstructions([...instructions, ""]);
    setInstructionModes([...instructionModes, "simple"]);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
      setInstructionModes(instructionModes.filter((_, i) => i !== index));
    }
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    const current = newInstructions[index];
    if (typeof current === "string") {
      newInstructions[index] = value;
    } else if ("instruction" in current) {
      newInstructions[index] = { ...current, instruction: value };
    }
    setInstructions(newInstructions);
  };

  const updateEndpointInstruction = (index: number, field: string, value: string | number | Record<string, string> | undefined) => {
    const newInstructions = [...instructions];
    const current = newInstructions[index];
    if (typeof current === "object" && current !== null && "type" in current && current.type === "endpoint") {
      newInstructions[index] = {
        ...current,
        [field]: value,
      } as EndpointInstruction;
      setInstructions(newInstructions);
    }
  };

  const updateThreadInstruction = (index: number, field: string, value: string | number | number[] | { mode: "deterministic" | "llm"; expression?: string } | undefined) => {
    const newInstructions = [...instructions];
    const current = newInstructions[index];
    if (typeof current === "object" && current !== null && "type" in current && current.type === "thread") {
      newInstructions[index] = {
        ...current,
        [field]: value,
      } as ThreadInstruction;
      setInstructions(newInstructions);
    }
  };

  const toggleInstructionMode = (index: number) => {
    const newModes = [...instructionModes];
    const currentMode = newModes[index];
    let newMode: "simple" | "conditional" | "endpoint" | "thread" | "router";
    
    // Cycle through: simple -> conditional -> endpoint -> thread -> router -> simple
    if (currentMode === "simple") {
      newMode = "conditional";
    } else if (currentMode === "conditional") {
      newMode = "endpoint";
    } else if (currentMode === "endpoint") {
      newMode = "thread";
    } else if (currentMode === "thread") {
      newMode = "router";
    } else {
      newMode = "simple";
    }
    
    newModes[index] = newMode;

    const newInstructions = [...instructions];
    const current = newInstructions[index];

    if (newMode === "conditional") {
      // Convert to conditional
      newInstructions[index] = {
        instruction: typeof current === "string" ? current : ("instruction" in current ? current.instruction : "") || "",
        condition: {
          expression: "",
          ifTrue: [],
          ifFalse: [],
        },
      };
    } else if (newMode === "endpoint") {
      // Convert to endpoint
      newInstructions[index] = {
        type: "endpoint",
        endpointUrl: endpointWorkers[0] || "https://endpoint-1.your-subdomain.workers.dev",
        apiUrl: "",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 30000,
        description: "",
      };
    } else if (newMode === "thread") {
      // Convert to thread - collect results from previous steps
      newInstructions[index] = {
        type: "thread",
        collectFromSteps: [],
        outputFormat: "json",
        description: "",
        completionCheck: {
          mode: "deterministic",
        },
      };
    } else if (newMode === "router") {
      // Convert to router - LLM decides which endpoint to call
      newInstructions[index] = {
        type: "router",
        description: "Router: Select the best data source",
        evaluationPrompt: "Based on the context, which data source would be most helpful?",
        options: [
          {
            id: "weather",
            name: "Weather API",
            description: "Weather forecasts, outdoor conditions, temperature data",
            endpoint: {
              endpointUrl: endpointWorkers[0] || "https://endpoint-1.developer-f79.workers.dev",
              apiUrl: `${endpointWorkers[0] || "https://endpoint-1.developer-f79.workers.dev"}/mock/weather`,
              method: "GET",
            },
          },
          {
            id: "news",
            name: "News API",
            description: "Current events, trending topics, news articles",
            endpoint: {
              endpointUrl: endpointWorkers[1] || "https://endpoint-2.developer-f79.workers.dev",
              apiUrl: `${endpointWorkers[1] || "https://endpoint-2.developer-f79.workers.dev"}/mock/news`,
              method: "GET",
            },
          },
          {
            id: "finance",
            name: "Finance API",
            description: "Stock prices, market data, financial information",
            endpoint: {
              endpointUrl: endpointWorkers[2] || "https://endpoint-3.developer-f79.workers.dev",
              apiUrl: `${endpointWorkers[2] || "https://endpoint-3.developer-f79.workers.dev"}/mock/finance`,
              method: "GET",
            },
          },
        ],
        defaultOption: "weather",
        retries: 3,
      };
    } else {
      // Convert to simple string
      if (typeof current === "string") {
        newInstructions[index] = current;
      } else if ("instruction" in current) {
        newInstructions[index] = current.instruction || "";
      } else {
        newInstructions[index] = "";
      }
    }

    setInstructionModes(newModes);
    setInstructions(newInstructions);
  };

  const updateCondition = (index: number, field: string, value: string | number | number[] | undefined) => {
    const newInstructions = [...instructions];
    const current = newInstructions[index];
    if (typeof current === "object" && current !== null && "condition" in current && current.condition) {
      newInstructions[index] = {
        ...current,
        condition: {
          ...current.condition,
          [field]: value,
        },
      } as ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction;
      setInstructions(newInstructions);
    }
  };

  const updateRouterInstruction = (index: number, field: string, value: unknown) => {
    const newInstructions = [...instructions];
    const current = newInstructions[index];
    if (typeof current === "object" && current !== null && "type" in current && current.type === "router") {
      newInstructions[index] = {
        ...current,
        [field]: value,
      } as RouterInstruction;
      setInstructions(newInstructions);
    }
  };

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder instructions
    const newInstructions = [...instructions];
    const [draggedItem] = newInstructions.splice(draggedIndex, 1);
    newInstructions.splice(targetIndex, 0, draggedItem);
    setInstructions(newInstructions);

    // Reorder modes
    const newModes = [...instructionModes];
    const [draggedMode] = newModes.splice(draggedIndex, 1);
    newModes.splice(targetIndex, 0, draggedMode);
    setInstructionModes(newModes);

    // Update conditional references (ifTrue/ifFalse indices)
    const updatedInstructions = newInstructions.map((inst) => {
      if (typeof inst === "object" && inst !== null && "condition" in inst && inst.condition) {
        const newCondition = { ...inst.condition };
        
        // Update ifTrue indices
        if (newCondition.ifTrue) {
          newCondition.ifTrue = newCondition.ifTrue.map((idx) => {
            if (idx === draggedIndex) return targetIndex;
            if (draggedIndex < targetIndex) {
              // Moving down: indices between draggedIndex and targetIndex shift up by 1
              if (idx > draggedIndex && idx <= targetIndex) return idx - 1;
            } else {
              // Moving up: indices between targetIndex and draggedIndex shift down by 1
              if (idx >= targetIndex && idx < draggedIndex) return idx + 1;
            }
            return idx;
          });
        }
        
        // Update ifFalse indices
        if (newCondition.ifFalse) {
          newCondition.ifFalse = newCondition.ifFalse.map((idx) => {
            if (idx === draggedIndex) return targetIndex;
            if (draggedIndex < targetIndex) {
              if (idx > draggedIndex && idx <= targetIndex) return idx - 1;
            } else {
              if (idx >= targetIndex && idx < draggedIndex) return idx + 1;
            }
            return idx;
          });
        }
        
        return { ...inst, condition: newCondition };
      }
      return inst;
    });
    setInstructions(updatedInstructions);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Poll for single workflow status
  useEffect(() => {
    if (instanceId && (workflowStatus?.status === "running" || workflowStatus?.status === "queued")) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${apiUrl}/?instanceId=${instanceId}`);
          const data = await response.json();
          const status = data.status;
          
          // Extract intermediate step results from step outputs
          let intermediateSteps: WorkflowStep[] = [];
          
          if (status.__LOCAL_DEV_STEP_OUTPUTS && Array.isArray(status.__LOCAL_DEV_STEP_OUTPUTS)) {
            intermediateSteps = status.__LOCAL_DEV_STEP_OUTPUTS.map((stepOutput: unknown, index: number) => {
              if (stepOutput && typeof stepOutput === 'object') {
                const step = stepOutput as Record<string, unknown>;
                return {
                  stepNumber: (step.stepNumber as number) || index + 1,
                  instruction: (step.instruction as string) || '',
                  result: (step.result as string) || '',
                  processedAt: (step.processedAt as string) || new Date().toISOString(),
                  duration: (step.duration as number) || undefined,
                };
              }
              return null;
            }).filter((step: WorkflowStep | null) => step !== null) as WorkflowStep[];
          }
          
          if (intermediateSteps.length > 0 && (!status.output || !status.output.steps)) {
            status.output = {
              originalContext: context,
              steps: intermediateSteps,
              finalizedAt: status.status === "complete" ? new Date().toISOString() : "",
            };
          }
          
          setWorkflowStatus(status);
          
          if (status.status === "complete" || status.status === "errored") {
            clearInterval(interval);
          }
        } catch (error) {
          console.error("Error polling workflow status:", error);
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [instanceId, workflowStatus?.status, apiUrl, context]);

  // Poll for concurrent workflows status
  useEffect(() => {
    const runningWorkflows = concurrentWorkflows.filter(
      (wf) => wf.status.status === "running" || wf.status.status === "queued"
    );

    if (runningWorkflows.length === 0) return;

    const interval = setInterval(async () => {
      const updatedWorkflows = await Promise.all(
        concurrentWorkflows.map(async (workflow) => {
          if (workflow.status.status === "complete" || workflow.status.status === "errored") {
            return workflow; // Skip completed/errored workflows
          }

          try {
            const response = await fetch(`${apiUrl}/?instanceId=${workflow.instanceId}`);
            const data = await response.json();
            const status = data.status;

            // Extract intermediate step results
            let intermediateSteps: WorkflowStep[] = [];
            if (status.__LOCAL_DEV_STEP_OUTPUTS && Array.isArray(status.__LOCAL_DEV_STEP_OUTPUTS)) {
              intermediateSteps = status.__LOCAL_DEV_STEP_OUTPUTS.map((stepOutput: unknown, index: number) => {
                if (stepOutput && typeof stepOutput === 'object') {
                  const step = stepOutput as Record<string, unknown>;
                  return {
                    stepNumber: (step.stepNumber as number) || index + 1,
                    instruction: (step.instruction as string) || '',
                    result: (step.result as string) || '',
                    processedAt: (step.processedAt as string) || new Date().toISOString(),
                    duration: (step.duration as number) || undefined,
                  };
                }
                return null;
              }).filter((step: WorkflowStep | null) => step !== null) as WorkflowStep[];
            }

            if (intermediateSteps.length > 0 && (!status.output || !status.output.steps)) {
              status.output = {
                originalContext: workflow.context,
                steps: intermediateSteps,
                finalizedAt: status.status === "complete" ? new Date().toISOString() : "",
              };
            }

            return {
              ...workflow,
              status,
            };
          } catch (error) {
            console.error(`Error polling workflow ${workflow.instanceId}:`, error);
            return workflow;
          }
        })
      );

      setConcurrentWorkflows(updatedWorkflows);
    }, 2000); // Poll every 2 seconds for concurrent workflows

    return () => {
      clearInterval(interval);
    };
  }, [concurrentWorkflows, apiUrl]);

  const startWorkflow = async (
    workflowContext: string,
    workflowInstructions: (string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction)[],
    workflowProvider: "openai" | "anthropic",
    workflowModel: string
  ): Promise<{ instanceId: string; status: WorkflowStatus } | null> => {
    try {
      const response = await fetch(`${apiUrl}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: workflowContext,
          instructions: workflowInstructions,
          provider: workflowProvider,
          model: workflowModel || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        instanceId: data.instanceId,
        status: data.status,
      };
    } catch (error) {
      console.error("Error starting workflow:", error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out empty instructions and normalize
    const validInstructions = instructions
      .map((inst) => {
        if (typeof inst === "string") {
          return inst.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "endpoint") {
          // Endpoint instruction - check if apiUrl is provided
          return inst.apiUrl.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "thread") {
          // Thread instruction - check if collectFromSteps has items
          return inst.collectFromSteps && inst.collectFromSteps.length > 0 ? inst : null;
        } else if ("type" in inst && inst.type === "router") {
          // Router instruction - check if options exist
          return inst.options && inst.options.length > 0 ? inst : null;
        } else if ("instruction" in inst) {
          // Conditional or simple instruction
          return inst.instruction.trim() !== "" ? inst : null;
        }
        return null;
      })
      .filter((inst): inst is string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction => inst !== null);

    if (validInstructions.length === 0) {
      alert("Please add at least one instruction");
      return;
    }

    setIsLoading(true);

    if (showConcurrentView) {
      // Add to concurrent workflows list
      const result = await startWorkflow(context, validInstructions, provider, model);
      if (result) {
        const newWorkflow: WorkflowInstance = {
          instanceId: result.instanceId,
          status: result.status,
          context,
          instructions: validInstructions,
          provider,
          model,
          createdAt: new Date().toISOString(),
        };
        setConcurrentWorkflows([...concurrentWorkflows, newWorkflow]);
      } else {
        alert("Failed to start workflow");
      }
    } else {
      // Single workflow mode
      setInstanceId(null);
      setWorkflowStatus(null);
      const result = await startWorkflow(context, validInstructions, provider, model);
      if (result) {
        setInstanceId(result.instanceId);
        setWorkflowStatus(result.status);
      } else {
        alert("Failed to start workflow");
      }
    }

    setIsLoading(false);
  };

  const startMultipleWorkflows = async (count: number) => {
    if (count < 1 || count > 10) {
      alert("Please enter a number between 1 and 10");
      return;
    }

    setIsLoading(true);
    const validInstructions = instructions
      .map((inst) => {
        if (typeof inst === "string") {
          return inst.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "endpoint") {
          // Endpoint instruction - check if apiUrl is provided
          return inst.apiUrl.trim() !== "" ? inst : null;
        } else if ("type" in inst && inst.type === "thread") {
          // Thread instruction - check if collectFromSteps has items
          return inst.collectFromSteps && inst.collectFromSteps.length > 0 ? inst : null;
        } else if ("type" in inst && inst.type === "router") {
          // Router instruction - check if options exist
          return inst.options && inst.options.length > 0 ? inst : null;
        } else if ("instruction" in inst) {
          // Conditional or simple instruction
          return inst.instruction.trim() !== "" ? inst : null;
        }
        return null;
      })
      .filter((inst): inst is string | ConditionalInstruction | EndpointInstruction | ThreadInstruction | RouterInstruction => inst !== null);

    if (validInstructions.length === 0) {
      alert("Please add at least one instruction");
      setIsLoading(false);
      return;
    }

    // Start multiple workflows concurrently
    const promises = Array.from({ length: count }, () =>
      startWorkflow(context, validInstructions, provider, model)
    );

    const results = await Promise.all(promises);
    const successfulWorkflows: WorkflowInstance[] = results
      .filter((result): result is { instanceId: string; status: WorkflowStatus } => result !== null)
      .map((result) => ({
        instanceId: result.instanceId,
        status: result.status,
        context,
        instructions: validInstructions,
        provider,
        model,
        createdAt: new Date().toISOString(),
      }));

    setConcurrentWorkflows([...concurrentWorkflows, ...successfulWorkflows]);
    setShowConcurrentView(true);
    setIsLoading(false);
  };

  const handleCheckStatus = async () => {
    if (!instanceId) return;

    try {
      const response = await fetch(`${apiUrl}/?instanceId=${instanceId}`);
      const data = await response.json();
      const status = data.status;
      
      // Extract intermediate step results from step outputs
      let intermediateSteps: WorkflowStep[] = [];
      
      if (status.__LOCAL_DEV_STEP_OUTPUTS && Array.isArray(status.__LOCAL_DEV_STEP_OUTPUTS)) {
        intermediateSteps = status.__LOCAL_DEV_STEP_OUTPUTS.map((stepOutput: unknown, index: number) => {
          if (stepOutput && typeof stepOutput === 'object') {
            const step = stepOutput as Record<string, unknown>;
            return {
              stepNumber: (step.stepNumber as number) || index + 1,
              instruction: (step.instruction as string) || '',
              result: (step.result as string) || '',
              processedAt: (step.processedAt as string) || new Date().toISOString(),
              duration: (step.duration as number) || undefined,
            };
          }
          return null;
        }).filter((step: WorkflowStep | null) => step !== null) as WorkflowStep[];
      }
      
      // If we have intermediate steps but no final output yet, construct partial output
      if (intermediateSteps.length > 0 && (!status.output || !status.output.steps)) {
        status.output = {
          originalContext: context,
          steps: intermediateSteps,
          finalizedAt: status.status === "complete" ? new Date().toISOString() : "",
        };
      }
      
      setWorkflowStatus(status);
    } catch (error) {
      console.error("Error checking workflow status:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Failed to check status"}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "complete":
        return "bg-green-100 text-green-800 border-green-300";
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "errored":
        return "bg-red-100 text-red-800 border-red-300";
      case "queued":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const formatDuration = (duration?: number): string => {
    if (duration === undefined || duration === null) return "";
    return `${duration.toFixed(1)}s`;
  };

  // Math Chain: Tests that each step works independently without knowing full context
  const loadMathChain = () => {
    setContext("Starting number: 8");
    setInstructions([
      "Extract the number from the input. Output ONLY the number, nothing else.",
      "Take the previous number and add 7 to it. Output ONLY the result number, nothing else.",
      "Take the previous number and multiply it by 2. Output ONLY the result number, nothing else.",
      "Take the previous number and subtract 5. Output ONLY the result number, nothing else.",
      {
        instruction: "Check if the previous number is divisible by 5. Answer only YES or NO.",
        condition: {
          expression: "result contains YES or says yes",
          ifTrue: [5], // Divisible by 5 → success path
          ifFalse: [6], // Not divisible → alternate path
        },
      },
      "SUCCESS: The math chain produced a number divisible by 5. State the final number and confirm it divides evenly by 5.",
      "ALTERNATE: The math chain produced a number NOT divisible by 5. State the final number and show the remainder when divided by 5.",
    ]);
    setInstructionModes(["simple", "simple", "simple", "simple", "conditional", "simple", "simple"]);
  };

  const loadContextModificationChain = () => {
    setContext("Original text: 'The weather is nice today. We should go outside.'");
    setInstructions([
      "Rewrite the text to be more formal and professional. Keep the same meaning but use professional language.",
      "Add a suggestion about what outdoor activity to do. Include a specific recommendation.",
      "Compare the modified text with the ORIGINAL: 'The weather is nice today. We should go outside.' - List specific changes made (word changes, additions, tone shifts). Answer YES if significant changes were made, NO if minimal changes.",
      {
        instruction: "Based on the comparison, determine if modifications are sufficient. If the comparison shows significant changes (new words, professional tone, added content), this is TRUE. If barely changed, this is FALSE.",
        condition: {
          evaluateAfterStep: 3, // Evaluate condition against step 3's comparison result
          expression: "result says YES or indicates significant changes were made or lists multiple modifications",
          ifTrue: [4], // If changes were made, proceed to step 4 (approve)
          ifFalse: [5], // If no changes, proceed to step 5 (reject)
        },
      },
      "APPROVED: Changes are sufficient. Summarize the approved modifications in bullet points and provide the final polished text.",
      "REJECTED: Changes are insufficient. The text needs more modification. List 3 specific improvements needed.",
    ]);
    setInstructionModes(["simple", "simple", "simple", "conditional", "simple", "simple"]);
  };

  // Sample: API + LLM Chain - Fetch data from API and process with LLM
  const loadApiLLMChain = () => {
    setContext("Fetch user data from API and analyze it");
    setInstructions([
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[0],
        apiUrl: "https://jsonplaceholder.typicode.com/users/1",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 30000,
        description: "Fetch user data from JSONPlaceholder API",
      },
      "Extract the user's name, email, and company name from the API response. Format as: Name: [name], Email: [email], Company: [company]",
      "Analyze the user data and provide a brief professional summary of the user profile.",
      "Generate a personalized greeting message for this user based on their profile.",
    ]);
    setInstructionModes(["endpoint", "simple", "simple", "simple"]);
  };

  // Sample: Multi-Endpoint Chain - Call multiple APIs sequentially
  const loadMultiEndpointChain = () => {
    setContext("Fetch data from multiple APIs and combine results");
    setInstructions([
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[0],
        apiUrl: "https://jsonplaceholder.typicode.com/posts/1",
        method: "GET",
        retries: 2,
        description: "Fetch first post",
      },
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[1],
        apiUrl: "https://jsonplaceholder.typicode.com/posts/2",
        method: "GET",
        retries: 2,
        description: "Fetch second post",
      },
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[2],
        apiUrl: "https://jsonplaceholder.typicode.com/posts/3",
        method: "GET",
        retries: 2,
        description: "Fetch third post",
      },
      "Combine the titles from all three posts into a single list. Format as: 1. [title1]\\n2. [title2]\\n3. [title3]",
      "Create a summary that explains what these three posts are about based on their titles.",
    ]);
    setInstructionModes(["endpoint", "endpoint", "endpoint", "simple", "simple"]);
  };

  // Sample: Conditional Endpoint Chain - Fetch data, check condition, then process
  const loadConditionalEndpointChain = () => {
    setContext("Fetch user data and process conditionally");
    setInstructions([
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[0],
        apiUrl: "https://jsonplaceholder.typicode.com/users/1",
        method: "GET",
        retries: 3,
        description: "Fetch user data",
      },
      "Check if the user's email domain is 'example.com'. Answer YES if it is, NO if it's not.",
      {
        instruction: "Based on the email domain check, determine the processing path.",
        condition: {
          evaluateAfterStep: 2,
          expression: "result contains YES or says yes",
          ifTrue: [3], // If example.com domain → process as internal user
          ifFalse: [4], // If not → process as external user
        },
      },
      "INTERNAL USER: Generate a welcome message for internal user with access to company resources.",
      "EXTERNAL USER: Generate a welcome message for external user with limited access.",
    ]);
    setInstructionModes(["endpoint", "simple", "conditional", "simple", "simple"]);
  };

  // Sample: API POST Chain - Send data to API, then process response
  const loadApiPostChain = () => {
    setContext("Create a new post and analyze the response");
    setInstructions([
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[0],
        apiUrl: "https://jsonplaceholder.typicode.com/posts",
        method: "POST",
        body: {
          title: "My Test Post",
          body: "This is a test post created via workflow",
          userId: 1,
        },
        retries: 2,
        description: "Create a new post",
      },
      "Extract the post ID from the API response. Format as: Post ID: [id]",
      "Analyze the created post and provide feedback on the title and body content.",
      "Suggest improvements to make the post more engaging.",
    ]);
    setInstructionModes(["endpoint", "simple", "simple", "simple"]);
  };

  // Sample: Thread Collector - Fetch from multiple APIs, collect with Thread step, then analyze
  const loadThreadCollectorChain = () => {
    setContext("Gather data from multiple APIs and analyze patterns using Thread collector");
    setInstructions([
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[0],
        apiUrl: "https://jsonplaceholder.typicode.com/posts/1",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 15000,
        description: "Fetch first post from API",
      },
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[1],
        apiUrl: "https://jsonplaceholder.typicode.com/posts/2",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 15000,
        description: "Fetch second post from API",
      },
      {
        type: "endpoint",
        endpointUrl: endpointWorkers[2],
        apiUrl: "https://jsonplaceholder.typicode.com/users/1",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 15000,
        description: "Fetch user profile data from API",
      },
      {
        type: "thread",
        collectFromSteps: [1, 2, 3],
        outputFormat: "json",
        description: "THREAD: Collect results from Steps 1, 2, and 3 into a single JSON payload",
        completionCheck: {
          mode: "deterministic",
        },
      },
      "You are receiving a JSON object containing collected results from 3 API calls (2 posts and 1 user profile). Parse the JSON and analyze: 1) Compare the two post titles and bodies, 2) Examine the user profile (name, company, email), 3) Identify any patterns or connections between the posts and the user.",
      "Based on the previous analysis of posts and user data, suggest 3 specific new blog post topics this user (based on their profile and interests) might want to write about. Format as a numbered list with title and brief description for each.",
    ]);
    setInstructionModes(["endpoint", "endpoint", "endpoint", "thread", "simple", "simple"]);
  };

  // Sample: Router - LLM decides which endpoint to call based on user question
  const loadRouterChain = () => {
    setContext("User question: What's the weather like for outdoor activities this weekend?");
    setInstructions([
      "Analyze the user's question and identify: 1) The main topic (weather, news, finance, etc.), 2) The intent (get information, make a decision, etc.), 3) Any specific requirements mentioned.",
      {
        type: "router",
        description: "Smart Data Source Router",
        evaluationPrompt: "Based on the analysis of the user's question, which data source would provide the most relevant information?",
        options: [
          {
            id: "weather",
            name: "Weather API",
            description: "Weather forecasts, outdoor conditions, temperature, precipitation, wind speed - best for outdoor planning, travel, activities",
            endpoint: {
              endpointUrl: endpointWorkers[0],
              apiUrl: `${endpointWorkers[0]}/mock/weather`,
              method: "GET",
            },
          },
          {
            id: "news",
            name: "News API", 
            description: "Current events, trending topics, news articles - best for staying informed, current events, trending stories",
            endpoint: {
              endpointUrl: endpointWorkers[1],
              apiUrl: `${endpointWorkers[1]}/mock/news`,
              method: "GET",
            },
          },
          {
            id: "finance",
            name: "Finance API",
            description: "Stock prices, market data, financial news - best for investment decisions, market analysis, business queries",
            endpoint: {
              endpointUrl: endpointWorkers[2],
              apiUrl: `${endpointWorkers[2]}/mock/finance`,
              method: "GET",
            },
          },
        ],
        defaultOption: "weather",
        retries: 3,
      },
      "Using the data retrieved from the selected API, provide a helpful and complete response to the user's original question. Include specific details from the data and give actionable recommendations.",
    ]);
    setInstructionModes(["simple", "router", "simple"]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Cloudflare Workflow Station
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-3">
            Multi-step LLM processing with OpenAI and Anthropic + External API Integration
          </p>
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
              <strong>💡 Sample Workflows:</strong> Click buttons below to load pre-configured workflows for testing.
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>🧮 Math Chain:</strong> Sequential math operations where each step only sees the previous number (8 → +7 → ×2 → -5 → check divisibility)</li>
                <li><strong>🔗 Text Chain:</strong> Text modification chain with approval/rejection branching</li>
                <li><strong>🌐 API + LLM:</strong> Fetch data from external API and process with LLM</li>
                <li><strong>🔄 Multi-Endpoint:</strong> Call multiple APIs sequentially and combine results</li>
                <li><strong>⚡ Conditional API:</strong> Fetch data, check condition, then process conditionally</li>
                <li><strong>📤 API POST:</strong> Send data to API, then process response</li>
                <li><strong>🧵 Thread Collector:</strong> Fetch from multiple APIs, collect all results with Thread step, then analyze combined data</li>
                <li><strong>🔀 Smart Router:</strong> LLM analyzes the question and decides which API (Weather/News/Finance) to call</li>
              </ul>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-sm">
              <strong className="text-purple-800 dark:text-purple-200">📚 Understanding Instruction vs Conditional Logic:</strong>
              <div className="mt-2 space-y-2 text-purple-700 dark:text-purple-300">
                <div>
                  <strong>Instruction:</strong> The actual task/prompt that the LLM executes. This is what tells the LLM what to do.
                  <div className="text-xs mt-1 text-purple-600 dark:text-purple-400 italic">
                    Example: &quot;Solve the arithmetic problem and provide the numerical answer only&quot;
                  </div>
                </div>
                <div>
                  <strong>Conditional Logic:</strong> The if-else branching mechanism that determines which steps execute next based on evaluating a condition.
                  <div className="text-xs mt-1 text-purple-600 dark:text-purple-400 italic">
                    Example: If result greater than 40, execute step 1, else execute step 2
                  </div>
                </div>
                <div className="text-xs mt-2 p-2 bg-purple-100 dark:bg-purple-900/40 rounded">
                  <strong>Key Difference:</strong> Instruction = &quot;What to do&quot;, Conditional Logic = &quot;When to do it&quot; (which path to take)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">
              Start Workflow
            </h2>

            {/* API URL Configuration */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                API URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                placeholder="http://localhost:8789"
              />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Context *
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={loadMathChain}
                      className="text-xs bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-medium"
                      title="Math chain: each step processes independently (8 → +7 → ×2 → -5 → check)"
                    >
                      🧮 Math Chain
                    </button>
                    <button
                      type="button"
                      onClick={loadContextModificationChain}
                      className="text-xs bg-orange-100 dark:bg-orange-900 hover:bg-orange-200 dark:hover:bg-orange-800 text-orange-700 dark:text-orange-300 px-2 py-1 rounded font-medium"
                      title="Text modification chain with approval/rejection branching"
                    >
                      🔗 Text Chain
                    </button>
                    <button
                      type="button"
                      onClick={loadApiLLMChain}
                      className="text-xs bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-300 px-2 py-1 rounded font-medium"
                      title="API + LLM: Fetch data from API and process with LLM"
                    >
                      🌐 API + LLM
                    </button>
                    <button
                      type="button"
                      onClick={loadMultiEndpointChain}
                      className="text-xs bg-purple-100 dark:bg-purple-900 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300 px-2 py-1 rounded font-medium"
                      title="Multi-Endpoint: Call multiple APIs sequentially"
                    >
                      🔄 Multi-Endpoint
                    </button>
                    <button
                      type="button"
                      onClick={loadConditionalEndpointChain}
                      className="text-xs bg-pink-100 dark:bg-pink-900 hover:bg-pink-200 dark:hover:bg-pink-800 text-pink-700 dark:text-pink-300 px-2 py-1 rounded font-medium"
                      title="Conditional Endpoint: Fetch data, check condition, then process"
                    >
                      ⚡ Conditional API
                    </button>
                    <button
                      type="button"
                      onClick={loadApiPostChain}
                      className="text-xs bg-teal-100 dark:bg-teal-900 hover:bg-teal-200 dark:hover:bg-teal-800 text-teal-700 dark:text-teal-300 px-2 py-1 rounded font-medium"
                      title="API POST: Send data to API, then process response"
                    >
                      📤 API POST
                    </button>
                    <button
                      type="button"
                      onClick={loadThreadCollectorChain}
                      className="text-xs bg-cyan-100 dark:bg-cyan-900 hover:bg-cyan-200 dark:hover:bg-cyan-800 text-cyan-700 dark:text-cyan-300 px-2 py-1 rounded font-medium"
                      title="Thread Collector: Fetch from multiple APIs, collect all results, then analyze"
                    >
                      🧵 Thread Collector
                    </button>
                    <button
                      type="button"
                      onClick={loadRouterChain}
                      className="text-xs bg-rose-100 dark:bg-rose-900 hover:bg-rose-200 dark:hover:bg-rose-800 text-rose-700 dark:text-rose-300 px-2 py-1 rounded font-medium"
                      title="Smart Router: LLM decides which API to call based on user question"
                    >
                      🔀 Smart Router
                    </button>
                  </div>
                </div>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter the context to process... (Try the example buttons above to test workflow independence)"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Instructions *
                    </label>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Drag ⋮⋮ to reorder steps
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addInstruction}
                    className="text-xs bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-300 px-2 py-1 rounded font-medium"
                  >
                    + Add Step
                  </button>
                </div>
                <div className="space-y-4">
                  {instructions.map((instruction, index) => {
                    const isConditional = instructionModes[index] === "conditional";
                    const isEndpoint = instructionModes[index] === "endpoint";
                    const isThread = instructionModes[index] === "thread";
                    const isRouter = instructionModes[index] === "router";
                    const instructionText = typeof instruction === "string" 
                      ? instruction 
                      : ("instruction" in instruction ? instruction.instruction : "");
                    const condition = typeof instruction === "object" && instruction !== null && "condition" in instruction ? instruction.condition : undefined;
                    const endpointInst = typeof instruction === "object" && instruction !== null && "type" in instruction && instruction.type === "endpoint" ? instruction as EndpointInstruction : null;
                    const threadInst = typeof instruction === "object" && instruction !== null && "type" in instruction && instruction.type === "thread" ? instruction as ThreadInstruction : null;
                    const routerInst = typeof instruction === "object" && instruction !== null && "type" in instruction && instruction.type === "router" ? instruction as RouterInstruction : null;
                    const isDragging = draggedIndex === index;
                    const isDragOver = dragOverIndex === index;

                    return (
                      <div
                        key={index}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={() => handleDrop(index)}
                        onDragEnd={handleDragEnd}
                        className={`border rounded-lg p-4 transition-all cursor-move ${
                          isDragging
                            ? "opacity-50 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                            : isDragOver
                            ? "border-blue-500 dark:border-blue-400 bg-blue-100 dark:bg-blue-900/50 scale-[1.02]"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 dark:text-slate-500 cursor-grab active:cursor-grabbing" title="Drag to reorder">
                              ⋮⋮
                            </span>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                              Step {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleInstructionMode(index)}
                              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                                isConditional
                                  ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800"
                                  : isEndpoint
                                  ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800"
                                  : isThread
                                  ? "bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-200 dark:hover:bg-cyan-800"
                                  : isRouter
                                  ? "bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800"
                                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                              }`}
                            >
                              {isConditional ? "Conditional" : isEndpoint ? "Endpoint" : isThread ? "Thread" : isRouter ? "Router" : "Simple"}
                            </button>
                          </div>
                          {instructions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeInstruction(index)}
                              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {isThread && threadInst ? (
                            <div className="space-y-3 pt-3 border-t border-cyan-200 dark:border-cyan-700">
                              <div className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-2">
                                Thread Configuration - Collect Results from Multiple Steps
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Collect From Steps (1-indexed, comma-separated) *
                                </label>
                                <input
                                  type="text"
                                  value={threadInst.collectFromSteps.join(", ")}
                                  onChange={(e) => {
                                    const values = e.target.value
                                      .split(",")
                                      .map((v) => parseInt(v.trim()))
                                      .filter((v) => !isNaN(v) && v > 0);
                                    updateThreadInstruction(index, "collectFromSteps", values);
                                  }}
                                  className="w-full px-3 py-2 text-sm border border-cyan-300 dark:border-cyan-700 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="e.g., 1, 2, 3"
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  Step numbers whose results will be collected and passed to the next step
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Output Format
                                  </label>
                                  <select
                                    value={threadInst.outputFormat || "json"}
                                    onChange={(e) => updateThreadInstruction(index, "outputFormat", e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="json">JSON</option>
                                    <option value="markdown">Markdown</option>
                                    <option value="numbered">Numbered List</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Completion Check Mode
                                  </label>
                                  <select
                                    value={threadInst.completionCheck?.mode || "deterministic"}
                                    onChange={(e) => updateThreadInstruction(index, "completionCheck", {
                                      ...threadInst.completionCheck,
                                      mode: e.target.value as "deterministic" | "llm",
                                    })}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="deterministic">Deterministic (all steps done)</option>
                                    <option value="llm">LLM Evaluation</option>
                                  </select>
                                </div>
                              </div>

                              {threadInst.completionCheck?.mode === "llm" && (
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    LLM Completion Expression
                                  </label>
                                  <input
                                    type="text"
                                    value={threadInst.completionCheck?.expression || ""}
                                    onChange={(e) => updateThreadInstruction(index, "completionCheck", {
                                      ...threadInst.completionCheck,
                                      mode: "llm",
                                      expression: e.target.value,
                                    })}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="e.g., all results contain valid data"
                                  />
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Natural language condition for LLM to evaluate if collection is complete
                                  </p>
                                </div>
                              )}

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Description (optional)
                                </label>
                                <input
                                  type="text"
                                  value={threadInst.description || ""}
                                  onChange={(e) => updateThreadInstruction(index, "description", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="What does this thread collect?"
                                />
                              </div>
                            </div>
                          ) : isRouter && routerInst ? (
                            <div className="space-y-3 pt-3 border-t border-rose-200 dark:border-rose-700">
                              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-2">
                                🔀 Router Configuration - LLM Decides Which Endpoint to Call
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Description
                                </label>
                                <input
                                  type="text"
                                  value={routerInst.description || ""}
                                  onChange={(e) => updateRouterInstruction(index, "description", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-rose-300 dark:border-rose-700 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="What does this router step do?"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Evaluation Prompt (Question for LLM)
                                </label>
                                <textarea
                                  value={routerInst.evaluationPrompt || ""}
                                  onChange={(e) => updateRouterInstruction(index, "evaluationPrompt", e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="e.g., Based on the context, which data source would best answer this query?"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Options ({routerInst.options?.length || 0} configured)
                                </label>
                                <div className="space-y-2">
                                  {routerInst.options?.map((opt, optIdx) => (
                                    <div key={optIdx} className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded border border-rose-200 dark:border-rose-800">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
                                          {opt.id}: {opt.name}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          {opt.endpoint.apiUrl}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                        {opt.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  Default options: Weather, News, Finance APIs. LLM will pick the best one.
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Default Option
                                  </label>
                                  <select
                                    value={routerInst.defaultOption || ""}
                                    onChange={(e) => updateRouterInstruction(index, "defaultOption", e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="">None (use first)</option>
                                    {routerInst.options?.map((opt) => (
                                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Retries
                                  </label>
                                  <input
                                    type="number"
                                    value={routerInst.retries || 3}
                                    onChange={(e) => updateRouterInstruction(index, "retries", parseInt(e.target.value) || 3)}
                                    min={0}
                                    max={10}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : !isEndpoint ? (
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Instruction
                              </label>
                              <textarea
                                value={instructionText}
                                onChange={(e) => updateInstruction(index, e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder={
                                  index === 0
                                    ? "What should the LLM do with the context?"
                                    : `What should the LLM do with step ${index}'s result?`
                                }
                              />
                            </div>
                          ) : endpointInst ? (
                            <div className="space-y-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                              <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2">
                                Endpoint Configuration
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Endpoint Worker URL *
                                </label>
                                <select
                                  value={endpointInst.endpointUrl}
                                  onChange={(e) => updateEndpointInstruction(index, "endpointUrl", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                >
                                  {endpointWorkers.map((url, idx) => (
                                    <option key={idx} value={url}>{url}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  External API URL *
                                </label>
                                <input
                                  type="text"
                                  value={endpointInst.apiUrl}
                                  onChange={(e) => updateEndpointInstruction(index, "apiUrl", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="https://api.example.com/data"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    HTTP Method
                                  </label>
                                  <select
                                    value={endpointInst.method || "GET"}
                                    onChange={(e) => updateEndpointInstruction(index, "method", e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="GET">GET</option>
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                    <option value="DELETE">DELETE</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Retries
                                  </label>
                                  <input
                                    type="number"
                                    value={endpointInst.retries || 3}
                                    onChange={(e) => updateEndpointInstruction(index, "retries", parseInt(e.target.value) || 3)}
                                    min={0}
                                    max={10}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Retry Delay (ms)
                                  </label>
                                  <input
                                    type="number"
                                    value={endpointInst.retryDelay || 1000}
                                    onChange={(e) => updateEndpointInstruction(index, "retryDelay", parseInt(e.target.value) || 1000)}
                                    min={100}
                                    step={100}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Timeout (ms)
                                  </label>
                                  <input
                                    type="number"
                                    value={endpointInst.timeout || 30000}
                                    onChange={(e) => updateEndpointInstruction(index, "timeout", parseInt(e.target.value) || 30000)}
                                    min={1000}
                                    step={1000}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              </div>

                              {(endpointInst.method === "POST" || endpointInst.method === "PUT" || endpointInst.method === "PATCH") && (
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    Request Body (JSON)
                                  </label>
                                  <textarea
                                    value={typeof endpointInst.body === "string" ? endpointInst.body : JSON.stringify(endpointInst.body || {}, null, 2)}
                                    onChange={(e) => {
                                      try {
                                        const parsed = JSON.parse(e.target.value);
                                        updateEndpointInstruction(index, "body", parsed);
                                      } catch {
                                        updateEndpointInstruction(index, "body", e.target.value);
                                      }
                                    }}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                                    placeholder='{"key": "value"}'
                                  />
                                </div>
                              )}

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Description (optional)
                                </label>
                                <input
                                  type="text"
                                  value={endpointInst.description || ""}
                                  onChange={(e) => updateEndpointInstruction(index, "description", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  placeholder="What does this endpoint do?"
                                />
                              </div>
                            </div>
                          ) : null}

                          {isConditional && condition && (
                            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
                                Conditional Logic
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Condition Expression
                                </label>
                                <input
                                  type="text"
                                  value={condition.expression}
                                  onChange={(e) => updateCondition(index, "expression", e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  placeholder='e.g., result contains a number greater than 40'
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  Natural language condition evaluated by LLM
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    If True - Steps (0-indexed)
                                  </label>
                                  <input
                                    type="text"
                                    value={condition.ifTrue?.join(", ") || ""}
                                    onChange={(e) => {
                                      const values = e.target.value
                                        .split(",")
                                        .map((v) => parseInt(v.trim()))
                                        .filter((v) => !isNaN(v));
                                      updateCondition(index, "ifTrue", values);
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-green-300 dark:border-green-700 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g., 1, 2"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    If False - Steps (0-indexed)
                                  </label>
                                  <input
                                    type="text"
                                    value={condition.ifFalse?.join(", ") || ""}
                                    onChange={(e) => {
                                      const values = e.target.value
                                        .split(",")
                                        .map((v) => parseInt(v.trim()))
                                        .filter((v) => !isNaN(v));
                                      updateCondition(index, "ifFalse", values);
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-red-300 dark:border-red-700 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="e.g., 3, 4"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                  Evaluate After Step (optional, 1-indexed)
                                </label>
                                <input
                                  type="number"
                                  value={condition.evaluateAfterStep || ""}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                                    updateCondition(index, "evaluateAfterStep", val);
                                  }}
                                  min={1}
                                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  placeholder="Default: current step"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as "openai" | "anthropic")}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  {provider === "openai" ? (
                    <>
                      <option value="gpt-5-nano">GPT-5 Nano</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                    </>
                  ) : (
                    <>
                      <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={showConcurrentView}
                      onChange={(e) => {
                        setShowConcurrentView(e.target.checked);
                        if (!e.target.checked) {
                          setConcurrentWorkflows([]);
                        }
                      }}
                      className="rounded"
                    />
                    <span>Concurrent Mode (Track Multiple Workflows)</span>
                  </label>
                </div>

                {showConcurrentView && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="number"
                        id="concurrentCount"
                        min="1"
                        max="10"
                        defaultValue="3"
                        className="w-20 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="Count"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById("concurrentCount") as HTMLInputElement;
                          const count = input ? parseInt(input.value) || 3 : 3;
                          startMultipleWorkflows(count);
                        }}
                        disabled={isLoading}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-1 px-3 rounded"
                      >
                        Start Workflows
                      </button>
                      {concurrentWorkflows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setConcurrentWorkflows([])}
                          className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium py-1 px-3 rounded"
                        >
                          Clear All ({concurrentWorkflows.length})
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Start multiple workflows with the same configuration to test concurrent processing.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    {isLoading ? "Starting..." : showConcurrentView ? "Add Workflow" : "Start Workflow"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPayloadModal(true)}
                    className="bg-slate-600 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                    title="View raw JSON payload"
                  >
                    📋 JSON
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Status & Results */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {showConcurrentView ? `Workflow Status (${concurrentWorkflows.length})` : "Workflow Status"}
              </h2>
              {showConcurrentView && concurrentWorkflows.length > 0 && (
                <div className="flex gap-2 text-xs">
                  <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                    Complete: {concurrentWorkflows.filter(w => w.status.status === "complete").length}
                  </span>
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                    Running: {concurrentWorkflows.filter(w => w.status.status === "running" || w.status.status === "queued").length}
                  </span>
                  <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded">
                    Errors: {concurrentWorkflows.filter(w => w.status.status === "errored").length}
                  </span>
                </div>
              )}
            </div>

            {instanceId && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Instance ID:
                  </span>
                  <button
                    onClick={handleCheckStatus}
                    className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-2 py-1 rounded text-slate-700 dark:text-slate-300"
                  >
                    Refresh
                  </button>
                </div>
                <code className="block text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 break-all">
                  {instanceId}
                </code>
              </div>
            )}

            {workflowStatus && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Status:
                    </span>
                    <span
                      className={`ml-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                        workflowStatus.status
                      )}`}
                    >
                      {workflowStatus.status.toUpperCase()}
                      {workflowStatus.status === "running" && (
                        <span className="ml-2 animate-pulse">●</span>
                      )}
                    </span>
                  </div>
                  {workflowStatus.output && (
                    <button
                      type="button"
                      onClick={() => setShowResultsModal(true)}
                      className="text-xs bg-emerald-100 dark:bg-emerald-900 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1"
                      title="View raw JSON results"
                    >
                      📄 View JSON Results
                    </button>
                  )}
                </div>

                {/* Show results when available (even if workflow is still running) */}
                {(workflowStatus.status === "complete" || workflowStatus.status === "running") && workflowStatus.output && (
                  <div className="mt-4 space-y-4 max-h-[600px] overflow-y-auto">
                    {/* Display all steps */}
                    {workflowStatus.output.steps && workflowStatus.output.steps.length > 0 ? (
                      workflowStatus.output.steps.map((step, index) => {
                        const isLastStep = index === (workflowStatus.output?.steps?.length ?? 0) - 1;
                        const isCurrentlyRunning = workflowStatus.status === "running" && isLastStep;
                        return (
                          <div
                            key={step.stepNumber}
                            className="border-t border-slate-200 dark:border-slate-700 pt-4"
                          >
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                                Step {step.stepNumber}
                                {isLastStep && workflowStatus.status === "complete" && " (Final)"}
                                {isCurrentlyRunning && (
                                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                                    Processing...
                                  </span>
                                )}
                              </h3>
                              {step.duration !== undefined && step.duration !== null && (
                                <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
                                  {formatDuration(step.duration)}
                                </span>
                              )}
                              {step.result && (
                                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                                  ✓ Complete
                                </span>
                              )}
                              {step.conditionEvaluated && (
                                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                  🔀 Condition: {step.conditionResult ? "TRUE" : "FALSE"}
                                </span>
                              )}
                              {step.branchTaken && step.branchTaken !== "sequential" && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  step.branchTaken === "true"
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                }`}>
                                  Branch: {step.branchTaken === "true" ? "TRUE" : "FALSE"}
                                </span>
                              )}
                            </div>
                            <div
                              className={`p-3 rounded border ${
                                isLastStep && workflowStatus.status === "complete"
                                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">
                                <span className="font-medium">Instruction:</span> {step.instruction}
                              </p>
                              {step.result ? (
                                <p
                                  className={`text-sm text-slate-900 dark:text-slate-100 ${
                                    isLastStep && workflowStatus.status === "complete" ? "font-medium" : ""
                                  }`}
                                >
                                  {step.result}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                                  Waiting for result...
                                </p>
                              )}
                              {step.processedAt && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  <span>Processed: {new Date(step.processedAt).toLocaleString()}</span>
                                  {step.duration !== undefined && step.duration !== null && (
                                    <span className="font-mono">• {formatDuration(step.duration)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // Legacy format support
                      <>
                        {workflowStatus.output.firstResult && (
                          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                              Step 1 Result
                            </h3>
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                              <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">
                                <span className="font-medium">Instruction:</span>{" "}
                                {workflowStatus.output.firstInstruction}
                              </p>
                              <p className="text-sm text-slate-900 dark:text-slate-100">
                                {workflowStatus.output.firstResult}
                              </p>
                              {workflowStatus.output.processedAt && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                  Processed:{" "}
                                  {new Date(workflowStatus.output.processedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {workflowStatus.output.secondResult && (
                          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                              Step 2 Result (Final)
                            </h3>
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
                              <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">
                                <span className="font-medium">Instruction:</span>{" "}
                                {workflowStatus.output.secondInstruction}
                              </p>
                              <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                                {workflowStatus.output.secondResult}
                              </p>
                              {workflowStatus.output.finalizedAt && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                  Finalized:{" "}
                                  {new Date(workflowStatus.output.finalizedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Original Context */}
                    {workflowStatus.output.originalContext && (
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                          Original Context
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {workflowStatus.output.originalContext}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Finalized timestamp */}
                    {workflowStatus.output.finalizedAt && workflowStatus.status === "complete" && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 text-center pt-2">
                        Workflow completed:{" "}
                        {new Date(workflowStatus.output.finalizedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Show message when workflow is running but no results yet */}
                {workflowStatus.status === "running" && workflowStatus.output && (!workflowStatus.output.steps || workflowStatus.output.steps.length === 0) && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Workflow is running... Step results will appear here as they complete.
                    </p>
                  </div>
                )}

                {workflowStatus.status === "errored" && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      Workflow encountered an error. Please check the logs or try again.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Concurrent Workflows View */}
            {showConcurrentView && concurrentWorkflows.length > 0 && (
              <div className="mt-6 space-y-4 max-h-[800px] overflow-y-auto">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 sticky top-0 bg-white dark:bg-slate-800 py-2 z-10">
                  Concurrent Workflows ({concurrentWorkflows.length})
                </h3>
                {concurrentWorkflows.map((workflow, idx) => {
                  const isRunning = workflow.status.status === "running" || workflow.status.status === "queued";
                  const isComplete = workflow.status.status === "complete";
                  const isErrored = workflow.status.status === "errored";
                  const steps = workflow.status.output?.steps || [];
                  
                  return (
                    <div
                      key={workflow.instanceId}
                      className={`border rounded-lg p-4 ${
                        isComplete
                          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                          : isErrored
                          ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                          : isRunning
                          ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50"
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            Workflow #{idx + 1}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                              workflow.status.status
                            )}`}
                          >
                            {workflow.status.status.toUpperCase()}
                            {isRunning && <span className="ml-1 animate-pulse">●</span>}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Started: {new Date(workflow.createdAt).toLocaleTimeString()}
                          </span>
                          {steps.length > 0 && (
                            <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                              {steps.length} step{steps.length !== 1 ? "s" : ""} completed
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setConcurrentWorkflows(concurrentWorkflows.filter((w) => w.instanceId !== workflow.instanceId));
                          }}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 px-2 py-1"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Instance ID */}
                      <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-3 text-slate-600 dark:text-slate-400 break-all">
                        ID: {workflow.instanceId}
                      </code>

                      {/* Steps Progress */}
                      {steps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Step Progress:
                          </div>
                          {steps.map((step, stepIdx) => {
                            const isLastStep = stepIdx === steps.length - 1;
                            return (
                              <div
                                key={step.stepNumber}
                                className={`p-3 rounded border ${
                                  isLastStep && isComplete
                                    ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700"
                                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                    Step {step.stepNumber}
                                  </span>
                                  {step.duration !== undefined && step.duration !== null && (
                                    <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                      {formatDuration(step.duration)}
                                    </span>
                                  )}
                                  {step.result && (
                                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full">
                                      ✓
                                    </span>
                                  )}
                                  {step.conditionEvaluated && (
                                    <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">
                                      🔀 {step.conditionResult ? "TRUE" : "FALSE"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                  <span className="font-medium">Instruction:</span> {step.instruction.substring(0, 80)}{step.instruction.length > 80 ? "..." : ""}
                                </p>
                                {step.result && (
                                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                                    <span className="font-medium">Result:</span> {step.result.substring(0, 150)}{step.result.length > 150 ? "..." : ""}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Waiting message */}
                      {isRunning && steps.length === 0 && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 italic flex items-center gap-2">
                          <span className="animate-pulse">●</span>
                          Processing... Waiting for first step to complete.
                        </div>
                      )}

                      {/* Error message */}
                      {isErrored && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-2">
                          Workflow encountered an error.
                        </div>
                      )}

                      {/* Completion time */}
                      {isComplete && workflow.status.output?.finalizedAt && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                          ✓ Completed at {new Date(workflow.status.output.finalizedAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!instanceId && !showConcurrentView && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>No workflow running. Start a new workflow to see status here.</p>
              </div>
            )}

            {showConcurrentView && concurrentWorkflows.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>No concurrent workflows. Enable concurrent mode and start workflows to see them here.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* JSON Payload Modal */}
      {showPayloadModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPayloadModal(false)}
          />
          
          {/* Modal */}
          <div
            ref={modalRef}
            className="absolute bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
            style={{
              left: `${modalPosition.x}px`,
              top: `${modalPosition.y}px`,
              cursor: isDraggingModal ? 'grabbing' : 'default',
            }}
            onMouseDown={handleModalMouseDown}
          >
            {/* Modal Header - Draggable */}
            <div className="modal-header flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-slate-900 rounded-t-lg">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Raw JSON Payload
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyPayloadToClipboard}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                    copyFeedback
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : "bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                  }`}
                  title="Copy to clipboard"
                >
                  {copyFeedback ? "✓ Copied!" : "📋 Copy"}
                </button>
                <button
                  onClick={() => setShowPayloadModal(false)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-1"
                  title="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                {JSON.stringify(generatePayload(), null, 2)}
              </pre>
            </div>
            
            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                ⋮⋮ Drag header to move • API endpoint: <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{apiUrl}</code>
              </div>
              <button
                onClick={() => setShowPayloadModal(false)}
                className="text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Results Modal */}
      {showResultsModal && workflowStatus?.output && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowResultsModal(false)}
          />
          
          {/* Modal */}
          <div
            ref={resultsModalRef}
            className="relative bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700"
            style={{
              position: 'absolute',
              left: resultsModalPosition.x,
              top: resultsModalPosition.y,
            }}
            onMouseDown={handleResultsModalMouseDown}
          >
            {/* Modal Header - Draggable */}
            <div className="results-modal-header flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing bg-emerald-50 dark:bg-emerald-900/30 rounded-t-lg">
              <div className="flex items-center gap-2">
                <span className="text-lg">📄</span>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Raw JSON Results
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300">
                  {workflowStatus.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyResultsToClipboard}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                    copyResultsFeedback
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : "bg-emerald-100 dark:bg-emerald-900 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-700 dark:text-emerald-300"
                  }`}
                  title="Copy to clipboard"
                >
                  {copyResultsFeedback ? "✓ Copied!" : "📋 Copy"}
                </button>
                <button
                  onClick={() => setShowResultsModal(false)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-1"
                  title="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                {JSON.stringify(workflowStatus.output, null, 2)}
              </pre>
            </div>
            
            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-emerald-900/30 rounded-b-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                ⋮⋮ Drag header to move • {workflowStatus.output.steps?.length || 0} steps
                {workflowStatus.output.finalizedAt && (
                  <span> • Completed: {new Date(workflowStatus.output.finalizedAt).toLocaleString()}</span>
                )}
              </div>
              <button
                onClick={() => setShowResultsModal(false)}
                className="text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
