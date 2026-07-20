const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
let mainWindow = null;

function statePath() { return path.join(app.getPath("userData"), "library-v2.json"); }
function iconDirectory() { return path.join(app.getPath("userData"), "icons"); }
function expandEnvironment(value) {
  return value.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}
function parseWindowsArguments(value) {
  const result = []; let token = ""; let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') { quoted = !quoted; continue; }
    if (/\s/.test(character) && !quoted) { if (token) { result.push(token); token = ""; } continue; }
    token += character;
  }
  if (token) result.push(token);
  return result;
}
function iconKey(target) {
  return crypto.createHash("sha256").update(target).digest("hex");
}
async function readState() {
  try { return JSON.parse(await fs.readFile(statePath(), "utf8")); } catch { return null; }
}
async function writeState(state) {
  const destination = statePath();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, destination);
  return true;
}
function iconPathFromLocation(iconLocation) {
  if (typeof iconLocation !== "string" || !iconLocation.trim()) return null;
  // Windows shortcut icon locations commonly look like "C:\\Program Files\\App\\app.exe,0".
  // Keep the final path component intact if an uncommon path happens to contain a comma.
  const match = iconLocation.trim().match(/^(.*?)(?:,\s*-?\d+)?$/);
  const candidate = (match?.[1] || iconLocation).trim().replace(/^"|"$/g, "");
  return candidate || null;
}
async function iconCandidates(target) {
  const expanded = expandEnvironment(target);
  const candidates = [expanded];
  if (/\.lnk$/i.test(expanded)) {
    const shortcut = await resolveWindowsShortcut(expanded);
    const location = iconPathFromLocation(shortcut?.iconLocation);
    if (location) candidates.push(expandEnvironment(location));
    if (shortcut?.target) candidates.push(expandEnvironment(shortcut.target));
  }
  return [...new Set(candidates.filter((candidate) => fssync.existsSync(candidate)))];
}
async function getIcon(target) {
  if (!target || /^(https?:|[a-z][a-z0-9+.-]*:)/i.test(target)) return null;
  const candidates = await iconCandidates(target);
  if (!candidates.length) return null;
  const key = iconKey(candidates.join("\0"));
  const filename = path.join(iconDirectory(), `${key}.png`);
  try { return { key, dataUrl: `data:image/png;base64,${(await fs.readFile(filename)).toString("base64")}` }; } catch {}
  try {
    await fs.mkdir(iconDirectory(), { recursive: true });
    for (const candidate of candidates) {
      try {
        const image = await app.getFileIcon(candidate, { size: "normal" });
        if (image.isEmpty()) continue;
        const png = image.resize({ width: 256, height: 256, quality: "best" }).toPNG();
        await fs.writeFile(filename, png);
        return { key, dataUrl: `data:image/png;base64,${png.toString("base64")}` };
      } catch { /* Try the next shortcut icon source. */ }
    }
  } catch { return null; }
  return null;
}
async function resolveWindowsShortcut(filePath) {
  if (process.platform !== "win32") return null;
  const encoded = Buffer.from(filePath, "utf8").toString("base64");
  const command = `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$s=(New-Object -ComObject WScript.Shell).CreateShortcut($p);[PSCustomObject]@{target=$s.TargetPath;arguments=$s.Arguments;workingDirectory=$s.WorkingDirectory;description=$s.Description;iconLocation=$s.IconLocation}|ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true });
    return JSON.parse(stdout);
  } catch { return null; }
}
function inferKind(target, directory = false) {
  if (/^https?:/i.test(target)) return "url";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "protocol";
  if (directory) return "folder";
  return /\.(exe|bat|cmd|lnk)$/i.test(target) ? "app" : "file";
}
async function scanFolder(folderPath) {
  const folder = expandEnvironment(folderPath);
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      results.push({ name: entry.name, target: fullPath, kind: "folder", tags: ["folder"] });
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if ([".exe", ".bat", ".cmd", ".lnk", ".url"].includes(extension)) {
      if (extension === ".lnk") {
        const shortcut = await resolveWindowsShortcut(fullPath);
        results.push({ name: path.basename(entry.name, extension), target: shortcut?.target || fullPath, kind: "app", arguments: shortcut?.arguments ? parseWindowsArguments(shortcut.arguments) : [], workingDirectory: shortcut?.workingDirectory || undefined, description: shortcut?.description || undefined, iconSource: fullPath, tags: ["shortcut"] });
      } else if (extension === ".url") {
        const content = await fs.readFile(fullPath, "utf8").catch(() => "");
        const target = content.match(/^URL=(.+)$/mi)?.[1]?.trim() || fullPath;
        results.push({ name: path.basename(entry.name, extension), target, kind: inferKind(target), tags: ["url"] });
      } else {
        results.push({ name: path.basename(entry.name, extension), target: fullPath, kind: "app", tags: [extension.slice(1)] });
      }
    }
  }
  return results;
}
async function openItem(item) {
  const target = expandEnvironment(item.target || "");
  if (!target) return { ok: false, error: "No target path is configured." };
  if (item.kind === "url" || item.kind === "protocol") {
    try { await shell.openExternal(target); return { ok: true }; } catch (error) { return { ok: false, error: String(error) }; }
  }
  if (!fssync.existsSync(target)) return { ok: false, error: "This path is unavailable. Relink the item before opening it." };
  if (item.kind === "app" && Array.isArray(item.arguments) && item.arguments.length > 0) {
    try {
      const child = spawn(target, item.arguments, { cwd: item.workingDirectory || undefined, detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
      return { ok: true };
    } catch (error) { return { ok: false, error: String(error) }; }
  }
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true };
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 880, minWidth: 900, minHeight: 640, title: "App Launcher", backgroundColor: "#050505", show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.cjs") }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}
function registerIpc() {
  ipcMain.handle("library:load", () => readState());
  ipcMain.handle("library:save", (_, state) => writeState(state));
  ipcMain.handle("library:open", (_, item) => openItem(item));
  ipcMain.handle("library:get-icon", (_, target) => getIcon(target));
  ipcMain.handle("library:path-exists", (_, target) => {
    if (/^(https?:|[a-z][a-z0-9+.-]*:)/i.test(target || "")) return true;
    return Boolean(target && fssync.existsSync(expandEnvironment(target)));
  });
  ipcMain.handle("library:scan-folder", (_, target) => scanFolder(target));
  const resourceFromTarget = async (target, kind) => {
    if (kind === "folder") return { target, kind: "folder", name: path.basename(target) };
    if (/\.lnk$/i.test(target)) {
      const shortcut = await resolveWindowsShortcut(target);
      if (shortcut?.target) return { target: shortcut.target, kind: inferKind(shortcut.target), name: path.basename(target, path.extname(target)), arguments: shortcut.arguments ? parseWindowsArguments(shortcut.arguments) : [], workingDirectory: shortcut.workingDirectory || undefined, description: shortcut.description || undefined, iconSource: target };
    }
    return { target, kind: "file", name: path.basename(target, path.extname(target)) };
  };
  const chooseResources = async (kind, multiple = false) => {
    const properties = kind === "folder" ? ["openDirectory"] : ["openFile"];
    if (multiple) properties.push("multiSelections");
    const result = await dialog.showOpenDialog(mainWindow, { title: kind === "folder" ? "Choose folder" : "Choose file or application", properties });
    if (result.canceled || result.filePaths.length === 0) return [];
    return Promise.all(result.filePaths.map((target) => resourceFromTarget(target, kind)));
  };
  ipcMain.handle("library:choose-resource", async (_, kind) => {
    const resources = await chooseResources(kind);
    return resources[0] || null;
  });
  ipcMain.handle("library:choose-resources", (_, kind) => chooseResources(kind, true));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on("activate", () => { if (!mainWindow) createWindow(); });
  });
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
