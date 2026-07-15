const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  loadState: () => ipcRenderer.invoke("library:load"),
  saveState: (state) => ipcRenderer.invoke("library:save", state),
  openItem: (item) => ipcRenderer.invoke("library:open", item),
  chooseResource: (kind) => ipcRenderer.invoke("library:choose-resource", kind),
  scanFolder: (folderPath) => ipcRenderer.invoke("library:scan-folder", folderPath),
  getIcon: (target) => ipcRenderer.invoke("library:get-icon", target),
  pathForFile: (file) => webUtils.getPathForFile(file)
});
