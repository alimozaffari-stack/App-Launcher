import type { ItemKind, ImportedResource, LibraryItem, LibraryState } from "./types";

declare global {
  interface Window {
    launcher?: {
      loadState(): Promise<LibraryState | null>;
      saveState(state: LibraryState): Promise<boolean>;
      openItem(item: LibraryItem): Promise<{ ok: boolean; error?: string }>;
      chooseResource(kind: ItemKind): Promise<ImportedResource | null>;
      scanFolder(path: string): Promise<ImportedResource[]>;
      getIcon(target: string): Promise<{ key: string; dataUrl: string } | null>;
      pathForFile(file: File): string;
    };
  }
}
export {};
