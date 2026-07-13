import { useEffect, useState } from "react";
import { CheckSquare, Layers, Tags, X } from "lucide-react";

export type BulkShortcutAction =
  | { type: "add-tags" | "remove-tags" | "replace-tags"; tags: string[] }
  | { type: "add-group" | "remove-group" | "set-primary-group"; group: string };

interface BulkEditPanelProps {
  selectedCount: number;
  visibleCount: number;
  categories: string[];
  onSelectVisible: () => void;
  onClearSelection: () => void;
  onDone: () => void;
  onApply: (action: BulkShortcutAction) => number;
}

export default function BulkEditPanel({
  selectedCount,
  visibleCount,
  categories,
  onSelectVisible,
  onClearSelection,
  onDone,
  onApply,
}: BulkEditPanelProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [group, setGroup] = useState("");
  const [groupOperation, setGroupOperation] = useState<
    "add-group" | "remove-group" | "set-primary-group"
  >("add-group");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!group || !categories.includes(group)) {
      setGroup(categories[0] || "");
    }
  }, [categories, group]);

  const applyAction = (action: BulkShortcutAction) => {
    const changedCount = onApply(action);
    setFeedback(
      changedCount > 0
        ? `Updated ${changedCount} selected ${changedCount === 1 ? "card" : "cards"}.`
        : "No change was needed for the selected cards.",
    );
  };

  const parsedTags = Array.from(
    new Set<string>(
      tagsInput
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );
  const canApply = selectedCount > 0;

  return (
    <section className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-lg shadow-black/10" aria-label="Bulk shortcut actions">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 pb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-amber-400" />
          <div>
            <h2 className="text-xs font-bold text-white">Bulk actions</h2>
            <p className="text-[10px] text-neutral-400">{selectedCount} selected</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelectVisible}
            disabled={visibleCount === 0}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-300 hover:border-neutral-700 hover:text-white disabled:opacity-40"
          >
            Select all shown ({visibleCount})
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-400 hover:text-white disabled:opacity-40"
          >
            Deselect all
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-bold text-neutral-950 hover:bg-amber-400"
          >
            <X className="h-3 w-3" />
            Done
          </button>
        </div>
      </div>

      <div className="grid gap-4 pt-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300">
            <Tags className="h-3.5 w-3.5 text-amber-400" />
            Tags
          </div>
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="Comma-separated tags"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-white placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {(["add-tags", "remove-tags", "replace-tags"] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={!canApply || parsedTags.length === 0}
                onClick={() => applyAction({ type, tags: parsedTags })}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-300 hover:border-amber-500/30 hover:text-amber-400 disabled:opacity-35"
              >
                {type === "add-tags" ? "Add" : type === "remove-tags" ? "Remove" : "Replace all"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            Groups
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Target group</span>
              <select
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value);
                  setFeedback("");
                }}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-white focus:border-amber-500 focus:outline-none"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Operation</span>
              <select
                value={groupOperation}
                onChange={(event) => {
                  setGroupOperation(event.target.value as typeof groupOperation);
                  setFeedback("");
                }}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="add-group">Add membership</option>
                <option value="remove-group">Remove additional membership</option>
                <option value="set-primary-group">Make primary group</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={!canApply || !group}
            onClick={() => applyAction({ type: groupOperation, group })}
            className="w-full rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-400 hover:bg-amber-500/15 disabled:opacity-35"
          >
            Apply group change to {selectedCount} selected
          </button>
          <p className="text-[9px] leading-normal text-neutral-500">
            Removing affects additional membership only. Making a group primary keeps the former primary as an additional membership.
          </p>
        </div>
      </div>
      {feedback && (
        <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-[10px] font-medium text-neutral-300" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}
