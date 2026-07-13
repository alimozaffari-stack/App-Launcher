import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitMerge, Loader2, SearchCheck, ShieldCheck, Undo2, X } from "lucide-react";
import type { Shortcut } from "../types";
import { findDuplicateGroups, mergeDuplicateGroup } from "../duplicates.js";

export interface DuplicateGroup {
  key: string;
  shortcutIds: string[];
}

interface DuplicateCleanerProps {
  shortcuts: Shortcut[];
  canUndo: boolean;
  onClean: (groups: DuplicateGroup[]) => void;
  onUndo: () => void;
  onClose: () => void;
}

export default function DuplicateCleaner({
  shortcuts,
  canUndo,
  onClean,
  onUndo,
  onClose,
}: DuplicateCleanerProps) {
  const [resolvedKeys, setResolvedKeys] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(true);
  const [resolutionNote, setResolutionNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    const resolveTargets = async () => {
      try {
        const resolver = window.appLauncherDesktop?.resolveShortcutTargets;
        if (!resolver) {
          setResolutionNote("Browser mode compares saved targets directly. Windows shortcut targets are resolved in the installed app.");
          return;
        }
        const resolved = await resolver(
          shortcuts.map(({ id, execPath }) => ({ id, execPath })),
        );
        if (!cancelled) {
          setResolvedKeys(Object.fromEntries(resolved.map((item) => [item.id, item.key])));
        }
      } catch (error) {
        console.error("Duplicate target resolution failed:", error);
        if (!cancelled) setResolutionNote("Some Windows targets could not be resolved; their saved paths were compared instead.");
      } finally {
        if (!cancelled) setResolving(false);
      }
    };
    void resolveTargets();
    return () => {
      cancelled = true;
    };
  }, [shortcuts]);

  const analysis = useMemo(
    () => findDuplicateGroups(shortcuts, resolvedKeys) as { exact: DuplicateGroup[]; possible: DuplicateGroup[] },
    [resolvedKeys, shortcuts],
  );
  const shortcutsById = useMemo(
    () => new Map(shortcuts.map((shortcut) => [shortcut.id, shortcut])),
    [shortcuts],
  );
  const removableCount = analysis.exact.reduce(
    (count, group) => count + group.shortcutIds.length - 1,
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-neutral-800 p-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <SearchCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Duplicate cleaner</h2>
              <p className="mt-1 text-xs text-neutral-400">Exact targets can be merged safely; name-only matches remain review-only.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="Close duplicate cleaner">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {resolving ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              Resolving Windows shortcut targets…
            </div>
          ) : (
            <div className="space-y-5">
              {resolutionNote && <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-xs text-neutral-500">{resolutionNote}</p>}

              <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">{analysis.exact.length} exact duplicate {analysis.exact.length === 1 ? "set" : "sets"}</h3>
                      <p className="mt-1 text-xs text-neutral-400">{removableCount} redundant {removableCount === 1 ? "card" : "cards"} can be merged without deleting files.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={analysis.exact.length === 0}
                    onClick={() => onClean(analysis.exact)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <GitMerge className="h-3.5 w-3.5" />
                    Merge all exact
                  </button>
                </div>

                {analysis.exact.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {analysis.exact.map((group) => {
                      const members = group.shortcutIds.map((id) => shortcutsById.get(id)).filter(Boolean) as Shortcut[];
                      const survivor = mergeDuplicateGroup(members) as Shortcut | null;
                      return (
                        <div key={group.key} className="rounded-lg border border-neutral-800/80 bg-neutral-950/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Same launch target</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {members.map((member) => (
                              <span key={member.id} className={`rounded-md border px-2 py-1 text-[11px] ${member.id === survivor?.id ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-neutral-800 text-neutral-400"}`}>
                                {member.name}{member.id === survivor?.id ? " · keep" : " · merge"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">{analysis.possible.length} possible name {analysis.possible.length === 1 ? "match" : "matches"}</h3>
                    <p className="mt-1 text-xs text-neutral-400">These point to different targets, so they are never removed automatically.</p>
                  </div>
                </div>
                {analysis.possible.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {analysis.possible.map((group) => (
                      <div key={group.key} className="rounded-lg border border-neutral-800/80 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
                        {group.shortcutIds.map((id) => shortcutsById.get(id)?.name).filter(Boolean).join(" · ")}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {canUndo && (
                <button type="button" onClick={onUndo} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white">
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo last duplicate cleanup
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
