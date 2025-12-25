"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface NodeMenuProps {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  nodeLabel?: string;
}

export function NodeMenu({ children, onEdit, onDelete, nodeLabel }: NodeMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {nodeLabel && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground truncate">
              {nodeLabel}
            </div>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={onEdit} className="gap-2">
          <Pencil className="h-4 w-4" />
          <span>Edit</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} variant="destructive" className="gap-2">
          <Trash2 className="h-4 w-4" />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

