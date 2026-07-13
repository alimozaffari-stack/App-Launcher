import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Loader2, RefreshCw, X } from "lucide-react";
import type { DesktopProcessMetric } from "../electron";

interface MemoryDiagnosticsProps {
  onClose: () => void;
}

function formatMemory(kilobytes: number) {
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export default function MemoryDiagnostics({ onClose }: MemoryDiagnosticsProps) {
  const [metrics, setMetrics] = useState<DesktopProcessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!window.appLauncherDesktop?.getProcessMetrics) {
        throw new Error("Process details are available in the desktop app only.");
      }
      setMetrics(await window.appLauncherDesktop.getProcessMetrics());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not read process details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalWorkingSet = useMemo(
    () => metrics.reduce((total, metric) => total + metric.workingSetKb, 0),
    [metrics],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-neutral-800 p-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Memory details</h2>
              <p className="mt-1 text-xs text-neutral-400">
                On-demand desktop process usage. This screen does not poll in the background.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="Close memory details">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Current working set</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatMemory(totalWorkingSet)}</p>
            </div>
            <button onClick={() => void refresh()} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm text-red-300">{error}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {metrics.map((metric) => (
                <div key={`${metric.type}-${metric.pid}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg border border-neutral-800/80 bg-neutral-950/40 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-200">{metric.name || metric.type}</p>
                    <p className="text-[10px] text-neutral-500">{metric.type} · PID {metric.pid}</p>
                  </div>
                  <span className="text-neutral-300">{formatMemory(metric.workingSetKb)}</span>
                  <span className="w-14 text-right text-neutral-500">{metric.cpuPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
