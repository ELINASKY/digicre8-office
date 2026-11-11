'use strict';
/* DigiCre8 Writer: extended features. Loaded after renderer.js and shares its globals. */

const isStr = v => typeof v === 'string';
const elOf = n => (n && n.nodeType === 1 ? n : n && n.parentElement);
const uid = () => Math.random().toString(36).slice(2, 9);
const CM = 37.795;
const HEX = /^#[0-9a-f]{6}$/i;
const markDirty = tab => { if (!tab.dirty) { tab.dirty = true; renderTabs(); } };
const putHtml = html => { restore(); document.execCommand('insertHTML', false, html); };
const PB = '<div class="pb" contenteditable="false"></div>';

function cleanHtml(html) {
  const d = new DOMParser().parseFromString(String(html), 'text/html');
  d.querySelectorAll('script,iframe,object,embed,style,link,meta,base,form').forEach(n => n.remove());
  d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
    if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
  }));
  return d.body.innerHTML;
}

/* ================= Saved document settings (stored in the .html file) ================= */
const META_KEYS = ['size', 'landscape', 'margin', 'bg', 'font', 'theme', 'cols', 'header', 'footer', 'hOn', 'fOn',
  'watermark', 'border', 'ink', 'comments', 'sources', 'recipients', 'restrict', 'restrictHash'];
function docMetaTag(tab) {
  const m = {};
  META_KEYS.forEach(k => { if (tab[k] !== undefined) m[k] = tab[k]; });
  return `<meta name="digicre8" content="${encodeURIComponent(JSON.stringify(m))}">`;
}
function readMeta(doc) {
  const out = {}, el = doc.querySelector('meta[name="digicre8"]');
  if (!el) return out;
  let m;
  try { m = JSON.parse(decodeURIComponent(el.getAttribute('content') || '')); } catch (e) { return out; }
  if (!m || typeof m !== 'object') return out;
  const n = Number.isFinite;
  if (PAGES[m.size]) out.size = m.size;
  if (typeof m.landscape === 'boolean') out.landscape = m.landscape;
  if (n(m.margin)) out.margin = Math.min(200, Math.max(0, m.margin));
  if (HEX.test(m.bg)) out.bg = m.bg;
  if (isStr(m.font) && (m.font === '' || FONTS.includes(m.font))) out.font = m.font;
  if (isStr(m.theme) && DOC_THEMES[m.theme]) out.theme = m.theme;
  if ([1, 2, 3].includes(m.cols)) out.cols = m.cols;
  if (isStr(m.header)) out.header = cleanHtml(m.header);
  if (isStr(m.footer)) out.footer = cleanHtml(m.footer);
  if (typeof m.hOn === 'boolean') out.hOn = m.hOn;
  if (typeof m.fOn === 'boolean') out.fOn = m.fOn;
  if (m.watermark && isStr(m.watermark.text) && HEX.test(m.watermark.color)) out.watermark = { text: m.watermark.text.slice(0, 40), color: m.watermark.color };
  if (['none', 'box', 'double', 'shadow'].includes(m.border)) out.border = m.border;
  if (Array.isArray(m.ink)) {
    out.ink = m.ink.filter(s => s && ['pen', 'pencil', 'highlighter'].includes(s.t) && HEX.test(s.c) && n(s.w) && n(s.o) &&
      Array.isArray(s.p) && s.p.every(q => Array.isArray(q) && q.length === 2 && q.every(n))).slice(0, 3000);
  }
  if (Array.isArray(m.comments)) {
    out.comments = m.comments.filter(c => c && isStr(c.id) && /^\w+$/.test(c.id) && isStr(c.text))
      .map(c => ({ id: c.id, text: c.text.slice(0, 2000), author: isStr(c.author) ? c.author.slice(0, 60) : '', time: n(c.time) ? c.time : 0 }));
  }
  if (Array.isArray(m.sources)) {
    out.sources = m.sources.filter(x => x && [x.id, x.author, x.year, x.title, x.publisher].every(isStr) && /^\w+$/.test(x.id))
      .map(x => ({ id: x.id, author: x.author.slice(0, 120), year: x.year.slice(0, 12), title: x.title.slice(0, 300), publisher: x.publisher.slice(0, 120) }));
  }
  if (m.recipients && Array.isArray(m.recipients.fields) && Array.isArray(m.recipients.rows)) {
    out.recipients = { fields: m.recipients.fields.map(String).slice(0, 50),
      rows: m.recipients.rows.slice(0, 5000).map(r => (Array.isArray(r) ? r.map(String).slice(0, 50) : [])) };
  }
  if (['none', 'readonly', 'tracked', 'comments'].includes(m.restrict)) out.restrict = m.restrict;
  if (isStr(m.restrictHash) && /^[0-9a-f]{64}$/.test(m.restrictHash)) out.restrictHash = m.restrictHash;
  return out;
}

/* ================= Page extras: themes, columns, header/footer, watermark, border, ruler ================= */
function plusApplyPage(tab) {
  const page = $('#page'); if (!page) return;
  const th = DOC_THEMES[tab.theme] || {};
  page.style.setProperty('--hc', th.hc || '');
  page.style.setProperty('--hf', th.hf || '');
  page.style.fontFamily = tab.font || th.font || '';
  page.style.columnCount = tab.cols > 1 ? tab.cols : '';
  page.style.columnGap = tab.cols > 1 ? '36px' : '';
  page.classList.toggle('grid', !!tab.gridOn);
  const ro = tab.view === 'read' || tab.preview || tab.restrict === 'readonly' || tab.restrict === 'comments';
  page.contentEditable = ro ? 'false' : 'true';
  if (tab.restrict === 'tracked') tab.track = true;
  $('#sheet').style.setProperty('--m', tab.margin + 'px');
  const hh = $('#hfHead'), ff = $('#hfFoot'), off = Math.max(8, tab.margin / 3 - 6) + 'px';
  hh.hidden = !tab.hOn; ff.hidden = !tab.fOn;
  [hh, ff].forEach(e => { e.style.left = tab.margin + 'px'; e.style.right = tab.margin + 'px'; e.contentEditable = ro ? 'false' : 'true'; });
  hh.style.top = off; ff.style.bottom = off;
  const wm = $('#wm');
  wm.hidden = !tab.watermark;
  if (tab.watermark) { wm.innerHTML = '<span></span>'; wm.firstChild.textContent = tab.watermark.text; wm.style.color = tab.watermark.color; }
  const pb = $('#pgBorder');
  pb.hidden = !tab.border || tab.border === 'none';
  pb.className = 'pgborder pgb-' + (tab.border || 'none');
  $('#navPane').hidden = !tab.navOn;
  $('#cmPane').hidden = !tab.cmOn;
  const bar = $('#restrictBar');
  bar.hidden = !tab.restrict || tab.restrict === 'none';
  if (!bar.hidden) {
    const label = { readonly: 'No changes allowed', comments: 'Comments only', tracked: 'Tracked changes only' }[tab.restrict];
    bar.innerHTML = `<span>This document is protected: ${label}.</span><button class="btn" id="stopRestrict">Stop protection</button>`;
    $('#stopRestrict').onclick = () => stopRestrict(tab);
  }
  renderRuler(tab);
  const ink = $('#ink'); if (ink) ink.classList.toggle('active', !!tab.tool);
}

