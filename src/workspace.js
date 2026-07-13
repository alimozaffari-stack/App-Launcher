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

export function suggestShortcutTags(shortcut, limit = 3) {
  const maximum = Math.max(0, Math.min(Number.isFinite(limit) ? limit : 3, 3));
  if (maximum === 0) return [];

  const name = String(shortcut?.name || "").trim().toLowerCase();
  const target = String(shortcut?.execPath || "").trim().toLowerCase();
  const category = String(shortcut?.category || "").trim().toLowerCase();
  const searchable = `${name} ${target} ${category}`;
  const suggestions = [];
  const add = (tag) => {
    const normalized = String(tag || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9+#.-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (normalized && !suggestions.includes(normalized) && suggestions.length < maximum) {
      suggestions.push(normalized);
    }
  };

  if (/^https?:\/\//.test(target)) add("website");
  else if (/^steam:/.test(target)) add("gaming");
  else {
    const leaf = target.split(/[\\/]/).pop() || "";
    if (target && !/\.[a-z0-9-]{2,8}$/.test(leaf)) add("folder");
  }

  if (category && category !== "others") add(category);

  const keywordRules = [
    ["development", /\b(code|coding|dev|developer|github|git|visual studio|vscode|terminal)\b/],
    ["ai", /\b(ai|artificial intelligence|chatgpt|gemini|claude|copilot)\b/],
    ["productivity", /\b(office|word|excel|powerpoint|notion|productivity)\b/],
    ["design", /\b(adobe|blender|design|figma|illustrator|photoshop)\b/],
    ["photography", /\b(camera|lightroom|photo|photography)\b/],
    ["research", /\b(research|reference|scholar|zotero)\b/],
    ["communication", /\b(discord|slack|teams|telegram|whatsapp|zoom)\b/],
    ["browser", /\b(browser|chrome|edge|firefox|opera)\b/],
    ["media", /\b(audio|media|music|spotify|video|vlc)\b/],
  ];
  for (const [tag, pattern] of keywordRules) {
    if (pattern.test(searchable)) add(tag);
  }

  const extension = target.match(/\.([a-z0-9-]{2,8})(?:[?#].*)?$/)?.[1];
  if (extension && !["exe", "lnk", "url"].includes(extension)) add(extension);

  for (const token of name.split(/[^a-z0-9+#.-]+/)) {
    if (token.length >= 3 && !["app", "the", "for", "and"].includes(token)) add(token);
  }

  return suggestions;
}

function normalizeTags(tags) {
  return Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function updateShortcutsInBulk(shortcuts, shortcutIds, action) {
  const selectedIds = shortcutIds instanceof Set ? shortcutIds : new Set(shortcutIds || []);
  if (selectedIds.size === 0 || !action?.type) return shortcuts;

  let changed = false;
  const updated = shortcuts.map((shortcut) => {
    if (!selectedIds.has(shortcut.id)) return shortcut;

    const currentTags = normalizeTags(shortcut.tags);
    const currentGroups = Array.from(new Set(shortcut.workspaceTags || []));
    let nextTags = currentTags;
    let nextGroups = currentGroups;
    let nextCategory = shortcut.category;

    if (["add-tags", "remove-tags", "replace-tags"].includes(action.type)) {
      const requestedTags = normalizeTags(action.tags);
      if (action.type === "add-tags") {
        nextTags = Array.from(new Set([...currentTags, ...requestedTags]));
      } else if (action.type === "remove-tags") {
        const removed = new Set(requestedTags);
        nextTags = currentTags.filter((tag) => !removed.has(tag));
      } else {
        nextTags = requestedTags;
      }
    } else if (action.type === "add-group" && action.group) {
      if (shortcut.category !== action.group && !currentGroups.includes(action.group)) {
        nextGroups = [...currentGroups, action.group];
      }
    } else if (action.type === "remove-group" && action.group) {
      nextGroups = currentGroups.filter((group) => group !== action.group);
    } else if (action.type === "set-primary-group" && action.group) {
      nextCategory = action.group;
      nextGroups = Array.from(
        new Set([
          ...currentGroups.filter((group) => group !== action.group),
          ...(shortcut.category !== action.group ? [shortcut.category] : []),
        ]),
      );
    }

    const tagsChanged =
      nextTags.length !== currentTags.length ||
      nextTags.some((tag, index) => tag !== currentTags[index]);
    const groupsChanged =
      nextGroups.length !== currentGroups.length ||
      nextGroups.some((group, index) => group !== currentGroups[index]);
    const categoryChanged = nextCategory !== shortcut.category;
    if (!tagsChanged && !groupsChanged && !categoryChanged) return shortcut;

    changed = true;
    return {
      ...shortcut,
      category: nextCategory,
      tags: nextTags,
      workspaceTags: nextGroups.length > 0 ? nextGroups : undefined,
    };
  });

  return changed ? updated : shortcuts;
}
