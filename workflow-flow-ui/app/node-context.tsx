"use client";

import React, { createContext, useContext, ReactNode } from "react";

interface NodeActionsContextType {
  onEditNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

const NodeActionsContext = createContext<NodeActionsContextType | null>(null);

export function NodeActionsProvider({
  children,
  onEditNode,
  onDeleteNode,
}: {
  children: ReactNode;
  onEditNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  return (
    <NodeActionsContext.Provider value={{ onEditNode, onDeleteNode }}>
      {children}
    </NodeActionsContext.Provider>
  );
}

export function useNodeActions() {
  const context = useContext(NodeActionsContext);
  if (!context) {
    throw new Error("useNodeActions must be used within a NodeActionsProvider");
  }
  return context;
}

