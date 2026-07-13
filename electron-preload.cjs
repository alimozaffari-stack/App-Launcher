const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appLauncherDesktop", {
  getRecoveredStorage() {
    return ipcRenderer.invoke("app-launcher:get-recovered-storage");
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
});
