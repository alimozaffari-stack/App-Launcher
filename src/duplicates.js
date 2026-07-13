function uniqueStrings(values) {
  return Array.from(
    new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

export function normalizeDuplicateName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.(lnk|url|exe|appref-ms)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(rawTarget) {
  try {
    const url = new URL(rawTarget);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function rawDuplicateKey(shortcut) {
  const target = String(shortcut?.execPath || "").trim();
  if (!target) return null;
  const url = normalizeUrl(target);
  if (url) return `url:${url}`;

  const protocol = target.match(/^([a-z][a-z\d+.-]*:)/i)?.[1];
  if (protocol && !/^[a-z]:$/i.test(protocol)) {
    return `protocol:${protocol.toLowerCase()}${target.slice(protocol.length)}`;
  }

  return `path:${target.replace(/\//g, "\\").replace(/[\\]+$/, "").toLowerCase()}`;
}

function groupBy(items, keyForItem) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key) continue;
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }
  return Array.from(grouped.entries())
    .filter(([, shortcuts]) => shortcuts.length > 1)
    .map(([key, shortcuts]) => ({ key, shortcutIds: shortcuts.map((item) => item.id) }));
}

export function findDuplicateGroups(shortcuts, resolvedKeys = {}) {
  const exact = groupBy(
    shortcuts,
    (shortcut) => resolvedKeys[shortcut.id] || rawDuplicateKey(shortcut),
  );
  const exactPairs = new Set();
  for (const group of exact) {
    for (const firstId of group.shortcutIds) {
      for (const secondId of group.shortcutIds) {
        if (firstId !== secondId) exactPairs.add(`${firstId}\0${secondId}`);
      }
    }
  }

  const possible = groupBy(shortcuts, (shortcut) => normalizeDuplicateName(shortcut.name))
    .filter((group) =>
      group.shortcutIds.some((firstId) =>
        group.shortcutIds.some(
          (secondId) => firstId !== secondId && !exactPairs.has(`${firstId}\0${secondId}`),
        ),
      ),
    );

  return { exact, possible };
}

function survivorScore(shortcut) {
  return (
    (shortcut.isFavorite ? 1000 : 0) +
    (shortcut.iconUrl ? 100 : 0) +
    (shortcut.description ? Math.min(shortcut.description.length, 100) : 0) +
    (shortcut.tags?.length || 0) * 4 +
    (shortcut.workspaceTags?.length || 0) * 4
  );
}

export function mergeDuplicateGroup(shortcuts) {
  if (!Array.isArray(shortcuts) || shortcuts.length === 0) return null;
  const survivor = shortcuts.reduce((best, shortcut) => {
    const scoreDifference = survivorScore(shortcut) - survivorScore(best);
    if (scoreDifference > 0) return shortcut;
    if (scoreDifference < 0) return best;
    return (shortcut.createdAt || Number.MAX_SAFE_INTEGER) <
      (best.createdAt || Number.MAX_SAFE_INTEGER)
      ? shortcut
      : best;
  });

  const categories = shortcuts.flatMap((shortcut) => [
    shortcut.category,
    ...(shortcut.workspaceTags || []),
  ]);
  const workspaceTags = uniqueStrings(categories).filter(
    (category) => category !== survivor.category,
  );
  const descriptions = shortcuts
    .map((shortcut) => shortcut.description || "")
    .sort((first, second) => second.length - first.length);
  const iconSource = shortcuts.find((shortcut) => shortcut.iconUrl);
  const createdAtValues = shortcuts.map((shortcut) => shortcut.createdAt).filter(Number.isFinite);
  const orderValues = shortcuts.map((shortcut) => shortcut.order).filter(Number.isFinite);
  const lastLaunchedValues = shortcuts
    .map((shortcut) => shortcut.lastLaunchedAt)
    .filter(Number.isFinite);

  return {
    ...survivor,
    tags: uniqueStrings(shortcuts.flatMap((shortcut) => shortcut.tags || [])),
    workspaceTags: workspaceTags.length > 0 ? workspaceTags : undefined,
    description: descriptions[0] || undefined,
    iconUrl: survivor.iconUrl || iconSource?.iconUrl,
    isFavorite: shortcuts.some((shortcut) => shortcut.isFavorite) || undefined,
    createdAt: createdAtValues.length > 0 ? Math.min(...createdAtValues) : survivor.createdAt,
    order: orderValues.length > 0 ? Math.min(...orderValues) : survivor.order,
    lastLaunchedAt:
      lastLaunchedValues.length > 0 ? Math.max(...lastLaunchedValues) : undefined,
  };
}

export function cleanExactDuplicates(shortcuts, exactGroups) {
  const byId = new Map(shortcuts.map((shortcut) => [shortcut.id, shortcut]));
  const replacements = new Map();
  const removedIds = new Set();

  for (const group of exactGroups || []) {
    const members = group.shortcutIds.map((id) => byId.get(id)).filter(Boolean);
    if (members.length < 2 || members.some((member) => removedIds.has(member.id))) continue;
    const merged = mergeDuplicateGroup(members);
    if (!merged) continue;
    replacements.set(merged.id, merged);
    for (const member of members) {
      if (member.id !== merged.id) removedIds.add(member.id);
    }
  }

  return {
    shortcuts: shortcuts
      .filter((shortcut) => !removedIds.has(shortcut.id))
      .map((shortcut) => replacements.get(shortcut.id) || shortcut)
      .map((shortcut, index) => ({ ...shortcut, order: index })),
    removedCount: removedIds.size,
  };
}
