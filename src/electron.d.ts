export {};

export interface DesktopProcessMetric {
  pid: number;
  type: string;
  name: string;
  cpuPercent: number;
  workingSetKb: number;
  privateKb: number;
}

declare global {
  interface Window {
    appLauncherDesktop?: {
      getRecoveredStorage(): Promise<Record<string, string>>;
      getProcessMetrics(): Promise<DesktopProcessMetric[]>;
      selectFolder(): Promise<{ name: string; path: string } | null>;
      getPathForFile(file: File): string;
      platform: string;
    };
  }
}
