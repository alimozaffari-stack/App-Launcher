const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appLauncherDesktop", {
  getRecoveredStorage() {
    return ipcRenderer.invoke("app-launcher:get-recovered-storage");
  },
  getProcessMetrics() {
    return ipcRenderer.invoke("app-launcher:get-process-metrics");
  },
  resolveShortcutTargets(candidates) {
    return ipcRenderer.invoke("app-launcher:resolve-shortcut-targets", candidates);
  },
  selectFolder() {
    return ipcRenderer.invoke("app-launcher:select-folder");
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
});
