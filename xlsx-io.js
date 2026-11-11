'use strict';
/* Excel (.xlsx) import and export for DigiCre8 Sheets. Runs in the Electron main process.
   Works on the workbook JSON produced by Workbook.toJSON() in src/sheet-model.js. */
const ExcelJS = require('exceljs');

const EPOCH = Date.UTC(1899, 11, 30);
const MAX_BYTES = 80e6;
const THEME = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646'];
const INDEXED = { 0: '000000', 1: 'FFFFFF', 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00', 6: 'FF00FF', 7: '00FFFF', 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00', 12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF', 16: '800000', 17: '008000', 18: '000080', 19: '808000', 20: '800080', 21: '008080', 22: 'C0C0C0', 23: '808080' };
const TABLE_STYLES = { blue: ['4F6BF2', 'E8ECFE'], green: ['12A37A', 'E3F6EF'], orange: ['F2701B', 'FDEBDD'], gray: ['5A6280', 'EEF0F5'], pink: ['D63A7C', 'FBE6EE'] };

const toHex = argb => (/^[0-9a-f]{8}$/i.test(argb || '') ? '#' + argb.slice(2).toLowerCase() : /^[0-9a-f]{6}$/i.test(argb || '') ? '#' + argb.toLowerCase() : null);
function colorOf(c) {
  if (!c) return null;
  if (c.argb) return toHex(c.argb);
  if (c.theme !== undefined) {
    const base = THEME[c.theme] || '000000';
    const t = c.tint || 0;
    const ch = i => { const v = parseInt(base.slice(i, i + 2), 16); return Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t).toString(16).padStart(2, '0'); };
    return '#' + ch(0) + ch(2) + ch(4);
  }
  if (c.indexed !== undefined && INDEXED[c.indexed]) return '#' + INDEXED[c.indexed].toLowerCase();
  return null;
}
const argb = hex => 'FF' + String(hex).replace('#', '').toUpperCase();
const validHex = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);

function textOf(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if (v.text !== undefined) return textOf(v.text);
  }
  return v;
}