function renderRuler(tab) {
  const r = $('#ruler'); r.hidden = !tab.rulerOn;
  if (r.hidden) return;
  const [w0, h0] = PAGES[tab.size], W = tab.landscape ? h0 : w0;
  r.style.width = W + 'px'; r.innerHTML = '';
  for (let i = 1; i < W / CM; i++) {
    const t = document.createElement('span');
    t.className = 'tick'; t.style.left = (i * CM) + 'px'; t.textContent = i;
    r.appendChild(t);
  }
  const mk = side => {
    const z = document.createElement('div'), hd = document.createElement('div');
    z.className = 'rm r' + side; z.style.width = tab.margin + 'px';
    hd.className = 'rh'; hd.title = 'Drag to change the margin';
    z.appendChild(hd); r.appendChild(z);
    hd.addEventListener('pointerdown', e => {
      hd.setPointerCapture(e.pointerId);
      const rect = r.getBoundingClientRect(), zoom = state.zoom / 100;
      const move = ev => {
        const x = (ev.clientX - rect.left) / zoom;
        const m = Math.round(Math.min(W / 2 - 120, Math.max(0, side === 'l' ? x : W - x)) / 4) * 4;
        tab.margin = m; $('#page').style.padding = m + 'px';
        $$('.rm', r).forEach(q => { q.style.width = m + 'px'; });
      };
      const up = () => { hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); markDirty(tab); applyPage(tab); };
      hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up);
    });
  };
  mk('l'); mk('r');
}

/* ================= Init for each Writer view ================= */
let selObj = null, navTimer = null;
function plusInit(tab) {
  const page = $('#page'), hh = $('#hfHead'), ff = $('#hfFoot');
  hh.innerHTML = tab.header || ''; ff.innerHTML = tab.footer || '';
  hh.addEventListener('input', () => { tab.header = hh.innerHTML; markDirty(tab); });
  ff.addEventListener('input', () => { tab.footer = ff.innerHTML; markDirty(tab); });
  page.addEventListener('click', e => { pickObj(e); followLink(e); });
  page.addEventListener('mouseup', () => { if (tab.painter && !getSelection().isCollapsed) applyPainter(tab); });
  tab.preview = false;
  trackInit(tab, page);
  inkInit(tab);
  navUpdate(tab); cmRender(tab);
}
function plusTouch(tab) {
  const page = $('#page'); if (!page) return;
  $$('img:not(.obj)', page).forEach(i => i.classList.add('obj'));
  if (page.querySelector('sup.fn, .notes')) rebuildNotes();
  clearTimeout(navTimer);
  navTimer = setTimeout(() => { navUpdate(tab); cmRender(tab); }, 400);
}
function plusBeforeSave(tab) {
  const was = tab.preview;
  if (was) { tab.preview = false; previewApply(tab); }
  $$('.obj.sel').forEach(o => o.classList.remove('sel')); selObj = null;
  return () => { if (was) { tab.preview = true; previewApply(tab); } };
}

/* ================= Objects: select, position, wrap, links ================= */
function pickObj(e) {
  $$('.obj.sel').forEach(x => x.classList.remove('sel'));
  selObj = e.target.closest ? e.target.closest('.obj') : null;
  if (selObj) selObj.classList.add('sel');
}
function followLink(e) {
  const a = e.target.closest && e.target.closest('a');
  if (!a || !e.ctrlKey) return;
  e.preventDefault();
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#')) {
    const t = document.getElementById(href.slice(1));
    if (t && $('#page').contains(t)) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); else toast('Bookmark not found');
  } else window.digicre8.openExternal(href);
}
function layoutObj(o) {
  const pos = o.dataset.pos || 'inline', wrap = o.dataset.wrap || 'inline';
  Object.assign(o.style, { float: '', margin: '', display: '' });
  if (wrap === 'square') {
    o.style.margin = '4px 14px';
    if (pos === 'center') { o.style.display = 'block'; o.style.margin = '8px auto'; } else o.style.float = pos === 'inline' ? 'left' : pos;
  } else if (wrap === 'block') {
    o.style.display = 'block';
    o.style.margin = pos === 'right' ? '8px 0 8px auto' : pos === 'left' || pos === 'inline' ? '8px auto 8px 0' : '8px auto';
  }
}

/* ================= Footnotes and endnotes ================= */
function rebuildNotes() {
  const page = $('#page');
  const roman = n => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'][n - 1] || String(n);
  let f = 0, e = 0; const foot = [], end = [];
  $$('sup.fn', page).forEach(s => {
    const isF = s.dataset.k === 'f', n = isF ? ++f : ++e, label = isF ? String(n) : roman(n);
    if (s.textContent !== label) s.textContent = label;
    (isF ? foot : end).push([label, s.dataset.text || '']);
  });
  const block = (cls, title, list) => list.length
    ? `<div class="notes ${cls}" contenteditable="false"><hr><p class="nt">${title}</p>${list.map(([l, t]) => `<p><sup>${esc(l)}</sup> ${esc(t)}</p>`).join('')}</div>` : '';
  const tmp = document.createElement('div');
  tmp.innerHTML = block('footnotes', 'Footnotes', foot) + block('endnotes', 'Endnotes', end);
  if (tmp.innerHTML === $$('.notes', page).map(n => n.outerHTML).join('')) return;
  $$('.notes', page).forEach(n => n.remove());
  page.insertAdjacentHTML('beforeend', tmp.innerHTML);
}
async function addNote(tab, k) {
  const v = await dialog({ title: k === 'f' ? 'Insert footnote' : 'Insert endnote', ok: 'Insert',
    fields: [{ label: 'Note text', name: 'text', type: 'textarea', rows: 3 }] });
  if (!v || !v.text.trim()) return;
  putHtml(`<sup class="fn" data-k="${k}" data-text="${esc(v.text.trim())}" contenteditable="false">0</sup>`);
}

/* ================= Table of contents, captions ================= */
const headingsHtml = () => $$('h1,h2,h3', $('#page')).filter(h => !h.closest('.toc'))
  .map(h => `<p style="margin-left:${(+h.tagName[1] - 1) * 20}px">${esc(h.textContent)}</p>`).join('');
function renumberCaptions() {
  const c = {};
  $$('p.caption').forEach(p => { const l = p.dataset.l || 'Figure'; c[l] = (c[l] || 0) + 1; const b = p.querySelector('b'); if (b) b.textContent = `${l} ${c[l]}`; });
}

