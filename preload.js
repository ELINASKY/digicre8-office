const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('digicre8', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openFile: (path) => ipcRenderer.invoke('file:open', path),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload)
});
