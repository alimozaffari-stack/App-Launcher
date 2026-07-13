const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appLauncherDesktop", {
  getRecoveredStorage() {
    return ipcRenderer.invoke("app-launcher:get-recovered-storage");
  },
  selectFolder() {
    return ipcRenderer.invoke("app-launcher:select-folder");
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
});
