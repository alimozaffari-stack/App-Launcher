import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AppWindow, ArchiveRestore, Check, ChevronDown, ChevronRight, CircleAlert, File, FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, FilePlus2,
  Folder, FolderOpen, GripVertical, LayoutList, Layers3, ListFilter, Plus, Presentation, Search, Settings2,
  Star, Tag, Trash2, X, Zap
} from "lucide-react";
import type { Group, ImportedResource, ItemKind, LibraryItem, LibraryLayout, LibraryState, PanelId, SortMode, Workspace, WorkspaceResource, WorkspaceSortMode } from "./types";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
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
const kindFromPath = (target: string): ItemKind => {
  if (/^https?:/i.test(target)) return "url";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "protocol";
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
  return {
    ...value,
    version: 2,
    groups: [...(value.groups || [])].sort((a, b) => collator.compare(a.name, b.name)),
    items: value.items || [], workspaces: (value.workspaces || []).map((workspace) => ({ ...workspace, resources: workspace.resources || [] })),
    preferences: {
      focusGroupId: value.preferences?.focusGroupId || "none",
      workspaceId: value.preferences?.workspaceId,
      panelOrder: JSON.stringify(value.preferences?.panelOrder) === JSON.stringify(["focus", "favourites", "recent", "workspaces"]) ? panelIds : [...new Set([...(value.preferences?.panelOrder || []), ...panelIds])] as PanelId[],
      sortMode: value.preferences?.sortMode || "manual",
      layout: value.preferences?.layout || "flat",
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
  const [nameDialog, setNameDialog] = useState<"group" | "workspace" | null>(null);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [copiedMetadata, setCopiedMetadata] = useState<Pick<LibraryItem, "primaryGroupId" | "groupIds" | "tags"> | null>(null);
  const [workspaceDeleteArmed, setWorkspaceDeleteArmed] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [brokenWorkspaceIds, setBrokenWorkspaceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const stored = await window.launcher?.loadState();
      const directDesktop = Boolean(window.launcher?.isDirectDesktop);
      const next = stored ? normaliseState(stored) : (loadBrowserState() || (directDesktop ? blankState() : migrateLegacy()));
      setState(next);
      if (!stored && !directDesktop) await persist(next);
      if (!stored && directDesktop) setMigrationWarning(true);
    })();
  }, []);

  async function persist(next: LibraryState) {
    const normalised = normaliseState(next);
    setState(normalised);
    if (window.launcher) await window.launcher.saveState(normalised);
    else saveBrowserState(normalised);
  }
  function change(mutator: (current: LibraryState) => LibraryState) { if (state) void persist(mutator(state)); }
  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(null), 4000); }

  const groups = useMemo(() => state ? [...state.groups].sort((a, b) => collator.compare(a.name, b.name)) : [], [state]);
  const groupName = (identifier: string) => groups.find((group) => group.id === identifier)?.name || "Unassigned";
  const allTags = useMemo(() => state ? [...new Set(state.items.flatMap((item) => item.tags))].sort(collator.compare) : [], [state]);
  const displayItems = useMemo(() => {
    if (!state) return [];
    const term = query.trim().toLocaleLowerCase();
    const filtered = state.items.filter((item) => {
      const inGroup = activeGroupId === "all" || item.groupIds.includes(activeGroupId);
      const searchable = [item.name, item.description || "", ...item.tags, ...item.groupIds.map(groupName)].join(" ").toLocaleLowerCase();
      return inGroup && (!term || searchable.includes(term));
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
    const fallback = state.groups.find((group) => group.id !== groupId) as Group;
    change((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== groupId), items: current.items.map((item) => item.primaryGroupId !== groupId && !item.groupIds.includes(groupId) ? item : { ...item, primaryGroupId: item.primaryGroupId === groupId ? fallback.id : item.primaryGroupId, groupIds: [...new Set(item.groupIds.filter((id) => id !== groupId).concat(item.primaryGroupId === groupId ? [fallback.id] : []))] }) }));
  }
  function mergeGroup(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    change((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== sourceId), items: current.items.map((item) => ({ ...item, primaryGroupId: item.primaryGroupId === sourceId ? targetId : item.primaryGroupId, groupIds: [...new Set(item.groupIds.map((id) => id === sourceId ? targetId : id))] })) }));
  }
  function deleteTag(tag: string) { change((current) => ({ ...current, items: current.items.map((item) => ({ ...item, tags: item.tags.filter((entry) => entry !== tag) })) })); }
  function mergeTag(source: string, target: string) { const clean = target.trim().toLowerCase(); if (!source || !clean || source === clean) return; change((current) => ({ ...current, items: current.items.map((item) => ({ ...item, tags: [...new Set(item.tags.map((tag) => tag === source ? clean : tag))].sort(collator.compare) })) })); }
  function addWorkspace(name: string) {
    if (!state || !name.trim()) return;
    if (state.workspaces.some((workspace) => workspace.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) { flash("That workspace already exists."); return; }
    const workspace: Workspace = { id: id("workspace"), name: name.trim(), itemIds: [], resources: [] };
    change((current) => ({ ...current, workspaces: [...current.workspaces, workspace], preferences: { ...current.preferences, workspaceId: workspace.id } }));
  }
  function deleteWorkspace() {
    if (!activeWorkspace) return;
    if (!workspaceDeleteArmed) { setWorkspaceDeleteArmed(true); flash("Click the red workspace delete button again to confirm."); return; }
    change((current) => ({ ...current, workspaces: current.workspaces.filter((workspace) => workspace.id !== activeWorkspace.id), preferences: { ...current.preferences, workspaceId: current.workspaces.find((workspace) => workspace.id !== activeWorkspace.id)?.id } }));
    setWorkspaceDeleteArmed(false);
  }
  function toggleSelection(itemId: string) {
    setSelectedIds((current) => { const next = new Set(current); next.has(itemId) ? next.delete(itemId) : next.add(itemId); return next; });
  }
  function selectVisible() { setSelectedIds(new Set(displayItems.map((item) => item.id))); }
  function updateItem(updated: LibraryItem) { change((current) => ({ ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) })); }
  function deleteItems(itemIds: Set<string>) {
    if (!itemIds.size || !window.confirm(`Remove ${itemIds.size} item${itemIds.size === 1 ? "" : "s"} from the launcher?`)) return;
    change((current) => ({ ...current, items: current.items.filter((item) => !itemIds.has(item.id)), workspaces: current.workspaces.map((workspace) => ({ ...workspace, itemIds: workspace.itemIds.filter((itemId) => !itemIds.has(itemId)) })) }));
    setSelectedIds(new Set());
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
    const resource = await window.launcher?.chooseResource(kind);
    if (!resource) return;
    const entry: WorkspaceResource = { id: id("workspace-resource"), name: resource.name || "Untitled resource", target: resource.target, kind: resource.kind, arguments: resource.arguments || [], workingDirectory: resource.workingDirectory, description: resource.description };
    change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => workspace.id !== activeWorkspace.id ? workspace : { ...workspace, resources: [...workspace.resources, entry] }) }));
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
    change((current) => ({ ...current, workspaces: current.workspaces.map((workspace) => workspace.id !== activeWorkspace.id ? workspace : { ...workspace, resources: workspace.resources.map((resource) => resource.id !== itemId ? resource : { ...resource, name: replacement.name || resource.name, target: replacement.target, kind: replacement.kind, arguments: replacement.arguments || [], workingDirectory: replacement.workingDirectory, description: replacement.description }) }) }));
    setBrokenWorkspaceIds((current) => { const next = new Set(current); next.delete(itemId); return next; });
  }
  async function verifyWorkspace() {
    if (!activeWorkspace) return;
    const entries: Array<LibraryItem | WorkspaceResource> = [...activeWorkspace.resources, ...activeWorkspace.itemIds.map((itemId) => state?.items.find((item) => item.id === itemId)).filter(Boolean) as Array<LibraryItem | WorkspaceResource>];
    const results = await Promise.all(entries.map(async (item) => ({ id: item.id, exists: await window.launcher?.pathExists(item.target) })));
    const broken = new Set(results.filter((result) => !result.exists).map((result) => result.id)); setBrokenWorkspaceIds(broken);
    flash(broken.size ? `${broken.size} workspace link${broken.size === 1 ? " is" : "s are"} unavailable. Use Relink or Remove.` : "All workspace links are available.");
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
      additions.push({ id: id("item"), name: resource.name || "Untitled item", target: resource.target, kind: resource.kind || kindFromPath(resource.target), arguments: resource.arguments || [], workingDirectory: resource.workingDirectory, description: resource.description, primaryGroupId: defaultGroup.id, groupIds: [defaultGroup.id], tags: [...new Set(resource.tags || [])].sort(collator.compare), createdAt: Date.now(), order: index, isFavourite: false });
    });
    if (additions.length) change((current) => ({ ...current, items: [...additions, ...current.items].map((item, index) => ({ ...item, order: index })) }));
    flash(`${additions.length} item${additions.length === 1 ? "" : "s"} added${duplicates ? `; ${duplicates} duplicate${duplicates === 1 ? " was" : "s were"} skipped` : ""}.`);
  }
  async function chooseResource(kind: ItemKind) { const resource = await window.launcher?.chooseResource(kind); if (resource) addResources([resource]); }
  async function launch(item: LibraryItem | WorkspaceResource) {
    const result = await window.launcher?.openItem(item as LibraryItem);
    if (result && !result.ok) { flash(result.error || "Could not open this item."); return; }
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

  if (!state) return <div className="min-h-screen grid place-items-center text-sm text-neutral-500">Opening your library…</div>;
  const selectedSet = selectedIds;
  const visiblePanels = state.preferences.panelOrder.filter((panelId) => state.preferences.panels[panelId].visible);
  const favourites = state.items.filter((item) => item.isFavourite);
  const recent = [...state.items].filter((item) => item.lastLaunchedAt).sort((a, b) => (b.lastLaunchedAt || 0) - (a.lastLaunchedAt || 0)).slice(0, 8);
  const focusItems = state.preferences.focusGroupId === "all" ? state.items : state.preferences.focusGroupId === "none" ? [] : state.items.filter((item) => item.groupIds.includes(state.preferences.focusGroupId));
  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.preferences.workspaceId) || state.workspaces[0];
  const workspaceItems = (activeWorkspace ? [...activeWorkspace.resources, ...activeWorkspace.itemIds.map((itemId) => state.items.find((item) => item.id === itemId)).filter(Boolean) as Array<LibraryItem | WorkspaceResource>] : []).sort((a, b) => state.preferences.workspaceSortMode === "type" ? (a.kind.localeCompare(b.kind) || collator.compare(displayName(a, true), displayName(b, true))) : collator.compare(displayName(a, true), displayName(b, true)));
  const workspaceOnly = visiblePanels.length === 1 && visiblePanels[0] === "workspaces";

  return <div className="min-h-screen bg-neutral-950 text-neutral-200" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
      <header className="mb-5 flex flex-col gap-4 border-b border-neutral-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-lg font-semibold text-white"><AppWindow className="h-5 w-5 text-amber-400" />App Launcher</h1><p className="mt-1 text-xs text-neutral-500">Applications, files, folders and workspaces—kept locally.</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="control primary" onClick={() => setEditor({ id: id("item"), name: "", target: "", kind: "app", arguments: [], primaryGroupId: groups[0]?.id || "", groupIds: [groups[0]?.id || ""], tags: [], createdAt: Date.now(), order: 0, isFavourite: false })}><Plus />Add item</button>
          <button className="control" onClick={() => void chooseResource("app")}><FilePlus2 />Choose file/app</button>
          <button className="control" onClick={() => void chooseResource("folder")}><FolderOpen />Choose folder</button>
          <button className="control" onClick={() => setScanOpen(true)}><Search />Scan folder</button>
          <button className="control" onClick={() => setManagePanels((current) => !current)}><Settings2 />Manage panels</button>
          <button className="control" onClick={() => setCreditsOpen(true)}>Credits</button>
        </div>
      </header>
      {migrationWarning && <section className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-neutral-300"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /><div><strong className="text-amber-300">No desktop library was found.</strong><p className="mt-1 text-xs leading-relaxed text-neutral-400">If this is an upgrade from the earlier localhost launcher, install and open the v1.1.0 migration build once before using this direct desktop version. New installations can ignore this notice.</p></div><button className="ml-auto text-xs text-neutral-400 hover:text-white" onClick={() => setMigrationWarning(false)}>Dismiss</button></section>}
      {!state.preferences.onboardingDismissed && state.items.length === 0 && <section className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm"><div className="mr-auto"><strong className="text-amber-300">Set up your library</strong><p className="mt-1 text-xs text-neutral-400">Optionally choose a folder or scan one now. You can skip this and do it later.</p></div><button className="control compact" onClick={() => void chooseResource("folder")}>Choose folder</button><button className="control compact" onClick={() => setScanOpen(true)}>Scan folder</button><button className="text-xs text-neutral-400 hover:text-white" onClick={() => setPreference("onboardingDismissed", true)}>Skip</button></section>}

      {managePanels && <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Dashboard panels</strong><button className="text-xs text-neutral-400 hover:text-white" onClick={() => setManagePanels(false)}>Done</button></div><p className="mb-3 text-xs text-neutral-500">Drag a panel by its handle to choose its position.</p><div className="flex flex-wrap gap-3">{panelIds.map((panelId) => <label key={panelId} className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-xs"><input type="checkbox" checked={state.preferences.panels[panelId].visible} onChange={(event) => changePanel(panelId, { visible: event.target.checked })} />{panelTitles[panelId]}</label>)}</div></section>}

      {visiblePanels.length > 0 && <section className="dashboard-panels mb-7 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
{visiblePanels.map((panelId) => panelId === "focus" ? <Panel key={panelId} title="Focus group" panelId={panelId} state={state} onChange={changePanel} onReorder={reorderPanels} actions={<select value={state.preferences.focusGroupId} onChange={(event) => setPreference("focusGroupId", event.target.value)} className="panel-select"><option value="none">None (hide)</option><option value="all">All items</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}><PreviewList items={focusItems} onLaunch={launch} collapsed={state.preferences.panels.focus.collapsed} empty="Choose a group or show all items." /></Panel> : panelId === "favourites" ? <Panel key={panelId} title="Favourites" panelId={panelId} state={state} onChange={changePanel} onReorder={reorderPanels}><PreviewList items={favourites} onLaunch={launch} collapsed={state.preferences.panels.favourites.collapsed} empty="Star items in the library to place them here." /></Panel> : panelId === "recent" ? <Panel key={panelId} title="Recent" panelId={panelId} state={state} onChange={changePanel} onReorder={reorderPanels}><PreviewList items={recent} onLaunch={launch} collapsed={state.preferences.panels.recent.collapsed} empty="Items you open will appear here." /></Panel> : <Panel key={panelId} title="Workspaces" panelId={panelId} state={state} onChange={changePanel} onReorder={reorderPanels} actions={<div className="flex items-center gap-1"><select value={activeWorkspace?.id || ""} onChange={(event) => { setWorkspaceDeleteArmed(false); setPreference("workspaceId", event.target.value); }} className="panel-select"><option value="">No workspace</option>{state.workspaces.slice().sort((a,b) => collator.compare(a.name,b.name)).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="icon-button" title="Create workspace" onClick={() => setNameDialog("workspace")}><Plus /></button><button className={workspaceDeleteArmed ? "icon-button danger text-red-300" : "icon-button danger"} title={workspaceDeleteArmed ? "Confirm delete workspace" : "Delete selected workspace"} onClick={deleteWorkspace}><Trash2 /></button></div>}><WorkspacePreview items={workspaceItems} onLaunch={launch} onAddFolder={() => void addDirectWorkspaceResource("folder")} onAddFile={() => void addDirectWorkspaceResource("file")} onVerify={() => void verifyWorkspace()} onRemove={removeWorkspaceEntry} onRelink={(id) => void relinkWorkspaceEntry(id)} brokenIds={brokenWorkspaceIds} collapsed={state.preferences.panels.workspaces.collapsed} /></Panel>)}
      </section>}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/25 p-3 sm:p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-neutral-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications, files, folders or tags…" className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400" /></div>
          <div className="flex flex-wrap items-center gap-2"><span className="label">Layout</span><Segmented value={state.preferences.layout} onChange={(value) => setPreference("layout", value as LibraryLayout)} options={[["flat", "Flat"], ["purpose", "By purpose"], ["alpha", "A–Z"]]} /><span className="label ml-2">Sort</span><Segmented value={state.preferences.sortMode} onChange={(value) => setPreference("sortMode", value as SortMode)} options={[["manual", "Drag order"], ["alpha", "A–Z"], ["date", "Date"]]} /></div>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5"><button className={`chip ${activeGroupId === "all" ? "active" : ""}`} onClick={() => setActiveGroupId("all")}>All</button>{groups.map((group) => <button key={group.id} className={`chip ${activeGroupId === group.id ? "active" : ""}`} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}<button className="chip add" onClick={() => setNameDialog("group")}>+ Add group</button><button className="chip add" onClick={() => setLabelManagerOpen(true)}>Manage labels</button></div>
        {allTags.length > 0 && <div className="mb-4 border-b border-neutral-800 pb-4"><button className="flex items-center gap-2 text-left" onClick={() => setTagsExpanded((value) => !value)}><span className="label">Tags</span><span className="text-xs text-neutral-500">{allTags.length}</span>{tagsExpanded ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}<span className="text-xs text-neutral-400">{tagsExpanded ? "Hide" : "Show"}</span></button>{tagsExpanded && <div className="mt-3 flex flex-wrap gap-1.5">{allTags.map((tag) => <button key={tag} className="tag-chip" onClick={() => setQuery(tag)}>{tag}</button>)}</div>}</div>}

        {selectedIds.size > 0 && <BulkBar selected={selectedIds.size} selectedItems={state.items.filter((item) => selectedIds.has(item.id))} groups={groups} workspaces={state.workspaces} hasCopiedMetadata={Boolean(copiedMetadata)} onCopyMetadata={copyMetadataFrom} onPasteMetadata={pasteMetadataToSelected} onClear={() => setSelectedIds(new Set())} onAddGroup={(identifier) => assignGroup(selectedIds, identifier)} onPrimary={(identifier) => assignGroup(selectedIds, identifier, true)} onFavourite={() => toggleFavourite(selectedIds, true)} onWorkspace={addSelectedToWorkspace} onDelete={() => deleteItems(selectedIds)} />}
        <div className="mb-3 flex items-center justify-between text-xs text-neutral-500"><span>{displayItems.length} item{displayItems.length === 1 ? "" : "s"}</span><div className="flex gap-3"><button className="hover:text-white" onClick={selectVisible}>Select all</button><button className="hover:text-white" onClick={() => setSelectedIds(new Set())}>Deselect</button>{state.preferences.layout === "purpose" && activeGroupId === "all" && <><button className="hover:text-white" onClick={() => setCollapsedGroupIds(new Set(groups.map((group) => group.id)))}>Collapse all</button><button className="hover:text-white" onClick={() => setCollapsedGroupIds(new Set())}>Expand all</button></>}</div></div>
        {state.preferences.layout === "purpose" && activeGroupId === "all" ? <PurposeLibrary groups={groups} collapsedGroupIds={collapsedGroupIds} onCollapsedChange={setCollapsedGroupIds} items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} /> : <ItemGrid items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} />}
      </section>
    </main>
    {nameDialog && <NameDialog title={nameDialog === "group" ? "Add group" : "Create workspace"} label={nameDialog === "group" ? "Group name" : "Workspace name"} onClose={() => setNameDialog(null)} onSave={(name) => { if (nameDialog === "group") addGroup(name); else addWorkspace(name); setNameDialog(null); }} />}
    {labelManagerOpen && <LabelManager groups={groups} tags={allTags} onClose={() => setLabelManagerOpen(false)} onDeleteGroup={deleteGroup} onMergeGroup={mergeGroup} onDeleteTag={deleteTag} onMergeTag={mergeTag} />}
    {creditsOpen && <CreditsDialog onClose={() => setCreditsOpen(false)} />}
    {editor && <ItemEditor item={editor} groups={groups} copiedMetadata={copiedMetadata} onCopyMetadata={(item) => setCopiedMetadata({ primaryGroupId: item.primaryGroupId, groupIds: item.groupIds, tags: item.tags })} onClose={() => setEditor(null)} onSave={(item) => { const existing = state.items.some((entry) => entry.id === item.id); if (existing) updateItem(item); else if (state.items.some((entry) => entry.kind === item.kind && cleanTarget(entry.target) === cleanTarget(item.target))) flash("A matching item already exists in the library."); else change((current) => ({ ...current, items: [{ ...item, order: 0 }, ...current.items].map((entry, index) => ({ ...entry, order: index })) })); setEditor(null); }} />}
    {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onImport={(resources) => { addResources(resources); setScanOpen(false); }} />}
    {notice && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm shadow-2xl"><CircleAlert className="mr-2 inline h-4 w-4 text-amber-400" />{notice}</div>}
  </div>;
}

function Segmented({ value, onChange, options }: { value: string; onChange(value: string): void; options: Array<[string, string]> }) { return <div className="flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">{options.map(([key, label]) => <button key={key} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${value === key ? "bg-amber-400 text-black" : "text-neutral-400 hover:text-white"}`} onClick={() => onChange(key)}>{label}</button>)}</div>; }
function Panel({ title, panelId, state, onChange, onReorder, actions, children }: { title: string; panelId: PanelId; state: LibraryState; onChange(panel: PanelId, patch: Partial<{ visible: boolean; collapsed: boolean }>): void; onReorder(source: string, target: string): void; actions?: React.ReactNode; children: React.ReactNode }) {
  const preference = state.preferences.panels[panelId];
  return <section draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", panelId)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData("text/plain"), panelId); }} className={`min-h-0 rounded-xl border border-neutral-800 bg-neutral-900/35 p-3 ${panelId === "workspaces" ? "workspace-panel" : ""}`}><div className="flex min-h-7 items-center justify-between gap-2 border-b border-neutral-800 pb-2"><strong className="text-xs uppercase tracking-wide text-neutral-200">{title}</strong><div className="flex items-center gap-1"><span className="icon-button cursor-grab text-neutral-500" title="Drag to reorder"><GripVertical /></span>{actions}<button className="icon-button" title={preference.collapsed ? "Expand" : "Collapse"} onClick={() => onChange(panelId, { collapsed: !preference.collapsed })}>{preference.collapsed ? <ChevronRight /> : <ChevronDown />}</button><button className="icon-button" title="Hide panel" onClick={() => onChange(panelId, { visible: false })}><X /></button></div></div>{children}</section>;
}
function PreviewList({ items, onLaunch, collapsed, empty, showExtensions = false }: { items: Array<LibraryItem | WorkspaceResource>; onLaunch(item: LibraryItem | WorkspaceResource): void; collapsed: boolean; empty: string; showExtensions?: boolean }) {
  if (collapsed) return <p className="pt-3 text-xs text-neutral-500">{items.length} item{items.length === 1 ? "" : "s"}</p>;
  return <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{items.length ? items.map((item) => <button key={item.id} title={item.target} onClick={() => void onLaunch(item)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-neutral-800"><ItemIcon item={item} compact /><span className="truncate text-xs font-medium text-neutral-200">{displayName(item, showExtensions)}</span></button>) : <p className="px-1 py-5 text-xs leading-relaxed text-neutral-500">{empty}</p>}</div>;
}
function WorkspacePreview({ items, onLaunch, onAddFolder, onAddFile, onVerify, onRemove, onRelink, brokenIds, collapsed }: { items: Array<LibraryItem | WorkspaceResource>; onLaunch(item: LibraryItem | WorkspaceResource): void; onAddFolder(): void; onAddFile(): void; onVerify(): void; onRemove(id: string): void; onRelink(id: string): void; brokenIds: Set<string>; collapsed: boolean }) {
  const [sortMode, setSortMode] = useState<WorkspaceSortMode>("alpha");
  const ordered = [...items].sort((a, b) => sortMode === "type" ? (a.kind.localeCompare(b.kind) || collator.compare(displayName(a, true), displayName(b, true))) : collator.compare(displayName(a, true), displayName(b, true)));
  const folders = ordered.filter((item) => item.kind === "folder"); const files = ordered.filter((item) => item.kind !== "folder");
  return <div className="pt-3"><div className="flex flex-wrap items-center gap-2"><button className="control compact" onClick={onAddFolder}><FolderOpen />Add folder</button><button className="control compact" onClick={onAddFile}><FilePlus2 />Add file</button><button className="control compact" onClick={onVerify}>Verify workspace</button><label className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500">Arrange <select value={sortMode} onChange={(event) => setSortMode(event.target.value as WorkspaceSortMode)} className="panel-select"><option value="alpha">A–Z</option><option value="type">By type</option></select></label></div>{collapsed ? <p className="pt-3 text-xs text-neutral-500">{items.length} item{items.length === 1 ? "" : "s"}</p> : <div className="workspace-two-column mt-3"><WorkspaceList title="Folders" items={folders} onLaunch={onLaunch} onRemove={onRemove} onRelink={onRelink} brokenIds={brokenIds} /><WorkspaceList title="Files" items={files} onLaunch={onLaunch} onRemove={onRemove} onRelink={onRelink} brokenIds={brokenIds} /></div>}</div>;
}
type WorkspaceIconSource = string | "txt" | "presentation";
function workspaceIconSource(item: LibraryItem | WorkspaceResource): WorkspaceIconSource { const extension = item.target.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || ""; const descriptor = `${item.name} ${item.target}`.toLowerCase(); const webTarget = item.kind === "url" || item.kind === "protocol" || /^(https?:|www\.)/.test(item.target) || /^(com|net|org|html?|url)$/i.test(extension); if (extension === "gdoc" || /\bgoogle[ _-]?doc/.test(descriptor)) return googleDocIcon; if (/^(doc|docx|odt|rtf)$/i.test(extension) || /\b(word|msword)\b/.test(descriptor)) return wordIcon; if (/^(ppt|pptx|odp)$/i.test(extension) || /\b(powerpoint|presentation|slides)\b/.test(descriptor)) return "presentation"; if (/^(xls|xlsx|csv|ods)$/i.test(extension) || /\b(excel|spreadsheet)\b/.test(descriptor)) return spreadsheetIcon; if (extension === "pdf") return pdfIcon; if (/^(md|mdx|markdown)$/i.test(extension) || /\bmarkdown\b/.test(descriptor)) return markdownIcon; if (extension === "txt") return "txt"; if (/^(json|py)$/i.test(extension)) return jsonPyIcon; if (webTarget) return comIcon; if (/^(js|ts|tsx|css|yml|yaml|xml)$/i.test(extension) || /\b(code|script)\b/.test(descriptor)) return codeIcon; if (/^(png|jpe?g|gif|webp|svg|tiff?)$/i.test(extension) || /\b(image|photo|picture)\b/.test(descriptor)) return imageIcon; if (/^(mp3|wav|m4a|flac|ogg)$/i.test(extension) || /\b(audio|sound|music)\b/.test(descriptor)) return audioIcon; if (/^(mp4|mov|mkv|avi|webm|mpeg|mpg|mpe|movie)$/i.test(extension) || /\b(video|movie)\b/.test(descriptor)) return movieIcon; if (extension === "com") return comIcon; if (/^(exe|bat|cmd)$/i.test(extension)) return utilityIcon; if (extension === "lnk" || /\b(application|shortcut)\b/.test(descriptor)) return applicationIcon; return documentIcon; }
function WorkspaceItemIcon({ item }: { item: LibraryItem | WorkspaceResource }) { if (item.kind === "folder") return <ItemIcon item={item} compact />; const source = workspaceIconSource(item); return <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">{source === "txt" ? <span className="text-[7px] font-bold text-sky-300">TXT</span> : source === "presentation" ? <Presentation className="h-4 w-4 text-orange-300" /> : <img src={source} alt="" className="h-full w-full object-contain" />}</span>; }
function WorkspaceList({ title, items, onLaunch, onRemove, onRelink, brokenIds }: { title: string; items: Array<LibraryItem | WorkspaceResource>; onLaunch(item: LibraryItem | WorkspaceResource): void; onRemove(id: string): void; onRelink(id: string): void; brokenIds: Set<string> }) { return <section className="min-w-0"><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{title} · {items.length}</h3><div className="space-y-1">{items.length ? items.map((item) => <div key={item.id} className={`group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-neutral-800 ${brokenIds.has(item.id) ? "bg-red-950/20" : ""}`}><button title={item.target} onClick={() => void onLaunch(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><WorkspaceItemIcon item={item} /><span className="truncate text-xs font-medium text-neutral-200">{displayName(item, true)}</span></button>{brokenIds.has(item.id) && <span className="text-[10px] text-red-300">Missing</span>}<button className="icon-button opacity-70 group-hover:opacity-100" title="Relink" onClick={() => onRelink(item.id)}><FolderOpen /></button><button className="icon-button danger opacity-70 group-hover:opacity-100" title="Remove from workspace" onClick={() => onRemove(item.id)}><Trash2 /></button></div>) : <p className="px-1 py-2 text-xs text-neutral-600">No {title.toLowerCase()}.</p>}</div></section>; }
function PurposeLibrary(props: ItemGridProps & { groups: Group[]; collapsedGroupIds: Set<string>; onCollapsedChange(next: Set<string>): void }) { return <div className="space-y-5">{props.groups.map((group) => { const groupItems = props.items.filter((item) => item.primaryGroupId === group.id); const isCollapsed = props.collapsedGroupIds.has(group.id); return groupItems.length ? <section key={group.id}><button className="mb-2 flex w-full items-center gap-2 text-left" onClick={() => { const next = new Set(props.collapsedGroupIds); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); props.onCollapsedChange(next); }}><Layers3 className="h-3.5 w-3.5 text-amber-400" /><h2 className="text-xs font-bold uppercase tracking-wide text-neutral-300">{group.name}</h2><span className="text-[10px] text-neutral-500">{groupItems.length}</span>{isCollapsed ? <ChevronRight className="ml-1 h-4 w-4 text-neutral-400" /> : <ChevronDown className="ml-1 h-4 w-4 text-neutral-400" />}</button>{!isCollapsed && <ItemGrid {...props} items={groupItems} />}</section> : null; })}</div>; }
type ItemGridProps = { items: LibraryItem[]; selected: Set<string>; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; manual: boolean; };
function ItemGrid({ items, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, manual }: ItemGridProps) { return <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <ItemCard key={item.id} item={item} selected={selected.has(item.id)} groupName={groupName} onSelect={onSelect} onLaunch={onLaunch} onEdit={onEdit} onToggleFavourite={onToggleFavourite} onDelete={onDelete} onReorder={onReorder} manual={manual} />)}{!items.length && <div className="rounded-lg border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">No items match this view.</div>}</div>; }
function ItemCard({ item, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, manual }: { item: LibraryItem; selected: boolean; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; manual: boolean; }) {
  return <article draggable={manual} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onDragOver={(event) => manual && event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData("text/plain"), item.id); }} className={`group grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 ${selected ? "border-amber-400/70 bg-amber-400/5" : "border-neutral-800 bg-neutral-950/35 hover:border-neutral-700"}`}><input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} className="accent-amber-400" /><button onClick={() => void onLaunch(item)} className="shrink-0"><ItemIcon item={item} /></button><button onClick={() => void onLaunch(item)} className="min-w-0 text-left"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-white">{item.name}</h3><span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">{groupName(item.primaryGroupId)}</span>{item.groupIds.length > 1 && <span className="text-[10px] font-semibold uppercase text-amber-400">{item.groupIds.length} groups</span>}</div><p className="mt-0.5 truncate text-xs text-neutral-500">{item.description || item.target}</p></button><div className="flex shrink-0 gap-1 opacity-70 transition group-hover:opacity-100"><button className="icon-button" title={item.isFavourite ? "Remove favourite" : "Add favourite"} onClick={() => onToggleFavourite(item)}><Star className={item.isFavourite ? "fill-amber-400 text-amber-400" : ""} /></button><button className="icon-button" title="Edit" onClick={() => onEdit(item)}><Settings2 /></button><button className="icon-button danger" title="Remove" onClick={() => onDelete(item)}><Trash2 /></button></div></article>;
}
function FallbackFileIcon({ item }: { item: LibraryItem | WorkspaceResource }) { const extension = item.target.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() || ""; const iconClass = "h-4 w-4"; if (item.kind === "folder") return <Folder className={iconClass} />; if (/^(doc|docx|odt|rtf)$/i.test(extension)) return <FileText className={iconClass} />; if (/^(xls|xlsx|csv|ods)$/i.test(extension)) return <FileSpreadsheet className={iconClass} />; if (/^(ppt|pptx|odp)$/i.test(extension)) return <Presentation className={iconClass} />; if (/^(pdf)$/i.test(extension)) return <FileText className={iconClass} />; if (/^(png|jpe?g|gif|webp|svg|tiff?)$/i.test(extension)) return <FileImage className={iconClass} />; if (/^(mp3|wav|m4a|flac|ogg)$/i.test(extension)) return <FileAudio className={iconClass} />; if (/^(mp4|mov|mkv|avi|webm)$/i.test(extension)) return <FileVideo className={iconClass} />; if (/^(zip|rar|7z|tar|gz)$/i.test(extension)) return <FileArchive className={iconClass} />; if (/^(js|ts|tsx|py|json|md|html|css|yml|yaml)$/i.test(extension)) return <FileCode2 className={iconClass} />; return item.kind === "file" ? <File className={iconClass} /> : <Zap className={iconClass} />; }
function ItemIcon({ item, compact = false }: { item: LibraryItem | WorkspaceResource; compact?: boolean }) { const [nativeSrc, setNativeSrc] = useState<string | null>(null); useEffect(() => { let live = true; const api = window.launcher; if (api) void api.getIcon(item.target).then((icon) => { if (live && icon?.dataUrl) setNativeSrc(icon.dataUrl); }); return () => { live = false; }; }, [item.target]); const src = nativeSrc || ("iconDataUrl" in item ? item.iconDataUrl : null) || null; const size = compact ? "h-6 w-6" : "h-10 w-10"; return <span className={`grid ${size} place-items-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-amber-400`}>{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <FallbackFileIcon item={item} />}</span>; }
function BulkBar({ selected, selectedItems, groups, workspaces, hasCopiedMetadata, onCopyMetadata, onPasteMetadata, onClear, onAddGroup, onPrimary, onFavourite, onWorkspace, onDelete }: { selected: number; selectedItems: LibraryItem[]; groups: Group[]; workspaces: Workspace[]; hasCopiedMetadata: boolean; onCopyMetadata(id: string): void; onPasteMetadata(): void; onClear(): void; onAddGroup(id: string): void; onPrimary(id: string): void; onFavourite(): void; onWorkspace(id: string): void; onDelete(): void; }) { return <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs"><strong className="text-amber-300">{selected} selected</strong><select defaultValue="" onChange={(event) => { if (event.target.value) { onCopyMetadata(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Copy labels/tags from…</option>{selectedItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="control compact" disabled={!hasCopiedMetadata} onClick={onPasteMetadata}>Paste labels & tags</button><select defaultValue="" onChange={(event) => { if (event.target.value) { onAddGroup(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onPrimary(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Set primary purpose…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onWorkspace(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to workspace…</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="control compact" onClick={onFavourite}><Star />Favourite</button><button className="control compact danger" onClick={onDelete}><Trash2 />Remove</button><button className="ml-auto text-neutral-400 hover:text-white" onClick={onClear}>Clear</button></div>; }
function ItemEditor({ item, groups, copiedMetadata, onCopyMetadata, onClose, onSave }: { item: LibraryItem; groups: Group[]; copiedMetadata: Pick<LibraryItem, "primaryGroupId" | "groupIds" | "tags"> | null; onCopyMetadata(item: LibraryItem): void; onClose(): void; onSave(item: LibraryItem): void }) {
  const [draft, setDraft] = useState(item); const isNew = !item.name && !item.target;
  const toggleGroup = (identifier: string) => setDraft((current) => ({ ...current, groupIds: current.groupIds.includes(identifier) ? current.groupIds.filter((entry) => entry !== identifier) : [...current.groupIds, identifier] }));
  const pasteMetadata = () => { if (copiedMetadata) setDraft((current) => ({ ...current, ...copiedMetadata, groupIds: copiedMetadata.groupIds.filter((id) => groups.some((group) => group.id === id)), primaryGroupId: groups.some((group) => group.id === copiedMetadata.primaryGroupId) ? copiedMetadata.primaryGroupId : current.primaryGroupId })); };
  return <Modal title={isNew ? "Add item" : "Edit item"} onClose={onClose}><form className="space-y-3" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!draft.name.trim() || !draft.target.trim()) return; const primary = draft.groupIds.includes(draft.primaryGroupId) ? draft.primaryGroupId : draft.groupIds[0] || groups[0]?.id; onSave({ ...draft, name: draft.name.trim(), target: draft.target.trim(), primaryGroupId: primary, tags: draft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).sort(collator.compare) }); }}>
    {!isNew && <div className="flex gap-2"><button type="button" className="control compact" onClick={() => onCopyMetadata(draft)}>Copy labels & tags</button><button type="button" className="control compact" disabled={!copiedMetadata} onClick={pasteMetadata}>Paste labels & tags</button></div>}
    <Field label="Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field><Field label="Target path or URL"><input value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ItemKind })}>{(["app", "folder", "file", "url", "protocol"] as ItemKind[]).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field><Field label="Primary purpose"><select value={draft.primaryGroupId} onChange={(event) => setDraft({ ...draft, primaryGroupId: event.target.value, groupIds: [...new Set([...draft.groupIds, event.target.value])] })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field></div><Field label="Tags (comma separated)"><input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",") })} /></Field><Field label="Description"><textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></Field><div><p className="mb-1 text-xs font-semibold text-neutral-300">Also in groups</p><div className="flex flex-wrap gap-2">{groups.map((group) => <label key={group.id} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs"><input type="checkbox" checked={draft.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.name}</label>)}</div></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button className="control primary" type="submit">Save</button></div></form></Modal>;
}
function LabelManager({ groups, tags, onClose, onDeleteGroup, onMergeGroup, onDeleteTag, onMergeTag }: { groups: Group[]; tags: string[]; onClose(): void; onDeleteGroup(id: string): void; onMergeGroup(source: string, target: string): void; onDeleteTag(tag: string): void; onMergeTag(source: string, target: string): void }) {
  const [groupSource, setGroupSource] = useState(""); const [groupTarget, setGroupTarget] = useState(""); const [tagSource, setTagSource] = useState(""); const [tagTarget, setTagTarget] = useState("");
  return <Modal title="Organise labels" onClose={onClose}><div className="space-y-6"><p className="text-xs leading-relaxed text-neutral-400">Delete removes a label from all shortcuts. Merge moves every shortcut using the source label to the destination label.</p><section><h3 className="mb-2 text-sm font-semibold">Groups</h3><div className="max-h-32 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{groups.map((group) => <div key={group.id} className="flex items-center justify-between gap-2 text-xs"><span>{group.name}</span><button className="text-red-300 hover:text-red-200" onClick={() => onDeleteGroup(group.id)}>Delete</button></div>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><select value={groupSource} onChange={(event) => setGroupSource(event.target.value)}><option value="">Merge this group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select value={groupTarget} onChange={(event) => setGroupTarget(event.target.value)}><option value="">Into this group…</option>{groups.filter((group) => group.id !== groupSource).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div><button className="control compact mt-2" disabled={!groupSource || !groupTarget} onClick={() => { onMergeGroup(groupSource, groupTarget); setGroupSource(""); setGroupTarget(""); }}>Merge groups</button></section><section><h3 className="mb-2 text-sm font-semibold">Tags</h3><div className="max-h-32 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{tags.map((tag) => <div key={tag} className="flex items-center justify-between gap-2 text-xs"><span>{tag}</span><button className="text-red-300 hover:text-red-200" onClick={() => onDeleteTag(tag)}>Delete</button></div>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><select value={tagSource} onChange={(event) => setTagSource(event.target.value)}><option value="">Merge this tag…</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select><input value={tagTarget} onChange={(event) => setTagTarget(event.target.value)} placeholder="Destination tag" /></div><button className="control compact mt-2" disabled={!tagSource || !tagTarget.trim()} onClick={() => { onMergeTag(tagSource, tagTarget); setTagSource(""); setTagTarget(""); }}>Merge tags</button></section><div className="flex justify-end"><button className="control" onClick={onClose}>Done</button></div></div></Modal>;
}
function CreditsDialog({ onClose }: { onClose(): void }) { return <Modal title="Credits" onClose={onClose}><div className="space-y-3 text-sm leading-relaxed text-neutral-300"><p>Workspace file-type icons use selected open-licensed SVG vectors from SVG Repo. Folders and application shortcuts retain their existing icon behaviour.</p><p className="text-xs text-neutral-400">Source: SVG Repo — Search, explore, edit and share open-licensed SVG vectors. Individual assets may carry their own licence terms.</p><a className="text-sm text-amber-300 underline" href="https://www.svgrepo.com/" target="_blank" rel="noreferrer">svgrepo.com</a><div className="flex justify-end"><button className="control" onClick={onClose}>Done</button></div></div></Modal>; }
function NameDialog({ title, label, onClose, onSave }: { title: string; label: string; onClose(): void; onSave(name: string): void }) { const [name, setName] = useState(""); return <Modal title={title} onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }}><Field label={label}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={title === "Create workspace" ? "For example, Thesis project" : "For example, Writing"} /></Field><div className="flex justify-end gap-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button className="control primary" type="submit">Save</button></div></form></Modal>; }
function ScanDialog({ onClose, onImport }: { onClose(): void; onImport(resources: ImportedResource[]): void }) { const [path, setPath] = useState("%USERPROFILE%\\Desktop"); const [items, setItems] = useState<ImportedResource[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); async function scan(event: FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { const resources = await window.launcher?.scanFolder(path); setItems(resources || []); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not scan this folder."); } finally { setLoading(false); } } return <Modal title="Scan folder" onClose={onClose}><form className="flex gap-2" onSubmit={scan}><input value={path} onChange={(event) => setPath(event.target.value)} className="min-w-0 flex-1" /><button className="control primary" disabled={loading}>{loading ? "Scanning…" : "Scan"}</button></form>{error && <p className="mt-3 text-xs text-red-300">{error}</p>}{items.length > 0 && <div className="mt-4"><p className="mb-2 text-xs text-neutral-400">{items.length} eligible resources found. Existing matching targets will be skipped.</p><div className="max-h-64 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{items.map((item) => <div key={`${item.target}:${item.name}`} className="flex gap-2 text-xs"><span className="text-amber-400">{item.kind}</span><span className="truncate">{item.name}</span></div>)}</div><div className="mt-3 flex justify-end gap-2"><button className="control" onClick={onClose}>Cancel</button><button className="control primary" onClick={() => onImport(items)}>Import {items.length}</button></div></div>}</Modal>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"><section className="w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white">{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div>{children}</section></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-neutral-300"><span className="mb-1 block">{label}</span>{children}</label>; }
