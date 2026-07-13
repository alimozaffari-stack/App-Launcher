import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Bookmark } from "lucide-react";
import { NOMINATED_WORKSPACE_DROP_ID } from "../workspace.js";

interface NominatedWorkspaceDropZoneProps {
  children: ReactNode;
  workspaceName: string;
  disabled?: boolean;
}

export default function NominatedWorkspaceDropZone({
  children,
  workspaceName,
  disabled = false,
}: NominatedWorkspaceDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: NOMINATED_WORKSPACE_DROP_ID,
    disabled,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${workspaceName} top workspace${disabled ? "" : " drop area"}`}
      className={`relative rounded-2xl border bg-neutral-950/15 flex flex-col gap-3 backdrop-blur-md shadow-sm transition-colors ${
        isOver
          ? "border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/25"
          : "border-neutral-700/30"
      }`}
      style={{ padding: "12px" }}
      id="panel-nominated"
    >
      {children}
      {isOver && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border border-dashed border-amber-400/70 bg-neutral-950/80 text-amber-300 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Bookmark className="h-4 w-4 fill-amber-400/20" />
            Release to nominate in {workspaceName}
          </div>
        </div>
      )}
    </section>
  );
}
