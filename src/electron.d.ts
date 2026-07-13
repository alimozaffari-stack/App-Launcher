export {};

export interface DesktopProcessMetric {
  pid: number;
  type: string;
  name: string;
  cpuPercent: number;
  workingSetKb: number;
  privateKb: number;
}

export interface ResolvedShortcutTarget {
  id: string;
  key: string;
  resolvedTarget: string;
  confidence: "exact";
}

declare global {
  interface Window {
    appLauncherDesktop?: {
      getRecoveredStorage(): Promise<Record<string, string>>;
      getProcessMetrics(): Promise<DesktopProcessMetric[]>;
      resolveShortcutTargets(
        candidates: Array<{ id: string; execPath: string }>,
      ): Promise<ResolvedShortcutTarget[]>;
      selectFolder(): Promise<{ name: string; path: string } | null>;
      getPathForFile(file: File): string;
      platform: string;
    };
  }
}
