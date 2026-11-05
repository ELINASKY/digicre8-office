'use strict';

/* ---------- App registry ---------- */
const APPS = {
  writer:    { name: 'DigiCre8 Writer',    short: 'Wr', color: '#4F6BF2', desc: 'Letters, reports and long documents', ready: true },
  sheets:    { name: 'DigiCre8 Sheets',    short: 'Sh', color: '#12A37A', desc: 'Budgets, schedules and data', phase: 3 },
  slides:    { name: 'DigiCre8 Slides',    short: 'Sl', color: '#F2701B', desc: 'Pitches, decks and presentations', phase: 4 },
  publisher: { name: 'DigiCre8 Publisher', short: 'Pu', color: '#D63A7C', desc: 'Flyers, brochures and print layouts', phase: 5 },
  pdf:       { name: 'DigiCre8 PDF',       short: 'Pd', color: '#7A4FE0', desc: 'Read, merge and sign PDF files', phase: 5 }
};

/* ---------- State ---------- */
const state = { tabs: [], active: null, settings: { theme: 'system', recent: [] }, nextId: 1, zoom: 100 };
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

function newTab(app, extra = {}) {
  const tab = { id: state.nextId++, app, title: app === 'home' ? 'Home' : 'Untitled', path: null, dirty: false, html: '', ribbon: 'Home', ...extra };
  state.tabs.push(tab);
  state.active = tab.id;
  render();
  return tab;
}
const activeTab = () => state.tabs.find(t => t.id === state.active);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function ask(label, button = 'Insert') {
  return new Promise(resolve => {
    const dlg = $('#askDialog'), input = $('#askInput');
    $('#askLabel').textContent = label;
    dlg.querySelector('.primary').textContent = button;
    input.value = '';
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? input.value.trim() : null), { once: true });
    dlg.showModal();
    input.focus();
  });
}

/* ---------- Theme ---------- */
const THEMES = ['system', 'light', 'dark'];
function applyTheme() {
  const pref = state.settings.theme;
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = 'Theme: ' + pref[0].toUpperCase() + pref.slice(1);
}
$('#themeBtn').addEventListener('click', async () => {
  const next = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
  state.settings = await window.digicre8.setSettings({ theme: next });
  applyTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- Tab bar ---------- */
function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML = '';
  for (const t of state.tabs) {
    const meta = APPS[t.app];
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === state.active ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.tabIndex = 0;
    el.style.setProperty('--accent', meta ? meta.color : 'var(--brand)');
    el.innerHTML = `<span class="dot"></span><span class="title"></span><button class="x" aria-label="Close tab" title="Close (Ctrl+W)">×</button>`;
    $('.title', el).textContent = (t.dirty ? '• ' : '') + t.title;
    el.addEventListener('click', () => { state.active = t.id; render(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { state.active = t.id; render(); } });
    $('.x', el).addEventListener('click', e => { e.stopPropagation(); closeTab(t.id); });
    bar.appendChild(el);
  }
}
function closeTab(id) {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.dirty && !confirm(`Close "${tab.title}" without saving your changes?`)) return;
  const i = state.tabs.indexOf(tab);
  state.tabs.splice(i, 1);
  if (!state.tabs.length) { newTab('home'); return; }
  if (state.active === id) state.active = state.tabs[Math.max(0, i - 1)].id;
  render();
}
$('#newTab').addEventListener('click', () => newTab('home'));

/* ---------- Home ---------- */
function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ms).toLocaleDateString();
}

