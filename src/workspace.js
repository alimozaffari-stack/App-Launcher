export const NOMINATED_WORKSPACE_DROP_ID = "nominated-workspace-drop";
export const NOMINATED_CARD_PREFIX = "nominated-card:";

export function isNominatedDropTarget(id) {
  const value = String(id || "");
  return value === NOMINATED_WORKSPACE_DROP_ID || value.startsWith(NOMINATED_CARD_PREFIX);
}

export function isShortcutInWorkspace(shortcut, workspaceName) {
  return (
    shortcut.category === workspaceName ||
    (shortcut.workspaceTags || []).includes(workspaceName)
  );
}

export function addShortcutToWorkspace(shortcuts, shortcutId, workspaceName) {
  let changed = false;
  const updated = shortcuts.map((shortcut) => {
    if (shortcut.id !== shortcutId) return shortcut;
    if (shortcut.category === workspaceName) return shortcut;
    const currentTags = shortcut.workspaceTags || [];
    if (currentTags.includes(workspaceName)) return shortcut;
    changed = true;
    return { ...shortcut, workspaceTags: [...currentTags, workspaceName] };
  });
  return changed ? updated : shortcuts;
}

export function removeShortcutFromWorkspace(shortcuts, shortcutId, workspaceName) {
  let changed = false;
  const updated = shortcuts.map((shortcut) => {
    if (shortcut.id !== shortcutId || !(shortcut.workspaceTags || []).includes(workspaceName)) {
      return shortcut;
    }
    changed = true;
    const workspaceTags = shortcut.workspaceTags.filter((name) => name !== workspaceName);
    if (workspaceTags.length === 0) {
      const { workspaceTags: _removed, ...withoutWorkspaceTags } = shortcut;
      return withoutWorkspaceTags;
    }
    return { ...shortcut, workspaceTags };
  });
  return changed ? updated : shortcuts;
}

export function readTemporaryFolders(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.path === "string" &&
        typeof item.workspace === "string" &&
        typeof item.createdAt === "number",
    );
  } catch {
    return [];
  }
}
