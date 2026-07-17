import type { ItemKind, ImportedResource, LibraryItem, LibraryState } from "./types";

declare module "*.svg" { const source: string; export default source; }

declare global {
  interface Window {
    launcher?: {
      isDirectDesktop?: boolean;
      loadState(): Promise<LibraryState | null>;
      saveState(state: LibraryState): Promise<boolean>;
      openItem(item: LibraryItem): Promise<{ ok: boolean; error?: string }>;
      chooseResource(kind: ItemKind): Promise<ImportedResource | null>;
      chooseResources(kind: "folder" | "file"): Promise<ImportedResource[]>;
      scanFolder(path: string): Promise<ImportedResource[]>;
      getIcon(target: string): Promise<{ key: string; dataUrl: string } | null>;
      pathExists(target: string): Promise<boolean>;
      pathForFile(file: File): string;
    };
  }
}
export {};
