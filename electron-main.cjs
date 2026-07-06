const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let serverProcess = null;
let mainWindow = null;

function startExpressServer() {
  console.log("Starting backend Express server...");
  const serverPath = path.join(__dirname, "dist", "server.cjs");
  
  // Set NODE_ENV to production so it serves static files from dist/
  serverProcess = spawn("node", [serverPath], {
    env: { ...process.env, NODE_ENV: "production", PORT: "3000" },
    stdio: "inherit",
    shell: true
  });

  serverProcess.on("error", (err) => {
    console.error("Failed to start backend server:", err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "App Launcher",
    icon: path.join(__dirname, "public", "icon.png"),
    backgroundColor: "#0a0a0a",
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Hide the default menu bar for a modern utility look
  mainWindow.setMenuBarVisibility(false);

  // Wait a short duration for the express server to spin up, then load
  setTimeout(() => {
    mainWindow.loadURL("http://localhost:3000")
      .then(() => {
        mainWindow.show();
      })
      .catch((err) => {
        console.error("Failed to load local app URL, retrying in 1s...", err);
        setTimeout(() => {
          mainWindow.loadURL("http://localhost:3000").then(() => mainWindow.show());
        }, 1000);
      });
  }, 1200);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("ready", () => {
    startExpressServer();
    createWindow();
  });
}

// Clean up child process on exit
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (serverProcess) {
    console.log("Stopping backend Express server...");
    serverProcess.kill();
  }
});