/* ---------------- import ---------------- */
async function importXlsx(filePath) {
  const fs = require('fs');
  if (fs.statSync(filePath).size > MAX_BYTES) throw new Error('That file is larger than 80 MB.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const styles = [{}], styleIdx = new Map([['{}', 0]]);
  const intern = o => { const s = JSON.stringify(o); let id = styleIdx.get(s); if (id === undefined) { id = styles.length; styles.push(o); styleIdx.set(s, id); } return id; };
  const sheets = [], names = {};
  wb.eachSheet(ws => {
    if (ws.state === 'veryHidden') return;
    const sh = { name: ws.name.slice(0, 31), cells: [], colW: [], rowH: [], hiddenRows: [], hiddenCols: [], merges: [], charts: [], cf: [], dv: [], tables: [], filter: null, freeze: { r: 0, c: 0 }, showGrid: true, showHeadings: true, zoom: 100, protect: false };
    const view = (ws.views && ws.views[0]) || {};
    if (view.state === 'frozen') sh.freeze = { r: view.ySplit || 0, c: view.xSplit || 0 };
    if (view.showGridLines === false) sh.showGrid = false;
    if (view.zoomScale) sh.zoom = Math.max(25, Math.min(400, view.zoomScale));
    const tab = ws.properties && ws.properties.tabColor; if (tab) sh.tabColor = colorOf(tab);
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height) sh.rowH.push([rn - 1, Math.round(row.height * 4 / 3)]);
      if (row.hidden) sh.hiddenRows.push(rn - 1);
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const st = {}, s = cell.style || {};
        if (s.font) { const f = s.font; if (f.name && f.name !== 'Calibri') st.ff = f.name; if (f.size && f.size !== 11) st.fs = f.size; if (f.bold) st.b = true; if (f.italic) st.i = true; if (f.underline) st.u = true; if (f.strike) st.st = true; const fc = colorOf(f.color); if (fc && fc !== '#000000') st.fc = fc; }
        if (s.fill && s.fill.type === 'pattern' && s.fill.pattern === 'solid') { const bg = colorOf(s.fill.fgColor); if (bg) st.bg = bg; }
        if (s.alignment) { const a = s.alignment; if (['left', 'center', 'right', 'justify'].includes(a.horizontal)) st.ha = a.horizontal; if (['top', 'middle', 'bottom'].includes(a.vertical) && a.vertical !== 'bottom') st.va = a.vertical; if (a.wrapText) st.wrap = true; if (a.indent) st.ind = a.indent; }
        if (s.border) for (const [k, side] of [['bt', 'top'], ['br', 'right'], ['bb', 'bottom'], ['bl', 'left']]) { const b = s.border[side]; if (b && b.style) st[k] = { s: b.style, c: colorOf(b.color) || '#000000' }; }
        let nf = s.numFmt; if (nf && nf !== 'General') st.nf = nf;
        let v = null, f = null, link = null, note = null;
        const val = cell.value;
        if (val instanceof Date) { v = (val.getTime() - EPOCH) / 86400000; if (!st.nf) st.nf = 'yyyy-mm-dd'; }
        else if (val && typeof val === 'object' && (val.formula !== undefined || val.sharedFormula !== undefined)) {
          f = cell.formula || val.formula || null;
          if (f && val.result && val.result.error) v = null;
          if (!f) v = textOf(val.result);
        } else if (val && typeof val === 'object' && val.error) { f = val.error; }
        else if (val && typeof val === 'object' && val.hyperlink) { v = textOf(val.text) ?? val.hyperlink; link = val.hyperlink; }
        else v = textOf(val);
        if (cell.note) note = typeof cell.note === 'string' ? cell.note : (cell.note.texts || []).map(t => t.text).join('');
        if (typeof v === 'string' && v.length > 32767) v = v.slice(0, 32767);
        sh.cells.push([rn - 1, cn - 1, v, f, Object.keys(st).length ? intern(st) : 0, note, link]);
      });
    });
    (ws.columns || []).forEach((col, i) => { if (col && col.width) sh.colW.push([i, Math.round(col.width * 7 + 5)]); if (col && col.hidden) sh.hiddenCols.push(i); });
    for (const m of (ws.model && ws.model.merges) || []) { const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m); if (mm) { const ci = s => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; sh.merges.push({ r1: +mm[2] - 1, c1: ci(mm[1]), r2: +mm[4] - 1, c2: ci(mm[3]) }); } }
    const dvs = ws.dataValidations && ws.dataValidations.model || {};
    for (const [ref, d] of Object.entries(dvs)) {
      const mm = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref); if (!mm || !['list', 'whole', 'decimal'].includes(d.type)) continue;
      const ci = s => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const rule = { r1: +mm[2] - 1, c1: ci(mm[1]), r2: +(mm[4] || mm[2]) - 1, c2: ci(mm[3] || mm[1]), type: d.type, blank: d.allowBlank !== false };
      if (d.type === 'list') { const f0 = String((d.formulae || [''])[0] || ''); rule.list = /^".*"$/.test(f0) ? f0.slice(1, -1) : '=' + f0; }
      else { rule.op = ({ between: 'between', notBetween: 'notbetween', equal: 'eq', notEqual: 'ne', greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le' })[d.operator] || 'between'; rule.v1 = (d.formulae || [])[0]; rule.v2 = (d.formulae || [])[1]; }
      sh.dv.push(rule);
    }
    sheets.push(sh);
  });
  const dn = wb.definedNames && wb.definedNames.model;
  for (const n of Array.isArray(dn) ? dn : []) { if (n && n.name && n.ranges && n.ranges[0] && !/^_xlnm/.test(n.name)) names[n.name.toLowerCase()] = { name: n.name, ref: n.ranges[0] }; }
  return { v: 1, active: 0, styles, names, calcAuto: true, sheets };
}

