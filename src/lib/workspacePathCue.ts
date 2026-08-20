/**
 * Returns enough parent-path context to distinguish identically named folders
 * without turning the workspace list into a full-path browser.
 */
export function workspacePathCue(target: string): string {
  const normalised = target.trim().replace(/\\+/g, "\\").replace(/\/+$/, "");
  if (!normalised) return "";

  const windows = /^([a-z]:)\\/i.exec(normalised);
  const root = windows ? `${windows[1].toUpperCase()}\\` : normalised.startsWith("/") ? "/" : "";
  const remainder = windows ? normalised.slice(windows[0].length) : normalised.slice(root.length);
  const segments = remainder.split(windows ? "\\" : "/").filter(Boolean);

  // The final segment is the folder name already displayed in the row.
  const parents = segments.slice(0, -1);
  if (!parents.length) return root || normalised;

  return `${root}…${windows ? "\\" : "/"}${parents.slice(-2).join(windows ? "\\" : "/")}`;
}
