const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  showNotification: (opts, body) => ipcRenderer.send("show-notification", opts, body),
  onWindowHide: (cb) => ipcRenderer.on("window-hidden", cb),
  offWindowHide: (cb) => ipcRenderer.removeListener("window-hidden", cb),
  checkForUpdates: () => ipcRenderer.invoke("app-update-check"),
  installUpdateNow: () => ipcRenderer.invoke("app-update-install"),
  onUpdateStatus: (cb) => ipcRenderer.on("app-update-status", cb),
  offUpdateStatus: (cb) => ipcRenderer.removeListener("app-update-status", cb),
  fetchMissedSchedules: (serverUrl) => ipcRenderer.invoke("fetch-missed-schedules", serverUrl),
});
