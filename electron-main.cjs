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
  return crypto.createHash("sha256").update(path.resolve(expandEnvironment(target))).digest("hex");
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
async function getIcon(target) {
  if (!target || /^(https?:|[a-z][a-z0-9+.-]*:)/i.test(target)) return null;
  const expanded = expandEnvironment(target);
  if (!fssync.existsSync(expanded)) return null;
  const key = iconKey(expanded);
  const filename = path.join(iconDirectory(), `${key}.png`);
  try { return { key, dataUrl: `data:image/png;base64,${(await fs.readFile(filename)).toString("base64")}` }; } catch {}
  try {
    await fs.mkdir(iconDirectory(), { recursive: true });
    const image = await app.getFileIcon(expanded, { size: "normal" });
    const png = image.resize({ width: 256, height: 256, quality: "best" }).toPNG();
    await fs.writeFile(filename, png);
    return { key, dataUrl: `data:image/png;base64,${png.toString("base64")}` };
  } catch { return null; }
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
        results.push({ name: path.basename(entry.name, extension), target: shortcut?.target || fullPath, kind: "app", arguments: shortcut?.arguments ? parseWindowsArguments(shortcut.arguments) : [], workingDirectory: shortcut?.workingDirectory || undefined, description: shortcut?.description || undefined, tags: ["shortcut"] });
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
  mainWindow.loadURL("http://localhost:3000");
  mainWindow.on("closed", () => { mainWindow = null; });
}
function registerIpc() {
  ipcMain.handle("library:load", () => readState());
  ipcMain.handle("library:save", (_, state) => writeState(state));
  ipcMain.handle("library:open", (_, item) => openItem(item));
  ipcMain.handle("library:get-icon", (_, target) => getIcon(target));
  ipcMain.handle("library:scan-folder", (_, target) => scanFolder(target));
  ipcMain.handle("library:choose-resource", async (_, kind) => {
    const properties = kind === "folder" ? ["openDirectory"] : ["openFile"];
    const result = await dialog.showOpenDialog(mainWindow, { title: kind === "folder" ? "Choose folder" : "Choose file or application", properties });
    if (result.canceled || result.filePaths.length === 0) return null;
    const target = result.filePaths[0];
    return { target, kind: kind === "folder" ? "folder" : inferKind(target), name: path.basename(target, path.extname(target)) };
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(async () => {
    registerIpc();
    const { startLocalServer } = require(path.join(__dirname, "dist", "server.cjs"));
    await startLocalServer();
    createWindow();
    app.on("activate", () => { if (!mainWindow) createWindow(); });
  });
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
