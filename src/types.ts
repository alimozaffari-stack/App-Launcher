export type ItemKind = "app" | "folder" | "file" | "url" | "protocol";
export type SortMode = "manual" | "alpha" | "date";
export type LibraryLayout = "flat" | "purpose" | "alpha";
export type WorkspaceSortMode = "alpha" | "type";
export type PanelId = "focus" | "favourites" | "recent" | "workspaces";

export interface Group { id: string; name: string; }
export interface LibraryItem {
  id: string;
  kind: ItemKind;
  name: string;
  target: string;
  arguments: string[];
  workingDirectory?: string;
  description?: string;
  primaryGroupId: string;
  groupIds: string[];
  tags: string[];
  iconKey?: string;
  iconDataUrl?: string;
  createdAt: number;
  order: number;
  isFavourite: boolean;
  lastLaunchedAt?: number;
}
export interface WorkspaceResource {
  id: string;
  name: string;
  target: string;
  kind: ItemKind;
  arguments: string[];
  workingDirectory?: string;
  description?: string;
}
export interface Workspace { id: string; name: string; itemIds: string[]; resources: WorkspaceResource[]; }
export interface PanelPreference { visible: boolean; collapsed: boolean; }
export interface LibraryState {
  version: 2;
  groups: Group[];
  items: LibraryItem[];
  workspaces: Workspace[];
  preferences: {
    focusGroupId: string | "all" | "none";
    workspaceId?: string;
    panels: Record<PanelId, PanelPreference>;
    panelOrder: PanelId[];
    sortMode: SortMode;
    layout: LibraryLayout;
    workspaceSortMode: WorkspaceSortMode;
    onboardingDismissed?: boolean;
  };
}
export interface ImportedResource {
  name: string;
  target: string;
  kind: ItemKind;
  arguments?: string[];
  workingDirectory?: string;
  description?: string;
  tags?: string[];
}

// Retained only for unused pre-v2 component files that may remain in an existing checkout.
// New application code uses LibraryItem exclusively.
export interface Shortcut {
  id: string;
  name: string;
  execPath: string;
  category: string;
  tags: string[];
  iconUrl?: string;
  description?: string;
  createdAt: number;
  order?: number;
  isFavorite?: boolean;
  lastLaunchedAt?: number;
}
export interface SuggestionResponse { category: string; tags: string[]; description: string; }