/* ---------------- export ---------------- */
function excelStyle(st) {
  const out = {};
  const font = {};
  if (st.ff) font.name = st.ff; if (st.fs) font.size = st.fs; if (st.b) font.bold = true; if (st.i) font.italic = true; if (st.u) font.underline = true; if (st.st) font.strike = true;
  if (validHex(st.fc)) font.color = { argb: argb(st.fc) };
  if (Object.keys(font).length) out.font = font;
  if (validHex(st.bg)) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.bg) } };
  const al = {};
  if (st.ha) al.horizontal = st.ha; if (st.va) al.vertical = st.va; if (st.wrap) al.wrapText = true; if (st.ind) al.indent = st.ind;
  if (Object.keys(al).length) out.alignment = al;
  const bd = {};
  for (const [k, side] of [['bt', 'top'], ['br', 'right'], ['bb', 'bottom'], ['bl', 'left']]) if (st[k] && st[k].s) bd[side] = { style: st[k].s, color: { argb: argb(validHex(st[k].c) ? st[k].c : '#000000') } };
  if (Object.keys(bd).length) out.border = bd;
  if (st.nf) out.numFmt = st.nf;
  return out;
}
const ADDR = (r, c) => { let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s + (r + 1); };

async function exportXlsx(model, images = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DigiCre8 Sheets';
  const styles = model.styles || [{}];
  for (const [si, sh] of (model.sheets || []).entries()) {
    const ws = wb.addWorksheet(String(sh.name).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet', {
      properties: sh.tabColor && validHex(sh.tabColor) ? { tabColor: { argb: argb(sh.tabColor) } } : {},
      views: [{ showGridLines: sh.showGrid !== false, zoomScale: sh.zoom || 100, ...(sh.freeze && (sh.freeze.r || sh.freeze.c) ? { state: 'frozen', xSplit: sh.freeze.c || 0, ySplit: sh.freeze.r || 0 } : {}) }]
    });
    const grid = new Map();
    for (const row of sh.cells || []) grid.set(row[0] * 20000 + row[1], row);
    // table styling baked into cell formatting
    const tableFill = (r, c) => {
      for (const t of sh.tables || []) {
        if (r < t.r1 || r > t.r2 || c < t.c1 || c > t.c2) continue;
        const pal = TABLE_STYLES[t.style] || TABLE_STYLES.blue;
        if (r === t.r1) return { bg: '#' + pal[0].toLowerCase(), fc: '#ffffff', b: true };
        if (t.banded !== false && (r - t.r1) % 2 === 0) return { bg: '#' + pal[1].toLowerCase() };
      }
      return null;
    };
    for (const row of sh.cells || []) {
      const [r, c, v, f, s, note, link, res] = row;
      const cell = ws.getCell(r + 1, c + 1);
      if (f !== null && f !== undefined) { const result = res && typeof res === 'object' ? { error: res.err } : res; cell.value = { formula: String(f), ...(result !== undefined && result !== null ? { result } : {}) }; }
      else if (link) cell.value = { text: String(v ?? link), hyperlink: link };
      else if (v !== null && v !== undefined) cell.value = v;
      const st = { ...(styles[s] || {}) }, tf = tableFill(r, c);
      if (tf) { if (!st.bg) st.bg = tf.bg; if (tf.fc && !st.fc) st.fc = tf.fc; if (tf.b) st.b = true; }
      Object.assign(cell, excelStyle(st));
      if (note) cell.note = String(note);
    }
    // styled-only cells inside tables
    for (const t of sh.tables || []) for (let r = t.r1; r <= t.r2; r++) for (let c = t.c1; c <= t.c2; c++) if (!grid.has(r * 20000 + c)) { const tf = tableFill(r, c); if (tf) Object.assign(ws.getCell(r + 1, c + 1), excelStyle(tf)); }
    for (const [c, w] of sh.colW || []) if (w > 0) ws.getColumn(c + 1).width = Math.max(1, (w - 5) / 7);
    for (const [r, h] of sh.rowH || []) if (h > 0) ws.getRow(r + 1).height = h * 0.75;
    for (const r of sh.hiddenRows || []) ws.getRow(r + 1).hidden = true;
    for (const c of sh.hiddenCols || []) ws.getColumn(c + 1).hidden = true;
    if (sh.filter && Number.isInteger(sh.filter.r1)) { try { ws.autoFilter = `${ADDR(sh.filter.r1, sh.filter.c1)}:${ADDR(sh.filter.r2, sh.filter.c2)}`; } catch (e) { /* ignore */ } }
    for (const m of sh.merges || []) { try { ws.mergeCells(`${ADDR(m.r1, m.c1)}:${ADDR(m.r2, m.c2)}`); } catch (e) { /* overlapping merge */ } }
    for (const d of sh.dv || []) {
      const opMap = { between: 'between', notbetween: 'notBetween', eq: 'equal', ne: 'notEqual', gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual' };
      const rule = d.type === 'list' ? { type: 'list', allowBlank: d.blank !== false, formulae: [String(d.list || '').startsWith('=') ? String(d.list).slice(1) : `"${String(d.list || '').replace(/"/g, '')}"`] }
        : ['whole', 'decimal'].includes(d.type) ? { type: d.type, allowBlank: d.blank !== false, operator: opMap[d.op] || 'between', formulae: [d.v1, d.v2].filter(x => x !== undefined && x !== '').map(Number) } : null;
      if (!rule) continue;
      for (let r = d.r1; r <= Math.min(d.r2, d.r1 + 2000); r++) for (let c = d.c1; c <= Math.min(d.c2, d.c1 + 50); c++) ws.getCell(r + 1, c + 1).dataValidation = rule;
    }
    for (const rule of sh.cf || []) {
      const ref = `${ADDR(rule.r1, rule.c1)}:${ADDR(rule.r2, rule.c2)}`, fmt = rule.fmt || {};
      const style = { ...(validHex(fmt.bg) ? { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(fmt.bg) } } } : {}), ...(validHex(fmt.fc) || fmt.b ? { font: { ...(validHex(fmt.fc) ? { color: { argb: argb(fmt.fc) } } : {}), ...(fmt.b ? { bold: true } : {}) } } : {}) };
      let rules = null;
      if (rule.type === 'cell') rules = [{ type: 'cellIs', operator: { gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual', eq: 'equal', ne: 'notEqual', between: 'between', notbetween: 'notBetween' }[rule.op] || 'greaterThan', formulae: [Number(rule.v1), ...(rule.op === 'between' || rule.op === 'notbetween' ? [Number(rule.v2)] : [])], style, priority: 1 }];
      else if (rule.type === 'text' && rule.op === 'contains') rules = [{ type: 'containsText', operator: 'containsText', text: String(rule.v1 || ''), style, priority: 1 }];
      else if (rule.type === 'scale2') rules = [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: argb(rule.c1c || '#ffffff') }, { argb: argb(rule.c2c || '#63be7b') }], priority: 1 }];
      else if (rule.type === 'scale3') rules = [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: argb(rule.c1c || '#f8696b') }, { argb: argb(rule.cmid || '#ffeb84') }, { argb: argb(rule.c2c || '#63be7b') }], priority: 1 }];
      if (rules) ws.addConditionalFormatting({ ref, rules });
    }
    for (const im of images.filter(i => i && i.sheet === si && /^[A-Za-z0-9+/=]+$/.test(i.png || ''))) {
      const id = wb.addImage({ base64: im.png, extension: 'png' });
      ws.addImage(id, { tl: { col: im.c, row: im.r }, ext: { width: Math.min(2000, im.w), height: Math.min(2000, im.h) } });
    }
  }
  for (const n of Object.values(model.names || {})) { try { wb.definedNames.add(n.ref, n.name); } catch (e) { /* skip bad name */ } }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { importXlsx, exportXlsx };