/* ================= Charts, SmartArt, shapes, icons, equations ================= */
const PALETTE = ['#4F6BF2', '#12A37A', '#F2701B', '#D63A7C', '#7A4FE0', '#E0B000', '#2BA3D6', '#8A8F9C'];
function chartSvg(type, title, rows) {
  const W = 480, Hh = 300, pad = 46, max = Math.max(...rows.map(r => r.v), 1);
  const fmt = v => String(Math.round(v * 100) / 100);
  let body = '';
  if (type === 'pie') {
    const total = rows.reduce((a, r) => a + r.v, 0) || 1, cx = 150, cy = 170, R = 100;
    let a0 = -Math.PI / 2;
    rows.forEach((r, i) => {
      const a1 = a0 + (r.v / total) * Math.PI * 2, c = PALETTE[i % 8];
      if (rows.length === 1) body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c}"/>`;
      else body += `<path d="M${cx} ${cy}L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}z" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
      body += `<rect x="290" y="${64 + i * 22}" width="12" height="12" rx="2" fill="${c}"/><text x="308" y="${74 + i * 22}" fill="#333">${esc(r.l.slice(0, 18))} (${fmt(r.v)})</text>`;
      a0 = a1;
    });
  } else {
    const ph = Hh - pad * 2 - 10, bw = (W - pad * 2) / rows.length;
    body += `<path d="M${pad} ${Hh - pad}H${W - pad} M${pad} ${Hh - pad}V${pad}" stroke="#999" fill="none"/>`;
    const pts = rows.map((r, i) => [pad + i * bw + bw / 2, Hh - pad - (r.v / max) * ph]);
    if (type === 'line') {
      body += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${PALETTE[0]}" stroke-width="2.5"/>`;
      pts.forEach(p => { body += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${PALETTE[0]}"/>`; });
    } else {
      rows.forEach((r, i) => { const h = (r.v / max) * ph; body += `<rect x="${pad + i * bw + bw * 0.15}" y="${Hh - pad - h}" width="${bw * 0.7}" height="${h}" rx="2" fill="${PALETTE[i % 8]}"/>`; });
    }
    rows.forEach((r, i) => {
      body += `<text x="${pad + i * bw + bw / 2}" y="${Hh - pad + 16}" text-anchor="middle" fill="#333">${esc(r.l.slice(0, 10))}</text>`;
      body += `<text x="${pts[i][0]}" y="${pts[i][1] - 6}" text-anchor="middle" fill="#333">${fmt(r.v)}</text>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI,Arial,sans-serif" font-size="12"><text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="600" fill="#1b1b1f">${esc(title)}</text>${body}</svg>`;
}
const SHAPES = {
  Rectangle: '<rect x="2" y="2" width="96" height="96"/>', 'Rounded rectangle': '<rect x="2" y="2" width="96" height="96" rx="16"/>',
  Ellipse: '<ellipse cx="50" cy="50" rx="48" ry="48"/>', Triangle: '<polygon points="50,3 97,97 3,97"/>',
  Diamond: '<polygon points="50,2 98,50 50,98 2,50"/>', Star: '<polygon points="50,3 61,38 98,38 68,60 79,96 50,74 21,96 32,60 2,38 39,38"/>',
  Arrow: '<polygon points="2,35 62,35 62,10 98,50 62,90 62,65 2,65"/>', Line: '<line x1="2" y1="98" x2="98" y2="2"/>'
};
const ICONS = {
  Heart: 'M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z', Mail: ICON.mail, Star: 'M12 3l2.800 5.800 6.200.9-4.500 4.400 1 6.200L12 17.400 6.500 20.300l1-6.200L3 9.700l6.200-.9z',
  Home: 'M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6', User: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  Phone: 'M6 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  Globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18', Clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  Camera: 'M4 8h4l2-3h4l2 3h4v11H4z M12 17a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z', Lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  Pin: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', Check: ICON.check, Chart: ICON.chart, Link: ICON.link
};
const EQS = [
  ['Fraction', '<span class="eq"><span class="frac"><span>a</span><span>b</span></span></span>'],
  ['Power', '<span class="eq">x<sup>2</sup></span>'], ['Square root', '<span class="eq">√<span class="over">x</span></span>'],
  ['Sum', '<span class="eq">∑<sub>i=1</sub><sup>n</sup> x<sub>i</sub></span>'], ['Integral', '<span class="eq">∫<sub>a</sub><sup>b</sup> f(x) dx</span>'],
  ['Quadratic', '<span class="eq">x = <span class="frac"><span>−b ± √<span class="over">b²−4ac</span></span><span>2a</span></span></span>'],
  ['Pythagoras', '<span class="eq">a² + b² = c²</span>'], ['Euler', '<span class="eq">e<sup>iπ</sup> + 1 = 0</span>'],
  ['Circle area', '<span class="eq">A = πr²</span>'], ['Limit', '<span class="eq">lim<sub>x→∞</sub> f(x)</span>']
];
async function gallery(title, html, fields) {
  let pick = null;
  await dialog({ title, ok: '', fields: fields || [], html: `<div class="gallery">${html}</div>`,
    onBuild: (body, dlg) => $$('.gl', body).forEach(b => b.addEventListener('click', () => {
      const inp = $('input[type=color]', body);
      pick = { key: b.dataset.k, color: inp ? inp.value : '#4F6BF2' }; dlg.close('cancel');
    })) });
  return pick;
}

/* ================= Mail merge helpers ================= */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const recipientsToCSV = r => [r.fields, ...r.rows].map(row => row.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
function setRecipients(tab, text) {
  const rows = parseCSV(text);
  const fields = rows.length ? rows[0].map(f => f.trim()).filter(Boolean) : [];
  if (rows.length < 2 || !fields.length) { toast('Add a header row and at least one recipient'); return false; }
  tab.recipients = { fields, rows: rows.slice(1, 5001).map(r => fields.map((_, i) => r[i] ?? '')) };
  tab.rec = 0; markDirty(tab); toast(`${tab.recipients.rows.length} recipients loaded`);
  return true;
}
const recObj = (tab, i) => { const o = {}; tab.recipients.fields.forEach((f, j) => { o[f] = (tab.recipients.rows[i] || [])[j] ?? ''; }); return o; };
const fillTpl = (tpl, rec) => esc(tpl).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => esc(rec[k] ?? '')).replace(/\n/g, '<br>');
function previewApply(tab) {
  const rec = tab.recipients ? recObj(tab, tab.rec || 0) : {};
  $$('.mf', $('#page')).forEach(s => { s.textContent = tab.preview ? (rec[s.dataset.f] ?? '') : `«${s.dataset.f}»`; });
}
const LABEL_SHEETS = {
  'A4 · 3 × 8': { size: 'A4', cols: 3, rows: 8 }, 'Letter · 3 × 10': { size: 'Letter', cols: 3, rows: 10 }, 'A4 · 2 × 7': { size: 'A4', cols: 2, rows: 7 }
};

/* ================= Comments ================= */
function cmRender(tab) {
  const pane = $('#cmPane'); if (!pane) return;
  pane.hidden = !tab.cmOn;
  if (!tab.cmOn) return;
  const page = $('#page');
  pane.innerHTML = '<h4>Comments</h4>';
  const list = (tab.comments || []).filter(c => page.querySelector(`.cm[data-id="${c.id}"]`));
  if (!list.length) pane.insertAdjacentHTML('beforeend', '<p class="muted">No comments yet. Select text, then choose New Comment.</p>');
  list.forEach(c => {
    const card = document.createElement('div'); card.className = 'cm-card';
    card.innerHTML = '<b></b><small></small><p></p><button class="btn">Delete</button>';
    $('b', card).textContent = c.author || 'You';
    $('small', card).textContent = c.time ? new Date(c.time).toLocaleString() : '';
    $('p', card).textContent = c.text;
    card.addEventListener('click', ev => {
      if (ev.target.tagName === 'BUTTON') { removeComment(tab, c.id); return; }
      const sp = page.querySelector(`.cm[data-id="${c.id}"]`);
      if (sp) { sp.scrollIntoView({ block: 'center', behavior: 'smooth' }); sp.classList.add('flash'); setTimeout(() => sp.classList.remove('flash'), 1200); }
    });
    pane.appendChild(card);
  });
}
function removeComment(tab, id) {
  const sp = $('#page').querySelector(`.cm[data-id="${id}"]`);
  if (sp) sp.replaceWith(...sp.childNodes);
  tab.comments = (tab.comments || []).filter(c => c.id !== id);
  touch(tab); cmRender(tab);
}

/* ================= Track changes ================= */
function trackInit(tab, page) {
  const wrapDel = (r) => {
    const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) { if (r.intersectsNode(w.currentNode) && !w.currentNode.parentElement.closest('del.tc')) nodes.push(w.currentNode); }
    let last = null;
    nodes.forEach(n => {
      let s = 0, e = n.length;
      if (n === r.startContainer) s = r.startOffset;
      if (n === r.endContainer) e = r.endOffset;
      if (e <= s) return;
      const mid = n.splitText(s); mid.splitText(e - s);
      const del = document.createElement('del');
      del.className = 'tc'; del.title = 'Deleted by You, ' + new Date().toLocaleString();
      mid.replaceWith(del); del.appendChild(mid); last = del;
    });
    return last;
  };
  const typeIns = (r, text) => {
    const ins = document.createElement('ins');
    ins.className = 'tc'; ins.title = 'Inserted by You, ' + new Date().toLocaleString();
    ins.textContent = text; r.insertNode(ins);
    const nr = document.createRange(); nr.selectNodeContents(ins); nr.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(nr);
  };
  page.addEventListener('beforeinput', e => {
    if (!tab.track) return;
    const t = e.inputType, sel = getSelection();
    if (t === 'insertText' && e.data && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      if (!r.collapsed) {
        e.preventDefault();
        const del = wrapDel(r.cloneRange());
        if (del) { const nr = document.createRange(); nr.setStartAfter(del); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); }
        typeIns(sel.getRangeAt(0), e.data);
        touch(tab); return;
      }
      if (elOf(r.startContainer).closest('ins.tc')) return;
      e.preventDefault(); typeIns(r, e.data); touch(tab);
    } else if (t.startsWith('delete') && e.getTargetRanges) {
      const tr = e.getTargetRanges()[0]; if (!tr) return;
      const r = document.createRange();
      r.setStart(tr.startContainer, tr.startOffset); r.setEnd(tr.endContainer, tr.endOffset);
      if (r.collapsed || !r.toString().length) return;
      const ins = elOf(r.commonAncestorContainer).closest('ins.tc');
      if (ins && ins.contains(r.startContainer) && ins.contains(r.endContainer)) return;
      e.preventDefault();
      const del = wrapDel(r);
      if (del) {
        const nr = document.createRange();
        if (t.includes('Backward')) nr.setStartBefore(del); else nr.setStartAfter(del);
        nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); touch(tab);
      }
    }
  });
}
function resolveChanges(tab, accept, all) {
  restore();
  const page = $('#page'), every = $$('ins.tc, del.tc', page);
  let list = every;
  if (!all) {
    const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
    list = r ? every.filter(c => r.intersectsNode(c)) : [];
    if (!list.length && r) { const n = elOf(s.anchorNode).closest('ins.tc, del.tc'); if (n) list = [n]; }
  }
  if (!list.length) return toast(all ? 'No tracked changes' : 'Place the cursor in a tracked change');
  list.forEach(c => { if ((c.tagName === 'INS') === accept) c.replaceWith(...c.childNodes); else c.remove(); });
  touch(tab);
}

/* ================= Ink (drawing) ================= */
const INK = { pen: { w: 2.2, o: 1, c: '#1f2a44' }, pencil: { w: 1.2, o: 0.75, c: '#555555' }, highlighter: { w: 14, o: 0.35, c: '#ffe600' } };
const pathD = p => 'M' + p.map(q => q[0] + ' ' + q[1]).join('L') + (p.length === 1 ? 'l0.1 0' : '');
function inkRender(tab) {
  $('#ink').innerHTML = (tab.ink || []).map(s => `<path d="${pathD(s.p)}" stroke="${s.c}" stroke-width="${s.w}" stroke-opacity="${s.o}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}
function inkInit(tab) {
  const svg = $('#ink'); tab.ink = tab.ink || [];
  inkRender(tab);
  let cur = null;
  const pt = e => { const r = svg.getBoundingClientRect(), z = state.zoom / 100; return [Math.round((e.clientX - r.left) / z * 10) / 10, Math.round((e.clientY - r.top) / z * 10) / 10]; };
  const erase = p => {
    const keep = tab.ink.filter(s => !s.p.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 10));
    if (keep.length !== tab.ink.length) { tab.ink = keep; inkRender(tab); markDirty(tab); }
  };
  svg.addEventListener('pointerdown', e => {
    if (!tab.tool) return;
    svg.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tab.tool === 'eraser') { cur = 'erase'; erase(p); return; }
    const T = INK[tab.tool];
    cur = { t: tab.tool, c: tab.inkColor || T.c, w: Math.round(T.w * (tab.inkS || 1) * 10) / 10, o: T.o, p: [p] };
    tab.ink.push(cur); inkRender(tab);
  });
  svg.addEventListener('pointermove', e => {
    if (!cur) return;
    const p = pt(e);
    if (cur === 'erase') return erase(p);
    const l = cur.p[cur.p.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 1.5) return;
    cur.p.push(p);
    const last = svg.lastElementChild; if (last) last.setAttribute('d', pathD(cur.p));
  });
  const end = () => { if (cur && cur !== 'erase') markDirty(tab); cur = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

/* ================= Navigation pane ================= */
function navUpdate(tab) {
  const nav = $('#navPane'); if (!nav || nav.hidden) return;
  const hs = $$('h1,h2,h3', $('#page')).filter(h => !h.closest('.toc'));
  nav.innerHTML = '<h4>Navigation</h4>' + (hs.length ? '' : '<p class="muted">Headings you add will appear here.</p>');
  hs.forEach(h => {
    const b = document.createElement('button');
    b.className = 'nav-item'; b.textContent = h.textContent.trim() || '(empty heading)';
    b.style.paddingLeft = (10 + (+h.tagName[1] - 1) * 14) + 'px';
    b.addEventListener('click', () => h.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    nav.appendChild(b);
  });
}

/* ================= Protection ================= */
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function stopRestrict(tab) {
  if (tab.restrictHash) {
    const v = await dialog({ title: 'Stop protection', ok: 'OK', fields: [{ label: 'Password', name: 'pw', type: 'password' }] });
    if (!v) return;
    if (await sha(v.pw) !== tab.restrictHash) return toast('Incorrect password');
  }
  tab.restrict = 'none'; tab.restrictHash = undefined;
  markDirty(tab); applyPage(tab); refreshState();
}

/* ================= Format painter ================= */
const toHex = c => { const m = c.match(/\d+/g) || [0, 0, 0]; return '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join(''); };
function applyPainter(tab) {
  const f = tab.painter; tab.painter = null; $('#page').classList.remove('painting');
  const dc = (c, v) => document.execCommand(c, false, v);
  dc('styleWithCSS', true); dc('foreColor', f.color); dc('fontName', f.family);
  [['bold', f.bold], ['italic', f.italic], ['underline', f.underline], ['strikeThrough', f.strike]].forEach(([c, want]) => { if (document.queryCommandState(c) !== want) dc(c); });
  setSize(tab, f.pt, true); touch(tab); refreshState();
}

/* ================= Commands ================= */
const applyBlocks = (tab, fn) => { restore(); blocks().forEach(fn); touch(tab); };
const toggle = (tab, key) => { tab[key] = !tab[key]; applyPage(tab); refreshState(); };

Object.assign(H, {
  /* Home */
  painter: tab => {
    if (tab.painter) { tab.painter = null; $('#page').classList.remove('painting'); refreshState(); return toast('Format painter off'); }
    const el = elOf(getSelection().anchorNode);
    if (!el || !$('#page').contains(el)) return toast('Click in the text you want to copy formatting from');
    const cs = getComputedStyle(el);
    tab.painter = { color: toHex(cs.color), family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), pt: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
      bold: +cs.fontWeight >= 600, italic: cs.fontStyle === 'italic', underline: (cs.textDecorationLine || '').includes('underline'), strike: (cs.textDecorationLine || '').includes('line-through') };
    $('#page').classList.add('painting'); refreshState(); toast('Now select the text to format');
  },

  /* Insert */
  cover: async tab => {
    const v = await dialog({ title: 'Cover page', ok: 'Insert', fields: [
      { label: 'Title', name: 'title', value: 'Document title' }, { label: 'Subtitle', name: 'sub', value: 'Subtitle' }, { label: 'Author', name: 'by' },
      { label: 'Style', name: 'style', type: 'select', opts: [['Accent bar', 'bar'], ['Centered', 'center'], ['Minimal', 'min']] }] });
    if (!v) return;
    $('#page').insertAdjacentHTML('afterbegin', `<div class="cover cv-${v.style}"><h1 class="title">${esc(v.title)}</h1><p class="subtitle">${esc(v.sub)}</p><p>${esc(v.by)}${v.by ? ' · ' : ''}${new Date().toLocaleDateString()}</p></div>${PB}`);
    touch(tab);
  },
  blankpage: () => putHtml(`${PB}<p><br></p>${PB}<p><br></p>`),
  shapes: async tab => {
    const pick = await gallery('Insert shape', Object.entries(SHAPES).map(([n, s]) =>
      `<button type="button" class="gl" data-k="${n}" title="${n}"><svg viewBox="0 0 100 100" width="40" height="40" fill="currentColor" stroke="currentColor" stroke-width="3">${s}</svg></button>`).join(''),
      [{ label: 'Color', name: 'fill', type: 'color', value: '#4F6BF2' }]);
    if (!pick) return;
    const line = pick.key === 'Line';
    putHtml(`<span class="obj shape" contenteditable="false" style="width:${line ? 160 : 110}px;height:${line ? 60 : 110}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" fill="${line ? 'none' : pick.color}" stroke="${line ? pick.color : '#1b1b1f'}" stroke-width="${line ? 4 : 1.5}" stroke-linejoin="round">${SHAPES[pick.key]}</svg></span>`);
  },
  icons: async () => {
    const pick = await gallery('Insert icon', Object.entries(ICONS).map(([n, d]) =>
      `<button type="button" class="gl" data-k="${n}" title="${n}"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></button>`).join(''),
      [{ label: 'Color', name: 'c', type: 'color', value: '#4F6BF2' }]);
    if (!pick) return;
    putHtml(`<span class="obj icon" contenteditable="false" style="width:48px;height:48px"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${pick.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[pick.key]}"/></svg></span>`);
  },
  chart: async () => {
    const v = await dialog({ title: 'Insert chart', ok: 'Insert', fields: [
      { label: 'Chart type', name: 'type', type: 'select', opts: [['Column', 'bar'], ['Line', 'line'], ['Pie', 'pie']] },
      { label: 'Title', name: 'title', value: 'Quarterly results' },
      { label: 'Data (one "Label, value" per line)', name: 'data', type: 'textarea', rows: 6, value: 'Q1, 12\nQ2, 19\nQ3, 8\nQ4, 15' }] });
    if (!v) return;
    const rows = v.data.split('\n').map(l => { const i = l.lastIndexOf(','); return { l: l.slice(0, i).trim(), v: parseFloat(l.slice(i + 1)) }; })
      .filter(r => r.l && Number.isFinite(r.v) && r.v >= 0).slice(0, 24);
    if (!rows.length) return toast('Enter at least one line like: Q1, 12');
    putHtml(`<span class="obj chart" contenteditable="false" style="width:480px;height:300px">${chartSvg(v.type, v.title, rows)}</span>`);
  },
  smartart: async () => {
    const v = await dialog({ title: 'Insert SmartArt', ok: 'Insert', fields: [
      { label: 'Layout', name: 'kind', type: 'select', opts: [['Process (steps)', 'process'], ['List (stack)', 'list'], ['Hierarchy (top item + children)', 'tree']] },
      { label: 'Items (one per line)', name: 'items', type: 'textarea', rows: 5, value: 'Plan\nShoot\nEdit\nPublish' }] });
    if (!v) return;
    const items = v.items.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12);
    if (!items.length) return;
    const box = x => `<span>${esc(x)}</span>`;
    let h;
    if (v.kind === 'process') h = `<div class="smart sa-process">${items.map(box).join('<b>→</b>')}</div>`;
    else if (v.kind === 'list') h = `<div class="smart sa-list">${items.map(box).join('')}</div>`;
    else h = `<div class="smart sa-tree"><span class="root">${esc(items[0])}</span><div class="kids">${items.slice(1).map(box).join('')}</div></div>`;
    putHtml(h + '<p><br></p>');
  },
  bookmark: async tab => {
    const v = await dialog({ title: 'Bookmark', ok: 'Add', fields: [{ label: 'Name (letters, numbers, dashes)', name: 'name' }] });
    if (!v) return;
    const name = v.name.trim().replace(/[^\w-]/g, '');
    if (!name) return toast('Use letters, numbers or dashes');
    if (document.getElementById('bm_' + name)) return toast('That bookmark already exists');
    putHtml(`<a id="bm_${name}" class="bm" title="Bookmark: ${name}">⚑</a>`);
    toast('Link to it with #' + name + ' (Ctrl+click follows links)');
  },
  header: tab => hf(tab, 'h'), footer: tab => hf(tab, 'f'),
  pagenum: async tab => {
    const v = await dialog({ title: 'Page number', ok: 'Insert', fields: [
      { label: 'Position', name: 'pos', type: 'select', opts: [['Bottom center', 'fc'], ['Bottom right', 'fr'], ['Bottom left', 'fl'], ['Top right', 'hr'], ['Top center', 'hc']] },
      { label: 'Format', name: 'fmt', type: 'select', opts: [['1', '{page}'], ['Page 1', 'Page {page}'], ['Page 1 of N', 'Page {page} of {pages}']] }] });
    if (!v) return;
    const head = v.pos[0] === 'h', el = $(head ? '#hfHead' : '#hfFoot');
    tab[head ? 'hOn' : 'fOn'] = true;
    if (!el.innerHTML.includes('{page}')) el.insertAdjacentHTML('beforeend', `<p style="text-align:${{ c: 'center', r: 'right', l: 'left' }[v.pos[1]]}">${v.fmt}</p>`);
    tab[head ? 'header' : 'footer'] = el.innerHTML;
    markDirty(tab); applyPage(tab); refreshState();
    toast('Page numbers appear as {page} here and are numbered in PDF exports and prints');
  },
  textbox: () => putHtml('<div class="obj textbox" style="width:220px">Type here…</div><p><br></p>'),
  equation: async () => {
    const pick = await gallery('Insert equation', EQS.map(([n, h]) => `<button type="button" class="gl eqb" data-k="${n}" title="${n}">${h}</button>`).join(''));
    if (pick) putHtml(EQS.find(e => e[0] === pick.key)[1] + '&nbsp;');
  },

  /* Draw */
  ink: (tab, tool) => {
    tab.tool = tab.tool === tool ? null : tool;
    if (tab.tool) tab.inkColor = INK[tab.tool] ? INK[tab.tool].c : tab.inkColor;
    applyPage(tab); refreshState();
    if (tab.tool) toast('Drawing: click the tool again or press Esc to stop');
  },
  inkcolor: (tab, v) => { tab.inkColor = v; },
  inkw: (tab, v) => { tab.inkS = +v; },
  clearink: tab => { if (!tab.ink.length) return; tab.ink = []; inkRender(tab); markDirty(tab); },
  ink2shape: tab => {
    const s = tab.ink[tab.ink.length - 1];
    if (!s || s.p.length < 3) return toast('Draw a line or shape first');
    const ps = s.p, xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
    const len = ps.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - ps[i - 1][0], p[1] - ps[i - 1][1]) : 0), 0);
    const a = ps[0], b = ps[ps.length - 1], gap = Math.hypot(a[0] - b[0], a[1] - b[1]), diag = Math.hypot(w, h) || 1;
    let np;
    if (gap > 0.35 * diag) {
      const L = gap || 1, dev = Math.max(...ps.map(p => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L));
      if (dev > 0.12 * L) return toast('Could not recognise a shape');
      np = [a, b];
    } else if (len / (2 * (w + h) || 1) > 0.9) np = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    else np = Array.from({ length: 49 }, (_, i) => [x0 + w / 2 + (w / 2) * Math.cos(i / 48 * Math.PI * 2), y0 + h / 2 + (h / 2) * Math.sin(i / 48 * Math.PI * 2)]);
    s.p = np.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    inkRender(tab); markDirty(tab);
  },

  /* Design */
  theme: (tab, v) => { tab.theme = v; markDirty(tab); applyPage(tab); },
  watermark: async tab => {
    let remove = false;
    const v = await dialog({ title: 'Watermark', ok: 'Apply', fields: [
      { label: 'Text', name: 'text', value: (tab.watermark && tab.watermark.text) || 'DRAFT' },
      { label: 'Color', name: 'color', type: 'color', value: (tab.watermark && tab.watermark.color) || '#888888' }],
    html: '<button type="button" class="btn" id="wmRemove">Remove watermark</button>', onBuild: (b, d) => { $('#wmRemove', b).onclick = () => { remove = true; d.close('cancel'); }; } });
    if (remove) tab.watermark = null;
    else if (v && v.text.trim()) tab.watermark = { text: v.text.trim().slice(0, 40), color: v.color };
    else return;
    markDirty(tab); applyPage(tab);
  },
  pageborder: async tab => {
    const v = await dialog({ title: 'Page borders', ok: 'Apply', fields: [{ label: 'Border', name: 'b', type: 'select', value: tab.border || 'none',
      opts: [['None', 'none'], ['Box', 'box'], ['Double line', 'double'], ['Shadow', 'shadow']] }] });
    if (v) { tab.border = v.b; markDirty(tab); applyPage(tab); }
  },

  /* Layout */
  cols: (tab, v) => { tab.cols = +v; markDirty(tab); applyPage(tab); },
  breaks: (tab, v) => {
    if (v === 'page') return H.pagebreak(tab);
    if (v === 'column') return putHtml('<div class="cb" contenteditable="false" style="break-after:column"></div><p><br></p>');
    if (v === 'section') putHtml(`${PB}<p><br></p>`);
  },
  indentL: (tab, v) => applyBlocks(tab, b => { b.style.marginLeft = (+v * CM) + 'px'; }),
  indentR: (tab, v) => applyBlocks(tab, b => { b.style.marginRight = (+v * CM) + 'px'; }),
  spaceB: (tab, v) => applyBlocks(tab, b => { b.style.marginTop = (+v) + 'pt'; }),
  spaceA: (tab, v) => applyBlocks(tab, b => { b.style.marginBottom = (+v) + 'pt'; }),
  objpos: (tab, v) => { if (!selObj) return toast('Click a picture, shape or chart first'); selObj.dataset.pos = v; layoutObj(selObj); touch(tab); },
  objwrap: (tab, v) => { if (!selObj) return toast('Click a picture, shape or chart first'); selObj.dataset.wrap = v; layoutObj(selObj); touch(tab); },

  /* References */
  updatetoc: tab => {
    const tocs = $$('.toc:not(.tof)', $('#page'));
    if (!tocs.length) return toast('Insert a table of contents first');
    tocs.forEach(t => { t.innerHTML = '<p><b>Table of Contents</b></p>' + headingsHtml(); });
    touch(tab);
  },
  footnote: tab => addNote(tab, 'f'), endnote: tab => addNote(tab, 'e'),
  cite: async tab => {
    tab.sources = tab.sources || [];
    let src = null;
    if (tab.sources.length) {
      let pick = null;
      await dialog({ title: 'Insert citation', ok: '', html: `<div class="srclist">${tab.sources.map(s => `<button type="button" class="btn" data-id="${s.id}">${esc(s.author)} (${esc(s.year)}): ${esc(s.title)}</button>`).join('')}<button type="button" class="btn primary" data-new="1">+ New source</button></div>`,
        onBuild: (b, d) => $$('button', b).forEach(x => x.addEventListener('click', () => { pick = x.dataset.new ? 'new' : x.dataset.id; d.close('cancel'); })) });
      if (!pick) return;
      if (pick !== 'new') src = tab.sources.find(s => s.id === pick);
    }
    if (!src) {
      const v = await dialog({ title: 'New source', ok: 'Add', fields: [{ label: 'Author', name: 'author' }, { label: 'Year', name: 'year' }, { label: 'Title', name: 'title' }, { label: 'Publisher', name: 'publisher' }] });
      if (!v || !v.author.trim()) return;
      src = { id: uid(), author: v.author.trim(), year: v.year.trim(), title: v.title.trim(), publisher: v.publisher.trim() };
      tab.sources.push(src); markDirty(tab);
    }
    putHtml(`<span class="cite" data-src="${src.id}">(${esc(src.author)}, ${esc(src.year)})</span>&nbsp;`);
  },
  biblio: tab => {
    if (!(tab.sources || []).length) return toast('Insert a citation first to add sources');
    const list = [...tab.sources].sort((a, b) => a.author.localeCompare(b.author));
    putHtml(`<div class="biblio"><p><b>Bibliography</b></p>${list.map(s => `<p>${esc(s.author)} (${esc(s.year)}). <i>${esc(s.title)}</i>. ${esc(s.publisher)}.</p>`).join('')}</div><p><br></p>`);
  },
  caption: async tab => {
    const v = await dialog({ title: 'Insert caption', ok: 'Insert', fields: [
      { label: 'Label', name: 'label', type: 'select', opts: [['Figure', 'Figure'], ['Table', 'Table'], ['Equation', 'Equation']] }, { label: 'Caption text', name: 'text' }] });
    if (!v) return;
    restore();
    const page = $('#page'); let blk = elOf(getSelection().anchorNode);
    while (blk && blk.parentElement !== page) blk = blk.parentElement;
    const html = `<p class="caption" data-l="${v.label}"><b>${v.label}</b>: ${esc(v.text)}</p>`;
    if (blk && page.contains(blk)) blk.insertAdjacentHTML('afterend', html); else page.insertAdjacentHTML('beforeend', html);
    renumberCaptions(); touch(tab);
  },
  tof: async () => {
    const v = await dialog({ title: 'Table of figures', ok: 'Insert', fields: [{ label: 'Caption label', name: 'label', type: 'select', opts: [['Figure', 'Figure'], ['Table', 'Table'], ['Equation', 'Equation']] }] });
    if (!v) return;
    const caps = $$(`p.caption[data-l="${v.label}"]`, $('#page'));
    if (!caps.length) return toast(`No ${v.label} captions found`);
    putHtml(`<div class="toc tof"><p><b>Table of ${v.label}s</b></p>${caps.map(c => `<p>${esc(c.textContent)}</p>`).join('')}</div><p><br></p>`);
  },

  /* Mailings */
  mmstart: async tab => {
    let pick = null;
    await dialog({ title: 'Start mail merge', ok: '', html: `<div class="srclist"><button type="button" class="btn primary" data-k="letters">Letters</button><button type="button" class="btn" data-k="env">Envelopes</button><button type="button" class="btn" data-k="labels">Labels</button></div>
      <p class="muted">Letters: write your letter here, choose recipients, insert merge fields, then Finish &amp; Merge.</p>`,
    onBuild: (b, d) => $$('button', b).forEach(x => x.addEventListener('click', () => { pick = x.dataset.k; d.close('cancel'); })) });
    if (pick === 'env') return H.envelopes(tab);
    if (pick === 'labels') return H.labels(tab);
    if (pick === 'letters') { if (!tab.recipients) H.recipients(tab); else toast('Insert merge fields, then Finish & Merge'); }
  },
  recipients: async tab => {
    let mode = null;
    await dialog({ title: 'Select recipients', ok: '', html: `<div class="srclist"><button type="button" class="btn primary" data-m="file">Import a CSV file…</button><button type="button" class="btn" data-m="type">Type a new list…</button></div><p class="muted">The first row holds the field names, for example: Name,Address,City</p>`,
      onBuild: (b, d) => $$('button', b).forEach(x => x.addEventListener('click', () => { mode = x.dataset.m; d.close('cancel'); })) });
    if (mode === 'type') return H.editrecips(tab);
    if (mode === 'file') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,text/csv';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (f.size > 5e6) return toast('That file is too large (5 MB max)'); setRecipients(tab, await f.text()); };
      inp.click();
    }
  },
  editrecips: async tab => {
    const v = await dialog({ title: 'Recipient list (CSV)', ok: 'Save', fields: [{ label: 'First row = field names', name: 'csv', type: 'textarea', rows: 10,
      value: tab.recipients ? recipientsToCSV(tab.recipients) : 'Name,Address\nJane Doe,12 Main Street' }] });
    if (v) setRecipients(tab, v.csv);
  },
  mergefield: async tab => {
    if (!tab.recipients) return toast('Select recipients first');
    let pick = null;
    await dialog({ title: 'Insert merge field', ok: '', html: `<div class="srclist">${tab.recipients.fields.map((f, i) => `<button type="button" class="btn" data-i="${i}">${esc(f)}</button>`).join('')}</div>`,
      onBuild: (b, d) => $$('button', b).forEach(x => x.addEventListener('click', () => { pick = tab.recipients.fields[+x.dataset.i]; d.close('cancel'); })) });
    if (pick) putHtml(`<span class="mf" data-f="${esc(pick)}" contenteditable="false">«${esc(pick)}»</span>&nbsp;`);
  },
  preview: tab => {
    if (!tab.recipients) return toast('Select recipients first');
    tab.preview = !tab.preview; tab.rec = tab.rec || 0;
    previewApply(tab); applyPage(tab); refreshState();
    if (tab.preview) toast(`Record ${tab.rec + 1} of ${tab.recipients.rows.length}`);
  },
  nextrec: tab => stepRec(tab, 1), prevrec: tab => stepRec(tab, -1),
  finishmerge: tab => {
    if (!tab.recipients || !tab.recipients.rows.length) return toast('Select recipients first');
    const page = $('#page');
    if (!page.querySelector('.mf')) return toast('Insert at least one merge field first');
    const was = tab.preview; if (was) { tab.preview = false; previewApply(tab); }
    const parts = tab.recipients.rows.map((_, i) => {
      const d = document.createElement('div'); d.innerHTML = page.innerHTML;
      $$('.mf', d).forEach(s => s.replaceWith(document.createTextNode(recObj(tab, i)[s.dataset.f] ?? '')));
      $$('.sel', d).forEach(x => x.classList.remove('sel'));
      return d.innerHTML;
    });
    if (was) { tab.preview = true; previewApply(tab); }
    newTab('writer', { title: baseName(tab) + ' (merged)', html: parts.join(PB), size: tab.size, landscape: tab.landscape, margin: tab.margin, font: tab.font,
      theme: tab.theme, header: tab.header, footer: tab.footer, hOn: tab.hOn, fOn: tab.fOn, dirty: true });
    toast(`Created ${parts.length} merged letters`);
  },
  envelopes: async tab => {
    const v = await dialog({ title: 'Create envelopes', ok: 'Create', fields: [
      { label: 'Delivery address (use {{Field}} for merge fields)', name: 'to', type: 'textarea', rows: 4, value: 'Jane Doe\n12 Main Street\nAccra' },
      { label: 'Return address', name: 'from', type: 'textarea', rows: 3 },
      { label: 'Envelopes', name: 'merge', type: 'select', opts: [['One envelope', 'no'], ['One per recipient (uses the recipient list)', 'yes']] }] });
    if (!v) return;
    if (v.merge === 'yes' && !tab.recipients) return toast('Select recipients first');
    const recs = v.merge === 'yes' ? tab.recipients.rows.map((_, i) => recObj(tab, i)) : [{}];
    const html = recs.map(r => `<div style="font-size:9pt;line-height:1.3">${fillTpl(v.from, {})}</div><div style="margin:60px 0 0 280px;font-size:13pt;line-height:1.4">${fillTpl(v.to, r)}</div>`).join(PB);
    newTab('writer', { title: 'Envelopes', html, size: 'Envelope DL', landscape: true, margin: 24, dirty: true, recipients: tab.recipients });
  },
  labels: async tab => {
    const v = await dialog({ title: 'Create labels', ok: 'Create', fields: [
      { label: 'Label text (use {{Field}} for merge fields)', name: 'text', type: 'textarea', rows: 4, value: 'Jane Doe\n12 Main Street\nAccra' },
      { label: 'Label sheet', name: 'sheet', type: 'select', opts: Object.keys(LABEL_SHEETS).map(k => [k, k]) },
      { label: 'Labels', name: 'merge', type: 'select', opts: [['Repeat one label', 'no'], ['One per recipient (uses the recipient list)', 'yes']] }] });
    if (!v) return;
    if (v.merge === 'yes' && !tab.recipients) return toast('Select recipients first');
    const L = LABEL_SHEETS[v.sheet], per = L.cols * L.rows, ph = PAGES[L.size][1], rh = Math.floor((ph - 48) / L.rows);
    const labels = v.merge === 'yes' ? tab.recipients.rows.map((_, i) => fillTpl(v.text, recObj(tab, i))) : Array(per).fill(fillTpl(v.text, {}));
    const pages = [];
    for (let i = 0; i < labels.length; i += per) {
      const chunk = labels.slice(i, i + per); let t = '<table class="labels">';
      for (let r = 0; r < L.rows; r++) {
        t += '<tr>' + Array.from({ length: L.cols }, (_, c) => `<td style="height:${rh}px">${chunk[r * L.cols + c] || ''}</td>`).join('') + '</tr>';
      }
      pages.push(t + '</table>');
    }
    newTab('writer', { title: 'Labels', html: pages.join(PB), size: L.size, margin: 24, dirty: true });
    toast('Label sizes are approximate: do a test print before using real label sheets');
  },

  /* Review */
  newcomment: async tab => {
    restore();
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !$('#page').contains(sel.anchorNode)) return toast('Select some text to comment on');
    const v = await dialog({ title: 'New comment', ok: 'Add', fields: [{ label: 'Comment', name: 'text', type: 'textarea', rows: 4 }] });
    if (!v || !v.text.trim()) return;
    restore();
    const id = uid(), span = document.createElement('span');
    span.className = 'cm'; span.dataset.id = id;
    try { getSelection().getRangeAt(0).surroundContents(span); } catch (e) { return toast('Select text within a single paragraph'); }
    tab.comments = tab.comments || [];
    tab.comments.push({ id, text: v.text.trim(), author: 'You', time: Date.now() });
    tab.cmOn = true; touch(tab); applyPage(tab); cmRender(tab); refreshState();
  },
  delcomment: tab => {
    restore();
    const c = elOf(getSelection().anchorNode);
    const sp = c && c.closest ? c.closest('.cm') : null;
    if (!sp) return toast('Place the cursor inside a comment');
    removeComment(tab, sp.dataset.id);
  },
  showcomments: tab => { toggle(tab, 'cmOn'); cmRender(tab); },
  track: tab => {
    if (tab.restrict === 'tracked') return toast('Tracking is locked by document protection');
    tab.track = !tab.track; refreshState();
    toast(tab.track ? 'Track changes on: typing and deleting are now marked' : 'Track changes off');
  },
  accept: tab => resolveChanges(tab, true, false), reject: tab => resolveChanges(tab, false, false),
  acceptall: tab => resolveChanges(tab, true, true), rejectall: tab => resolveChanges(tab, false, true),
  restrict: async tab => {
    if (tab.restrict && tab.restrict !== 'none') return stopRestrict(tab);
    const v = await dialog({ title: 'Restrict editing', ok: 'Start protection', fields: [
      { label: 'Allow only', name: 'mode', type: 'select', opts: [['No changes (read only)', 'readonly'], ['Comments', 'comments'], ['Tracked changes', 'tracked']] },
      { label: 'Password (optional)', name: 'pw', type: 'password' }] });
    if (!v) return;
    tab.restrict = v.mode; tab.restrictHash = v.pw ? await sha(v.pw) : undefined;
    if (v.mode === 'tracked') tab.track = true;
    markDirty(tab); applyPage(tab); refreshState();
  },

  /* View */
  ruler: tab => toggle(tab, 'rulerOn'),
  grid: tab => toggle(tab, 'gridOn'),
  nav: tab => { toggle(tab, 'navOn'); navUpdate(tab); }
});

