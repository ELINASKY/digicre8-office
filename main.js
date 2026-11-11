const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { importDocx, exportDocx } = require('./docx-io');
const { importXlsx, exportXlsx } = require('./xlsx-io');

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

// Only files the user picked in a dialog (or reopened from Recent) may be written by the interface.
const approved = new Set();

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
      filters: [{ name: 'All supported files', extensions: ['docx', 'xlsx', 'csv', 'tsv', 'dcsheet', 'html', 'htm', 'txt', 'md'] }, { name: 'Word documents', extensions: ['docx'] }, { name: 'Excel workbooks', extensions: ['xlsx'] }, { name: 'CSV and text', extensions: ['csv', 'tsv', 'txt'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    filePath = res.filePaths[0];
  }
  try {
    approved.add(filePath);
    if (/\.docx$/i.test(filePath)) {
      const doc = await importDocx(filePath);
      const recent = addRecent(filePath, 'writer');
      return { path: filePath, name: path.basename(filePath), kind: 'docx', content: doc.html, meta: doc.meta, recent };
    }
    if (/\.xlsx$/i.test(filePath)) {
      const model = await importXlsx(filePath);
      const recent = addRecent(filePath, 'sheets');
      return { path: filePath, name: path.basename(filePath), kind: 'xlsx', model, recent };
    }
    if (fs.statSync(filePath).size > 60e6) throw new Error('That file is larger than 60 MB.');
    const content = fs.readFileSync(filePath, 'utf8');
    const sheetFile = /\.(csv|tsv|dcsheet)$/i.test(filePath);
    const recent = addRecent(filePath, sheetFile ? 'sheets' : 'writer');
    return { path: filePath, name: path.basename(filePath), content, recent };
  } catch (e) {
    dialog.showErrorBox('Could not open file', `${path.basename(filePath)} could not be read.\n${e.message}`);
    return null;
  }
});

ipcMain.handle('file:save', async (_e, { path: filePath, content, suggestedName, saveAs, filters, noRecent }) => {
  let target = filePath;
  if (target && !saveAs && !approved.has(target)) return null;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || 'Untitled document.html',
      filters: filters || [{ name: 'DigiCre8 Writer document', extensions: ['html'] }, { name: 'Plain text', extensions: ['txt'] }]
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
    approved.add(target);
  }
  try {
    fs.writeFileSync(target, content, 'utf8');
    const recent = noRecent ? readStore().recent : addRecent(target, 'writer');
    return { path: target, name: path.basename(target), recent };
  } catch (e) {
    dialog.showErrorBox('Could not save file', `${path.basename(target)} could not be saved.\n${e.message}`);
    return null;
  }
});

ipcMain.handle('edit:paste', () => { if (win) win.webContents.paste(); });

const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : d));
function templateHtml(html, margin) {
  const safe = String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\{page\}/g, '<span class="pageNumber"></span>')
    .replace(/\{pages\}/g, '<span class="totalPages"></span>')
    .replace(/\{date\}/g, '<span class="date"></span>')
    .replace(/\{title\}/g, '<span class="title"></span>');
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#444;width:100%;box-sizing:border-box;padding:0 ${margin}px">${safe}</div>`;
}
function makePdf({ width, height, margin, header, footer }) {
  const w = clamp(width, 100, 4000, 794), h = clamp(height, 100, 4000, 1123), m = clamp(margin, 0, 400, 96);
  return win.webContents.printToPDF({
    pageSize: { width: w / 96, height: h / 96 },
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: !!(header || footer),
    headerTemplate: templateHtml(header, m),
    footerTemplate: templateHtml(footer, m)
  });
}

ipcMain.handle('file:exportPdf', async (_e, opts) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: (opts && opts.suggestedName) || 'Document.pdf',
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (res.canceled || !res.filePath) return null;
  try {
    fs.writeFileSync(res.filePath, await makePdf(opts || {}));
    return { path: res.filePath, name: path.basename(res.filePath) };
  } catch (e) {
    dialog.showErrorBox('Could not create PDF', e.message);
    return null;
  }
});

ipcMain.handle('file:printPdf', async (_e, opts) => {
  try {
    const tmp = path.join(app.getPath('temp'), `DigiCre8-print-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, await makePdf(opts || {}));
    const err = await shell.openPath(tmp);
    return err ? null : { path: tmp };
  } catch (e) {
    dialog.showErrorBox('Could not prepare print file', e.message);
    return null;
  }
});

ipcMain.handle('open:external', (_e, url) => {
  if (typeof url === 'string' && /^(https?:\/\/|mailto:)/i.test(url)) return shell.openExternal(url);
});

ipcMain.handle('file:chooseSave', async (_e, { suggestedName, filters } = {}) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: typeof suggestedName === 'string' ? suggestedName : 'Untitled document.docx',
    filters: Array.isArray(filters) ? filters : [{ name: 'Word document', extensions: ['docx'] }]
  });
  if (res.canceled || !res.filePath) return null;
  let target = res.filePath;
  if (!/\.(docx|xlsx|csv|dcsheet|html?|txt)$/i.test(target)) {
    const hint = typeof suggestedName === 'string' ? (suggestedName.match(/\.(docx|xlsx|csv|dcsheet|html?|txt)$/i) || [])[0] : null;
    target += hint || '.docx';
  }
  approved.add(target);
  return target;
});

ipcMain.handle('file:saveDocx', async (_e, opts) => {
  const target = opts && opts.path;
  if (typeof target !== 'string' || !/\.docx$/i.test(target) || !approved.has(target)) return null;
  try {
    const buf = await exportDocx({
      html: String(opts.html || ''), header: String(opts.header || ''), footer: String(opts.footer || ''),
      size: opts.size, landscape: !!opts.landscape, margin: opts.margin, title: opts.title, font: opts.font
    });
    fs.writeFileSync(target, buf);
    const recent = addRecent(target, 'writer');
    return { path: target, name: path.basename(target), recent };
  } catch (e) {
    dialog.showErrorBox('Could not save Word file', e.message);
    return null;
  }
});

ipcMain.handle('file:saveXlsx', async (_e, opts) => {
  const target = opts && opts.path;
  if (typeof target !== 'string' || !/\.xlsx$/i.test(target) || !approved.has(target)) return null;
  try {
    const buf = await exportXlsx(opts.model || {}, Array.isArray(opts.images) ? opts.images : []);
    fs.writeFileSync(target, buf);
    const recent = addRecent(target, 'sheets');
    return { path: target, name: path.basename(target), recent };
  } catch (e) {
    dialog.showErrorBox('Could not save Excel file', e.message);
    return null;
  }
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => { if (typeof text === 'string' && text.length < 50e6) clipboard.writeText(text); });
