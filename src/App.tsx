import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, File, FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, FilePlus2,
  Folder, FolderOpen, GripVertical, Layers3, Plus, Presentation, Search, Settings2,
  Star, Tag, Trash2, X, Zap
} from "lucide-react";
import { version as appVersion } from "../package.json";
import type { Group, ImportedResource, ItemKind, LibraryItem, LibraryLayout, LibraryState, PanelId, SortMode, Workspace, WorkspaceColumnSortMode, WorkspaceResource } from "./types";
import { workspacePathCue } from "./lib/workspacePathCue";

function AppLauncherIcon({ className = "h-6 w-6 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="13" fill="#0f0f0f" stroke="#262626" strokeWidth="2" />
      <path d="M40 12H12V52H40" fill="none" stroke="#f5f5f5" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="42" cy="32" r="13.5" fill="#f59e0b" />
    </svg>
  );
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const iconCache = new Map<string, string | null>();
const workspaceIcon = (name: string) => new URL(`./assets/workspace-file-icons/${name}.svg`, import.meta.url).href;
const pdfIcon = workspaceIcon("pdf-new"), wordIcon = workspaceIcon("word-new"), spreadsheetIcon = workspaceIcon("spreadsheet-new"), codeIcon = workspaceIcon("code-new"), imageIcon = workspaceIcon("image-new"), audioIcon = workspaceIcon("audio-new"), markdownIcon = workspaceIcon("markdown-new"), documentIcon = workspaceIcon("document-new"), applicationIcon = workspaceIcon("app-file"), googleDocIcon = workspaceIcon("gdoc"), utilityIcon = workspaceIcon("utility"), comIcon = workspaceIcon("com"), movieIcon = workspaceIcon("movie-new"), jsonPyIcon = workspaceIcon("json-py");
const panelTitles: Record<PanelId, string> = { focus: "Focus group", favourites: "Favourites", recent: "Recent", workspaces: "Workspaces" };
const panelIds: PanelId[] = ["workspaces", "focus", "favourites", "recent"];
const defaultPanelPreferences = {
  focus: { visible: true, collapsed: false }, favourites: { visible: true, collapsed: false },
  recent: { visible: true, collapsed: false }, workspaces: { visible: true, collapsed: false }
};
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const cleanTarget = (target: string) => target.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLocaleLowerCase();
const groupId = (name: string) => `group-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "other"}`;
const isProtocolTarget = (target: string): boolean => {
  const trimmed = target.trim();
  if (/^[a-z]:([\\/]|$)/i.test(trimmed)) return false;
  return /^[a-z][a-z0-9+.-]+:/i.test(trimmed);
};
const kindFromPath = (target: string): ItemKind => {
  if (/^https?:/i.test(target)) return "url";
  if (isProtocolTarget(target)) return "protocol";
  if (/\.(exe|bat|cmd|lnk)$/i.test(target)) return "app";
  return "file";
};
const displayName = (item: LibraryItem | WorkspaceResource, includeExtension = false) => {
  const extension = (includeExtension || item.kind === "file") ? (item.target.match(/(\.[^\\/.]+)$/)?.[1] || "") : "";
  return extension && !item.name.toLowerCase().endsWith(extension.toLowerCase()) ? `${item.name}${extension}` : item.name;
};

function makeGroup(name: string): Group { return { id: groupId(name), name: name.trim() }; }
function blankState(): LibraryState {
  const groups = ["Applications", "Current Work", "Knowledge Management", "Office", "Others", "Research", "Utility"].map(makeGroup);
  return { version: 2, groups, items: [], workspaces: [], preferences: { focusGroupId: "none", panels: defaultPanelPreferences, panelOrder: panelIds, sortMode: "manual", layout: "flat", workspaceSortMode: "alpha" } };
}
function normaliseState(value: LibraryState): LibraryState {
  const rawPanelOrder = (value.preferences?.panelOrder || []).filter((entry): entry is PanelId => panelIds.includes(entry));
  const panelOrder: PanelId[] = JSON.stringify(rawPanelOrder) === JSON.stringify(["focus", "favourites", "recent", "workspaces"])
    ? panelIds
    : [...new Set([...rawPanelOrder, ...panelIds])];
  return {
    ...value,
    version: 2,
    groups: [...(value.groups || [])].sort((a, b) => collator.compare(a.name, b.name)),
    items: value.items || [], workspaces: (value.workspaces || []).map((workspace) => ({ ...workspace, resources: workspace.resources || [] })),
    preferences: {
      focusGroupId: value.preferences?.focusGroupId || "none",
      workspaceId: value.preferences?.workspaceId,
      panelOrder,
      sortMode: value.preferences?.sortMode || "manual",
      layout: value.preferences?.layout === "purpose" ? "purpose" : "flat",
      workspaceSortMode: value.preferences?.workspaceSortMode || "alpha",
      onboardingDismissed: value.preferences?.onboardingDismissed,
      panels: { ...defaultPanelPreferences, ...(value.preferences?.panels || {}) }
    }
  };
}
function migrateLegacy(): LibraryState {
  const initial = blankState();
  try {
    const rawCategories = JSON.parse(localStorage.getItem("launcher_categories") || "[]") as Array<string | { name: string }>;
    const categoryNames = rawCategories.map((entry) => typeof entry === "string" ? entry : entry.name).filter(Boolean);
    if (categoryNames.length) initial.groups = categoryNames.map(makeGroup);
    const rawItems = JSON.parse(localStorage.getItem("launcher_shortcuts") || "[]") as Array<Record<string, unknown>>;
    if (!rawItems.length) return initial;
    localStorage.setItem("launcher_shortcuts_backup_v1", JSON.stringify(rawItems));
    const fallback = initial.groups.find((group) => group.name === "Others") || initial.groups[0];
    initial.items = rawItems.map((legacy, index) => {
      const category = typeof legacy.category === "string" ? legacy.category : fallback.name;
      let group = initial.groups.find((item) => item.name.toLowerCase() === category.toLowerCase());
      if (!group) { group = makeGroup(category); initial.groups.push(group); }
      const target = String(legacy.execPath || "");
      return {
        id: String(legacy.id || id("item")), name: String(legacy.name || "Untitled item"), target,
        kind: kindFromPath(target), arguments: [], description: typeof legacy.description === "string" ? legacy.description : undefined,
        primaryGroupId: group.id, groupIds: [group.id], tags: Array.isArray(legacy.tags) ? legacy.tags.map(String) : [],
        iconDataUrl: typeof legacy.iconUrl === "string" ? legacy.iconUrl : undefined,
        createdAt: Number(legacy.createdAt) || Date.now(), order: Number(legacy.order) || index,
        isFavourite: Boolean(legacy.isFavorite), lastLaunchedAt: Number(legacy.lastLaunchedAt) || undefined
      };
    });
    const nominated = localStorage.getItem("launcher_nominated_category");
    initial.preferences.focusGroupId = initial.groups.find((group) => group.name === nominated)?.id || "none";
    initial.groups.sort((a, b) => collator.compare(a.name, b.name));
  } catch { /* A blank v2 state is safer than a partial migration. */ }
  return initial;
}
function saveBrowserState(state: LibraryState) { localStorage.setItem("launcher_library_v2", JSON.stringify(state)); }
function loadBrowserState(): LibraryState | null {
  try { const raw = localStorage.getItem("launcher_library_v2"); return raw ? normaliseState(JSON.parse(raw)) : null; } catch { return null; }
}

export default function App() {
  const [state, setState] = useState<LibraryState | null>(null);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<LibraryItem | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [managePanels, setManagePanels] = useState(false);
  const [migrationWarning, setMigrationWarning] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [nameDialog, setNameDialog] = useState<"group" | "workspace" | null>(null);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [copiedMetadata, setCopiedMetadata] = useState<Pick<LibraryItem, "primaryGroupId" | "groupIds" | "tags"> | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [brokenWorkspaceIds, setBrokenWorkspaceIds] = useState<Set<string>>(new Set());
  const stateRef = useRef<LibraryState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const noticeTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const stored = await window.launcher?.loadState();
      const directDesktop = Boolean(window.launcher?.isDirectDesktop);
      const next = stored ? normaliseState(stored) : (loadBrowserState() || (directDesktop ? blankState() : migrateLegacy()));
      stateRef.current = next;
      setState(next);
      if (!stored && !directDesktop) await persist(next);
      if (!stored && directDesktop) setMigrationWarning(true);
    })();
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inEditable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (event.key === "/" && !inEditable && !editor && !scanOpen && !labelManagerOpen && !nameDialog && !confirmDialog && !creditsOpen) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [editor, scanOpen, labelManagerOpen, nameDialog, confirmDialog, creditsOpen]);

  async function persist(next: LibraryState) {
    const normalised = normaliseState(next);
    stateRef.current = normalised;
    setState(normalised);
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (window.launcher) await window.launcher.saveState(normalised);
      else saveBrowserState(normalised);
    }).catch(() => {
      flash("Could not save changes to disk.");
    });
    await saveQueueRef.current;
  }
  function change(mutator: (current: LibraryState) => LibraryState) {
    const current = stateRef.current;
    if (current) void persist(mutator(current));
  }
  function flash(message: string) {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  }

  const groups = useMemo(() => state ? [...state.groups].sort((a, b) => collator.compare(a.name, b.name)) : [], [state]);
  const groupName = (identifier: string) => groups.find((group) => group.id === identifier)?.name || "Unassigned";
  const allTags = useMemo(() => state ? [...new Set(state.items.flatMap((item) => item.tags))].sort(collator.compare) : [], [state]);
  const displayItems = useMemo(() => {
    if (!state) return [];
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).map((token) => token.replace(/^#/, "")).filter(Boolean);
    const filtered = state.items.filter((item) => {
      const inGroup = activeGroupId === "all" || item.groupIds.includes(activeGroupId);
      if (!inGroup) return false;
      if (!tokens.length) return true;
      const searchable = [item.name, item.description || "", ...item.tags, ...item.groupIds.map(groupName)].join(" ").toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
    if (state.preferences.sortMode === "alpha") return [...filtered].sort((a, b) => collator.compare(a.name, b.name));
    if (state.preferences.sortMode === "date") return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    return [...filtered].sort((a, b) => a.order - b.order);
  }, [state, query, activeGroupId, groups]);

  function addGroup(name: string) {
    const clean = name.trim(); if (!clean || !state) return;
    if (state.groups.some((group) => group.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) { flash("That group already exists."); return; }
    change((current) => ({ ...current, groups: [...current.groups, makeGroup(clean)] }));
  }
  function deleteGroup(groupId: string) {
    if (!state || state.groups.length < 2) { flash("At least one group must remain."); return; }
    const targetGroup = state.groups.find((group) => group.id === groupId);
    const affectedCount = state.items.filter((item) => item.primaryGroupId === groupId || item.groupIds.includes(groupId)).length;
    setConfirmDialog({
      title: `Delete group "${targetGroup?.name || "this group"}"?`,
      message: affectedCount
        ? `${affectedCount} item${affectedCount === 1 ? "" : "s"} in this group will be reassigned to the next available group.`
        : "No items currently use this group.",
      confirmLabel: "Delete group",
      onConfirm: () => {
        const current = stateRef.current;
        if (!current || current.groups.length < 2) return;
        const fallback = current.groups.find((group) => group.id !== groupId) as Group;
        if (activeGroupId === groupId) setActiveGroupId("all");
        change((latest) => ({
          ...latest,
          groups: latest.groups.filter((group) => group.id !== groupId),
          items: latest.items.map((item) => item.primaryGroupId !== groupId && !item.groupIds.includes(groupId) ? item : { ...item, primaryGroupId: item.primaryGroupId === groupId ? fallback.id : item.primaryGroupId, groupIds: [...new Set(item.groupIds.filter((id) => id !== groupId).concat(item.primaryGroupId === groupId ? [fallback.id] : []))] }),
          preferences: { ...latest.preferences, focusGroupId: latest.preferences.focusGroupId === groupId ? "none" : latest.preferences.focusGroupId }
        }));
      }
    });
  }
  function mergeGroup(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (activeGroupId === sourceId) setActiveGroupId(targetId);
    change((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== sourceId),
      items: current.items.map((item) => ({ ...item, primaryGroupId: item.primaryGroupId === sourceId ? targetId : item.primaryGroupId, groupIds: [...new Set(item.groupIds.map((id) => id === sourceId ? targetId : id))] })),
      preferences: { ...current.preferences, focusGroupId: current.preferences.focusGroupId === sourceId ? targetId : current.preferences.focusGroupId }
    }));
  }
  function deleteTag(tag: string) {
    const affectedCount = state?.items.filter((item) => item.tags.includes(tag)).length || 0;
    setConfirmDialog({
      title: `Delete tag "#${tag}"?`,
      message: affectedCount
        ? `This removes #${tag} from ${affectedCount} item${affectedCount === 1 ? "" : "s"}.`
        : `Remove #${tag}?`,
      confirmLabel: "Delete tag",
      onConfirm: () => {
        change((current) => ({ ...current, items: current.items.map((item) => ({ ...item, tags: item.tags.filter((entry) => entry !== tag) })) }));
      }
    });
  }
  function mergeTag(source: string, target: string) { const clean = target.trim().toLowerCase(); if (!source || !clean || source === clean) return; change((current) => ({ ...current, items: current.items.map((item) => ({ ...item, tags: [...new Set(item.tags.map((tag) => tag === source ? clean : tag))].sort(collator.compare) })) })); }
  function addWorkspace(name: string) {
    if (!state || !name.trim()) return;
    if (state.workspaces.some((workspace) => workspace.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) { flash("That workspace already exists."); return; }
    const workspace: Workspace = { id: id("workspace"), name: name.trim(), itemIds: [], resources: [] };
    change((current) => ({ ...current, workspaces: [...current.workspaces, workspace], preferences: { ...current.preferences, workspaceId: workspace.id } }));
  }
  function deleteWorkspace() {
    if (!activeWorkspace) return;
    const targetWorkspace = activeWorkspace;
    setConfirmDialog({
      title: `Delete workspace "${targetWorkspace.name}"?`,
      message: "This removes the workspace and its direct folder and file links. Main library items and files on disk are not deleted.",
      confirmLabel: "Delete workspace",
      onConfirm: () => {
        change((current) => {
          const remaining = current.workspaces.filter((workspace) => workspace.id !== targetWorkspace.id);
          return { ...current, workspaces: remaining, preferences: { ...current.preferences, workspaceId: remaining[0]?.id ?? "" } };
        });
      }
    });
  }
  function toggleSelection(itemId: string) {
    setSelectedIds((current) => { const next = new Set(current); next.has(itemId) ? next.delete(itemId) : next.add(itemId); return next; });
  }
  function selectVisible() { setSelectedIds(new Set(displayItems.map((item) => item.id))); }
  function updateItem(updated: LibraryItem) { change((current) => ({ ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) })); }
  function deleteItems(itemIds: Set<string>) {
    if (!itemIds.size) return;
    const idsToDelete = new Set(itemIds);
    const singleName = idsToDelete.size === 1 ? state?.items.find((item) => idsToDelete.has(item.id))?.name : undefined;
    setConfirmDialog({
      title: singleName ? `Remove "${singleName}"?` : `Remove ${idsToDelete.size} items?`,
      message: "This removes the selected shortcuts from your launcher and workspace links. Original files on disk are not affected.",
      confirmLabel: "Remove",
      onConfirm: () => {
        change((current) => ({ ...current, items: current.items.filter((item) => !idsToDelete.has(item.id)), workspaces: current.workspaces.map((workspace) => ({ ...workspace, itemIds: workspace.itemIds.filter((itemId) => !idsToDelete.has(itemId)) })) }));
        setSelectedIds(new Set());
      }
    });
  }
  function assignGroup(itemIds: Set<string>, nextGroupId: string, makePrimary = false) {
    if (!nextGroupId) return;
    change((current) => ({ ...current, items: current.items.map((item) => !itemIds.has(item.id) ? item : {
      ...item, primaryGroupId: makePrimary ? nextGroupId : item.primaryGroupId,
      groupIds: [...new Set([...item.groupIds, nextGroupId])]
    }) }));
  }
  function toggleFavourite(itemIds: Set<string>, value?: boolean) {
    change((current) => ({ ...current, items: current.items.map((item) => itemIds.has(item.id) ? { ...item, isFavourite: value ?? !item.isFavourite } : item) }));
  }
  function addSelectedToWorkspace(workspaceId: string) {
    if (!workspaceId || !selectedIds.size) return;
    change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => workspace.id === workspaceId ? { ...workspace, itemIds: [...new Set([...workspace.itemIds, ...selectedIds])] } : workspace) }));
    flash(`${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"} added to the workspace.`);
  }
  function copyMetadataFrom(itemId: string) { const source = state?.items.find((item) => item.id === itemId); if (source) { setCopiedMetadata({ primaryGroupId: source.primaryGroupId, groupIds: source.groupIds, tags: source.tags }); flash(`Copied labels and tags from ${source.name}.`); } }
  function pasteMetadataToSelected() { if (!copiedMetadata || !selectedIds.size) return; change((current) => ({ ...current, items: current.items.map((item) => !selectedIds.has(item.id) ? item : { ...item, primaryGroupId: copiedMetadata.primaryGroupId, groupIds: copiedMetadata.groupIds.filter((id) => current.groups.some((group) => group.id === id)), tags: copiedMetadata.tags }) })); flash(`Pasted labels and tags to ${selectedIds.size} selected item${selectedIds.size === 1 ? "" : "s"}.`); }
  async function addDirectWorkspaceResource(kind: "folder" | "file") {
    if (!activeWorkspace) { flash("Create or select a workspace first."); return; }
    const resources = await window.launcher?.chooseResources(kind) || [];
    if (!resources.length) return;
    const entries = resources.map((resource) => ({ id: id("workspace-resource"), name: resource.name || "Untitled resource", target: resource.target, kind: resource.kind, arguments: resource.arguments || [], workingDirectory: resource.workingDirectory, description: resource.description, iconSource: resource.iconSource, addedAt: Date.now() } satisfies WorkspaceResource));
    const existingTargets = new Set(activeWorkspace.resources.map((resource) => cleanTarget(resource.target)));
    const additions = entries.filter((entry) => !existingTargets.has(cleanTarget(entry.target)));
    const duplicates = entries.length - additions.length;
    if (additions.length) {
      change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => {
        if (workspace.id !== activeWorkspace.id) return workspace;
        const currentTargets = new Set(workspace.resources.map((resource) => cleanTarget(resource.target)));
        const uniqueAdditions = additions.filter((entry) => !currentTargets.has(cleanTarget(entry.target)));
        return { ...workspace, resources: [...workspace.resources, ...uniqueAdditions] };
      }) }));
    }
    flash(`${additions.length} ${kind}${additions.length === 1 ? "" : "s"} added to the workspace${duplicates ? `; ${duplicates} duplicate${duplicates === 1 ? " was" : "s were"} skipped` : ""}.`);
  }
  function removeWorkspaceEntry(itemId: string) {
    if (!activeWorkspace) return;
    change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => workspace.id !== activeWorkspace.id ? workspace : { ...workspace, resources: workspace.resources.filter((resource) => resource.id !== itemId), itemIds: workspace.itemIds.filter((id) => id !== itemId) }) }));
    setBrokenWorkspaceIds((current) => { const next = new Set(current); next.delete(itemId); return next; });
  }
  async function relinkWorkspaceEntry(itemId: string) {
    if (!activeWorkspace) return;
    const existing = activeWorkspace.resources.find((resource) => resource.id === itemId);
    if (!existing) { flash("This is a library shortcut. Edit it in the main library to relink it."); return; }
    const replacement = await window.launcher?.chooseResource(existing.kind === "folder" ? "folder" : "file");
    if (!replacement) return;
    change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => workspace.id !== activeWorkspace.id ? workspace : { ...workspace, resources: workspace.resources.map((resource) => resource.id !== itemId ? resource : { ...resource, name: replacement.name || resource.name, target: replacement.target, kind: replacement.kind, arguments: replacement.arguments || [], workingDirectory: replacement.workingDirectory, description: replacement.description, iconSource: replacement.iconSource }) }) }));
    setBrokenWorkspaceIds((current) => { const next = new Set(current); next.delete(itemId); return next; });
  }
  async function verifyWorkspace() {
    if (!activeWorkspace || verifyBusy) return;
    setVerifyBusy(true);
    try {
      const entries: Array<LibraryItem | WorkspaceResource> = [...activeWorkspace.resources, ...activeWorkspace.itemIds.map((itemId) => state?.items.find((item) => item.id === itemId)).filter(Boolean) as Array<LibraryItem | WorkspaceResource>];
      const results = await Promise.all(entries.map(async (item) => ({ id: item.id, exists: await window.launcher?.pathExists(item.target) })));
      const broken = new Set(results.filter((result) => !result.exists).map((result) => result.id));
      setBrokenWorkspaceIds(broken);
      flash(broken.size ? `${broken.size} workspace link${broken.size === 1 ? " is" : "s are"} unavailable. Use Relink or Remove.` : "All workspace links are available.");
    } finally {
      setVerifyBusy(false);
    }
  }
  function addResources(resources: ImportedResource[]) {
    if (!state || !resources.length) return;
    const defaultGroup = groups.find((group) => group.id === activeGroupId) || groups.find((group) => group.name === "Others") || groups[0];
    const targets = new Set(state.items.map((item) => `${item.kind}:${cleanTarget(item.target)}`));
    const additions: LibraryItem[] = [];
    let duplicates = 0;
    resources.forEach((resource, index) => {
      const fingerprint = `${resource.kind}:${cleanTarget(resource.target)}`;
      if (!resource.target || targets.has(fingerprint)) { duplicates += 1; return; }
      targets.add(fingerprint);
      additions.push({ id: id("item"), name: resource.name || "Untitled item", target: resource.target, kind: resource.kind || kindFromPath(resource.target), arguments: resource.arguments || [], workingDirectory: resource.workingDirectory, description: resource.description, iconSource: resource.iconSource, primaryGroupId: defaultGroup.id, groupIds: [defaultGroup.id], tags: [...new Set(resource.tags || [])].sort(collator.compare), createdAt: Date.now(), order: index, isFavourite: false });
    });
    if (additions.length) change((current) => ({ ...current, items: [...additions, ...current.items].map((item, index) => ({ ...item, order: index })) }));
    flash(`${additions.length} item${additions.length === 1 ? "" : "s"} added${duplicates ? `; ${duplicates} duplicate${duplicates === 1 ? " was" : "s were"} skipped` : ""}.`);
  }
  async function chooseResource(kind: ItemKind) { const resource = await window.launcher?.chooseResource(kind); if (resource) addResources([resource]); }
  async function launch(item: LibraryItem | WorkspaceResource) {
    const result = await window.launcher?.openItem(item as LibraryItem);
    if (result && !result.ok) { flash(result.error || "Could not open this item."); return; }
    flash(`Opening ${item.name}…`);
    if ("isFavourite" in item) change((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, lastLaunchedAt: Date.now() } : entry) }));
  }
  function reorder(sourceId: string, targetId: string) {
    if (!state || state.preferences.sortMode !== "manual" || sourceId === targetId) return;
    const sourceIndex = state.items.findIndex((item) => item.id === sourceId); const targetIndex = state.items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...state.items]; const [moved] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, moved);
    change((current) => ({ ...current, items: next.map((item, index) => ({ ...item, order: index })) }));
  }
  function changePanel(panelId: PanelId, patch: Partial<{ visible: boolean; collapsed: boolean }>) {
    change((current) => ({ ...current, preferences: { ...current.preferences, panels: { ...current.preferences.panels, [panelId]: { ...current.preferences.panels[panelId], ...patch } } } }));
  }
  function movePanel(panelId: PanelId, delta: -1 | 1) {
    if (!state) return;
    change((current) => {
      const order = [...current.preferences.panelOrder];
      const index = order.indexOf(panelId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      const [moved] = order.splice(index, 1);
      order.splice(nextIndex, 0, moved);
      return { ...current, preferences: { ...current.preferences, panelOrder: order } };
    });
  }
  function reorderPanels(sourceId: string, targetId: string) {
    if (!state || sourceId === targetId || !panelIds.includes(sourceId as PanelId) || !panelIds.includes(targetId as PanelId)) return;
    change((current) => {
      const order = [...current.preferences.panelOrder];
      const sourceIndex = order.indexOf(sourceId as PanelId); const targetIndex = order.indexOf(targetId as PanelId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = order.splice(sourceIndex, 1); order.splice(targetIndex, 0, moved);
      return { ...current, preferences: { ...current.preferences, panelOrder: order } };
    });
  }
  function setPreference<K extends keyof LibraryState["preferences"]>(key: K, value: LibraryState["preferences"][K]) { change((current) => ({ ...current, preferences: { ...current.preferences, [key]: value } })); }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const resources = Array.from(event.dataTransfer.files).map((file) => {
      const target = window.launcher?.pathForFile(file) || "";
      return { name: file.name.replace(/\.[^.]+$/, ""), target, kind: kindFromPath(target), tags: ["dropped"] } as ImportedResource;
    }).filter((resource) => resource.target);
    if (!resources.length) flash("Drag-and-drop requires the installed desktop application so the real file paths are available.");
    else addResources(resources);
  }

  if (!state) return <div className="min-h-screen grid place-items-center text-sm text-neutral-400">Opening your library…</div>;
  const selectedSet = selectedIds;
  const visiblePanels = state.preferences.panelOrder.filter((panelId) => state.preferences.panels[panelId].visible);
  const favourites = state.items.filter((item) => item.isFavourite).sort((a, b) => collator.compare(displayName(a), displayName(b)));
  const recent = [...state.items].filter((item) => item.lastLaunchedAt).sort((a, b) => (b.lastLaunchedAt || 0) - (a.lastLaunchedAt || 0)).slice(0, 8);
  const focusGroupId = state.preferences.focusGroupId;
  const focusSource = focusGroupId === "all"
    ? state.items
    : focusGroupId === "none"
      ? []
      : state.items.filter((item) => item.groupIds.includes(focusGroupId));
  const focusItems = [...focusSource].sort((a, b) => collator.compare(displayName(a), displayName(b)));
  const activeWorkspace = state.preferences.workspaceId === undefined
    ? state.workspaces[0]
    : state.workspaces.find((workspace) => workspace.id === state.preferences.workspaceId);
  const workspaceItems: Array<LibraryItem | WorkspaceResource> = activeWorkspace ? [...activeWorkspace.resources, ...activeWorkspace.itemIds.map((itemId) => state.items.find((item) => item.id === itemId)).filter(Boolean)] as Array<LibraryItem | WorkspaceResource> : [];
  const normalizedQuery = query.trim().replace(/^#/, "").toLocaleLowerCase();
  const topSearchMatch = query.trim() ? displayItems[0] : undefined;
  const searchExpanded = searchFocused || Boolean(query.trim());

  function renderPanel(panelId: PanelId) {
    if (panelId === "focus") {
      return (
        <Panel key={panelId} title="Focus group" panelId={panelId} state={state!} onChange={changePanel} onReorder={reorderPanels} actions={<select aria-label="Focus group selection" value={state!.preferences.focusGroupId} onChange={(event) => setPreference("focusGroupId", event.target.value)} className="panel-select"><option value="none">None (hide)</option><option value="all">All items</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}>
          <PreviewList items={focusItems} onLaunch={launch} collapsed={state!.preferences.panels.focus.collapsed} empty="Choose a group or show all items." />
        </Panel>
      );
    }
    if (panelId === "favourites") {
      return (
        <Panel key={panelId} title="Favourites" panelId={panelId} state={state!} onChange={changePanel} onReorder={reorderPanels}>
          <PreviewList items={favourites} onLaunch={launch} collapsed={state!.preferences.panels.favourites.collapsed} empty="Star items in the library to place them here." />
        </Panel>
      );
    }
    if (panelId === "recent") {
      return (
        <Panel key={panelId} title="Recent" panelId={panelId} state={state!} onChange={changePanel} onReorder={reorderPanels}>
          <PreviewList items={recent} onLaunch={launch} collapsed={state!.preferences.panels.recent.collapsed} empty="Items you open will appear here." />
        </Panel>
      );
    }
    return (
      <Panel key={panelId} title="Workspaces" panelId={panelId} state={state!} onChange={changePanel} onReorder={reorderPanels} actions={<div className="flex flex-wrap items-center gap-1"><select aria-label="Active workspace" value={activeWorkspace?.id || ""} onChange={(event) => setPreference("workspaceId", event.target.value)} className="panel-select"><option value="">No workspace</option>{state!.workspaces.slice().sort((a, b) => collator.compare(a.name, b.name)).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="icon-button" aria-label="Create workspace" title="Create workspace" onClick={() => setNameDialog("workspace")}><Plus /></button>{activeWorkspace && <button className="icon-button danger" aria-label={`Delete workspace ${activeWorkspace.name}`} title="Delete selected workspace" onClick={deleteWorkspace}><Trash2 /></button>}</div>}>
        <WorkspacePreview items={workspaceItems} onLaunch={launch} onAddFolder={() => void addDirectWorkspaceResource("folder")} onAddFile={() => void addDirectWorkspaceResource("file")} onVerify={() => void verifyWorkspace()} verifyBusy={verifyBusy} onRemove={removeWorkspaceEntry} onRelink={(id) => void relinkWorkspaceEntry(id)} brokenIds={brokenWorkspaceIds} collapsed={state!.preferences.panels.workspaces.collapsed} />
      </Panel>
    );
  }

  return <div className="min-h-screen bg-neutral-950 text-neutral-200" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
      <header className="mb-3 flex flex-col gap-3 border-b border-neutral-800 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-lg font-semibold text-white">
            <AppLauncherIcon className="h-6 w-6 shrink-0" />
            <span>App Launcher</span>
            <span className="text-xs font-light tracking-wide text-neutral-400">v{appVersion}</span>
          </h1>
          <p className="mt-0.5 text-xs text-neutral-400">Applications, files, folders and workspaces—kept locally.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="control primary" onClick={() => setEditor({ id: id("item"), name: "", target: "", kind: "app", arguments: [], primaryGroupId: groups[0]?.id || "", groupIds: [groups[0]?.id || ""], tags: [], createdAt: Date.now(), order: 0, isFavourite: false })}><Plus />Add item</button>
          <button className="control" onClick={() => void chooseResource("app")}><FilePlus2 />Choose file/app</button>
          <button className="control" onClick={() => void chooseResource("folder")}><FolderOpen />Choose folder</button>
          <button className="control" onClick={() => setScanOpen(true)}><Search />Scan folder</button>
          <button className="control" onClick={() => setManagePanels((current) => !current)}><Settings2 />Manage panels</button>
        </div>
      </header>
      {migrationWarning && <section className="mb-3 flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 text-sm text-neutral-300"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" /><div><strong className="text-neutral-200">No existing desktop library was found.</strong><p className="mt-1 text-xs leading-relaxed text-neutral-400">If you are upgrading from an earlier localhost launcher, open the v1.1.0 migration build once before using this direct desktop version. New installations can dismiss this.</p></div><button className="ml-auto text-xs text-neutral-400 hover:text-white" onClick={() => setMigrationWarning(false)}>Dismiss</button></section>}
      {!state.preferences.onboardingDismissed && state.items.length === 0 && <section className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-sm"><div className="mr-auto"><strong className="text-amber-300">Set up your library</strong><p className="mt-1 text-xs text-neutral-400">Optionally choose a folder or scan one now. You can skip this and do it later.</p></div><button className="control compact" onClick={() => void chooseResource("folder")}>Choose folder</button><button className="control compact" onClick={() => setScanOpen(true)}>Scan folder</button><button className="text-xs text-neutral-400 hover:text-white" onClick={() => setPreference("onboardingDismissed", true)}>Skip</button></section>}

      <section className={`mb-3 rounded-xl border border-neutral-800 bg-neutral-900/40 transition-all ${searchExpanded || tagsExpanded ? "p-2.5" : "px-2 py-1.5"}`}>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 ${searchExpanded ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
            <input
              ref={searchInputRef}
              value={query}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && topSearchMatch) {
                  event.preventDefault();
                  void launch(topSearchMatch);
                } else if (event.key === "Escape") {
                  if (query) {
                    event.preventDefault();
                    setQuery("");
                  } else {
                    setTagsExpanded(false);
                    searchInputRef.current?.blur();
                  }
                }
              }}
              placeholder="Find by app name, function, or #tag…"
              aria-label="Search applications, files, folders or tags"
              className={`w-full rounded-lg border border-neutral-700/80 bg-neutral-950 pl-8 transition-all outline-none focus:border-amber-400 ${searchExpanded ? "py-2 pr-40 text-sm" : "py-1 pr-16 text-xs"}`}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="rounded px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-white">
                  Clear
                </button>
              )}
              <span className="hidden rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400 sm:inline">
                {topSearchMatch ? `Enter → ${topSearchMatch.name}` : "Ctrl+K"}
              </span>
            </div>
          </div>
          {allTags.length > 0 && (
            <button
              type="button"
              aria-expanded={tagsExpanded}
              onClick={() => setTagsExpanded((value) => !value)}
              className={`control compact shrink-0 ${tagsExpanded || normalizedQuery ? "border-amber-500/50 text-amber-300" : ""}`}
            >
              <Tag className="text-amber-400" />
              <span>Tags ({allTags.length})</span>
              {query && <span className="text-[11px] text-neutral-400">· {displayItems.length}</span>}
              {tagsExpanded ? <ChevronDown /> : <ChevronRight />}
            </button>
          )}
        </div>
        {allTags.length > 0 && tagsExpanded && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-neutral-800/80 pt-2.5">
            {allTags.map((tag) => {
              const isActive = normalizedQuery === tag.toLocaleLowerCase();
              return (
                <button key={tag} type="button" className={`tag-chip ${isActive ? "active" : ""}`} onClick={() => setQuery(isActive ? "" : tag)}>
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {managePanels && (
        <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <strong className="text-sm">Dashboard panels</strong>
            <button className="inline-flex min-h-6 items-center px-1 text-xs text-neutral-400 hover:text-white" onClick={() => setManagePanels(false)}>Done</button>
          </div>
          <p className="mb-3 text-xs text-neutral-400">Drag a panel by its handle or use the arrow buttons to choose its position.</p>
          <div className="flex flex-wrap gap-3">
            {state.preferences.panelOrder.map((panelId, index) => (
              <div key={panelId} className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-xs">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={state.preferences.panels[panelId].visible} onChange={(event) => changePanel(panelId, { visible: event.target.checked })} />
                  <span>{panelTitles[panelId]}</span>
                </label>
                <button type="button" className="icon-button" disabled={index === 0} aria-label={`Move ${panelTitles[panelId]} earlier`} title="Move earlier" onClick={() => movePanel(panelId, -1)}><ChevronLeft /></button>
                <button type="button" className="icon-button" disabled={index === state.preferences.panelOrder.length - 1} aria-label={`Move ${panelTitles[panelId]} later`} title="Move later" onClick={() => movePanel(panelId, 1)}><ChevronRight /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {visiblePanels.length > 0 && <section className="dashboard-panels mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visiblePanels.map(renderPanel)}
      </section>}

      <section className="border-t border-neutral-800/80 pt-4">
        <h2 className="sr-only">Library</h2>
        <div className="mb-4 flex flex-col gap-3 border-b border-neutral-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button className={`chip ${activeGroupId === "all" ? "active" : ""}`} onClick={() => setActiveGroupId("all")}>All</button>
            {groups.map((group) => <button key={group.id} className={`chip ${activeGroupId === group.id ? "active" : ""}`} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}
            <button className="chip add" onClick={() => setNameDialog("group")}>+ Add group</button>
            <button className="chip add" onClick={() => setLabelManagerOpen(true)}>Manage groups &amp; tags</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="label">Layout</span>
            <Segmented value={state.preferences.layout === "purpose" ? "purpose" : "flat"} onChange={(value) => setPreference("layout", value as LibraryLayout)} options={[["flat", "Flat"], ["purpose", "By group"]]} />
            <span className="label ml-2">Sort</span>
            <Segmented value={state.preferences.sortMode} onChange={(value) => setPreference("sortMode", value as SortMode)} options={[["manual", "Drag order"], ["alpha", "A–Z"], ["date", "Date"]]} />
          </div>
        </div>

        {selectedIds.size > 0 && <BulkBar selected={selectedIds.size} selectedItems={state.items.filter((item) => selectedIds.has(item.id))} groups={groups} workspaces={state.workspaces} hasCopiedMetadata={Boolean(copiedMetadata)} onCopyMetadata={copyMetadataFrom} onPasteMetadata={pasteMetadataToSelected} onClear={() => setSelectedIds(new Set())} onAddGroup={(identifier) => assignGroup(selectedIds, identifier)} onPrimary={(identifier) => assignGroup(selectedIds, identifier, true)} onFavourite={() => toggleFavourite(selectedIds, true)} onWorkspace={addSelectedToWorkspace} onDelete={() => deleteItems(selectedIds)} />}
        <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
          <span>{displayItems.length} item{displayItems.length === 1 ? "" : "s"}{state.preferences.sortMode === "manual" ? " · Alt+↑/↓ to reorder" : ""}</span>
          <div className="flex gap-2">
            <button className="inline-flex min-h-6 items-center px-1 hover:text-white" onClick={selectVisible}>Select all</button>
            <button className="inline-flex min-h-6 items-center px-1 hover:text-white" onClick={() => setSelectedIds(new Set())}>Deselect</button>
            {state.preferences.layout === "purpose" && activeGroupId === "all" && <><button className="inline-flex min-h-6 items-center px-1 hover:text-white" onClick={() => setCollapsedGroupIds(new Set(groups.map((group) => group.id)))}>Collapse all</button><button className="inline-flex min-h-6 items-center px-1 hover:text-white" onClick={() => setCollapsedGroupIds(new Set())}>Expand all</button></>}
          </div>
        </div>
        {state.preferences.layout === "purpose" && activeGroupId === "all" ? <PurposeLibrary groups={groups} collapsedGroupIds={collapsedGroupIds} onCollapsedChange={setCollapsedGroupIds} items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} /> : <ItemGrid items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} />}
      </section>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-400">
        <span>Tip: press <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-300">Ctrl+K</kbd> or <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-300">/</kbd> to find an app by name or tag.</span>
        <button type="button" className="inline-flex min-h-6 items-center px-1 text-neutral-400 underline-offset-4 hover:text-white hover:underline" onClick={() => setCreditsOpen(true)}>Credits &amp; Licences</button>
      </footer>
    </main>
    {nameDialog && <NameDialog title={nameDialog === "group" ? "Add group" : "Create workspace"} label={nameDialog === "group" ? "Group name" : "Workspace name"} onClose={() => setNameDialog(null)} onSave={(name) => { if (nameDialog === "group") addGroup(name); else addWorkspace(name); setNameDialog(null); }} />}
    {labelManagerOpen && <LabelManager groups={groups} tags={allTags} onClose={() => setLabelManagerOpen(false)} onDeleteGroup={deleteGroup} onMergeGroup={mergeGroup} onDeleteTag={deleteTag} onMergeTag={mergeTag} />}
    {creditsOpen && <CreditsDialog onClose={() => setCreditsOpen(false)} />}
    {confirmDialog && <ConfirmDialog title={confirmDialog.title} message={confirmDialog.message} confirmLabel={confirmDialog.confirmLabel} onCancel={() => setConfirmDialog(null)} onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} />}
    {editor && <ItemEditor item={editor} groups={groups} copiedMetadata={copiedMetadata} onCopyMetadata={(item) => setCopiedMetadata({ primaryGroupId: item.primaryGroupId, groupIds: item.groupIds, tags: item.tags })} onClose={() => setEditor(null)} onSave={(item) => { const existing = state.items.some((entry) => entry.id === item.id); if (existing) updateItem(item); else if (state.items.some((entry) => entry.kind === item.kind && cleanTarget(entry.target) === cleanTarget(item.target))) flash("A matching item already exists in the library."); else change((current) => ({ ...current, items: [{ ...item, order: 0 }, ...current.items].map((entry, index) => ({ ...entry, order: index })) })); setEditor(null); }} />}
    {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onImport={(resources) => { addResources(resources); setScanOpen(false); }} />}
    {notice && <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm shadow-2xl"><CircleAlert className="mr-2 inline h-4 w-4 text-amber-400" />{notice}</div>}
  </div>;
}

function Segmented({ value, onChange, options }: { value: string; onChange(value: string): void; options: Array<[string, string]> }) { return <div className="flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">{options.map(([key, label]) => <button key={key} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${value === key ? "bg-amber-400 text-black" : "text-neutral-400 hover:text-white"}`} onClick={() => onChange(key)}>{label}</button>)}</div>; }
function Panel({ title, panelId, state, onChange, onReorder, actions, children }: { title: string; panelId: PanelId; state: LibraryState; onChange(panel: PanelId, patch: Partial<{ visible: boolean; collapsed: boolean }>): void; onReorder(source: string, target: string): void; actions?: React.ReactNode; children: React.ReactNode }) {
  const preference = state.preferences.panels[panelId];
  return <section draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", panelId)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData("text/plain"), panelId); }} className={`min-h-0 rounded-xl border border-neutral-800 bg-neutral-900/35 p-3 ${panelId === "workspaces" ? "workspace-panel" : ""}`}><div className="flex min-h-7 flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2"><h2 className="text-xs font-bold uppercase tracking-wide text-neutral-200">{title}</h2><div className="flex flex-wrap items-center gap-1"><span className="icon-button cursor-grab text-neutral-400" title="Drag to reorder" aria-hidden="true"><GripVertical /></span>{actions}<button className="icon-button" aria-label={preference.collapsed ? `Expand ${title}` : `Collapse ${title}`} title={preference.collapsed ? "Expand" : "Collapse"} onClick={() => onChange(panelId, { collapsed: !preference.collapsed })}>{preference.collapsed ? <ChevronRight /> : <ChevronDown />}</button><button className="icon-button" aria-label={`Hide ${title}`} title="Hide panel" onClick={() => onChange(panelId, { visible: false })}><X /></button></div></div>{children}</section>;
}
function PreviewList({ items, onLaunch, collapsed, empty, showExtensions = false }: { items: Array<LibraryItem | WorkspaceResource>; onLaunch(item: LibraryItem | WorkspaceResource): void; collapsed: boolean; empty: string; showExtensions?: boolean }) {
  if (collapsed) return <p className="pt-3 text-xs text-neutral-400">{items.length} item{items.length === 1 ? "" : "s"}</p>;
  return <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{items.length ? items.map((item) => <button key={item.id} title={item.target} onClick={() => void onLaunch(item)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-neutral-800"><ItemIcon item={item} compact /><span className="truncate text-xs font-medium text-neutral-200">{displayName(item, showExtensions)}</span></button>) : <p className="px-1 py-5 text-xs leading-relaxed text-neutral-400">{empty}</p>}</div>;
}
const workspaceItemDate = (item: LibraryItem | WorkspaceResource): number | undefined => {
  if ("createdAt" in item) return item.createdAt;
  return item.addedAt;
};

function compareWorkspaceItems(a: LibraryItem | WorkspaceResource, b: LibraryItem | WorkspaceResource, mode: WorkspaceColumnSortMode): number {
  if (mode === "alpha") {
    return collator.compare(displayName(a, true), displayName(b, true));
  }
  if (mode === "type") {
    return (
      collator.compare(workspaceType(a), workspaceType(b)) ||
      collator.compare(displayName(a, true), displayName(b, true))
    );
  }
  const dateA = workspaceItemDate(a);
  const dateB = workspaceItemDate(b);
  if (dateA === undefined && dateB === undefined) return 0;
  if (dateA === undefined) return 1;
  if (dateB === undefined) return -1;
  if (mode === "date-newest") {
    return dateB - dateA;
  }
  return dateA - dateB;
}

function WorkspacePreview({ items, onLaunch, onAddFolder, onAddFile, onVerify, verifyBusy, onRemove, onRelink, brokenIds, collapsed }: { items: Array<LibraryItem | WorkspaceResource>; onLaunch(item: LibraryItem | WorkspaceResource): void; onAddFolder(): void; onAddFile(): void; onVerify(): void; verifyBusy: boolean; onRemove(id: string): void; onRelink(id: string): void; brokenIds: Set<string>; collapsed: boolean }) {
  const [folderSortMode, setFolderSortMode] = useState<WorkspaceColumnSortMode>("alpha");
  const [fileSortMode, setFileSortMode] = useState<WorkspaceColumnSortMode>("alpha");
  const folders = items.filter((item) => item.kind === "folder").sort((a, b) => compareWorkspaceItems(a, b, folderSortMode));
  const files = items.filter((item) => item.kind !== "folder").sort((a, b) => compareWorkspaceItems(a, b, fileSortMode));
  return <div className="pt-3"><div className="flex flex-wrap items-center gap-2"><button className="control compact" onClick={onAddFolder}><FolderOpen />Add folder</button><button className="control compact" onClick={onAddFile}><FilePlus2 />Add file</button><button className="control compact" disabled={verifyBusy} onClick={onVerify}>{verifyBusy ? "Verifying…" : "Verify workspace"}</button></div>{collapsed ? <p className="pt-3 text-xs text-neutral-400">{items.length} item{items.length === 1 ? "" : "s"}</p> : <div className="workspace-two-column mt-3"><WorkspaceList title="Folders" items={folders} sortMode={folderSortMode} onSortChange={setFolderSortMode} onLaunch={onLaunch} onRemove={onRemove} onRelink={onRelink} brokenIds={brokenIds} /><WorkspaceList title="Files" items={files} sortMode={fileSortMode} onSortChange={setFileSortMode} onLaunch={onLaunch} onRemove={onRemove} onRelink={onRelink} brokenIds={brokenIds} /></div>}</div>;
}
function workspaceType(item: LibraryItem | WorkspaceResource) { if (item.kind === "folder") return "Folder"; const extension = item.target.match(/\.([^.\\/]+)$/)?.[1]?.trim().toUpperCase(); return extension || (item.kind === "url" || item.kind === "protocol" ? "WEB LINK" : item.kind.toUpperCase()); }
type WorkspaceIconSource = string | "txt" | "presentation";
function workspaceIconSource(item: LibraryItem | WorkspaceResource): WorkspaceIconSource { const extension = item.target.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || ""; const descriptor = `${item.name} ${item.target}`.toLowerCase(); const webTarget = item.kind === "url" || item.kind === "protocol" || /^(https?:|www\.)/.test(item.target) || /^(com|net|org|html?|url)$/i.test(extension); if (extension === "gdoc" || /\bgoogle[ _-]?doc/.test(descriptor)) return googleDocIcon; if (/^(doc|docx|odt|rtf)$/i.test(extension) || /\b(word|msword)\b/.test(descriptor)) return wordIcon; if (/^(ppt|pptx|odp)$/i.test(extension) || /\b(powerpoint|presentation|slides)\b/.test(descriptor)) return "presentation"; if (/^(xls|xlsx|csv|ods)$/i.test(extension) || /\b(excel|spreadsheet)\b/.test(descriptor)) return spreadsheetIcon; if (extension === "pdf") return pdfIcon; if (/^(md|mdx|markdown)$/i.test(extension) || /\bmarkdown\b/.test(descriptor)) return markdownIcon; if (extension === "txt") return "txt"; if (/^(json|py)$/i.test(extension)) return jsonPyIcon; if (webTarget) return comIcon; if (/^(js|ts|tsx|css|yml|yaml|xml)$/i.test(extension) || /\b(code|script)\b/.test(descriptor)) return codeIcon; if (/^(png|jpe?g|gif|webp|svg|tiff?)$/i.test(extension) || /\b(image|photo|picture)\b/.test(descriptor)) return imageIcon; if (/^(mp3|wav|m4a|flac|ogg)$/i.test(extension) || /\b(audio|sound|music)\b/.test(descriptor)) return audioIcon; if (/^(mp4|mov|mkv|avi|webm|mpeg|mpg|mpe|movie)$/i.test(extension) || /\b(video|movie)\b/.test(descriptor)) return movieIcon; if (extension === "com") return comIcon; if (/^(exe|bat|cmd)$/i.test(extension)) return utilityIcon; if (extension === "lnk" || /\b(application|shortcut)\b/.test(descriptor)) return applicationIcon; return documentIcon; }
function WorkspaceItemIcon({ item }: { item: LibraryItem | WorkspaceResource }) { if (item.kind === "folder") return <ItemIcon item={item} compact />; const source = workspaceIconSource(item); return <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">{source === "txt" ? <span className="text-[7px] font-bold text-sky-300">TXT</span> : source === "presentation" ? <Presentation className="h-4 w-4 text-orange-300" /> : <img src={source} alt="" className="h-full w-full object-contain" />}</span>; }
function WorkspaceList({ title, items, sortByType = false, sortMode = "alpha", onSortChange, onLaunch, onRemove, onRelink, brokenIds }: { title: string; items: Array<LibraryItem | WorkspaceResource>; sortByType?: boolean; sortMode?: WorkspaceColumnSortMode; onSortChange?: (mode: WorkspaceColumnSortMode) => void; onLaunch(item: LibraryItem | WorkspaceResource): void; onRemove(id: string): void; onRelink(id: string): void; brokenIds: Set<string> }) {
  const row = (item: LibraryItem | WorkspaceResource) => {
    const isBroken = brokenIds.has(item.id);
    const label = displayName(item, true);
    return (
      <div key={item.id} className={`group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-neutral-800 ${isBroken ? "bg-red-950/20" : ""}`}>
        <button title={item.target} onClick={() => void onLaunch(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <WorkspaceItemIcon item={item} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-neutral-200">{label}</span>
            {item.kind === "folder" && <span className="block truncate font-mono text-[11px] text-neutral-400">{workspacePathCue(item.target)}</span>}
          </span>
        </button>
        {isBroken && <span className="text-[11px] font-medium text-red-300">Missing</span>}
        {isBroken
          ? <button className="control compact shrink-0" aria-label={`Relink ${label}`} title="Relink" onClick={() => onRelink(item.id)}><FolderOpen />Relink</button>
          : <button className="icon-button opacity-80 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Relink ${label}`} title="Relink" onClick={() => onRelink(item.id)}><FolderOpen /></button>}
        <button className="icon-button danger opacity-80 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${label} from workspace`} title="Remove from workspace" onClick={() => onRemove(item.id)}><Trash2 /></button>
      </div>
    );
  };
  const isTypeSort = sortMode === "type" || sortByType;
  const typeGroups = items.reduce<Record<string, Array<LibraryItem | WorkspaceResource>>>((groups, item) => { const type = workspaceType(item); (groups[type] ||= []).push(item); return groups; }, {});
  let listContent: React.ReactNode;
  if (!items.length) {
    listContent = <p className="px-1 py-2 text-xs text-neutral-400">No {title.toLowerCase()}.</p>;
  } else if (isTypeSort) {
    listContent = Object.entries(typeGroups).map(([type, grouped]) => (
      <div key={type} className="mb-2">
        <h4 className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{type}</h4>
        {grouped.map(row)}
      </div>
    ));
  } else {
    listContent = items.map(row);
  }
  return <section className="min-w-0"><div className="mb-1 flex items-center justify-between gap-2"><h3 className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">{title} · {items.length}</h3>{onSortChange && <select aria-label={`${title} sort order`} value={sortMode} onChange={(event) => onSortChange(event.target.value as WorkspaceColumnSortMode)} className="panel-select"><option value="alpha">A–Z</option><option value="type">By type</option><option value="date-newest">Date added (Newest)</option><option value="date-oldest">Date added (Oldest)</option></select>}</div><div className="space-y-1">{listContent}</div></section>;
}
function PurposeLibrary(props: ItemGridProps & { groups: Group[]; collapsedGroupIds: Set<string>; onCollapsedChange(next: Set<string>): void }) { return <div className="space-y-5">{props.groups.map((group) => { const groupItems = props.items.filter((item) => item.primaryGroupId === group.id); const isCollapsed = props.collapsedGroupIds.has(group.id); return groupItems.length ? <section key={group.id}><button className="mb-2 flex min-h-6 w-full items-center gap-2 text-left" onClick={() => { const next = new Set(props.collapsedGroupIds); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); props.onCollapsedChange(next); }}><Layers3 className="h-3.5 w-3.5 text-amber-400" /><h3 className="text-xs font-bold uppercase tracking-wide text-neutral-300">{group.name}</h3><span className="text-[11px] text-neutral-400">{groupItems.length}</span>{isCollapsed ? <ChevronRight className="ml-1 h-4 w-4 text-neutral-400" /> : <ChevronDown className="ml-1 h-4 w-4 text-neutral-400" />}</button>{!isCollapsed && <ItemGrid {...props} items={groupItems} />}</section> : null; })}</div>; }
type ItemGridProps = { items: LibraryItem[]; selected: Set<string>; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; manual: boolean; };
function ItemGrid({ items, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, manual }: ItemGridProps) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
      {items.map((item, index) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selected.has(item.id)}
          groupName={groupName}
          onSelect={onSelect}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onToggleFavourite={onToggleFavourite}
          onDelete={onDelete}
          onReorder={onReorder}
          onStepReorder={(delta) => {
            const neighbor = items[index + delta];
            if (neighbor) onReorder(item.id, neighbor.id);
          }}
          manual={manual}
        />
      ))}
      {!items.length && <div className="rounded-lg border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-400">No items match this view.</div>}
    </div>
  );
}
function ItemCard({ item, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, onStepReorder, manual }: { item: LibraryItem; selected: boolean; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; onStepReorder(delta: -1 | 1): void; manual: boolean; }) {
  const visibleTags = item.tags.slice(0, 3);
  return (
    <article
      draggable={manual}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
      onDragOver={(event) => manual && event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData("text/plain"), item.id); }}
      onKeyDown={(event) => {
        if (!manual || !event.altKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); onStepReorder(-1); }
        else if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); onStepReorder(1); }
      }}
      className={`group grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3 ${selected ? "border-amber-400/70 bg-amber-400/5" : "border-neutral-800 bg-neutral-950/35 hover:border-neutral-700"}`}
    >
      <label className="grid min-h-6 min-w-6 cursor-pointer place-items-center">
        <input type="checkbox" checked={selected} aria-label={`Select ${item.name}`} onChange={() => onSelect(item.id)} className="accent-amber-400" />
      </label>
      <button onClick={() => void onLaunch(item)} aria-label={`Open ${item.name}`} className="shrink-0"><ItemIcon item={item} /></button>
      <button onClick={() => void onLaunch(item)} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-neutral-300">{groupName(item.primaryGroupId)}</span>
          {item.groupIds.length > 1 && <span className="text-[11px] font-semibold uppercase text-amber-400">{item.groupIds.length} groups</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-neutral-400">{item.description || item.target}</p>
        {visibleTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visibleTags.map((tag) => <span key={tag} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-300">#{tag}</span>)}
            {item.tags.length > 3 && <span className="text-[11px] text-neutral-400">+{item.tags.length - 3}</span>}
          </div>
        )}
      </button>
      <div className="flex shrink-0 gap-1 opacity-80 transition group-hover:opacity-100 focus-within:opacity-100">
        <button className="icon-button" aria-label={item.isFavourite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`} title={item.isFavourite ? "Remove favourite" : "Add favourite"} onClick={() => onToggleFavourite(item)}><Star className={item.isFavourite ? "fill-amber-400 text-amber-400" : ""} /></button>
        <button className="icon-button" aria-label={`Edit ${item.name}`} title="Edit" onClick={() => onEdit(item)}><Settings2 /></button>
        <button className="icon-button danger" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => onDelete(item)}><Trash2 /></button>
      </div>
    </article>
  );
}
function FallbackFileIcon({ item }: { item: LibraryItem | WorkspaceResource }) { const extension = item.target.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || ""; const iconClass = "h-4 w-4"; if (item.kind === "folder") return <Folder className={iconClass} />; if (/^(doc|docx|odt|rtf)$/i.test(extension)) return <FileText className={iconClass} />; if (/^(xls|xlsx|csv|ods)$/i.test(extension)) return <FileSpreadsheet className={iconClass} />; if (/^(ppt|pptx|odp)$/i.test(extension)) return <Presentation className={iconClass} />; if (/^(pdf)$/i.test(extension)) return <FileText className={iconClass} />; if (/^(png|jpe?g|gif|webp|svg|tiff?)$/i.test(extension)) return <FileImage className={iconClass} />; if (/^(mp3|wav|m4a|flac|ogg)$/i.test(extension)) return <FileAudio className={iconClass} />; if (/^(mp4|mov|mkv|avi|webm)$/i.test(extension)) return <FileVideo className={iconClass} />; if (/^(zip|rar|7z|tar|gz)$/i.test(extension)) return <FileArchive className={iconClass} />; if (/^(js|ts|tsx|py|json|md|html|css|yml|yaml)$/i.test(extension)) return <FileCode2 className={iconClass} />; return item.kind === "file" ? <File className={iconClass} /> : <Zap className={iconClass} />; }
function ItemIcon({ item, compact = false }: { item: LibraryItem | WorkspaceResource; compact?: boolean }) {
  const iconSource = item.iconSource || item.target;
  const [nativeSrc, setNativeSrc] = useState<string | null>(() => iconCache.get(iconSource) ?? null);
  useEffect(() => {
    let live = true;
    if (!iconSource) { setNativeSrc(null); return; }
    if (iconCache.has(iconSource)) {
      setNativeSrc(iconCache.get(iconSource) ?? null);
      return;
    }
    setNativeSrc(null);
    const api = window.launcher;
    if (api) {
      void api.getIcon(iconSource)
        .then((icon) => {
          const url = icon?.dataUrl ?? null;
          iconCache.set(iconSource, url);
          if (live) setNativeSrc(url);
        })
        .catch(() => { if (live) setNativeSrc(null); });
    }
    return () => { live = false; };
  }, [iconSource]);
  const src = ("iconDataUrl" in item ? item.iconDataUrl : null) || nativeSrc || null;
  const size = compact ? "h-6 w-6" : "h-10 w-10";
  return <span className={`grid ${size} place-items-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-amber-400`}>{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <FallbackFileIcon item={item} />}</span>;
}
function BulkBar({ selected, selectedItems, groups, workspaces, hasCopiedMetadata, onCopyMetadata, onPasteMetadata, onClear, onAddGroup, onPrimary, onFavourite, onWorkspace, onDelete }: { selected: number; selectedItems: LibraryItem[]; groups: Group[]; workspaces: Workspace[]; hasCopiedMetadata: boolean; onCopyMetadata(id: string): void; onPasteMetadata(): void; onClear(): void; onAddGroup(id: string): void; onPrimary(id: string): void; onFavourite(): void; onWorkspace(id: string): void; onDelete(): void; }) { return <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs"><strong className="text-amber-300">{selected} selected</strong><select defaultValue="" onChange={(event) => { if (event.target.value) { onCopyMetadata(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Copy groups/tags from…</option>{selectedItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="control compact" disabled={!hasCopiedMetadata} onClick={onPasteMetadata}>Paste groups &amp; tags</button><select defaultValue="" onChange={(event) => { if (event.target.value) { onAddGroup(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onPrimary(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Set primary group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onWorkspace(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to workspace…</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="control compact" onClick={onFavourite}><Star />Favourite</button><button className="control compact danger" onClick={onDelete}><Trash2 />Remove</button><button className="ml-auto text-neutral-300 hover:text-white" onClick={onClear}>Clear</button></div>; }
function ItemEditor({ item, groups, copiedMetadata, onCopyMetadata, onClose, onSave }: { item: LibraryItem; groups: Group[]; copiedMetadata: Pick<LibraryItem, "primaryGroupId" | "groupIds" | "tags"> | null; onCopyMetadata(item: LibraryItem): void; onClose(): void; onSave(item: LibraryItem): void }) {
  const [draft, setDraft] = useState(item);
  const [iconError, setIconError] = useState<string | null>(null);
  const isNew = !item.name && !item.target;
  const iconInputRef = useRef<HTMLInputElement>(null);
  const toggleGroup = (identifier: string) => setDraft((current) => ({ ...current, groupIds: current.groupIds.includes(identifier) ? current.groupIds.filter((entry) => entry !== identifier) : [...current.groupIds, identifier] }));
  const pasteMetadata = () => { if (copiedMetadata) setDraft((current) => ({ ...current, ...copiedMetadata, groupIds: copiedMetadata.groupIds.filter((id) => groups.some((group) => group.id === id)), primaryGroupId: groups.some((group) => group.id === copiedMetadata.primaryGroupId) ? copiedMetadata.primaryGroupId : current.primaryGroupId })); };
  const browseForTarget = async () => {
    const resource = await window.launcher?.chooseResource(draft.kind === "folder" ? "folder" : "app");
    if (!resource) return;
    setDraft((current) => ({ ...current, name: current.name.trim() || resource.name || current.name, target: resource.target, kind: resource.kind, arguments: resource.arguments || [], workingDirectory: resource.workingDirectory, description: current.description || resource.description, iconSource: resource.iconSource }));
  };
  const setCustomIcon = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setIconError("Choose an image file (PNG, JPEG, WebP, GIF, or SVG) for the shortcut icon."); return; }
    if (file.size > 4 * 1024 * 1024) { setIconError("Choose an image smaller than 4 MB."); return; }
    setIconError(null);
    const reader = new FileReader();
    reader.onload = () => { const dataUrl = reader.result; if (typeof dataUrl === "string") setDraft((current) => ({ ...current, iconDataUrl: dataUrl })); };
    reader.readAsDataURL(file);
  };
  return <Modal title={isNew ? "Add item" : "Edit item"} onClose={onClose}><form className="space-y-3" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!draft.name.trim() || !draft.target.trim()) return; const primary = draft.groupIds.includes(draft.primaryGroupId) ? draft.primaryGroupId : draft.groupIds[0] || groups[0]?.id; onSave({ ...draft, name: draft.name.trim(), target: draft.target.trim(), primaryGroupId: primary, tags: draft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).sort(collator.compare) }); }}>
    {!isNew && <div className="flex gap-2"><button type="button" className="control compact" onClick={() => onCopyMetadata(draft)}>Copy groups &amp; tags</button><button type="button" className="control compact" disabled={!copiedMetadata} onClick={pasteMetadata}>Paste groups &amp; tags</button></div>}
    <Field label="Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field><Field label="Target path or URL"><div className="flex gap-2"><input value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} placeholder="Enter or paste a path or URL, or use Browse…" required /><button type="button" className="control compact shrink-0" onClick={() => void browseForTarget()}>Browse…</button></div></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ItemKind })}>{(["app", "folder", "file", "url", "protocol"] as ItemKind[]).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field><Field label="Primary group"><select value={draft.primaryGroupId} onChange={(event) => setDraft({ ...draft, primaryGroupId: event.target.value, groupIds: [...new Set([...draft.groupIds, event.target.value])] })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field></div><Field label="Shortcut icon"><div className="flex items-center gap-2"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 text-amber-400">{draft.iconDataUrl ? <img src={draft.iconDataUrl} alt="Custom shortcut icon" className="h-full w-full object-cover" /> : <Zap className="h-4 w-4" />}</span><input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={setCustomIcon} /><button type="button" className="control compact" onClick={() => iconInputRef.current?.click()}>{draft.iconDataUrl ? "Replace image…" : "Add image…"}</button>{draft.iconDataUrl && <button type="button" className="control compact" onClick={() => { setIconError(null); setDraft((current) => ({ ...current, iconDataUrl: undefined })); }}>Use system icon</button>}</div>{iconError && <p role="alert" className="mt-1 text-xs font-normal text-red-300">{iconError}</p>}<p className="mt-1 text-[11px] font-normal text-neutral-400">A custom image takes priority over the icon collected from the shortcut.</p></Field><Field label="Tags (comma separated — useful for searching by function)"><input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",") })} placeholder="e.g. pdf, merge, ocr, citation" /></Field><Field label="Description"><textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></Field><div><p className="mb-1 text-xs font-semibold text-neutral-300">Also in groups</p><div className="flex flex-wrap gap-2">{groups.map((group) => <label key={group.id} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs"><input type="checkbox" checked={draft.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.name}</label>)}</div></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button className="control primary" type="submit">Save</button></div></form></Modal>;
}
function LabelManager({ groups, tags, onClose, onDeleteGroup, onMergeGroup, onDeleteTag, onMergeTag }: { groups: Group[]; tags: string[]; onClose(): void; onDeleteGroup(id: string): void; onMergeGroup(source: string, target: string): void; onDeleteTag(tag: string): void; onMergeTag(source: string, target: string): void }) {
  const [groupSource, setGroupSource] = useState(""); const [groupTarget, setGroupTarget] = useState(""); const [tagSource, setTagSource] = useState(""); const [tagTarget, setTagTarget] = useState("");
  return <Modal title="Organise groups & tags" onClose={onClose}><div className="space-y-6"><p className="text-xs leading-relaxed text-neutral-400">Delete removes a group or tag from all shortcuts (you will be asked to confirm). Merge moves every shortcut using the source into the destination.</p><section><h3 className="mb-2 text-sm font-semibold">Groups</h3><div className="max-h-32 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{groups.map((group) => <div key={group.id} className="flex items-center justify-between gap-2 text-xs"><span>{group.name}</span><button className="text-red-300 hover:text-red-200" onClick={() => onDeleteGroup(group.id)}>Delete</button></div>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><select value={groupSource} onChange={(event) => setGroupSource(event.target.value)}><option value="">Merge this group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select value={groupTarget} onChange={(event) => setGroupTarget(event.target.value)}><option value="">Into this group…</option>{groups.filter((group) => group.id !== groupSource).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><button className="control compact mt-2" disabled={!groupSource || !groupTarget} onClick={() => { onMergeGroup(groupSource, groupTarget); setGroupSource(""); setGroupTarget(""); }}>Merge groups</button></section><section><h3 className="mb-2 text-sm font-semibold">Tags</h3><div className="max-h-32 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{tags.length ? tags.map((tag) => <div key={tag} className="flex items-center justify-between gap-2 text-xs"><span>#{tag}</span><button className="text-red-300 hover:text-red-200" onClick={() => onDeleteTag(tag)}>Delete</button></div>) : <p className="text-xs text-neutral-400">No tags added yet.</p>}</div><div className="mt-2 grid grid-cols-2 gap-2"><select value={tagSource} onChange={(event) => setTagSource(event.target.value)}><option value="">Merge this tag…</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select><input value={tagTarget} onChange={(event) => setTagTarget(event.target.value)} placeholder="Destination tag" /></div><button className="control compact mt-2" disabled={!tagSource || !tagTarget.trim()} onClick={() => { onMergeTag(tagSource, tagTarget); setTagSource(""); setTagTarget(""); }}>Merge tags</button></section><div className="flex justify-end"><button className="control" onClick={onClose}>Done</button></div></div></Modal>;
}
function CreditsDialog({ onClose }: { onClose(): void }) { return <Modal title="Credits" onClose={onClose}><div className="space-y-3 text-sm leading-relaxed text-neutral-300"><p>Workspace file-type icons use selected open-licensed SVG vectors from SVG Repo. Folders and application shortcuts retain their existing icon behaviour.</p><p className="text-xs text-neutral-400">Source: SVG Repo — Search, explore, edit and share open-licensed SVG vectors. Individual assets may carry their own licence terms.</p><a className="text-sm text-amber-300 underline" href="https://www.svgrepo.com/" target="_blank" rel="noreferrer">svgrepo.com</a><div className="flex justify-end"><button className="control" onClick={onClose}>Done</button></div></div></Modal>; }
function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; onCancel(): void; onConfirm(): void }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutral-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="control" onClick={onCancel}>Cancel</button>
          <button type="button" className="control danger" autoFocus onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
function NameDialog({ title, label, onClose, onSave }: { title: string; label: string; onClose(): void; onSave(name: string): void }) { const [name, setName] = useState(""); return <Modal title={title} onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }}><Field label={label}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={title === "Create workspace" ? "For example, Thesis project" : "For example, Writing"} /></Field><div className="flex justify-end gap-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button className="control primary" type="submit">Save</button></div></form></Modal>; }
function ScanDialog({ onClose, onImport }: { onClose(): void; onImport(resources: ImportedResource[]): void }) {
  const [path, setPath] = useState("%USERPROFILE%\\Desktop");
  const [items, setItems] = useState<ImportedResource[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function scan(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resources = await window.launcher?.scanFolder(path) || [];
      setItems(resources);
      setSelectedIndexes(new Set(resources.map((_, index) => index)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not scan this folder.");
    } finally {
      setLoading(false);
    }
  }
  const toggleIndex = (index: number) => {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };
  const chosenItems = items.filter((_, index) => selectedIndexes.has(index));
  return <Modal title="Scan folder" onClose={onClose}><form className="flex gap-2" onSubmit={scan}><input value={path} onChange={(event) => setPath(event.target.value)} aria-label="Folder path to scan" className="min-w-0 flex-1" /><button className="control primary" disabled={loading}>{loading ? "Scanning…" : "Scan"}</button></form>{error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}{items.length > 0 && <div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs text-neutral-400"><span>{items.length} eligible resources found. Existing matching targets will be skipped.</span><div className="flex gap-2"><button type="button" className="hover:text-white" onClick={() => setSelectedIndexes(new Set(items.map((_, index) => index)))}>All</button><button type="button" className="hover:text-white" onClick={() => setSelectedIndexes(new Set())}>None</button></div></div><div className="max-h-64 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{items.map((item, index) => <label key={`${item.target}:${item.name}`} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-neutral-800/60"><input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggleIndex(index)} className="w-auto accent-amber-400" /><span className="text-amber-400">{item.kind}</span><span className="truncate">{item.name}</span></label>)}</div><div className="mt-3 flex justify-end gap-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button type="button" className="control primary" disabled={!chosenItems.length} onClick={() => onImport(chosenItems)}>Import {chosenItems.length}</button></div></div>}</Modal>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    if (container && !container.contains(document.activeElement)) {
      const firstFocusable = container.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      firstFocusable?.focus();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (previousFocus && typeof previousFocus.focus === "function" && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-neutral-300"><span className="mb-1 block">{label}</span>{children}</label>; }
