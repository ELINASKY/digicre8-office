'use strict';

/* ================= Registry & state ================= */
const APPS = {
  writer:    { name: 'DigiCre8 Writer',    short: 'Wr', color: '#4F6BF2', desc: 'Letters, reports and long documents', ready: true },
  sheets:    { name: 'DigiCre8 Sheets',    short: 'Sh', color: '#12A37A', desc: 'Budgets, schedules and data', phase: 3 },
  slides:    { name: 'DigiCre8 Slides',    short: 'Sl', color: '#F2701B', desc: 'Pitches, decks and presentations', phase: 4 },
  publisher: { name: 'DigiCre8 Publisher', short: 'Pu', color: '#D63A7C', desc: 'Flyers, brochures and print layouts', phase: 5 },
  pdf:       { name: 'DigiCre8 PDF',       short: 'Pd', color: '#7A4FE0', desc: 'Read, merge and sign PDF files', phase: 5 }
};
const state = { tabs: [], active: null, settings: { theme: 'system', recent: [] }, nextId: 1, zoom: 100 };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const baseName = t => t.title.replace(/\.(html?|txt)$/i, '');

function newTab(app, extra = {}) {
  const tab = { id: state.nextId++, app, title: app === 'home' ? 'Home' : 'Untitled', path: null, dirty: false, html: null,
    ribbon: 'Home', size: 'A4', landscape: false, margin: 96, bg: '#ffffff', font: '', view: 'print', ...extra };
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
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* Generic dialog: fields -> values object, or null if cancelled. Pass ok:'' for an info-only dialog. */
function dialog({ title, fields = [], html = '', ok = 'OK', onBuild }) {
  return new Promise(resolve => {
    const dlg = $('#dlg'), body = $('#dlgBody');
    $('#dlgTitle').textContent = title;
    body.innerHTML = '';
    for (const f of fields) {
      const l = document.createElement('label');
      l.textContent = f.label;
      const i = document.createElement('input');
      i.type = f.type || 'text'; i.name = f.name; i.value = f.value ?? '';
      if (f.min) i.min = f.min; if (f.max) i.max = f.max;
      l.appendChild(i); body.appendChild(l);
    }
    if (html) body.insertAdjacentHTML('beforeend', html);
    $('#dlgOk').hidden = !ok; $('#dlgOk').textContent = ok || 'OK';
    $('#dlgCancel').textContent = ok ? 'Cancel' : 'Close';
    if (onBuild) onBuild(body, dlg);
    dlg.returnValue = '';
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return resolve(null);
      const out = {};
      $$('input[name]', body).forEach(i => { out[i.name] = i.value; });
      resolve(out);
    }, { once: true });
    dlg.showModal();
    const first = $('input', body); if (first) first.focus();
  });
}

