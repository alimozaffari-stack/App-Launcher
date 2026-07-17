const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  isDirectDesktop: true,
  loadState: () => ipcRenderer.invoke("library:load"),
  saveState: (state) => ipcRenderer.invoke("library:save", state),
  openItem: (item) => ipcRenderer.invoke("library:open", item),
  chooseResource: (kind) => ipcRenderer.invoke("library:choose-resource", kind),
  chooseResources: (kind) => ipcRenderer.invoke("library:choose-resources", kind),
  scanFolder: (folderPath) => ipcRenderer.invoke("library:scan-folder", folderPath),
  getIcon: (target) => ipcRenderer.invoke("library:get-icon", target),
  pathExists: (target) => ipcRenderer.invoke("library:path-exists", target),
  pathForFile: (file) => webUtils.getPathForFile(file)
});
