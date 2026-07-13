const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");

const DESKTOP_PORT = 3000;
const STORED_SETTING_KEYS = [
  "launcher_shortcuts",
  "launcher_categories",
  "launcher_view_mode",
  "launcher_nominated_category",
  "launcher_sort_mode",
];

let backendServer = null;
let backendUrl = null;
let mainWindow = null;
let recoveredStorage = {};
let storageRecoveryInProgress = false;

async function startExpressServer() {
  process.env.APP_LAUNCHER_EMBEDDED = "1";
  process.env.APP_LAUNCHER_ENV_FILE = path.join(app.getPath("userData"), ".env");
  process.env.NODE_ENV = "production";
  process.env.PORT = String(DESKTOP_PORT);

  const serverPath = path.join(__dirname, "dist", "server.cjs");
  const { startServer } = require(serverPath);
  const running = await startServer({
    port: DESKTOP_PORT,
    host: "127.0.0.1",
    browserHost: "localhost",
  });

  backendServer = running.server;
  backendUrl = running.url;
}

function preferStoredValue(key, currentValue, candidateValue) {
  if (!candidateValue) return currentValue;
  if (!currentValue) return candidateValue;
  if (!["launcher_shortcuts", "launcher_categories"].includes(key)) {
    return currentValue;
  }

  try {
    const currentItems = JSON.parse(currentValue);
    const candidateItems = JSON.parse(candidateValue);
    if (Array.isArray(candidateItems) &&
        (!Array.isArray(currentItems) || candidateItems.length > currentItems.length)) {
      return candidateValue;
    }
  } catch {
    // Keep the first parseable value. The renderer validates it again.
  }
  return currentValue;
}

async function readStorageSnapshot(browserSession, origin) {
  const migrationWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
      session: browserSession,
    },
  });

  try {
    await migrationWindow.loadURL(`${origin}/migration-storage`);
    return await migrationWindow.webContents.executeJavaScript(`
      (() => {
        const keys = ${JSON.stringify(STORED_SETTING_KEYS)};
        return Object.fromEntries(
          keys.map((key) => [key, localStorage.getItem(key)])
            .filter(([, value]) => typeof value === "string" && value.length > 0)
        );
      })()
    `);
  } catch (error) {
    console.warn(`Could not inspect legacy storage at ${origin}:`, error);
    return {};
  } finally {
    if (!migrationWindow.isDestroyed()) migrationWindow.destroy();
  }
}

async function recoverLegacyStorage() {
  const origins = ["localhost", "127.0.0.1"].map(
    (hostname) => `http://${hostname}:${DESKTOP_PORT}`,
  );
  const sessions = [session.defaultSession];
  const currentUserData = path.resolve(app.getPath("userData")).toLowerCase();
  const appData = app.getPath("appData");

  for (const directoryName of ["app-launcher", "App Launcher", "AppLauncher"]) {
    const candidate = path.join(appData, directoryName);
    if (path.resolve(candidate).toLowerCase() === currentUserData) continue;
    if (!fs.existsSync(path.join(candidate, "Local Storage"))) continue;
    try {
      sessions.push(session.fromPath(candidate, { cache: false }));
    } catch (error) {
      console.warn(`Could not open legacy application profile ${candidate}:`, error);
    }
  }

  const merged = {};
  for (const browserSession of sessions) {
    for (const origin of origins) {
      const snapshot = await readStorageSnapshot(browserSession, origin);
      for (const key of STORED_SETTING_KEYS) {
        merged[key] = preferStoredValue(key, merged[key], snapshot[key]);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => typeof value === "string"),
  );
}

ipcMain.handle("app-launcher:get-recovered-storage", () => recoveredStorage);
ipcMain.handle("app-launcher:select-folder", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Add a temporary workspace folder",
    buttonLabel: "Add folder",
    properties: ["openDirectory", "dontAddToRecent"],
  });
  const selectedPath = result.canceled ? "" : result.filePaths[0];
  if (!selectedPath) return null;
  return {
    name: path.basename(selectedPath) || selectedPath,
    path: selectedPath,
  };
});

function isSafeExternalUrl(rawUrl) {
  try {
    const protocol = new URL(rawUrl).protocol.toLowerCase();
    return !["data:", "devtools:", "file:", "javascript:", "vbscript:"].includes(protocol);
  } catch {
    return false;
  }
}

function openExternalUrl(rawUrl) {
  if (!isSafeExternalUrl(rawUrl)) return;
  shell.openExternal(rawUrl).catch((error) => {
    console.error("Could not open external URL:", error);
  });
}

function createWindow() {
  if (!backendUrl) {
    throw new Error("The local application server is not ready.");
  }

  const allowedOrigin = new URL(backendUrl).origin;
  const isDevelopment = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "App Launcher",
    backgroundColor: "#0a0a0a",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      devTools: isDevelopment,
      nodeIntegration: false,
      preload: path.join(__dirname, "electron-preload.cjs"),
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  const isAllowedClipboardWrite = (permission, requestingUrl) => {
    if (permission !== "clipboard-sanitized-write") return false;
    try {
      return new URL(requestingUrl).origin === allowedOrigin;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      isAllowedClipboardWrite(permission, requestingOrigin),
  );

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) =>
      callback(isAllowedClipboardWrite(permission, webContents.getURL())),
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === allowedOrigin) return;
    } catch {
      // Invalid navigation is blocked below.
    }
    event.preventDefault();
    openExternalUrl(url);
  });

  if (isDevelopment) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      if (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && key === "i")
      ) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      if (
        input.key === "F5" ||
        ((input.control || input.meta) && key === "r")
      ) {
        mainWindow.reload();
        event.preventDefault();
      }
    });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(backendUrl).catch((error) => {
    console.error("The desktop interface could not be loaded:", error);
    dialog.showErrorBox(
      "App Launcher could not start",
      "The local interface failed to load. Close any application using port 3000 and try again.",
    );
    app.quit();
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady()
    .then(async () => {
      await startExpressServer();
      storageRecoveryInProgress = true;
      try {
        recoveredStorage = await recoverLegacyStorage();
      } catch (error) {
        recoveredStorage = {};
        console.warn("Legacy storage recovery was skipped:", error);
      } finally {
        storageRecoveryInProgress = false;
      }
      createWindow();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      console.error("App Launcher failed to start:", error);
      dialog.showErrorBox(
        "App Launcher could not start",
        error?.code === "EADDRINUSE"
          ? "Port 3000 is already in use. Close the other application and try again."
          : "The local application service failed to start.",
      );
      app.quit();
    });
}

app.on("window-all-closed", () => {
  if (storageRecoveryInProgress) return;
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  backendServer?.close();
  backendServer = null;
});
