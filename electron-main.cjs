const { app, BrowserWindow } = require("electron");
const path = require("path");

let mainWindow = null;

function startExpressServer() {
  console.log("Starting backend Express server inside Electron process...");
  // Set NODE_ENV to production so it serves static files from the dist directory
  process.env.NODE_ENV = "production";
  process.env.PORT = "3000";

  try {
    const serverPath = path.join(__dirname, "dist", "server.cjs");
    require(serverPath);
    console.log("Backend Express server successfully loaded inside Electron!");
  } catch (err) {
    console.error("Failed to require backend server:", err);
  }
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

  // Add developer-friendly troubleshooting shortcuts
  mainWindow.webContents.on("before-input-event", (event, input) => {
    // F12 or Ctrl+Shift+I toggles DevTools
    if (input.key === "F12" || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i")) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    // F5 reloads the window
    if (input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r")) {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  // Wait a brief moment for the express server to start up, then load the local URL
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
  }, 400);

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

// Clean up on exit
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

