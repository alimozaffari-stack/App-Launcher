const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appLauncherDesktop", {
  getRecoveredStorage() {
    return ipcRenderer.invoke("app-launcher:get-recovered-storage");
  },
  getProcessMetrics() {
    return ipcRenderer.invoke("app-launcher:get-process-metrics");
  },
  selectFolder() {
    return ipcRenderer.invoke("app-launcher:select-folder");
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
});
