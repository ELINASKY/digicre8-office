const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const storeFile = () => path.join(app.getPath('userData'), 'settings.json');
const defaults = { theme: 'system', recent: [] };

function readStore() {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')) }; }
  catch { return { ...defaults }; }
}
function writeStore(data) {
  try { fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
}
function addRecent(filePath, appKey) {
  const s = readStore();
  s.recent = [{ path: filePath, name: path.basename(filePath), app: appKey, time: Date.now() },
    ...s.recent.filter(r => r.path !== filePath)].slice(0, 12);
  writeStore(s);
  return s.recent;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 960, minHeight: 600,
    title: 'DigiCre8 Office',
    backgroundColor: '#151A2D',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  nativeTheme.themeSource = readStore().theme;
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('settings:get', () => readStore());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = { ...readStore(), ...patch };
  writeStore(s);
  if (patch.theme) nativeTheme.themeSource = patch.theme;
  return s;
});

ipcMain.handle('file:open', async (_e, requestedPath) => {
  let filePath = requestedPath;
  if (filePath) {
    // Only allow re-opening files that were opened or saved through the app.
    if (!readStore().recent.some(r => r.path === filePath)) return null;
  } else {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['html', 'htm', 'txt', 'md'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    filePath = res.filePaths[0];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const recent = addRecent(filePath, 'writer');
    return { path: filePath, name: path.basename(filePath), content, recent };
  } catch (e) {
    dialog.showErrorBox('Could not open file', `${path.basename(filePath)} could not be read.\n${e.message}`);
    return null;
  }
});

ipcMain.handle('file:save', async (_e, { path: filePath, content, suggestedName, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || 'Untitled document.html',
      filters: [{ name: 'DigiCre8 Writer document', extensions: ['html'] }, { name: 'Plain text', extensions: ['txt'] }]
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  try {
    fs.writeFileSync(target, content, 'utf8');
    const recent = addRecent(target, 'writer');
    return { path: target, name: path.basename(target), recent };
  } catch (e) {
    dialog.showErrorBox('Could not save file', `${path.basename(target)} could not be saved.\n${e.message}`);
    return null;
  }
});