function stepRec(tab, d) {
  if (!tab.recipients) return toast('Select recipients first');
  const n = tab.recipients.rows.length;
  tab.rec = (((tab.rec || 0) + d) % n + n) % n;
  if (tab.preview) { previewApply(tab); toast(`Record ${tab.rec + 1} of ${n}`); } else toast('Turn on Preview Results first');
}
function hf(tab, k) {
  const key = k === 'h' ? 'hOn' : 'fOn';
  tab[key] = !tab[key]; markDirty(tab); applyPage(tab); refreshState();
  if (tab[key]) $(k === 'h' ? '#hfHead' : '#hfFoot').focus();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const t = activeTab();
  if (t && t.app === 'writer' && t.tool) { t.tool = null; applyPage(t); refreshState(); }
});


/* ================= Word (.docx) export preparation ================= */
const loadImage = src => new Promise((res, rej) => { const i = new Image(); const t = setTimeout(() => rej(new Error('timeout')), 4000); i.onload = () => { clearTimeout(t); res(i); }; i.onerror = () => { clearTimeout(t); rej(new Error('load')); }; i.src = src; });
async function svgToPng(svgEl, w, h) {
  const c = svgEl.cloneNode(true);
  c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  c.setAttribute('width', w); c.setAttribute('height', h);
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c)));
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  const g = cv.getContext('2d');
  g.scale(2, 2); g.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/png');
}
async function docxPayload(tab) {
  const root = document.createElement('div');
  root.innerHTML = tab.html;
  $$('del.tc', root).forEach(n => n.remove());
  $$('ins.tc', root).forEach(n => n.replaceWith(...n.childNodes));
  $$('.cb', root).forEach(n => n.remove());
  $$('.pb', root).forEach(n => { const d = document.createElement('div'); d.setAttribute('style', 'page-break-after: always'); n.replaceWith(d); });
  for (const o of $$('.obj', root)) {
    const sv = $('svg', o);
    if (!sv) continue;
    const w = parseInt(o.style.width, 10) || 120, h = parseInt(o.style.height, 10) || 120;
    try {
      const im = document.createElement('img');
      im.src = await svgToPng(sv, w, h); im.width = w; im.height = h;
      o.replaceWith(im);
    } catch (e) { o.remove(); }
  }
  $$('[contenteditable]', root).forEach(n => n.removeAttribute('contenteditable'));
  const th = DOC_THEMES[tab.theme] || {};
  return { html: root.innerHTML, header: tab.hOn ? cleanHtml(tab.header || '') : '', footer: tab.fOn ? cleanHtml(tab.footer || '') : '',
    size: tab.size, landscape: tab.landscape, margin: tab.margin, title: baseName(tab), font: tab.font || th.font || 'Segoe UI' };
}
function lossyFeatures(tab) {
  const root = document.createElement('div');
  root.innerHTML = tab.html || '';
  const out = [];
  if ((tab.ink || []).length) out.push('drawings');
  if (tab.watermark) out.push('watermark');
  if (tab.border && tab.border !== 'none') out.push('page border');
  if (tab.cols > 1) out.push('columns');
  if (root.querySelector('.cm')) out.push('comments');
  if (root.querySelector('ins.tc, del.tc')) out.push('tracked changes (saved as accepted)');
  if (root.querySelector('.obj svg')) out.push('shapes and charts (saved as pictures)');
  if (root.querySelector('.smart, .eq, .textbox')) out.push('SmartArt, equations and text boxes lose their layout');
  return out;
}
