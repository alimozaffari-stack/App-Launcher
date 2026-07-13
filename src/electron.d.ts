export {};

declare global {
  interface Window {
    appLauncherDesktop?: {
      getRecoveredStorage(): Promise<Record<string, string>>;
      getPathForFile(file: File): string;
      platform: string;
    };
  }
}
