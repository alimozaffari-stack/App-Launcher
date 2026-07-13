import { FolderOpen, Pin, X } from "lucide-react";
import type { TemporaryFolder } from "../types";

interface TemporaryFolderCardProps {
  key?: string;
  folder: TemporaryFolder;
  onLaunch: (folder: TemporaryFolder) => void;
  onPin: (folder: TemporaryFolder) => void;
  onRemove: (id: string) => void;
}

export default function TemporaryFolderCard({
  folder,
  onLaunch,
  onPin,
  onRemove,
}: TemporaryFolderCardProps) {
  return (
    <div className="group relative flex items-center gap-2.5 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-2.5 transition-colors hover:border-amber-500/50 hover:bg-amber-500/10">
      <button
        type="button"
        onClick={() => onLaunch(folder)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        title={`Open ${folder.path}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-neutral-950 text-amber-400">
          <FolderOpen className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-bold text-neutral-200">{folder.name}</span>
          <span className="block truncate text-[8px] font-mono uppercase tracking-wider text-amber-400/70">
            Temporary folder
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onPin(folder)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-amber-400"
          title="Keep as a permanent shortcut"
        >
          <Pin className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(folder.id)}
          className="rounded p-1 text-neutral-500 hover:bg-red-950/30 hover:text-red-400"
          title="Remove temporary folder"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