function renderHome() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  view.innerHTML = `
    <section class="home"><div class="home-inner">
      <h1>${greet}. What will you create today?</h1>
      <p class="sub">Start something new or pick up where you left off.</p>
      <div class="tiles" id="tiles"></div>
      <div class="row"><h2>Recent files</h2><button class="btn" id="openBtn">Open a file</button></div>
      <div class="recent" id="recent"></div>
    </div></section>`;
  const tiles = $('#tiles');
  for (const [key, a] of Object.entries(APPS)) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.style.setProperty('--accent', a.color);
    b.innerHTML = `<span class="mono">${a.short}</span><span><div class="name">${a.name}</div><div class="desc">${a.desc}</div>${a.ready ? '' : `<span class="soon">Coming in phase ${a.phase}</span>`}</span>`;
    b.addEventListener('click', () => openApp(key));
    tiles.appendChild(b);
  }
  $('#openBtn').addEventListener('click', openFileDialog);
  const rec = $('#recent');
  if (!state.settings.recent.length) {
    rec.innerHTML = '<div class="empty">No recent files yet. Files you open or save will show up here.</div>';
  } else {
    for (const r of state.settings.recent) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="title"></span><span class="when"></span>`;
      $('.title', b).textContent = r.name;
      $('.when', b).textContent = timeAgo(r.time);
      b.addEventListener('click', () => openFileDialog(r.path));
      rec.appendChild(b);
    }
  }
}

function openApp(key) {
  const a = APPS[key];
  const home = activeTab();
  // Reuse the current tab when it is an empty Home tab.
  if (home && home.app === 'home') {
    Object.assign(home, { app: key, title: a.ready ? 'Untitled document' : a.name, html: '', ribbon: 'Home', dirty: false });
    render();
  } else {
    newTab(key, { title: a.ready ? 'Untitled document' : a.name });
  }
}

/* ---------- Coming soon ---------- */
function renderSoon(tab) {
  const a = APPS[tab.app];
  view.innerHTML = `<section class="soon-view" style="--accent:${a.color}"><div>
    <div class="mono">${a.short}</div><h2>${a.name} is on the roadmap</h2>
    <p>This app arrives in phase ${a.phase}. Writer is ready to use today.</p>
    <button class="btn primary" id="toWriter">Open Writer</button></div></section>`;
  $('#toWriter').addEventListener('click', () => { tab.app = 'writer'; tab.title = 'Untitled document'; render(); });
}

/* ---------- Writer ---------- */
const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'];
const SIZES = [['1', '8'], ['2', '10'], ['3', '12'], ['4', '14'], ['5', '18'], ['6', '24'], ['7', '36']];

const RIBBON = {
  Home: [
    { g: 'File', items: [['Open', 'file:open'], ['Save', 'file:save'], ['Save as', 'file:saveas'], ['Print', 'file:print']] },
    { g: 'History', items: [['Undo', 'undo'], ['Redo', 'redo']] },
    { g: 'Font', items: [{ select: 'fontName', opts: FONTS.map(f => [f, f]) }, { select: 'fontSize', opts: SIZES, def: '3' },
      ['B', 'bold', 'b', 'Bold (Ctrl+B)'], ['I', 'italic', 'i', 'Italic (Ctrl+I)'], ['U', 'underline', 'u', 'Underline (Ctrl+U)']] },
    { g: 'Paragraph', items: [['Left', 'justifyLeft'], ['Center', 'justifyCenter'], ['Right', 'justifyRight'], ['Justify', 'justifyFull'], ['Bullets', 'insertUnorderedList'], ['Numbers', 'insertOrderedList']] },
    { g: 'Styles', items: [['Title', 'block:h1'], ['Heading', 'block:h2'], ['Body', 'block:p']] }
  ],
  Insert: [{ g: 'Elements', items: [['Table', 'table'], ['Divider', 'insertHorizontalRule'], ['Link', 'link']] }],
  Layout: [{ g: 'Margins', items: [['Narrow', 'margin:48'], ['Normal', 'margin:96'], ['Wide', 'margin:144']] }],
  View: [{ g: 'Zoom', items: [['Zoom out', 'zoom:-10'], ['Zoom in', 'zoom:10'], ['Reset', 'zoom:0']] }]
};

function renderWriter(tab) {
  const a = APPS.writer;
  view.innerHTML = `
    <div class="ribbon" style="--accent:${a.color}">
      <div class="ribbon-tabs" role="tablist"></div>
      <div class="ribbon-body"></div>
    </div>
    <div class="canvas"><div class="page-wrap" id="wrap"><div class="page" id="page" contenteditable="true" spellcheck="true" aria-label="Document"></div></div></div>
    <footer class="status"><span id="words">0 words</span><span id="chars">0 characters</span><span class="spacer"></span><span id="zoomLabel"></span></footer>`;

  const tabs = $('.ribbon-tabs');
  for (const name of Object.keys(RIBBON)) {
    const b = document.createElement('button');
    b.className = 'ribbon-tab' + (name === tab.ribbon ? ' active' : '');
    b.textContent = name;
    b.addEventListener('click', () => { tab.ribbon = name; renderWriter(tab); });
    tabs.appendChild(b);
  }

  const body = $('.ribbon-body');
  for (const grp of RIBBON[tab.ribbon]) {
    const g = document.createElement('div');
    g.className = 'group';
    const items = document.createElement('div');
    items.className = 'group-items';
    for (const it of grp.items) {
      if (it.select) {
        const s = document.createElement('select');
        s.className = 'rsel';
        s.setAttribute('aria-label', it.select === 'fontName' ? 'Font' : 'Font size');
        for (const [v, label] of it.opts) { const o = new Option(label, v); s.add(o); }
        if (it.def) s.value = it.def;
        s.addEventListener('change', () => { $('#page').focus(); document.execCommand(it.select, false, s.value); });
        items.appendChild(s);
      } else {
        const b = document.createElement('button');
        b.className = 'rb ' + (it[2] || '');
        b.textContent = it[0];
        if (it[3]) b.title = it[3];
        b.addEventListener('mousedown', e => e.preventDefault()); // keep text selection
        b.addEventListener('click', () => runCommand(it[1], tab));
        items.appendChild(b);
      }
    }
    g.appendChild(items);
    g.insertAdjacentHTML('beforeend', `<div class="group-name">${grp.g}</div>`);
    body.appendChild(g);
  }

  const page = $('#page');
  page.innerHTML = tab.html || '<h1>Untitled document</h1><p>Start typing here.</p>';
  if (tab.margin) page.style.padding = tab.margin + 'px';
  page.addEventListener('input', () => {
    tab.html = page.innerHTML;
    if (!tab.dirty) { tab.dirty = true; renderTabs(); }
    updateCounts();
  });
  applyZoom();
  updateCounts();
}

function updateCounts() {
  const page = $('#page'); if (!page) return;
  const text = page.innerText.trim();
  $('#words').textContent = (text ? text.split(/\s+/).length : 0) + ' words';
  $('#chars').textContent = text.length + ' characters';
}
function applyZoom() {
  const wrap = $('#wrap'); if (!wrap) return;
  wrap.style.zoom = state.zoom / 100;
  $('#zoomLabel').textContent = state.zoom + '%';
}

async function runCommand(cmd, tab) {
  const page = $('#page');
  page.focus();
  if (cmd === 'file:open') return openFileDialog();
  if (cmd === 'file:save') return saveTab(tab, false);
  if (cmd === 'file:saveas') return saveTab(tab, true);
  if (cmd === 'file:print') return window.print();
  if (cmd.startsWith('block:')) return document.execCommand('formatBlock', false, cmd.slice(6));
  if (cmd.startsWith('margin:')) { tab.margin = +cmd.slice(7); page.style.padding = tab.margin + 'px'; return; }
  if (cmd.startsWith('zoom:')) {
    const d = +cmd.slice(5);
    state.zoom = d === 0 ? 100 : Math.min(200, Math.max(50, state.zoom + d));
    return applyZoom();
  }
  if (cmd === 'table') {
    const val = await ask('Table size (rows x columns)', 'Insert');
    if (!val) return;
    const m = val.match(/^(\d{1,2})\s*[x×,]\s*(\d{1,2})$/i);
    if (!m) return toast('Enter a size like 3x4');
    const rows = Math.min(+m[1], 50), cols = Math.min(+m[2], 20);
    const cell = '<td><br></td>';
    const html = '<table>' + ('<tr>' + cell.repeat(cols) + '</tr>').repeat(rows) + '</table><p><br></p>';
    page.focus();
    return document.execCommand('insertHTML', false, html);
  }
  if (cmd === 'link') {
    const url = await ask('Link address (https://...)', 'Add link');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return toast('Links must start with https://, http:// or mailto:');
    page.focus();
    return document.execCommand('createLink', false, url);
  }
  document.execCommand(cmd, false, null);
}

/* ---------- Files ---------- */
async function openFileDialog(path) {
  const p = typeof path === 'string' ? path : undefined;
  const res = await window.digicre8.openFile(p);
  if (!res) return;
  state.settings.recent = res.recent;
  let html;
  if (/\.html?$/i.test(res.name)) {
    const doc = new DOMParser().parseFromString(res.content, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(at => { if (/^on/i.test(at.name)) n.removeAttribute(at.name); }));
    html = doc.body.innerHTML;
  } else {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = res.content.split(/\r?\n/).map(l => `<p>${esc(l) || '<br>'}</p>`).join('');
  }
  const cur = activeTab();
  const extra = { title: res.name, path: res.path, html, dirty: false, ribbon: 'Home' };
  if (cur && cur.app === 'home') { Object.assign(cur, extra, { app: 'writer' }); render(); }
  else newTab('writer', extra);
  toast('Opened ' + res.name);
}

async function saveTab(tab, saveAs) {
  if (tab.app !== 'writer') return;
  const page = $('#page');
  tab.html = page.innerHTML;
  const isTxt = tab.path && /\.txt$/i.test(tab.path);
  const content = isTxt ? page.innerText :
    `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${tab.title.replace(/[<>&]/g, '')}</title></head>\n<body>\n${tab.html}\n</body></html>`;
  const res = await window.digicre8.saveFile({ path: tab.path, content, suggestedName: tab.title.replace(/\.(html?|txt)$/i, '') + '.html', saveAs });
  if (!res) return;
  tab.path = res.path; tab.title = res.name; tab.dirty = false;
  state.settings.recent = res.recent;
  renderTabs();
  toast('Saved ' + res.name);
}

/* ---------- Render + shortcuts ---------- */
function render() {
  renderTabs();
  const tab = activeTab();
  if (!tab) return;
  if (tab.app === 'home') renderHome();
  else if (tab.app === 'writer') renderWriter(tab);
  else renderSoon(tab);
}

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  const tab = activeTab();
  if (k === 't') { e.preventDefault(); newTab('home'); }
  else if (k === 'w') { e.preventDefault(); if (tab) closeTab(tab.id); }
  else if (k === 'o') { e.preventDefault(); openFileDialog(); }
  else if (k === 's' && tab && tab.app === 'writer') { e.preventDefault(); saveTab(tab, e.shiftKey); }
  else if (k === 'tab') {
    e.preventDefault();
    const i = state.tabs.indexOf(tab);
    state.active = state.tabs[(i + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length].id;
    render();
  }
});

window.addEventListener('beforeunload', e => {
  if (state.tabs.some(t => t.dirty)) { e.preventDefault(); e.returnValue = ''; }
});

(async function init() {
  state.settings = await window.digicre8.getSettings();
  applyTheme();
  newTab('home');
})();
