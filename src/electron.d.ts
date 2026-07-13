export {};

declare global {
  interface Window {
    appLauncherDesktop?: {
      getRecoveredStorage(): Promise<Record<string, string>>;
      selectFolder(): Promise<{ name: string; path: string } | null>;
      getPathForFile(file: File): string;
      platform: string;
    };
  }
}
