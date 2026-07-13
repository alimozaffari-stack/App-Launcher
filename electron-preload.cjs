const { contextBridge, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appLauncherDesktop", {
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
});
