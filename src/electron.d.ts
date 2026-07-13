export {};

declare global {
  interface Window {
    appLauncherDesktop?: {
      getPathForFile(file: File): string;
      platform: string;
    };
  }
}