/* ================= Theme ================= */
const THEMES = ['system', 'light', 'dark'];
function applyTheme() {
  const pref = state.settings.theme;
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = 'Theme: ' + pref[0].toUpperCase() + pref.slice(1);
}
$('#themeBtn').addEventListener('click', async () => {
  state.settings = await window.digicre8.setSettings({ theme: THEMES[(THEMES.indexOf(state.settings.theme) + 1) % 3] });
  applyTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ================= Tab bar ================= */
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

/* ================= Home ================= */
function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(ms).toLocaleDateString();
}
function fillRecent(rec) {
  rec.innerHTML = '';
  if (!state.settings.recent.length) {
    rec.innerHTML = '<div class="empty">No recent files yet. Files you open or save will show up here.</div>';
    return;
  }
  for (const r of state.settings.recent) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="title"></span><span class="when"></span>`;
    $('.title', b).textContent = r.name;
    $('.when', b).textContent = timeAgo(r.time);
    b.addEventListener('click', () => { closeBackstage(); openFileDialog(r.path); });
    rec.appendChild(b);
  }
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
  $('#openBtn').addEventListener('click', () => openFileDialog());
  fillRecent($('#recent'));
}
function openApp(key) {
  const a = APPS[key], home = activeTab();
  const title = a.ready ? 'Untitled document' : a.name;
  if (home && home.app === 'home') { Object.assign(home, { app: key, title, html: null, ribbon: 'Home', dirty: false }); render(); }
  else newTab(key, { title });
}
function renderSoon(tab) {
  const a = APPS[tab.app];
  view.innerHTML = `<section class="soon-view" style="--accent:${a.color}"><div>
    <div class="mono">${a.short}</div><h2>${a.name} is on the roadmap</h2>
    <p>This app arrives in phase ${a.phase}. Writer is ready to use today.</p>
    <button class="btn primary" id="toWriter">Open Writer</button></div></section>`;
  $('#toWriter').addEventListener('click', () => { tab.app = 'writer'; tab.title = 'Untitled document'; render(); });
}

/* ================= Writer: data ================= */
const PAGES = { A4: [794, 1123], Letter: [816, 1056], Legal: [816, 1344], A5: [559, 794] };
const PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'];
const ICON = {
  paste: 'M9 4h6v3H9z M7 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-1',
  table: 'M4 5h16v14H4z M4 10h16 M4 15h16 M10 5v14 M15 5v14',
  picture: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01',
  pagebreak: 'M5 4h14v6H5z M5 14h14v6H5z M3 12h2 M9 12h2 M13 12h2 M19 12h2',
  toc: 'M4 6h16 M4 10h12 M4 14h16 M4 18h10',
  find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16.5 16.5L21 21',
  check: 'M4 12l5 5L20 6',
  speaker: 'M4 9v6h4l5 4V5L8 9z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  count: 'M5 5h14 M5 9h14 M5 13h9 M16 17l2 2 3-3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3'
};
const svg = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

/* Ribbon item builders: B button, D disabled placeholder, SEL dropdown, COL colour picker */
const B = (label, cmd, o = {}) => ({ label, cmd, ...o });
const D = (label, o = {}) => ({ label, off: true, ...o });
const SEL = (cmd, label, opts, def) => ({ sel: cmd, label, opts, def });
const COL = (cmd, label, def, glyph) => ({ col: cmd, label, def, glyph });

const RIBBON = {
  Home: [
    ['Clipboard', [B('Paste', 'paste', { big: 1, ic: 'paste' }), B('Cut', 'cut'), B('Copy', 'copy'), D('Format Painter')]],
    ['Font', [SEL('fontName', 'Font', FONTS.map(f => [f, f]), 'Segoe UI'), SEL('fontSize', 'Font size', PT.map(p => [p, p]), 11),
      B('A▲', 'grow', { title: 'Increase font size' }), B('A▼', 'shrink', { title: 'Decrease font size' }),
      B('B', 'bold', { cls: 'b', st: 1, title: 'Bold (Ctrl+B)' }), B('I', 'italic', { cls: 'i', st: 1, title: 'Italic (Ctrl+I)' }),
      B('U', 'underline', { cls: 'u', st: 1, title: 'Underline (Ctrl+U)' }), B('abc', 'strikeThrough', { cls: 's', st: 1, title: 'Strikethrough' }),
      B('x₂', 'subscript', { st: 1, title: 'Subscript' }), B('x²', 'superscript', { st: 1, title: 'Superscript' }),
      COL('color', 'Font color', '#d62828', 'A'), COL('hilite', 'Text highlight color', '#ffe600', 'ab'),
      B('Clear', 'removeFormat', { title: 'Clear all formatting' })]],
    ['Paragraph', [B('• List', 'insertUnorderedList', { st: 1, title: 'Bullets' }), B('1. List', 'insertOrderedList', { st: 1, title: 'Numbering' }),
      B('Outdent', 'outdent'), B('Indent', 'indent'),
      B('Left', 'justifyLeft', { st: 1 }), B('Center', 'justifyCenter', { st: 1 }), B('Right', 'justifyRight', { st: 1 }), B('Justify', 'justifyFull', { st: 1 }),
      SEL('spacing', 'Line spacing', [['1.0', '1'], ['1.15', '1.15'], ['1.5', '1.5'], ['2.0', '2'], ['3.0', '3']], '1.15')]],
    ['Styles', [B('Normal', 'style', { arg: 'p' }), B('Title', 'style', { arg: 'h1.title' }), B('Heading 1', 'style', { arg: 'h1' }),
      B('Heading 2', 'style', { arg: 'h2' }), B('Heading 3', 'style', { arg: 'h3' }), B('Quote', 'style', { arg: 'blockquote' })]],
    ['Editing', [B('Find', 'find', { big: 1, ic: 'find' }), B('Replace', 'replace'), B('Select All', 'selectAll')]]
  ],
  Insert: [
    ['Pages', [D('Cover Page'), D('Blank Page'), B('Page Break', 'pagebreak', { big: 1, ic: 'pagebreak' })]],
    ['Tables', [B('Table', 'table', { big: 1, ic: 'table' })]],
    ['Illustrations', [B('Pictures', 'picture', { big: 1, ic: 'picture' }), D('Shapes'), D('Icons'), D('Charts'), D('SmartArt')]],
    ['Links', [B('Link', 'link', { big: 1, ic: 'link' }), B('Remove Link', 'unlink'), D('Bookmark')]],
    ['Header & Footer', [D('Header'), D('Footer'), D('Page Number')]],
    ['Text', [D('Text Box'), B('Date & Time', 'datetime'), B('Horizontal Line', 'insertHorizontalRule')]],
    ['Symbols', [D('Equation'), B('Symbol', 'symbol')]]
  ],
  Draw: [
    ['Drawing Tools', [D('Pen', { big: 1 }), D('Pencil', { big: 1 }), D('Highlighter', { big: 1 }), D('Eraser', { big: 1 })]],
    ['Convert', [D('Ink to Shape'), D('Ink to Math')]]
  ],
  Design: [
    ['Document Formatting', [D('Themes'), SEL('docFont', 'Document font', [['Default', ''], ...FONTS.map(f => [f, f])], '')]],
    ['Page Background', [D('Watermark'), COL('pagecolor', 'Page color', '#ffffff', 'Page color'), D('Page Borders')]]
  ],
  Layout: [
    ['Page Setup', [SEL('margin', 'Margins', [['Normal', 96], ['Narrow', 48], ['Moderate', 72], ['Wide', 144]], t => t.margin),
      SEL('orient', 'Orientation', [['Portrait', 'portrait'], ['Landscape', 'landscape']], t => t.landscape ? 'landscape' : 'portrait'),
      SEL('size', 'Size', Object.keys(PAGES).map(k => [k, k]), t => t.size), D('Columns'), D('Breaks')]],
    ['Paragraph', [D('Indent'), D('Spacing')]],
    ['Arrange', [D('Position'), D('Wrap Text')]]
  ],
  References: [
    ['Table of Contents', [B('Table of Contents', 'toc', { big: 1, ic: 'toc' }), D('Update Table')]],
    ['Footnotes', [D('Insert Footnote'), D('Insert Endnote')]],
    ['Citations & Bibliography', [D('Insert Citation'), D('Bibliography')]],
    ['Captions', [D('Insert Caption'), D('Table of Figures')]]
  ],
  Mailings: [
    ['Create', [D('Envelopes'), D('Labels')]],
    ['Start Mail Merge', [D('Start Mail Merge'), D('Select Recipients'), D('Edit Recipient List')]],
    ['Finish', [D('Finish & Merge')]]
  ],
  Review: [
    ['Proofing', [B('Spelling', 'spelling', { big: 1, ic: 'check' }), B('Word Count', 'wordcount', { big: 1, ic: 'count' })]],
    ['Speech', [B('Read Aloud', 'readaloud', { big: 1, ic: 'speaker' })]],
    ['Comments', [D('New Comment'), D('Delete'), D('Show Comments')]],
    ['Tracking', [D('Track Changes'), D('Accept'), D('Reject')]],
    ['Protect', [D('Restrict Editing')]]
  ],
  View: [
    ['Views', [B('Print Layout', 'viewmode', { arg: 'print' }), B('Web Layout', 'viewmode', { arg: 'web' }), B('Read Mode', 'viewmode', { arg: 'read' }), B('Focus', 'focus')]],
    ['Show', [D('Ruler'), D('Gridlines'), D('Navigation Pane')]],
    ['Zoom', [B('Zoom Out', 'zoom', { arg: -10 }), B('Zoom In', 'zoom', { arg: 10 }), B('100%', 'zoom', { arg: 0 })]]
  ],
  Help: [
    ['Help', [B('Keyboard Shortcuts', 'shortcuts'), B('About', 'about')]]
  ]
};

/* ================= Writer: selection helpers ================= */
let lastRange = null;
function restore() {
  const page = $('#page'); if (!page) return;
  page.focus();
  if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
}
function exec(c, v = null) {
  restore();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(c, false, v);
}
function blocks() {
  const s = getSelection(); if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  return [...$('#page').children].filter(el => r.intersectsNode(el));
}
function touch(tab) {
  const p = $('#page'); if (!p) return;
  tab.html = p.innerHTML;
  if (!tab.dirty) { tab.dirty = true; renderTabs(); }
  updateCounts();
}
function updateCounts() {
  const page = $('#page'); if (!page) return;
  const text = page.innerText.trim();
  $('#words').textContent = (text ? text.split(/\s+/).length : 0) + ' words';
  $('#chars').textContent = text.length + ' characters';
}
function applyZoom() {
  const w = $('#wrap'); if (!w) return;
  w.style.zoom = state.zoom / 100;
  $('#zoomLabel').textContent = state.zoom + '%';
}
function applyPage(tab) {
  const page = $('#page'); if (!page) return;
  const [w, h] = PAGES[tab.size], land = tab.landscape;
  page.style.width = (land ? h : w) + 'px';
  page.style.minHeight = (land ? w : h) + 'px';
  page.style.padding = tab.margin + 'px';
  page.style.background = tab.bg;
  page.style.fontFamily = tab.font || '';
  page.classList.toggle('web', tab.view === 'web');
  page.contentEditable = tab.view === 'read' ? 'false' : 'true';
  $('#pageinfo').textContent = `${tab.size} · ${land ? 'Landscape' : 'Portrait'}`;
  $('#pageStyle').textContent = `@page { size: ${tab.size} ${land ? 'landscape' : 'portrait'}; margin: ${tab.margin}px; }`;
}
function setSize(tab, pt) {
  restore();
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) return toast('Select some text first');
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, '7');
  $$('font[size="7"]', $('#page')).forEach(f => { f.removeAttribute('size'); f.style.fontSize = pt + 'pt'; });
  touch(tab);
}
function stepSize(tab, dir) {
  const n = getSelection().anchorNode; if (!n) return;
  const el = n.nodeType === 1 ? n : n.parentElement;
  const pt = parseFloat(getComputedStyle(el).fontSize) * 0.75;
  const next = dir > 0 ? PT.find(p => p > pt + 0.1) : [...PT].reverse().find(p => p < pt - 0.1);
  if (next) setSize(tab, next);
}

/* ================= Writer: commands ================= */
const H = {
  paste: async () => { restore(); await window.digicre8.paste(); },
  fontSize: (t, v) => setSize(t, +v),
  grow: t => stepSize(t, 1),
  shrink: t => stepSize(t, -1),
  color: (t, v) => exec('foreColor', v),
  hilite: (t, v) => exec('hiliteColor', v),
  spacing: (t, v) => { restore(); blocks().forEach(b => { b.style.lineHeight = v; }); touch(t); },
  style: (t, v) => { const [tag, cls] = v.split('.'); exec('formatBlock', tag); blocks().forEach(b => { b.className = cls || ''; }); touch(t); },
  find: () => openFind(false),
  replace: () => openFind(true),
  pagebreak: () => { restore(); document.execCommand('insertHTML', false, '<div class="pb" contenteditable="false"></div><p><br></p>'); },
  picture: () => $('#picInput').click(),
  datetime: () => { restore(); document.execCommand('insertText', false, new Date().toLocaleString()); },
  table: async () => {
    const v = await dialog({ title: 'Insert table', ok: 'Insert', fields: [
      { label: 'Columns', name: 'cols', type: 'number', value: 3, min: 1, max: 20 }, { label: 'Rows', name: 'rows', type: 'number', value: 3, min: 1, max: 50 }] });
    if (!v) return;
    const cols = Math.min(20, Math.max(1, +v.cols || 1)), rows = Math.min(50, Math.max(1, +v.rows || 1));
    restore();
    document.execCommand('insertHTML', false, '<table>' + ('<tr>' + '<td><br></td>'.repeat(cols) + '</tr>').repeat(rows) + '</table><p><br></p>');
  },
  link: async () => {
    const v = await dialog({ title: 'Insert link', ok: 'Insert', fields: [{ label: 'Address (https://…)', name: 'url' }] });
    if (!v || !v.url.trim()) return;
    if (!/^(https?:\/\/|mailto:)/i.test(v.url.trim())) return toast('Links must start with https://, http:// or mailto:');
    exec('createLink', v.url.trim());
  },
  symbol: async () => {
    const syms = '© ® ™ € £ ¥ ° ± × ÷ ≠ ≤ ≥ ∞ π Ω µ § ¶ † ‡ • … « » “ ” ‘ ’ – — ← → ↑ ↓ ✓ ★'.split(' ');
    let pick = null;
    await dialog({ title: 'Insert symbol', ok: '', html: `<div class="symgrid">${syms.map(s => `<button type="button" class="sym">${s}</button>`).join('')}</div>`,
      onBuild: (body, dlg) => $$('.sym', body).forEach(b => b.addEventListener('click', () => { pick = b.textContent; dlg.close('cancel'); })) });
    if (pick) { restore(); document.execCommand('insertText', false, pick); }
  },
  toc: () => {
    const hs = $$('h1,h2,h3', $('#page'));
    if (!hs.length) return toast('Add some headings first, then insert the table of contents');
    const html = '<div class="toc"><p><b>Table of Contents</b></p>' +
      hs.map(h => `<p style="margin-left:${(+h.tagName[1] - 1) * 20}px">${esc(h.textContent)}</p>`).join('') + '</div><p><br></p>';
    restore(); document.execCommand('insertHTML', false, html);
  },
  margin: (t, v) => { t.margin = +v; applyPage(t); },
  orient: (t, v) => { t.landscape = v === 'landscape'; applyPage(t); },
  size: (t, v) => { t.size = v; applyPage(t); },
  docFont: (t, v) => { t.font = v; applyPage(t); },
  pagecolor: (t, v) => { t.bg = v; applyPage(t); },
  spelling: t => { const p = $('#page'); p.spellcheck = !p.spellcheck; toast('Spell check ' + (p.spellcheck ? 'on' : 'off')); },
  wordcount: () => {
    const text = $('#page').innerText;
    const w = text.trim() ? text.trim().split(/\s+/).length : 0;
    const paras = $$('p,h1,h2,h3,li,blockquote', $('#page')).filter(e => e.textContent.trim()).length;
    dialog({ title: 'Word count', ok: '', html: `<dl class="info"><dt>Words</dt><dd>${w}</dd><dt>Characters (with spaces)</dt><dd>${text.trim().length}</dd>
      <dt>Characters (no spaces)</dt><dd>${text.replace(/\s/g, '').length}</dd><dt>Paragraphs</dt><dd>${paras}</dd></dl>` });
  },
  readaloud: () => {
    const synth = window.speechSynthesis;
    if (!synth) return toast('Read aloud is not available on this system');
    if (synth.speaking) { synth.cancel(); return toast('Stopped reading'); }
    const s = getSelection().toString().trim();
    const text = s || $('#page').innerText;
    if (text.trim()) { synth.speak(new SpeechSynthesisUtterance(text)); toast('Reading aloud…'); }
  },
  viewmode: (t, v) => { t.view = v; applyPage(t); },
  focus: () => { $('#ribbon').hidden = true; toast('Focus mode: press Esc to show the ribbon'); },
  zoom: (t, d) => { state.zoom = d === 0 ? 100 : Math.min(200, Math.max(50, state.zoom + d)); applyZoom(); },
  shortcuts: () => dialog({ title: 'Keyboard shortcuts', ok: '', html: `<dl class="info">
    <dt>Ctrl+N / T</dt><dd>New tab</dd><dt>Ctrl+O</dt><dd>Open</dd><dt>Ctrl+S</dt><dd>Save</dd><dt>Ctrl+Shift+S</dt><dd>Save as</dd>
    <dt>Ctrl+P</dt><dd>Print</dd><dt>Ctrl+F / H</dt><dd>Find / Replace</dd><dt>Ctrl+B / I / U</dt><dd>Bold / Italic / Underline</dd>
    <dt>Ctrl+Z / Y</dt><dd>Undo / Redo</dd><dt>Ctrl+W</dt><dd>Close tab</dd></dl>` }),
  about: () => dialog({ title: 'About DigiCre8 Office', ok: '', html: '<p>DigiCre8 Office, version 0.2.0.<br>A creative productivity suite.</p>' })
};
function run(cmd, tab, arg) {
  const f = H[cmd];
  if (f) return f(tab, arg);
  exec(cmd, arg);
}

/* ================= Writer: Find & Replace ================= */
function openFind(withReplace) {
  const fb = $('#findbar'); if (!fb) return;
  fb.hidden = false;
  const s = getSelection().toString();
  if (s && s.length < 80) $('#findIn').value = s;
  $(withReplace ? '#repIn' : '#findIn').focus();
}
function bindFind(tab) {
  const fi = $('#findIn'), ri = $('#repIn');
  const next = () => { if (fi.value && !window.find(fi.value, false, false, true)) toast('No results'); };
  $('#fNext').onclick = next;
  fi.addEventListener('keydown', e => { if (e.key === 'Enter') next(); });
  $('#fRep').onclick = () => {
    const sel = getSelection();
    if (fi.value && sel.toString().toLowerCase() === fi.value.toLowerCase() && $('#page').contains(sel.anchorNode)) {
      restore(); document.execCommand('insertText', false, ri.value);
    }
    next();
  };
  $('#fAll').onclick = () => {
    const q = fi.value; if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let n = 0;
    const w = document.createTreeWalker($('#page'), NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(t => { t.nodeValue = t.nodeValue.replace(re, () => { n++; return ri.value; }); });
    if (n) touch(tab);
    toast(n ? `Replaced ${n} item${n > 1 ? 's' : ''}` : 'No matches');
  };
  $('#fClose').onclick = () => { $('#findbar').hidden = true; };
}

/* ================= Writer: ribbon ================= */
function itemEl(it, tab) {
  if (it.sel) {
    const s = document.createElement('select');
    s.className = 'rsel'; s.title = it.label; s.setAttribute('aria-label', it.label);
    for (const [l, v] of it.opts) s.add(new Option(l, v));
    s.value = String(typeof it.def === 'function' ? it.def(tab) : it.def);
    s.addEventListener('change', () => run(it.sel, tab, s.value));
    return s;
  }
  if (it.col) {
    const l = document.createElement('label');
    l.className = 'rb colorbtn'; l.title = it.label;
    l.innerHTML = `<span class="cg" style="border-bottom-color:${it.def}">${it.glyph}</span><input type="color" value="${it.def}" aria-label="${it.label}">`;
    const inp = $('input', l);
    inp.addEventListener('input', () => { $('.cg', l).style.borderBottomColor = inp.value; run(it.col, tab, inp.value); });
    return l;
  }
  const b = document.createElement('button');
  b.className = 'rb' + (it.big ? ' big' : '') + (it.cls ? ' ' + it.cls : '');
  b.innerHTML = (it.ic ? svg(it.ic) : '') + `<span>${it.label}</span>`;
  if (it.title) b.title = it.title;
  if (it.off) { b.disabled = true; b.title = it.label + ' (coming in a later update)'; return b; }
  if (it.st) b.dataset.state = it.cmd;
  b.addEventListener('mousedown', e => e.preventDefault());
  b.addEventListener('click', () => run(it.cmd, tab, it.arg));
  return b;
}
function renderRibbon(tab) {
  const tabsEl = $('.ribbon-tabs'), body = $('.ribbon-body');
  tabsEl.innerHTML = ''; body.innerHTML = '';
  for (const [ic, t, c] of [['save', 'Save (Ctrl+S)', 'save'], ['undo', 'Undo (Ctrl+Z)', 'undo'], ['redo', 'Redo (Ctrl+Y)', 'redo']]) {
    const b = document.createElement('button');
    b.className = 'qat'; b.title = t; b.setAttribute('aria-label', t); b.innerHTML = svg(ic);
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => c === 'save' ? saveTab(tab, false) : run(c, tab));
    tabsEl.appendChild(b);
  }
  const file = document.createElement('button');
  file.className = 'ribbon-tab file'; file.textContent = 'File';
  file.addEventListener('click', () => showBackstage(tab));
  tabsEl.appendChild(file);
  for (const name of Object.keys(RIBBON)) {
    const b = document.createElement('button');
    b.className = 'ribbon-tab' + (name === tab.ribbon ? ' active' : '');
    b.textContent = name;
    b.addEventListener('click', () => { tab.ribbon = name; renderRibbon(tab); });
    tabsEl.appendChild(b);
  }
  for (const [gname, items] of RIBBON[tab.ribbon]) {
    const g = document.createElement('div'); g.className = 'group';
    const box = document.createElement('div'); box.className = 'group-items';
    items.forEach(it => box.appendChild(itemEl(it, tab)));
    g.appendChild(box);
    g.insertAdjacentHTML('beforeend', `<div class="group-name">${gname}</div>`);
    body.appendChild(g);
  }
  refreshState();
}
function refreshState() {
  $$('.rb[data-state]').forEach(b => { let on = false; try { on = document.queryCommandState(b.dataset.state); } catch (e) { /* ignore */ } b.classList.toggle('on', on); });
}
document.addEventListener('selectionchange', () => {
  const page = $('#page'); if (!page) return;
  const s = getSelection();
  if (s.rangeCount && page.contains(s.anchorNode)) { lastRange = s.getRangeAt(0).cloneRange(); refreshState(); }
});

function renderWriter(tab) {
  lastRange = null;
  view.innerHTML = `
    <div class="ribbon" id="ribbon" style="--accent:${APPS.writer.color}"><div class="ribbon-tabs" role="tablist"></div><div class="ribbon-body"></div></div>
    <div class="findbar" id="findbar" hidden>
      <input id="findIn" placeholder="Find" aria-label="Find"><input id="repIn" placeholder="Replace with" aria-label="Replace with">
      <button class="btn" id="fNext">Find next</button><button class="btn" id="fRep">Replace</button><button class="btn" id="fAll">Replace all</button>
      <button class="btn" id="fClose" aria-label="Close find">×</button>
    </div>
    <div class="canvas"><div class="page-wrap" id="wrap"><div class="page" id="page" contenteditable="true" spellcheck="true" aria-label="Document"></div></div></div>
    <footer class="status"><span id="words"></span><span id="chars"></span><span id="pageinfo"></span><span class="spacer"></span><span id="zoomLabel"></span></footer>
    <style id="pageStyle"></style>`;
  renderRibbon(tab);
  const page = $('#page');
  page.innerHTML = tab.html == null ? '<h1>Untitled document</h1><p>Start typing here.</p>' : tab.html;
  page.addEventListener('input', () => touch(tab));
  bindFind(tab);
  applyPage(tab); applyZoom(); updateCounts();
}

/* ================= Backstage (File menu) ================= */
const BS = [['info', 'Info'], ['new', 'New'], ['open', 'Open'], ['save', 'Save'], ['saveas', 'Save As'], ['print', 'Print'], ['share', 'Share'], ['export', 'Export'], ['close', 'Close'], ['options', 'Options']];
function closeBackstage() { const b = $('#backstage'); if (b) b.remove(); }
function showBackstage(tab, section = 'info') {
  closeBackstage();
  const el = document.createElement('div');
  el.id = 'backstage'; el.className = 'backstage';
  el.style.setProperty('--accent', APPS.writer.color);
  el.innerHTML = `<nav><button class="bs-back" aria-label="Back to document" title="Back (Esc)">←</button>${BS.map(([k, l]) => `<button class="bs-item" data-k="${k}">${l}</button>`).join('')}</nav><section class="bs-panel" id="bsPanel"></section>`;
  view.appendChild(el);
  $('.bs-back', el).addEventListener('click', closeBackstage);
  $$('.bs-item', el).forEach(b => b.addEventListener('click', () => bsGo(tab, b.dataset.k)));
  bsGo(tab, section);
}
async function exportPdf(tab) {
  closeBackstage();
  await new Promise(r => setTimeout(r, 150));
  const res = await window.digicre8.exportPdf({ suggestedName: baseName(tab) + '.pdf', size: tab.size, landscape: tab.landscape });
  if (res) toast('Created ' + res.name);
}
async function bsGo(tab, k) {
  const direct = {
    save: () => saveTab(tab, false), saveas: () => saveTab(tab, true),
    print: () => setTimeout(() => window.print(), 150), close: () => closeTab(tab.id)
  };
  if (direct[k]) { closeBackstage(); return direct[k](); }
  $$('.bs-item').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  const p = $('#bsPanel');
  const page = $('#page');
  if (k === 'info') {
    const text = page ? page.innerText.trim() : '';
    p.innerHTML = `<h2>Info</h2><dl class="info"><dt>Name</dt><dd>${esc(tab.title)}</dd><dt>Location</dt><dd>${tab.path ? esc(tab.path) : 'Not saved yet'}</dd>
      <dt>Words</dt><dd>${text ? text.split(/\s+/).length : 0}</dd><dt>Characters</dt><dd>${text.length}</dd>
      <dt>Page setup</dt><dd>${tab.size}, ${tab.landscape ? 'landscape' : 'portrait'}, ${tab.margin}px margins</dd></dl>`;
  } else if (k === 'new') {
    p.innerHTML = `<h2>New</h2><button class="tile" id="bsBlank" style="--accent:${APPS.writer.color}"><span class="mono">Wr</span><span><div class="name">Blank document</div><div class="desc">Start with an empty page</div></span></button>`;
    $('#bsBlank').addEventListener('click', () => { closeBackstage(); newTab('writer', { title: 'Untitled document' }); });
  } else if (k === 'open') {
    p.innerHTML = `<h2>Open</h2><button class="btn primary" id="bsBrowse">Browse for a file…</button><h3>Recent</h3><div class="recent" id="bsRecent"></div>`;
    $('#bsBrowse').addEventListener('click', () => { closeBackstage(); openFileDialog(); });
    fillRecent($('#bsRecent'));
  } else if (k === 'share') {
    p.innerHTML = `<h2>Share</h2><p class="muted">Sharing and co-authoring arrive in a later update. For now, use Export to create a PDF you can send.</p>`;
  } else if (k === 'export') {
    p.innerHTML = `<h2>Export</h2><div class="bs-actions">
      <button class="btn" id="exPdf"><b>Create PDF</b><br><span class="muted">Fixed layout, ready to share</span></button>
      <button class="btn" id="exTxt"><b>Plain text (.txt)</b><br><span class="muted">Text only, no formatting</span></button>
      <button class="btn" id="exHtml"><b>Web page (.html)</b><br><span class="muted">Keeps formatting and images</span></button></div>`;
    $('#exPdf').addEventListener('click', () => exportPdf(tab));
    $('#exHtml').addEventListener('click', () => { closeBackstage(); saveTab(tab, true); });
    $('#exTxt').addEventListener('click', async () => {
      const res = await window.digicre8.saveFile({ content: page.innerText, suggestedName: baseName(tab) + '.txt', saveAs: true, noRecent: true, filters: [{ name: 'Plain text', extensions: ['txt'] }] });
      if (res) { closeBackstage(); toast('Exported ' + res.name); }
    });
  } else if (k === 'options') {
    p.innerHTML = `<h2>Options</h2><label class="opt">Color theme<select id="optTheme" class="rsel">${THEMES.map(t => `<option value="${t}"${t === state.settings.theme ? ' selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>`;
    $('#optTheme').addEventListener('change', async e => { state.settings = await window.digicre8.setSettings({ theme: e.target.value }); applyTheme(); });
  }
}

/* ================= Files ================= */
async function openFileDialog(path) {
  const res = await window.digicre8.openFile(typeof path === 'string' ? path : undefined);
  if (!res) return;
  state.settings.recent = res.recent;
  let html;
  if (/\.html?$/i.test(res.name)) {
    const doc = new DOMParser().parseFromString(res.content, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(at => { if (/^on/i.test(at.name)) n.removeAttribute(at.name); }));
    html = doc.body.innerHTML;
  } else {
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
    `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(baseName(tab))}</title>\n<style>body{font-family:"Segoe UI",sans-serif;line-height:1.3;max-width:800px;margin:40px auto;padding:0 24px}table{border-collapse:collapse}td,th{border:1px solid #b9bdd0;padding:6px 10px}img{max-width:100%}</style></head>\n<body>\n${tab.html}\n</body></html>`;
  const res = await window.digicre8.saveFile({ path: tab.path, content, suggestedName: baseName(tab) + '.html', saveAs });
  if (!res) return;
  tab.path = res.path; tab.title = res.name; tab.dirty = false;
  state.settings.recent = res.recent;
  renderTabs();
  toast('Saved ' + res.name);
}

/* ================= Render & shortcuts ================= */
function render() {
  renderTabs();
  const tab = activeTab();
  if (!tab) return;
  if (tab.app === 'home') renderHome();
  else if (tab.app === 'writer') renderWriter(tab);
  else renderSoon(tab);
}

$('#picInput').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !/^image\//.test(f.type)) return;
  const r = new FileReader();
  r.onload = () => { if (activeTab() && activeTab().app === 'writer') exec('insertImage', r.result); };
  r.readAsDataURL(f);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const rb = $('#ribbon');
    if ($('#backstage')) closeBackstage();
    else if (rb && rb.hidden) rb.hidden = false;
    else if ($('#findbar') && !$('#findbar').hidden) $('#findbar').hidden = true;
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase(), tab = activeTab(), writer = tab && tab.app === 'writer';
  if (k === 't' || k === 'n') { e.preventDefault(); newTab('home'); }
  else if (k === 'w') { e.preventDefault(); if (tab) closeTab(tab.id); }
  else if (k === 'o') { e.preventDefault(); openFileDialog(); }
  else if (k === 's' && writer) { e.preventDefault(); saveTab(tab, e.shiftKey); }
  else if (k === 'p' && writer) { e.preventDefault(); window.print(); }
  else if (k === 'f' && writer) { e.preventDefault(); openFind(false); }
  else if (k === 'h' && writer) { e.preventDefault(); openFind(true); }
  else if (k === 'y' && writer) { e.preventDefault(); exec('redo'); }
  else if (k === 'tab') {
    e.preventDefault();
    const i = state.tabs.indexOf(tab);
    state.active = state.tabs[(i + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length].id;
    render();
  }
});
window.addEventListener('beforeunload', e => { if (state.tabs.some(t => t.dirty)) { e.preventDefault(); e.returnValue = ''; } });

(async function init() {
  state.settings = await window.digicre8.getSettings();
  applyTheme();
  newTab('home');
})();
