"use client";

import React, { useCallback, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Handle,
  Position,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle, BaseNodeContent } from "@/components/base-node";
import { NodeMenu } from "@/components/node-menu";
import { NodeActionsProvider, useNodeActions } from "./node-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Settings, FileText, GitBranch, Globe, Layers, RefreshCw, Play, Zap, Hand, Download, Upload, ClipboardPaste } from "lucide-react";
import {
  StepType,
  NodeData,
  SimpleStep,
  ConditionalStep,
  EndpointStep,
  ThreadStep,
  RouterStep,
  ConditionalLogic,
  RouterOption,
} from "./types";

// Default endpoint workers
const ENDPOINT_WORKERS = [
  "https://endpoint-1.developer-f79.workers.dev",
  "https://endpoint-2.developer-f79.workers.dev",
  "https://endpoint-3.developer-f79.workers.dev",
];

// Helper function to create default step config
function createDefaultStepConfig(stepType: StepType): SimpleStep | ConditionalStep | EndpointStep | ThreadStep | RouterStep {
  switch (stepType) {
    case "simple":
      return { instruction: "" };
    case "conditional":
      return {
        instruction: "",
        condition: { expression: "", ifTrue: [], ifFalse: [] },
      };
    case "endpoint":
      return {
        type: "endpoint",
        endpointUrl: ENDPOINT_WORKERS[0],
        apiUrl: "",
        method: "GET",
        retries: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
    case "thread":
      return {
        type: "thread",
        collectFromSteps: [],
        outputFormat: "json",
        completionCheck: { mode: "deterministic" },
      };
    case "router":
      return {
        type: "router",
        description: "",
        evaluationPrompt: "",
        options: [],
        defaultOption: "",
      };
  }
}

// Custom node component using BaseNode
function CustomNode({ data, id }: { data: NodeData; id: string }) {
  const { onEditNode, onDeleteNode } = useNodeActions();
  
  const stepTypeStyles: Record<StepType, { bg: string; border: string; gradient: string; Icon: React.ComponentType<{ className?: string }> }> = {
    simple: {
      bg: "bg-blue-500",
      border: "border-blue-400/30",
      gradient: "from-blue-500/10 to-transparent",
      Icon: FileText,
    },
    conditional: {
      bg: "bg-purple-500",
      border: "border-purple-400/30",
      gradient: "from-purple-500/10 to-transparent",
      Icon: GitBranch,
    },
    endpoint: {
      bg: "bg-emerald-500",
      border: "border-emerald-400/30",
      gradient: "from-emerald-500/10 to-transparent",
      Icon: Globe,
    },
    thread: {
      bg: "bg-amber-500",
      border: "border-amber-400/30",
      gradient: "from-amber-500/10 to-transparent",
      Icon: Layers,
    },
    router: {
      bg: "bg-rose-500",
      border: "border-rose-400/30",
      gradient: "from-rose-500/10 to-transparent",
      Icon: RefreshCw,
    },
  };

  const isStartNode = data.label.toLowerCase().includes("start");
  const nodeWidth = isStartNode ? "min-w-[100px]" : "min-w-[180px]";
  const styles = stepTypeStyles[data.stepType];
  const IconComponent = styles.Icon;

  return (
    <NodeMenu 
      onEdit={() => onEditNode(id)} 
      onDelete={() => onDeleteNode(id)}
      nodeLabel={data.label}
    >
      <BaseNode 
        className={`${nodeWidth} ${styles.border} shadow-lg hover:shadow-xl transition-all duration-200`}
      >
        <Handle 
          type="target" 
          position={Position.Top} 
          className={`!w-2 !h-2 !border !border-white ${styles.bg} !cursor-crosshair !z-10`}
          style={{ top: '-4px', pointerEvents: 'auto' }}
          isConnectable={true}
        />
        
        {/* Gradient accent at top */}
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${styles.bg.replace('bg-', 'from-')} to-transparent rounded-t-lg`} />
        
        <BaseNodeHeader className={`bg-gradient-to-b ${styles.gradient} border-b border-border/30 py-2 px-3`}>
          <div className="flex items-center justify-center w-full gap-1.5 relative">
            {isStartNode && <Play className="h-2.5 w-2.5" />}
            <BaseNodeHeaderTitle className={`text-center font-semibold tracking-tight ${isStartNode ? "text-[10px]" : "text-[11px]"}`}>
              {data.label}
            </BaseNodeHeaderTitle>
            {!isStartNode && (
              <span
                className={`absolute -right-1 flex items-center justify-center px-1.5 py-0.5 rounded-md text-white shadow-md ${styles.bg}`}
              >
                <IconComponent className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        </BaseNodeHeader>
        
        {data.description && !isStartNode && (
          <BaseNodeContent className="py-1.5 px-2">
            <p className="text-[9px] text-muted-foreground text-center leading-snug opacity-80">
              {data.description}
            </p>
          </BaseNodeContent>
        )}
        
        {!isStartNode && (
          <BaseNodeContent className="py-1.5 px-2 pt-0">
            <div className="text-[9px] text-center">
              {data.stepType === "simple" && (data.stepConfig as SimpleStep).instruction && (
                <p className="truncate text-foreground/70 font-mono bg-muted/50 rounded px-1.5 py-0.5">
                  {(data.stepConfig as SimpleStep).instruction}
                </p>
              )}
              {data.stepType === "endpoint" && (
                <p className="truncate text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/30 rounded px-1.5 py-0.5">
                  {(data.stepConfig as EndpointStep).apiUrl || "No API URL"}
                </p>
              )}
              {data.stepType === "thread" && (
                <p className="truncate text-amber-600 dark:text-amber-400 font-mono bg-amber-50 dark:bg-amber-950/30 rounded px-1.5 py-0.5">
                  Steps: {(data.stepConfig as ThreadStep).collectFromSteps.join(", ") || "—"}
                </p>
              )}
              {data.stepType === "router" && (
                <p className="truncate text-rose-600 dark:text-rose-400 font-mono bg-rose-50 dark:bg-rose-950/30 rounded px-1.5 py-0.5">
                  {(data.stepConfig as RouterStep).options.length} option(s)
                </p>
              )}
              {data.stepType === "conditional" && (
                <p className="truncate text-purple-600 dark:text-purple-400 font-mono bg-purple-50 dark:bg-purple-950/30 rounded px-1.5 py-0.5">
                  {(data.stepConfig as ConditionalStep).condition?.expression || "No condition"}
                </p>
              )}
            </div>
          </BaseNodeContent>
        )}
        
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className={`!w-2 !h-2 !border !border-white ${styles.bg} !cursor-crosshair !z-10`}
          style={{ bottom: '-4px', pointerEvents: 'auto' }}
          isConnectable={true}
        />
      </BaseNode>
    </NodeMenu>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const initialNodes: Node[] = [
  {
    id: "1",
    type: "custom",
    position: { x: 250, y: 100 },
    data: {
      label: "Start Node",
      description: "Workflow entry point",
      stepType: "simple",
      stepConfig: { instruction: "Start processing" },
    },
  },
];

const initialEdges: Edge[] = [];

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [nodeIdCounter, setNodeIdCounter] = useState(2);

  // Form state
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [stepType, setStepType] = useState<StepType>("simple");
  const [stepConfig, setStepConfig] = useState<SimpleStep | ConditionalStep | EndpointStep | ThreadStep | RouterStep>(
    createDefaultStepConfig("simple")
  );

  // Space key panning state
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Paste JSON dialog state
  const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle node double-click to configure
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const nodeData = node.data as NodeData;
    setSelectedNode(node);
    setLabel(nodeData.label);
    setDescription(nodeData.description || "");
    setStepType(nodeData.stepType);
    setStepConfig(nodeData.stepConfig);
    setIsConfigDialogOpen(true);
  }, []);

  // Handle node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNode((current) => (current?.id === nodeId ? null : current));
    },
    [setNodes, setEdges]
  );

  // Edit node (for context menu)
  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const nodeData = node.data as NodeData;
      setSelectedNode(node);
      setLabel(nodeData.label);
      setDescription(nodeData.description || "");
      setStepType(nodeData.stepType);
      setStepConfig(nodeData.stepConfig);
      setIsConfigDialogOpen(true);
    },
    [nodes]
  );

  // Export flow as JSON (matching workflow-engine-ui format)
  const handleExportFlow = useCallback(() => {
    // Build adjacency list from edges
    const adjacency: Record<string, string[]> = {};
    edges.forEach((edge) => {
      if (!adjacency[edge.source]) adjacency[edge.source] = [];
      adjacency[edge.source].push(edge.target);
    });

    // Find start node (node with no incoming edges)
    const hasIncoming = new Set(edges.map((e) => e.target));
    const startNodes = nodes.filter((n) => !hasIncoming.has(n.id));
    
    // Topological sort to get execution order
    const visited = new Set<string>();
    const orderedNodes: Node[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) orderedNodes.push(node);
      (adjacency[nodeId] || []).forEach(visit);
    };
    
    startNodes.forEach((n) => visit(n.id));
    // Add any unvisited nodes
    nodes.forEach((n) => {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        orderedNodes.push(n);
      }
    });

    // Extract context from start node or use default
    const startNode = orderedNodes.find((n) => 
      (n.data as NodeData).label.toLowerCase().includes("start")
    );
    const context = startNode 
      ? (startNode.data as NodeData).description || "Workflow context" 
      : "Workflow context";

    // Convert nodes to instructions (skip start node)
    const instructions = orderedNodes
      .filter((n) => !(n.data as NodeData).label.toLowerCase().includes("start"))
      .map((node) => {
        const data = node.data as NodeData;
        const config = data.stepConfig;

        switch (data.stepType) {
          case "simple":
            return (config as SimpleStep).instruction || data.label;

          case "conditional":
            const condConfig = config as ConditionalStep;
            return {
              instruction: condConfig.instruction || data.label,
              condition: condConfig.condition ? {
                expression: condConfig.condition.expression,
                ifTrue: condConfig.condition.ifTrue,
                ifFalse: condConfig.condition.ifFalse,
                evaluateAfterStep: condConfig.condition.evaluateAfterStep,
              } : undefined,
            };

          case "endpoint":
            const endConfig = config as EndpointStep;
            return {
              type: "endpoint" as const,
              endpointUrl: endConfig.endpointUrl,
              apiUrl: endConfig.apiUrl,
              method: endConfig.method,
              headers: endConfig.headers,
              body: endConfig.body,
              retries: endConfig.retries,
              retryDelay: endConfig.retryDelay,
              timeout: endConfig.timeout,
              description: endConfig.description || data.description,
              condition: endConfig.condition,
            };

          case "thread":
            const threadConfig = config as ThreadStep;
            return {
              type: "thread" as const,
              collectFromSteps: threadConfig.collectFromSteps,
              outputFormat: threadConfig.outputFormat,
              description: threadConfig.description || data.description,
              completionCheck: threadConfig.completionCheck,
              condition: threadConfig.condition,
            };

          case "router":
            const routerConfig = config as RouterStep;
            return {
              type: "router" as const,
              description: routerConfig.description || data.description || data.label,
              evaluationPrompt: routerConfig.evaluationPrompt,
              options: routerConfig.options,
              defaultOption: routerConfig.defaultOption,
              retries: routerConfig.retries,
              retryDelay: routerConfig.retryDelay,
              timeout: routerConfig.timeout,
              condition: routerConfig.condition,
            };

          default:
            return data.label;
        }
      });

    // Build workflow payload matching workflow-engine-ui format
    const workflowPayload = {
      context,
      instructions,
      provider: "openai" as const,
      model: "gpt-5-nano",
    };

    const jsonString = JSON.stringify(workflowPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  // Import flow from JSON (workflow-engine-ui format)
  const handleImportFlow = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const payload = JSON.parse(content);

        // Validate basic structure
        if (!payload.instructions || !Array.isArray(payload.instructions)) {
          alert("Invalid workflow file: missing instructions array");
          return;
        }

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const startX = 250;
        const startY = 50;
        const nodeSpacing = 150;

        // Create start node with context
        const startNodeId = "imported-start";
        newNodes.push({
          id: startNodeId,
          type: "custom",
          position: { x: startX, y: startY },
          data: {
            label: "Start",
            description: payload.context || "Imported workflow",
            stepType: "simple",
            stepConfig: { instruction: "Start workflow" },
          } as NodeData,
        });

        let prevNodeId = startNodeId;

        // Convert instructions to nodes
        payload.instructions.forEach((instruction: unknown, index: number) => {
          const nodeId = `imported-${index + 1}`;
          const yPos = startY + (index + 1) * nodeSpacing;
          let nodeData: NodeData;

          if (typeof instruction === "string") {
            // Simple instruction
            nodeData = {
              label: `Step ${index + 1}`,
              description: instruction.substring(0, 50) + (instruction.length > 50 ? "..." : ""),
              stepType: "simple",
              stepConfig: { instruction } as SimpleStep,
            };
          } else if (instruction && typeof instruction === "object") {
            const inst = instruction as Record<string, unknown>;
            
            if (inst.type === "endpoint") {
              nodeData = {
                label: (inst.description as string) || `Endpoint ${index + 1}`,
                description: inst.apiUrl as string,
                stepType: "endpoint",
                stepConfig: {
                  type: "endpoint",
                  endpointUrl: inst.endpointUrl as string || ENDPOINT_WORKERS[0],
                  apiUrl: inst.apiUrl as string || "",
                  method: inst.method as EndpointStep["method"] || "GET",
                  headers: inst.headers as Record<string, string>,
                  body: inst.body as string | Record<string, unknown>,
                  retries: inst.retries as number,
                  retryDelay: inst.retryDelay as number,
                  timeout: inst.timeout as number,
                  description: inst.description as string,
                  condition: inst.condition as ConditionalLogic,
                } as EndpointStep,
              };
            } else if (inst.type === "thread") {
              nodeData = {
                label: (inst.description as string) || `Thread ${index + 1}`,
                description: `Collect from steps: ${(inst.collectFromSteps as number[])?.join(", ") || ""}`,
                stepType: "thread",
                stepConfig: {
                  type: "thread",
                  collectFromSteps: inst.collectFromSteps as number[] || [],
                  outputFormat: inst.outputFormat as ThreadStep["outputFormat"] || "json",
                  description: inst.description as string,
                  completionCheck: inst.completionCheck as ThreadStep["completionCheck"],
                  condition: inst.condition as ConditionalLogic,
                } as ThreadStep,
              };
            } else if (inst.type === "router") {
              nodeData = {
                label: (inst.description as string) || `Router ${index + 1}`,
                description: inst.evaluationPrompt as string,
                stepType: "router",
                stepConfig: {
                  type: "router",
                  description: inst.description as string || "",
                  evaluationPrompt: inst.evaluationPrompt as string || "",
                  options: inst.options as RouterOption[] || [],
                  defaultOption: inst.defaultOption as string,
                  retries: inst.retries as number,
                  retryDelay: inst.retryDelay as number,
                  timeout: inst.timeout as number,
                  condition: inst.condition as ConditionalLogic,
                } as RouterStep,
              };
            } else if (inst.condition) {
              // Conditional instruction
              const condition = inst.condition as Record<string, unknown>;
              nodeData = {
                label: `Conditional ${index + 1}`,
                description: (inst.instruction as string)?.substring(0, 50) || "",
                stepType: "conditional",
                stepConfig: {
                  instruction: inst.instruction as string || "",
                  condition: {
                    expression: condition.expression as string || "",
                    ifTrue: condition.ifTrue as number[],
                    ifFalse: condition.ifFalse as number[],
                    evaluateAfterStep: condition.evaluateAfterStep as number,
                  },
                } as ConditionalStep,
              };
            } else {
              // Simple instruction object
              nodeData = {
                label: `Step ${index + 1}`,
                description: (inst.instruction as string)?.substring(0, 50) || "",
                stepType: "simple",
                stepConfig: { instruction: inst.instruction as string || "" } as SimpleStep,
              };
            }
          } else {
            return; // Skip invalid instruction
          }

          newNodes.push({
            id: nodeId,
            type: "custom",
            position: { x: startX, y: yPos },
            data: nodeData,
          });

          // Create edge from previous node
          newEdges.push({
            id: `e-${prevNodeId}-${nodeId}`,
            source: prevNodeId,
            target: nodeId,
            type: "smoothstep",
          });

          prevNodeId = nodeId;
        });

        // Update state
        setNodes(newNodes);
        setEdges(newEdges);
        setSelectedNode(null);

        // Reset file input
        event.target.value = "";
      } catch (error) {
        console.error("Error importing workflow:", error);
        alert("Failed to import workflow. Please check the file format.");
        event.target.value = "";
      }
    };

    reader.readAsText(file);
  }, [setNodes, setEdges]);

  // Import from pasted JSON text
  const handlePasteImport = useCallback(() => {
    setPasteError(null);
    
    if (!pasteJsonText.trim()) {
      setPasteError("Please paste JSON content");
      return;
    }

    try {
      const payload = JSON.parse(pasteJsonText);

      // Validate basic structure
      if (!payload.instructions || !Array.isArray(payload.instructions)) {
        setPasteError("Invalid workflow: missing instructions array");
        return;
      }

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const startX = 250;
      const startY = 50;
      const nodeSpacing = 150;

      // Create start node with context
      const startNodeId = "imported-start";
      newNodes.push({
        id: startNodeId,
        type: "custom",
        position: { x: startX, y: startY },
        data: {
          label: "Start",
          description: payload.context || "Imported workflow",
          stepType: "simple",
          stepConfig: { instruction: "Start workflow" },
        } as NodeData,
      });

      let prevNodeId = startNodeId;

      // Convert instructions to nodes
      payload.instructions.forEach((instruction: unknown, index: number) => {
        const nodeId = `imported-${index + 1}`;
        const yPos = startY + (index + 1) * nodeSpacing;
        let nodeData: NodeData;

        if (typeof instruction === "string") {
          nodeData = {
            label: `Step ${index + 1}`,
            description: instruction.substring(0, 50) + (instruction.length > 50 ? "..." : ""),
            stepType: "simple",
            stepConfig: { instruction } as SimpleStep,
          };
        } else if (instruction && typeof instruction === "object") {
          const inst = instruction as Record<string, unknown>;
          
          if (inst.type === "endpoint") {
            nodeData = {
              label: (inst.description as string) || `Endpoint ${index + 1}`,
              description: inst.apiUrl as string,
              stepType: "endpoint",
              stepConfig: {
                type: "endpoint",
                endpointUrl: inst.endpointUrl as string || ENDPOINT_WORKERS[0],
                apiUrl: inst.apiUrl as string || "",
                method: inst.method as EndpointStep["method"] || "GET",
                headers: inst.headers as Record<string, string>,
                body: inst.body as string | Record<string, unknown>,
                retries: inst.retries as number,
                retryDelay: inst.retryDelay as number,
                timeout: inst.timeout as number,
                description: inst.description as string,
                condition: inst.condition as ConditionalLogic,
              } as EndpointStep,
            };
          } else if (inst.type === "thread") {
            nodeData = {
              label: (inst.description as string) || `Thread ${index + 1}`,
              description: `Collect from steps: ${(inst.collectFromSteps as number[])?.join(", ") || ""}`,
              stepType: "thread",
              stepConfig: {
                type: "thread",
                collectFromSteps: inst.collectFromSteps as number[] || [],
                outputFormat: inst.outputFormat as ThreadStep["outputFormat"] || "json",
                description: inst.description as string,
                completionCheck: inst.completionCheck as ThreadStep["completionCheck"],
                condition: inst.condition as ConditionalLogic,
              } as ThreadStep,
            };
          } else if (inst.type === "router") {
            nodeData = {
              label: (inst.description as string) || `Router ${index + 1}`,
              description: inst.evaluationPrompt as string,
              stepType: "router",
              stepConfig: {
                type: "router",
                description: inst.description as string || "",
                evaluationPrompt: inst.evaluationPrompt as string || "",
                options: inst.options as RouterOption[] || [],
                defaultOption: inst.defaultOption as string,
                retries: inst.retries as number,
                retryDelay: inst.retryDelay as number,
                timeout: inst.timeout as number,
                condition: inst.condition as ConditionalLogic,
              } as RouterStep,
            };
          } else if (inst.condition) {
            const condition = inst.condition as Record<string, unknown>;
            nodeData = {
              label: `Conditional ${index + 1}`,
              description: (inst.instruction as string)?.substring(0, 50) || "",
              stepType: "conditional",
              stepConfig: {
                instruction: inst.instruction as string || "",
                condition: {
                  expression: condition.expression as string || "",
                  ifTrue: condition.ifTrue as number[],
                  ifFalse: condition.ifFalse as number[],
                  evaluateAfterStep: condition.evaluateAfterStep as number,
                },
              } as ConditionalStep,
            };
          } else {
            nodeData = {
              label: `Step ${index + 1}`,
              description: (inst.instruction as string)?.substring(0, 50) || "",
              stepType: "simple",
              stepConfig: { instruction: inst.instruction as string || "" } as SimpleStep,
            };
          }
        } else {
          return;
        }

        newNodes.push({
          id: nodeId,
          type: "custom",
          position: { x: startX, y: yPos },
          data: nodeData,
        });

        newEdges.push({
          id: `e-${prevNodeId}-${nodeId}`,
          source: prevNodeId,
          target: nodeId,
          type: "smoothstep",
        });

        prevNodeId = nodeId;
      });

      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNode(null);
      setIsPasteDialogOpen(false);
      setPasteJsonText("");
      setPasteError(null);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      setPasteError("Invalid JSON format. Please check your input.");
    }
  }, [pasteJsonText, setNodes, setEdges]);

  // Handle keyboard events (delete + space for panning)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode && !isConfigDialogOpen) {
        handleDeleteNode(selectedNode.id);
      }
      if (event.code === "Space" && !isConfigDialogOpen) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedNode, handleDeleteNode, isConfigDialogOpen]);

  // Create new node
  const handleCreateNode = useCallback(() => {
    if (!reactFlowInstance) return;

    const viewport = reactFlowInstance.getViewport();
    const centerX = -viewport.x + window.innerWidth / 2;
    const centerY = -viewport.y + window.innerHeight / 2;

    const newNode: Node = {
      id: `node-${nodeIdCounter}`,
      type: "custom",
      position: { x: centerX - 100, y: centerY - 50 },
      data: {
        label: `New Node ${nodeIdCounter}`,
        description: "",
        stepType: "simple",
        stepConfig: createDefaultStepConfig("simple"),
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setNodeIdCounter((counter) => counter + 1);
    setSelectedNode(newNode);
    setLabel(newNode.data.label);
    setDescription(newNode.data.description || "");
    setStepType("simple");
    setStepConfig(createDefaultStepConfig("simple"));
    setIsConfigDialogOpen(true);
  }, [reactFlowInstance, nodeIdCounter, setNodes]);

  // Handle step type change
  const handleStepTypeChange = useCallback((newStepType: StepType) => {
    setStepType(newStepType);
    setStepConfig(createDefaultStepConfig(newStepType));
  }, []);

  // Save node configuration
  const handleSaveNode = useCallback(() => {
    if (!selectedNode || !label.trim()) return;

    const nodeData: NodeData = {
      label: label.trim(),
      description: description.trim() || undefined,
      stepType,
      stepConfig,
    };

    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id ? { ...node, data: nodeData } : node
      )
    );
    setIsConfigDialogOpen(false);
    setSelectedNode(null);
  }, [selectedNode, label, description, stepType, stepConfig, setNodes]);

  return (
    <NodeActionsProvider onEditNode={handleEditNode} onDeleteNode={handleDeleteNode}>
      <div className="h-screen w-screen relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-card/80 backdrop-blur-md rounded-xl border shadow-xl p-2 px-3">
        <div className="flex items-center gap-2 pr-2 border-r border-border">
          <Zap className="h-4 w-4" />
          <span className="text-xs font-bold tracking-tight text-foreground/80">Workflow Flow</span>
        </div>
        {isSpacePressed && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded-md text-xs font-medium animate-pulse">
            <Hand className="h-3.5 w-3.5" />
            Panning
          </div>
        )}
        <Button onClick={handleCreateNode} size="sm" className="gap-1.5 font-medium">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button onClick={handleExportFlow} variant="outline" size="sm" className="gap-1.5 font-medium">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 font-medium"
          onClick={() => document.getElementById("import-file-input")?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
        <input
          id="import-file-input"
          type="file"
          accept=".json"
          onChange={handleImportFlow}
          className="hidden"
        />
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 font-medium"
          onClick={() => setIsPasteDialogOpen(true)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste
        </Button>
        {selectedNode && (
          <>
            <div className="w-px h-6 bg-border" />
            <Button
              onClick={() => {
                const nodeData = selectedNode.data as NodeData;
                setLabel(nodeData.label);
                setDescription(nodeData.description || "");
                setStepType(nodeData.stepType);
                setStepConfig(nodeData.stepConfig);
                setIsConfigDialogOpen(true);
              }}
              variant="secondary"
              size="sm"
              className="gap-1.5 font-medium"
            >
              <Settings className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              onClick={() => handleDeleteNode(selectedNode.id)}
              variant="destructive"
              size="sm"
              className="gap-1.5 font-medium"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        panOnDrag={isSpacePressed}
        selectionOnDrag={!isSpacePressed}
        panOnScroll={true}
        zoomOnScroll={true}
        className={isSpacePressed ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={20} size={1} />
        <Controls className="!bg-card/80 !backdrop-blur-md !border !shadow-lg !rounded-lg overflow-hidden [&>button]:!border-border [&>button]:!bg-transparent [&>button:hover]:!bg-muted" />
        <MiniMap 
          className="!bg-card/80 !backdrop-blur-md !border !shadow-lg !rounded-lg overflow-hidden"
          nodeColor="#94a3b8"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>

      {/* Configuration Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" showOverlay={false}>
          <DialogHeader>
            <DialogTitle>Configure Node</DialogTitle>
            <DialogDescription>Set up the step configuration for this node.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid gap-2">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter node label"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter node description (optional)"
              />
            </div>

            {/* Step Type Selection */}
            <div className="grid gap-2">
              <Label htmlFor="stepType">Step Type</Label>
              <Select value={stepType} onValueChange={handleStepTypeChange}>
                <SelectTrigger id="stepType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                  <SelectItem value="endpoint">Endpoint</SelectItem>
                  <SelectItem value="thread">Thread</SelectItem>
                  <SelectItem value="router">Router</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Step Configuration Forms */}
            <Tabs value={stepType} onValueChange={(value) => handleStepTypeChange(value as StepType)} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="simple">Simple</TabsTrigger>
                <TabsTrigger value="conditional">Conditional</TabsTrigger>
                <TabsTrigger value="endpoint">Endpoint</TabsTrigger>
                <TabsTrigger value="thread">Thread</TabsTrigger>
                <TabsTrigger value="router">Router</TabsTrigger>
              </TabsList>

              {/* Simple Step */}
              <TabsContent value="simple" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="instruction">Instruction *</Label>
                  <Textarea
                    id="instruction"
                    value={(stepConfig as SimpleStep).instruction || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, instruction: e.target.value } as SimpleStep)
                    }
                    placeholder="Enter the instruction for the LLM"
                    rows={4}
                  />
                </div>
              </TabsContent>

              {/* Conditional Step */}
              <TabsContent value="conditional" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="cond-instruction">Instruction *</Label>
                  <Textarea
                    id="cond-instruction"
                    value={(stepConfig as ConditionalStep).instruction || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        instruction: e.target.value,
                      } as ConditionalStep)
                    }
                    placeholder="Enter the instruction for the LLM"
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="condition-expression">Condition Expression *</Label>
                  <Input
                    id="condition-expression"
                    value={(stepConfig as ConditionalStep).condition?.expression || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        condition: {
                          ...(stepConfig as ConditionalStep).condition,
                          expression: e.target.value,
                        } as ConditionalLogic,
                      } as ConditionalStep)
                    }
                    placeholder="e.g., result contains YES"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="if-true">If True (Step indices, comma-separated, 0-indexed)</Label>
                    <Input
                      id="if-true"
                      value={(stepConfig as ConditionalStep).condition?.ifTrue?.join(", ") || ""}
                      onChange={(e) => {
                        const values = e.target.value
                          .split(",")
                          .map((v) => parseInt(v.trim()))
                          .filter((v) => !isNaN(v));
                        setStepConfig({
                          ...stepConfig,
                          condition: {
                            ...(stepConfig as ConditionalStep).condition,
                            ifTrue: values,
                          } as ConditionalLogic,
                        } as ConditionalStep);
                      }}
                      placeholder="e.g., 1, 2"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="if-false">If False (Step indices, comma-separated, 0-indexed)</Label>
                    <Input
                      id="if-false"
                      value={(stepConfig as ConditionalStep).condition?.ifFalse?.join(", ") || ""}
                      onChange={(e) => {
                        const values = e.target.value
                          .split(",")
                          .map((v) => parseInt(v.trim()))
                          .filter((v) => !isNaN(v));
                        setStepConfig({
                          ...stepConfig,
                          condition: {
                            ...(stepConfig as ConditionalStep).condition,
                            ifFalse: values,
                          } as ConditionalLogic,
                        } as ConditionalStep);
                      }}
                      placeholder="e.g., 3, 4"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="evaluate-after">Evaluate After Step (1-indexed, optional)</Label>
                  <Input
                    id="evaluate-after"
                    type="number"
                    value={(stepConfig as ConditionalStep).condition?.evaluateAfterStep || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        condition: {
                          ...(stepConfig as ConditionalStep).condition,
                          evaluateAfterStep: e.target.value ? parseInt(e.target.value) : undefined,
                        } as ConditionalLogic,
                      } as ConditionalStep)
                    }
                    placeholder="Leave empty to evaluate current step"
                  />
                </div>
              </TabsContent>

              {/* Endpoint Step */}
              <TabsContent value="endpoint" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="endpoint-url">Endpoint Worker URL *</Label>
                  <Select
                    value={(stepConfig as EndpointStep).endpointUrl || ""}
                    onValueChange={(value) =>
                      setStepConfig({
                        ...stepConfig,
                        endpointUrl: value,
                      } as EndpointStep)
                    }
                  >
                    <SelectTrigger id="endpoint-url">
                      <SelectValue placeholder="Select endpoint worker" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENDPOINT_WORKERS.map((url) => (
                        <SelectItem key={url} value={url}>
                          {url}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="api-url">API URL *</Label>
                  <Input
                    id="api-url"
                    value={(stepConfig as EndpointStep).apiUrl || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        apiUrl: e.target.value,
                      } as EndpointStep)
                    }
                    placeholder="https://api.example.com/endpoint"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="method">HTTP Method</Label>
                    <Select
                      value={(stepConfig as EndpointStep).method || "GET"}
                      onValueChange={(value) =>
                        setStepConfig({
                          ...stepConfig,
                          method: value as EndpointStep["method"],
                        } as EndpointStep)
                      }
                    >
                      <SelectTrigger id="method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="retries">Retries</Label>
                    <Input
                      id="retries"
                      type="number"
                      min="0"
                      max="10"
                      value={(stepConfig as EndpointStep).retries || 3}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          retries: parseInt(e.target.value) || 3,
                        } as EndpointStep)
                      }
                    />
                  </div>
                </div>
                {["POST", "PUT", "PATCH"].includes((stepConfig as EndpointStep).method || "GET") && (
                  <div className="grid gap-2">
                    <Label htmlFor="body">Request Body (JSON)</Label>
                    <Textarea
                      id="body"
                      value={(() => {
                        const body = (stepConfig as EndpointStep).body;
                        if (typeof body === "string") return body;
                        if (body === undefined) return "";
                        return JSON.stringify(body, null, 2);
                      })()}
                      onChange={(e) => {
                        const value = e.target.value;
                        try {
                          const parsed = JSON.parse(value);
                          setStepConfig({
                            ...stepConfig,
                            body: parsed,
                          } as EndpointStep);
                        } catch {
                          setStepConfig({
                            ...stepConfig,
                            body: value,
                          } as EndpointStep);
                        }
                      }}
                      placeholder='{"key": "value"}'
                      rows={4}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="retry-delay">Retry Delay (ms)</Label>
                    <Input
                      id="retry-delay"
                      type="number"
                      min="100"
                      value={(stepConfig as EndpointStep).retryDelay || 1000}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          retryDelay: parseInt(e.target.value) || 1000,
                        } as EndpointStep)
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="timeout">Timeout (ms)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min="1000"
                      value={(stepConfig as EndpointStep).timeout || 30000}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          timeout: parseInt(e.target.value) || 30000,
                        } as EndpointStep)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endpoint-description">Description</Label>
                  <Input
                    id="endpoint-description"
                    value={(stepConfig as EndpointStep).description || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        description: e.target.value,
                      } as EndpointStep)
                    }
                    placeholder="Optional description"
                  />
                </div>
              </TabsContent>

              {/* Thread Step */}
              <TabsContent value="thread" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="collect-from">Collect From Steps (1-indexed, comma-separated) *</Label>
                  <Input
                    id="collect-from"
                    value={(stepConfig as ThreadStep).collectFromSteps?.join(", ") || ""}
                    onChange={(e) => {
                      const values = e.target.value
                        .split(",")
                        .map((v) => parseInt(v.trim()))
                        .filter((v) => !isNaN(v));
                      setStepConfig({
                        ...stepConfig,
                        collectFromSteps: values,
                      } as ThreadStep);
                    }}
                    placeholder="e.g., 1, 2, 3"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="output-format">Output Format</Label>
                  <Select
                    value={(stepConfig as ThreadStep).outputFormat || "json"}
                    onValueChange={(value) =>
                      setStepConfig({
                        ...stepConfig,
                        outputFormat: value as ThreadStep["outputFormat"],
                      } as ThreadStep)
                    }
                  >
                    <SelectTrigger id="output-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="numbered">Numbered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="completion-mode">Completion Check Mode</Label>
                  <Select
                    value={(stepConfig as ThreadStep).completionCheck?.mode || "deterministic"}
                    onValueChange={(value) =>
                      setStepConfig({
                        ...stepConfig,
                        completionCheck: {
                          mode: value as "deterministic" | "llm",
                          expression: value === "llm" ? (stepConfig as ThreadStep).completionCheck?.expression : undefined,
                        },
                      } as ThreadStep)
                    }
                  >
                    <SelectTrigger id="completion-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deterministic">Deterministic</SelectItem>
                      <SelectItem value="llm">LLM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(stepConfig as ThreadStep).completionCheck?.mode === "llm" && (
                  <div className="grid gap-2">
                    <Label htmlFor="completion-expression">Completion Expression *</Label>
                    <Input
                      id="completion-expression"
                      value={(stepConfig as ThreadStep).completionCheck?.expression || ""}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          completionCheck: {
                            ...(stepConfig as ThreadStep).completionCheck,
                            expression: e.target.value,
                          },
                        } as ThreadStep)
                      }
                      placeholder="e.g., all results contain valid data"
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="thread-description">Description</Label>
                  <Input
                    id="thread-description"
                    value={(stepConfig as ThreadStep).description || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        description: e.target.value,
                      } as ThreadStep)
                    }
                    placeholder="Optional description"
                  />
                </div>
              </TabsContent>

              {/* Router Step */}
              <TabsContent value="router" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="router-description">Description *</Label>
                  <Input
                    id="router-description"
                    value={(stepConfig as RouterStep).description || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        description: e.target.value,
                      } as RouterStep)
                    }
                    placeholder="Describe what this router does"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="evaluation-prompt">Evaluation Prompt *</Label>
                  <Textarea
                    id="evaluation-prompt"
                    value={(stepConfig as RouterStep).evaluationPrompt || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        evaluationPrompt: e.target.value,
                      } as RouterStep)
                    }
                    placeholder="Prompt/question for LLM to evaluate options"
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Router Options</Label>
                  <div className="space-y-2 border rounded-md p-4">
                    {(stepConfig as RouterStep).options?.map((option, index) => (
                      <div key={option.id} className="border rounded p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Option {index + 1}</span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              const newOptions = (stepConfig as RouterStep).options.filter(
                                (o) => o.id !== option.id
                              );
                              setStepConfig({
                                ...stepConfig,
                                options: newOptions,
                              } as RouterStep);
                            }}
                          >
                            Remove
                          </Button>
        </div>
                        <Input
                          placeholder="Option ID"
                          value={option.id}
                          onChange={(e) => {
                            const newOptions = [...(stepConfig as RouterStep).options];
                            newOptions[index] = { ...option, id: e.target.value };
                            setStepConfig({
                              ...stepConfig,
                              options: newOptions,
                            } as RouterStep);
                          }}
                        />
                        <Input
                          placeholder="Option Name"
                          value={option.name}
                          onChange={(e) => {
                            const newOptions = [...(stepConfig as RouterStep).options];
                            newOptions[index] = { ...option, name: e.target.value };
                            setStepConfig({
                              ...stepConfig,
                              options: newOptions,
                            } as RouterStep);
                          }}
                        />
                        <Textarea
                          placeholder="Option Description"
                          value={option.description}
                          onChange={(e) => {
                            const newOptions = [...(stepConfig as RouterStep).options];
                            newOptions[index] = { ...option, description: e.target.value };
                            setStepConfig({
                              ...stepConfig,
                              options: newOptions,
                            } as RouterStep);
                          }}
                          rows={2}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={option.endpoint.endpointUrl}
                            onValueChange={(value) => {
                              const newOptions = [...(stepConfig as RouterStep).options];
                              newOptions[index] = {
                                ...option,
                                endpoint: { ...option.endpoint, endpointUrl: value },
                              };
                              setStepConfig({
                                ...stepConfig,
                                options: newOptions,
                              } as RouterStep);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Endpoint Worker" />
                            </SelectTrigger>
                            <SelectContent>
                              {ENDPOINT_WORKERS.map((url) => (
                                <SelectItem key={url} value={url}>
                                  {url}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={option.endpoint.method || "GET"}
                            onValueChange={(value) => {
                              const newOptions = [...(stepConfig as RouterStep).options];
                              newOptions[index] = {
                                ...option,
                                endpoint: {
                                  ...option.endpoint,
                                  method: value as RouterOption["endpoint"]["method"],
                                },
                              };
                              setStepConfig({
                                ...stepConfig,
                                options: newOptions,
                              } as RouterStep);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                              <SelectItem value="PUT">PUT</SelectItem>
                              <SelectItem value="PATCH">PATCH</SelectItem>
                              <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Input
                          placeholder="API URL"
                          value={option.endpoint.apiUrl}
                          onChange={(e) => {
                            const newOptions = [...(stepConfig as RouterStep).options];
                            newOptions[index] = {
                              ...option,
                              endpoint: { ...option.endpoint, apiUrl: e.target.value },
                            };
                            setStepConfig({
                              ...stepConfig,
                              options: newOptions,
                            } as RouterStep);
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const newOption: RouterOption = {
                          id: `option-${Date.now()}`,
                          name: "",
                          description: "",
                          endpoint: {
                            endpointUrl: ENDPOINT_WORKERS[0],
                            apiUrl: "",
                            method: "GET",
                          },
                        };
                        setStepConfig({
                          ...stepConfig,
                          options: [...(stepConfig as RouterStep).options, newOption],
                        } as RouterStep);
                      }}
                    >
                      Add Option
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="default-option">Default Option ID</Label>
                  <Input
                    id="default-option"
                    value={(stepConfig as RouterStep).defaultOption || ""}
                    onChange={(e) =>
                      setStepConfig({
                        ...stepConfig,
                        defaultOption: e.target.value,
                      } as RouterStep)
                    }
                    placeholder="ID of default option"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="router-retries">Retries</Label>
                    <Input
                      id="router-retries"
                      type="number"
                      min="0"
                      max="10"
                      value={(stepConfig as RouterStep).retries || 3}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          retries: parseInt(e.target.value) || 3,
                        } as RouterStep)
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="router-timeout">Timeout (ms)</Label>
                    <Input
                      id="router-timeout"
                      type="number"
                      min="1000"
                      value={(stepConfig as RouterStep).timeout || 30000}
                      onChange={(e) =>
                        setStepConfig({
                          ...stepConfig,
                          timeout: parseInt(e.target.value) || 30000,
                        } as RouterStep)
                      }
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
        </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNode} disabled={!label.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste JSON Dialog */}
      <Dialog open={isPasteDialogOpen} onOpenChange={setIsPasteDialogOpen}>
        <DialogContent showOverlay={false} className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5" />
              Paste Workflow JSON
            </DialogTitle>
            <DialogDescription>
              Paste a workflow JSON payload to import it as a flow diagram.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden py-4">
            <Textarea
              placeholder={`{
  "context": "Your workflow context...",
  "instructions": [
    "Step 1 instruction",
    { "type": "endpoint", "apiUrl": "..." },
    { "type": "router", "options": [...] }
  ],
  "provider": "openai",
  "model": "gpt-4o-mini"
}`}
              value={pasteJsonText}
              onChange={(e) => {
                setPasteJsonText(e.target.value);
                setPasteError(null);
              }}
              className="h-[300px] font-mono text-sm resize-none"
            />
            {pasteError && (
              <p className="text-sm text-destructive mt-2">{pasteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsPasteDialogOpen(false);
                setPasteJsonText("");
                setPasteError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handlePasteImport} disabled={!pasteJsonText.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </NodeActionsProvider>
  );
}
