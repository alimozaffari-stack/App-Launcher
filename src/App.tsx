import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AppWindow, ArchiveRestore, Check, ChevronDown, ChevronRight, CircleAlert, File, FilePlus2,
  Folder, FolderOpen, LayoutList, Layers3, ListFilter, Plus, Search, Settings2,
  Star, Tag, Trash2, X, Zap
} from "lucide-react";
import type { Group, ImportedResource, ItemKind, LibraryItem, LibraryLayout, LibraryState, PanelId, SortMode, Workspace } from "./types";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const panelTitles: Record<PanelId, string> = { focus: "Focus group", favourites: "Favourites", recent: "Recent", workspaces: "Workspaces" };
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

function makeGroup(name: string): Group { return { id: groupId(name), name: name.trim() }; }
function blankState(): LibraryState {
  const groups = ["Applications", "Current Work", "Knowledge Management", "Office", "Others", "Research", "Utility"].map(makeGroup);
  return { version: 2, groups, items: [], workspaces: [], preferences: { focusGroupId: "none", panels: defaultPanelPreferences, sortMode: "manual", layout: "flat" } };
}
function normaliseState(value: LibraryState): LibraryState {
  return {
    ...value,
    version: 2,
    groups: [...(value.groups || [])].sort((a, b) => collator.compare(a.name, b.name)),
    items: value.items || [], workspaces: value.workspaces || [],
    preferences: {
      focusGroupId: value.preferences?.focusGroupId || "none",
      workspaceId: value.preferences?.workspaceId,
      sortMode: value.preferences?.sortMode || "manual",
      layout: value.preferences?.layout || "flat",
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

  useEffect(() => {
    void (async () => {
      const stored = await window.launcher?.loadState();
      const next = stored ? normaliseState(stored) : (loadBrowserState() || migrateLegacy());
      setState(next);
      if (!stored) await persist(next);
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
  function addWorkspace() {
    if (!state) return;
    const name = window.prompt("Workspace name (for example, Current Work):");
    if (!name?.trim()) return;
    const workspace: Workspace = { id: id("workspace"), name: name.trim(), itemIds: [] };
    change((current) => ({ ...current, workspaces: [...current.workspaces, workspace], preferences: { ...current.preferences, workspaceId: workspace.id } }));
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
  async function launch(item: LibraryItem) {
    const result = await window.launcher?.openItem(item);
    if (result && !result.ok) { flash(result.error || "Could not open this item."); return; }
    change((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, lastLaunchedAt: Date.now() } : entry) }));
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
  const visiblePanels = (Object.keys(panelTitles) as PanelId[]).filter((panelId) => state.preferences.panels[panelId].visible);
  const favourites = state.items.filter((item) => item.isFavourite);
  const recent = [...state.items].filter((item) => item.lastLaunchedAt).sort((a, b) => (b.lastLaunchedAt || 0) - (a.lastLaunchedAt || 0)).slice(0, 8);
  const focusItems = state.preferences.focusGroupId === "all" ? state.items : state.preferences.focusGroupId === "none" ? [] : state.items.filter((item) => item.groupIds.includes(state.preferences.focusGroupId));
  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.preferences.workspaceId) || state.workspaces[0];
  const workspaceItems = activeWorkspace ? activeWorkspace.itemIds.map((itemId) => state.items.find((item) => item.id === itemId)).filter(Boolean) as LibraryItem[] : [];

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
        </div>
      </header>

      {managePanels && <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">Dashboard panels</strong><button className="text-xs text-neutral-400 hover:text-white" onClick={() => setManagePanels(false)}>Done</button></div><div className="flex flex-wrap gap-3">{(Object.keys(panelTitles) as PanelId[]).map((panelId) => <label key={panelId} className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-xs"><input type="checkbox" checked={state.preferences.panels[panelId].visible} onChange={(event) => changePanel(panelId, { visible: event.target.checked })} />{panelTitles[panelId]}</label>)}</div></section>}

      {visiblePanels.length > 0 && <section className="mb-7 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {state.preferences.panels.focus.visible && <Panel title="Focus group" panelId="focus" state={state} onChange={changePanel} actions={<select value={state.preferences.focusGroupId} onChange={(event) => setPreference("focusGroupId", event.target.value)} className="panel-select"><option value="none">None (hide)</option><option value="all">All items</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}><PreviewList items={focusItems} onLaunch={launch} collapsed={state.preferences.panels.focus.collapsed} empty="Choose a group or show all items." /></Panel>}
        {state.preferences.panels.favourites.visible && <Panel title="Favourites" panelId="favourites" state={state} onChange={changePanel}><PreviewList items={favourites} onLaunch={launch} collapsed={state.preferences.panels.favourites.collapsed} empty="Star items in the library to place them here." /></Panel>}
        {state.preferences.panels.recent.visible && <Panel title="Recent" panelId="recent" state={state} onChange={changePanel}><PreviewList items={recent} onLaunch={launch} collapsed={state.preferences.panels.recent.collapsed} empty="Items you open will appear here." /></Panel>}
        {state.preferences.panels.workspaces.visible && <Panel title="Workspaces" panelId="workspaces" state={state} onChange={changePanel} actions={<div className="flex items-center gap-1"><select value={activeWorkspace?.id || ""} onChange={(event) => setPreference("workspaceId", event.target.value)} className="panel-select"><option value="">No workspace</option>{state.workspaces.slice().sort((a,b) => collator.compare(a.name,b.name)).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="icon-button" title="Create workspace" onClick={addWorkspace}><Plus /></button></div>}><PreviewList items={workspaceItems} onLaunch={launch} collapsed={state.preferences.panels.workspaces.collapsed} empty="Create a workspace and add selected resources below." /></Panel>}
      </section>}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/25 p-3 sm:p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-neutral-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications, files, folders or tags…" className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400" /></div>
          <div className="flex flex-wrap items-center gap-2"><span className="label">Layout</span><Segmented value={state.preferences.layout} onChange={(value) => setPreference("layout", value as LibraryLayout)} options={[["flat", "Flat"], ["purpose", "By purpose"], ["alpha", "A–Z"]]} /><span className="label ml-2">Sort</span><Segmented value={state.preferences.sortMode} onChange={(value) => setPreference("sortMode", value as SortMode)} options={[["manual", "Drag order"], ["alpha", "A–Z"], ["date", "Date"]]} /></div>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5"><button className={`chip ${activeGroupId === "all" ? "active" : ""}`} onClick={() => setActiveGroupId("all")}>All</button>{groups.map((group) => <button key={group.id} className={`chip ${activeGroupId === group.id ? "active" : ""}`} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}<button className="chip add" onClick={() => { const name = window.prompt("New group name:"); if (name) addGroup(name); }}>+ Add group</button></div>
        {allTags.length > 0 && <div className="mb-4 flex flex-wrap gap-1.5 border-b border-neutral-800 pb-4"><span className="label mr-1">Tags</span>{allTags.map((tag) => <button key={tag} className="tag-chip" onClick={() => setQuery(tag)}>{tag}</button>)}</div>}

        {selectedIds.size > 0 && <BulkBar selected={selectedIds.size} groups={groups} workspaces={state.workspaces} onClear={() => setSelectedIds(new Set())} onAddGroup={(identifier) => assignGroup(selectedIds, identifier)} onPrimary={(identifier) => assignGroup(selectedIds, identifier, true)} onFavourite={() => toggleFavourite(selectedIds, true)} onWorkspace={addSelectedToWorkspace} onDelete={() => deleteItems(selectedIds)} />}
        <div className="mb-3 flex items-center justify-between text-xs text-neutral-500"><span>{displayItems.length} item{displayItems.length === 1 ? "" : "s"}</span><div className="flex gap-3"><button className="hover:text-white" onClick={selectVisible}>Select all</button><button className="hover:text-white" onClick={() => setSelectedIds(new Set())}>Deselect</button></div></div>
        {state.preferences.layout === "purpose" && activeGroupId === "all" ? <PurposeLibrary groups={groups} items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} /> : <ItemGrid items={displayItems} selected={selectedSet} groupName={groupName} onSelect={toggleSelection} onLaunch={launch} onEdit={setEditor} onToggleFavourite={(item) => toggleFavourite(new Set([item.id]))} onDelete={(item) => deleteItems(new Set([item.id]))} onReorder={reorder} manual={state.preferences.sortMode === "manual"} />}
      </section>
    </main>
    {editor && <ItemEditor item={editor} groups={groups} onClose={() => setEditor(null)} onSave={(item) => { const existing = state.items.some((entry) => entry.id === item.id); if (existing) updateItem(item); else if (state.items.some((entry) => entry.kind === item.kind && cleanTarget(entry.target) === cleanTarget(item.target))) flash("A matching item already exists in the library."); else change((current) => ({ ...current, items: [{ ...item, order: 0 }, ...current.items].map((entry, index) => ({ ...entry, order: index })) })); setEditor(null); }} />}
    {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onImport={(resources) => { addResources(resources); setScanOpen(false); }} />}
    {notice && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm shadow-2xl"><CircleAlert className="mr-2 inline h-4 w-4 text-amber-400" />{notice}</div>}
  </div>;
}

function Segmented({ value, onChange, options }: { value: string; onChange(value: string): void; options: Array<[string, string]> }) { return <div className="flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">{options.map(([key, label]) => <button key={key} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${value === key ? "bg-amber-400 text-black" : "text-neutral-400 hover:text-white"}`} onClick={() => onChange(key)}>{label}</button>)}</div>; }
function Panel({ title, panelId, state, onChange, actions, children }: { title: string; panelId: PanelId; state: LibraryState; onChange(panel: PanelId, patch: Partial<{ visible: boolean; collapsed: boolean }>): void; actions?: React.ReactNode; children: React.ReactNode }) {
  const preference = state.preferences.panels[panelId];
  return <section className="min-h-0 rounded-xl border border-neutral-800 bg-neutral-900/35 p-3"><div className="flex min-h-7 items-center justify-between gap-2 border-b border-neutral-800 pb-2"><strong className="text-xs uppercase tracking-wide text-neutral-200">{title}</strong><div className="flex items-center gap-1">{actions}<button className="icon-button" title={preference.collapsed ? "Expand" : "Collapse"} onClick={() => onChange(panelId, { collapsed: !preference.collapsed })}>{preference.collapsed ? <ChevronRight /> : <ChevronDown />}</button><button className="icon-button" title="Hide panel" onClick={() => onChange(panelId, { visible: false })}><X /></button></div></div>{children}</section>;
}
function PreviewList({ items, onLaunch, collapsed, empty }: { items: LibraryItem[]; onLaunch(item: LibraryItem): void; collapsed: boolean; empty: string }) {
  if (collapsed) return <p className="pt-3 text-xs text-neutral-500">{items.length} item{items.length === 1 ? "" : "s"}</p>;
  return <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{items.length ? items.map((item) => <button key={item.id} onClick={() => void onLaunch(item)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-neutral-800"><ItemIcon item={item} compact /><span className="truncate text-xs font-medium text-neutral-200">{item.name}</span></button>) : <p className="px-1 py-5 text-xs leading-relaxed text-neutral-500">{empty}</p>}</div>;
}
function PurposeLibrary(props: ItemGridProps & { groups: Group[] }) { return <div className="space-y-5">{props.groups.map((group) => { const groupItems = props.items.filter((item) => item.primaryGroupId === group.id); return groupItems.length ? <section key={group.id}><div className="mb-2 flex items-center gap-2"><Layers3 className="h-3.5 w-3.5 text-amber-400" /><h2 className="text-xs font-bold uppercase tracking-wide text-neutral-300">{group.name}</h2><span className="text-[10px] text-neutral-500">{groupItems.length}</span></div><ItemGrid {...props} items={groupItems} /></section> : null; })}</div>; }
type ItemGridProps = { items: LibraryItem[]; selected: Set<string>; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; manual: boolean; };
function ItemGrid({ items, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, manual }: ItemGridProps) { return <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">{items.map((item) => <ItemCard key={item.id} item={item} selected={selected.has(item.id)} groupName={groupName} onSelect={onSelect} onLaunch={onLaunch} onEdit={onEdit} onToggleFavourite={onToggleFavourite} onDelete={onDelete} onReorder={onReorder} manual={manual} />)}{!items.length && <div className="rounded-lg border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">No items match this view.</div>}</div>; }
function ItemCard({ item, selected, groupName, onSelect, onLaunch, onEdit, onToggleFavourite, onDelete, onReorder, manual }: { item: LibraryItem; selected: boolean; groupName(id: string): string; onSelect(id: string): void; onLaunch(item: LibraryItem): void; onEdit(item: LibraryItem): void; onToggleFavourite(item: LibraryItem): void; onDelete(item: LibraryItem): void; onReorder(source: string, target: string): void; manual: boolean; }) {
  return <article draggable={manual} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onDragOver={(event) => manual && event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReorder(event.dataTransfer.getData("text/plain"), item.id); }} className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3 ${selected ? "border-amber-400/70 bg-amber-400/5" : "border-neutral-800 bg-neutral-950/35 hover:border-neutral-700"}`}><input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} className="accent-amber-400" /><button onClick={() => void onLaunch(item)} className="shrink-0"><ItemIcon item={item} /></button><button onClick={() => void onLaunch(item)} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-white">{item.name}</h3><span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">{groupName(item.primaryGroupId)}</span>{item.groupIds.length > 1 && <span className="text-[10px] font-semibold uppercase text-amber-400">{item.groupIds.length} groups</span>}</div><p className="mt-0.5 truncate text-xs text-neutral-500">{item.description || item.target}</p></button><div className="flex shrink-0 gap-1 opacity-70 transition group-hover:opacity-100"><button className="icon-button" title={item.isFavourite ? "Remove favourite" : "Add favourite"} onClick={() => onToggleFavourite(item)}><Star className={item.isFavourite ? "fill-amber-400 text-amber-400" : ""} /></button><button className="icon-button" title="Edit" onClick={() => onEdit(item)}><Settings2 /></button><button className="icon-button danger" title="Remove" onClick={() => onDelete(item)}><Trash2 /></button></div></article>;
}
function ItemIcon({ item, compact = false }: { item: LibraryItem; compact?: boolean }) { const [src, setSrc] = useState<string | null>(null); useEffect(() => { let live = true; const api = window.launcher; if (api) void api.getIcon(item.target).then((icon) => { if (live) setSrc(icon?.dataUrl || null); }); return () => { live = false; }; }, [item.target]); const size = compact ? "h-6 w-6" : "h-10 w-10"; return <span className={`grid ${size} place-items-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-amber-400`}>{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : item.kind === "folder" ? <Folder className="h-4 w-4" /> : item.kind === "file" ? <File className="h-4 w-4" /> : <Zap className="h-4 w-4" />}</span>; }
function BulkBar({ selected, groups, workspaces, onClear, onAddGroup, onPrimary, onFavourite, onWorkspace, onDelete }: { selected: number; groups: Group[]; workspaces: Workspace[]; onClear(): void; onAddGroup(id: string): void; onPrimary(id: string): void; onFavourite(): void; onWorkspace(id: string): void; onDelete(): void; }) { return <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs"><strong className="text-amber-300">{selected} selected</strong><select defaultValue="" onChange={(event) => { if (event.target.value) { onAddGroup(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to group…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onPrimary(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Set primary purpose…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) { onWorkspace(event.target.value); event.currentTarget.value = ""; } }} className="bulk-select"><option value="">Add to workspace…</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="control compact" onClick={onFavourite}><Star />Favourite</button><button className="control compact danger" onClick={onDelete}><Trash2 />Remove</button><button className="ml-auto text-neutral-400 hover:text-white" onClick={onClear}>Clear</button></div>; }
function ItemEditor({ item, groups, onClose, onSave }: { item: LibraryItem; groups: Group[]; onClose(): void; onSave(item: LibraryItem): void }) { const [draft, setDraft] = useState(item); const isNew = !item.name && !item.target; const toggleGroup = (identifier: string) => setDraft((current) => ({ ...current, groupIds: current.groupIds.includes(identifier) ? current.groupIds.filter((entry) => entry !== identifier) : [...current.groupIds, identifier] })); return <Modal title={isNew ? "Add item" : "Edit item"} onClose={onClose}><form className="space-y-3" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!draft.name.trim() || !draft.target.trim()) return; const primary = draft.groupIds.includes(draft.primaryGroupId) ? draft.primaryGroupId : draft.groupIds[0] || groups[0]?.id; onSave({ ...draft, name: draft.name.trim(), target: draft.target.trim(), primaryGroupId: primary, tags: draft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).sort(collator.compare) }); }}><Field label="Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field><Field label="Target path or URL"><input value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ItemKind })}>{(["app", "folder", "file", "url", "protocol"] as ItemKind[]).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field><Field label="Primary purpose"><select value={draft.primaryGroupId} onChange={(event) => setDraft({ ...draft, primaryGroupId: event.target.value, groupIds: [...new Set([...draft.groupIds, event.target.value])] })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field></div><Field label="Tags (comma separated)"><input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",") })} /></Field><Field label="Description"><textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></Field><div><p className="mb-1 text-xs font-semibold text-neutral-300">Also in groups</p><div className="flex flex-wrap gap-2">{groups.map((group) => <label key={group.id} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs"><input type="checkbox" checked={draft.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.name}</label>)}</div></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="control" onClick={onClose}>Cancel</button><button className="control primary" type="submit">Save</button></div></form></Modal>; }
function ScanDialog({ onClose, onImport }: { onClose(): void; onImport(resources: ImportedResource[]): void }) { const [path, setPath] = useState("%USERPROFILE%\\Desktop"); const [items, setItems] = useState<ImportedResource[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); async function scan(event: FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { const resources = await window.launcher?.scanFolder(path); setItems(resources || []); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not scan this folder."); } finally { setLoading(false); } } return <Modal title="Scan folder" onClose={onClose}><form className="flex gap-2" onSubmit={scan}><input value={path} onChange={(event) => setPath(event.target.value)} className="min-w-0 flex-1" /><button className="control primary" disabled={loading}>{loading ? "Scanning…" : "Scan"}</button></form>{error && <p className="mt-3 text-xs text-red-300">{error}</p>}{items.length > 0 && <div className="mt-4"><p className="mb-2 text-xs text-neutral-400">{items.length} eligible resources found. Existing matching targets will be skipped.</p><div className="max-h-64 space-y-1 overflow-auto rounded border border-neutral-800 p-2">{items.map((item) => <div key={`${item.target}:${item.name}`} className="flex gap-2 text-xs"><span className="text-amber-400">{item.kind}</span><span className="truncate">{item.name}</span></div>)}</div><div className="mt-3 flex justify-end gap-2"><button className="control" onClick={onClose}>Cancel</button><button className="control primary" onClick={() => onImport(items)}>Import {items.length}</button></div></div>}</Modal>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"><section className="w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white">{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div>{children}</section></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-neutral-300"><span className="mb-1 block">{label}</span>{children}</label>; }
