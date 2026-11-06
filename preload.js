const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('digicre8', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openFile: (path) => ipcRenderer.invoke('file:open', path),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  exportPdf: (opts) => ipcRenderer.invoke('file:exportPdf', opts),
  chooseSave: (opts) => ipcRenderer.invoke('file:chooseSave', opts),
  saveDocx: (opts) => ipcRenderer.invoke('file:saveDocx', opts),
  paste: () => ipcRenderer.invoke('edit:paste'),
  printPdf: (opts) => ipcRenderer.invoke('file:printPdf', opts),
  openExternal: (url) => ipcRenderer.invoke('open:external', url)
});
