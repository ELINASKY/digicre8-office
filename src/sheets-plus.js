'use strict';
/* DigiCre8 Sheets: ribbon commands, dialogs, charts, context menus, file menu, save and print. */

const FN_CATS = {
  Math: ['ABS', 'CEILING', 'EXP', 'FLOOR', 'INT', 'LN', 'LOG', 'LOG10', 'MOD', 'PI', 'POWER', 'PRODUCT', 'RAND', 'RANDBETWEEN', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'SIGN', 'SQRT', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'TRUNC'],
  Statistical: ['AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'COUNT', 'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS', 'LARGE', 'MAX', 'MAXIFS', 'MEDIAN', 'MIN', 'MINIFS', 'MODE', 'PERCENTILE', 'QUARTILE', 'RANK', 'SLOPE', 'SMALL', 'STDEV', 'VAR'],
  Logical: ['AND', 'IF', 'IFERROR', 'IFNA', 'IFS', 'NOT', 'OR', 'SWITCH', 'XOR', 'TRUE', 'FALSE'],
  Text: ['CHAR', 'CONCAT', 'CONCATENATE', 'EXACT', 'FIND', 'LEFT', 'LEN', 'LOWER', 'MID', 'PROPER', 'REPLACE', 'REPT', 'RIGHT', 'SEARCH', 'SUBSTITUTE', 'TEXT', 'TEXTJOIN', 'TRIM', 'UPPER', 'VALUE'],
  'Lookup & reference': ['CHOOSE', 'COLUMN', 'HLOOKUP', 'INDEX', 'INDIRECT', 'LOOKUP', 'MATCH', 'OFFSET', 'ROW', 'ROWS', 'TRANSPOSE', 'VLOOKUP', 'XLOOKUP'],
  'Date & time': ['DATE', 'DATEDIF', 'DAY', 'DAYS', 'EDATE', 'EOMONTH', 'HOUR', 'MINUTE', 'MONTH', 'NETWORKDAYS', 'NOW', 'SECOND', 'TIME', 'TODAY', 'WEEKDAY', 'YEAR'],
  Financial: ['FV', 'IPMT', 'IRR', 'NPER', 'NPV', 'PMT', 'PPMT', 'PV', 'RATE'],
  Information: ['ISBLANK', 'ISERROR', 'ISEVEN', 'ISNA', 'ISNUMBER', 'ISODD', 'ISTEXT']
};
const NUM_FORMATS = [['General', 'General'], ['Number (2 decimals)', '0.00'], ['Number with commas', '#,##0.00'], ['Integer', '0'], ['Currency ($)', '$#,##0.00'], ['Currency (€)', '€#,##0.00'], ['Currency (£)', '£#,##0.00'],
  ['Currency (₵)', '₵#,##0.00'], ['Percentage', '0.00%'], ['Percentage (0 decimals)', '0%'], ['Scientific', '0.00E+00'], ['Short date', 'yyyy-mm-dd'], ['Date d/m/yyyy', 'dd/mm/yyyy'], ['Date m/d/yyyy', 'mm/dd/yyyy'],
  ['Long date', 'dddd, mmmm d, yyyy'], ['Time 24h', 'hh:mm:ss'], ['Time 12h', 'h:mm AM/PM'], ['Text', '@']];
const CELL_STYLES = {
  good: { bg: '#c6efce', fc: '#006100' }, bad: { bg: '#ffc7ce', fc: '#9c0006' }, neutral: { bg: '#ffeb9c', fc: '#9c5700' },
  heading: { b: true, fs: 13, fc: '#1f2a44', bb: { s: 'medium', c: '#4f6bf2' } }, title: { b: true, fs: 18, fc: '#1f2a44' }, total: { b: true, bt: { s: 'thin', c: '#000000' }, bb: { s: 'double', c: '#000000' } },
  input: { bg: '#ffcc99', fc: '#3f3f76', bt: { s: 'thin', c: '#7f7f7f' }, bb: { s: 'thin', c: '#7f7f7f' }, bl: { s: 'thin', c: '#7f7f7f' }, br: { s: 'thin', c: '#7f7f7f' } }, note: { bg: '#ffffcc', bt: { s: 'thin', c: '#b2b2b2' }, bb: { s: 'thin', c: '#b2b2b2' }, bl: { s: 'thin', c: '#b2b2b2' }, br: { s: 'thin', c: '#b2b2b2' } }
};
const CF_PRESETS = { 'Light red fill with dark red text': { bg: '#ffc7ce', fc: '#9c0006' }, 'Yellow fill with dark yellow text': { bg: '#ffeb9c', fc: '#9c5700' }, 'Green fill with dark green text': { bg: '#c6efce', fc: '#006100' }, 'Light red fill': { bg: '#ffc7ce' }, 'Red text': { fc: '#c62828' }, 'Bold blue text': { fc: '#1f4fd6', b: true } };

const sel2 = tab => selRange(tab);
const prot = tab => { if (curSheet(tab).protect) { toast('This sheet is protected. Unprotect it to make changes.'); return true; } return false; };
const syncFlags = tab => { const sh = curSheet(tab); tab.fGrid = sh.showGrid; tab.fHead = sh.showHeadings; tab.fPrintGrid = sh.page.printGrid; tab.fProtect = sh.protect; tab.fFilter = !!sh.filter; };
function currentRegion(tab, r, c) {
  let r1 = r, r2 = r, c1 = c, c2 = c, grew = true;
  const nonEmpty = (a, b) => hasData(tab, a, b);
  if (!nonEmpty(r, c) && !nonEmpty(r - 1, c) && !nonEmpty(r + 1, c) && !nonEmpty(r, c - 1) && !nonEmpty(r, c + 1)) return { r1: r, c1: c, r2: r, c2: c };
  let guard = 0;
  while (grew && guard++ < 5000) {
    grew = false;
    for (let cc = c1; cc <= c2; cc++) { if (r1 > 0 && nonEmpty(r1 - 1, cc)) { r1--; grew = true; break; } if (nonEmpty(r2 + 1, cc)) { r2++; grew = true; break; } }
    for (let rr = r1; rr <= r2; rr++) { if (c1 > 0 && nonEmpty(rr, c1 - 1)) { c1--; grew = true; break; } if (nonEmpty(rr, c2 + 1)) { c2++; grew = true; break; } }
  }
  return { r1, c1, r2, c2 };
}
const guessHeader = (tab, g) => {
  if (g.r2 <= g.r1) return false;
  const wb = tab.wb, si = wb.active;
  let allText = true, anyNum = false, allBold = true;
  for (let c = g.c1; c <= g.c2; c++) {
    const v = wb.evalCell(si, g.r1, c); if (typeof v !== 'string' || v === '') allText = false;
    const v2 = wb.evalCell(si, g.r1 + 1, c); if (typeof v2 === 'number') anyNum = true;
    if (!wb.cellStyle(curSheet(tab), g.r1, c).b) allBold = false;
  }
  return allText && (anyNum || allBold);
};
const ask = (title, fields, ok = 'OK', html = '') => dialog({ title, fields, ok, html });
const colLabel = c => colName(c);

Object.assign(SC, {
  cutcmd: tab => SC.copy(tab, true), copycmd: tab => SC.copy(tab, false),
  pastemode: (tab, v) => { if (v) SC.paste(tab, v); },
  clear: (tab, what) => {
    if (tab.selChart) return deleteChart(tab);
    if (prot(tab)) return;
    const rg = sel2(tab); tab.wb.clear(tab.wb.active, rg, what || 'all');
    if (what === 'all' || what === 'notes') tab.wb.tx(() => { for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 5000); r++) for (let c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 500); c++) { const x = curSheet(tab).get(r, c); if (x && x.n) { tab.wb.setCellObj(curSheet(tab), r, c, { ...x, n: undefined }); } } });
    requestDraw(tab);
  },
  clearcmd: (tab, v) => { if (v) SC.clear(tab, v === 'notes' ? 'notes' : v); },
  togglestyle: (tab, k) => {
    if (prot(tab)) return;
    const cur = !!tab.wb.cellStyle(curSheet(tab), tab.sel.ar, tab.sel.ac)[k];
    tab.wb.setStyle(tab.wb.active, sel2(tab), { [k]: cur ? null : true });
  },
  sfont: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { ff: v === 'Calibri' ? null : v }); },
  ssize: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { fs: +v === 11 ? null : +v }); },
  fsinc: tab => stepFont(tab, 1), fsdec: tab => stepFont(tab, -1),
  sfill: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { bg: v }); },
  sfontcolor: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { fc: v }); },
  align: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { ha: v }); },
  valign: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { va: v === 'bottom' ? null : v }); },
  indent: (tab, d) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), st => ({ ind: Math.max(0, (st.ind || 0) + d) || null, ha: st.ha || 'left' })); },
  numfmt: (tab, v) => { if (!prot(tab)) tab.wb.setStyle(tab.wb.active, sel2(tab), { nf: v === 'General' ? null : v }); },
  numquick: (tab, v) => { if (!prot(tab)) { const cur = tab.wb.cellStyle(curSheet(tab), tab.sel.ar, tab.sel.ac).nf; tab.wb.setStyle(tab.wb.active, sel2(tab), { nf: cur === v ? null : v }); } },
  decimals: (tab, d) => {
    if (prot(tab)) return;
    tab.wb.setStyle(tab.wb.active, sel2(tab), (st, r, c) => {
      let nf = st.nf && st.nf !== 'General' ? st.nf : null;
      if (!nf) { const v = tab.wb.evalCell(tab.wb.active, r, c); nf = typeof v === 'number' && !Number.isInteger(v) ? '0.' + '0'.repeat(Math.min(6, (String(v).split('.')[1] || '').length)) : '0'; }
      const m = /^([^.]*)(?:\.(0+))?(.*)$/.exec(nf); if (!m) return {};
      const n = Math.max(0, (m[2] || '').length + d);
      return { nf: m[1] + (n ? '.' + '0'.repeat(n) : '') + m[3] };
    });
  },
  border: (tab, kind) => {
    if (!kind || prot(tab)) return;
    const rg = sel2(tab), line = { s: 'thin', c: '#000000' };
    tab.wb.setStyle(tab.wb.active, rg, (st, r, c) => {
      const p = {}, top = r === rg.r1, bot = r === rg.r2, lft = c === rg.c1, rgt = c === rg.c2;
      if (kind === 'none') return { bt: null, br: null, bb: null, bl: null };
      if (kind === 'all') return { bt: line, br: line, bb: line, bl: line };
      if (kind === 'outside' || kind === 'thick') { const l = kind === 'thick' ? { s: 'thick', c: '#000000' } : line; if (top) p.bt = l; if (bot) p.bb = l; if (lft) p.bl = l; if (rgt) p.br = l; return p; }
      if (kind === 'top' && top) p.bt = line; if (kind === 'bottom' && bot) p.bb = line; if (kind === 'left' && lft) p.bl = line; if (kind === 'right' && rgt) p.br = line;
      if (kind === 'double' && bot) p.bb = { s: 'double', c: '#000000' };
      return p;
    });
  },
  mergeop: (tab, v) => {
    if (!v || prot(tab)) return;
    const rg = sel2(tab), wb = tab.wb, sh = curSheet(tab);
    if (v === 'unmerge') { wb.mutate(() => { sh.merges = sh.merges.filter(m => !(m.r1 >= rg.r1 && m.r2 <= rg.r2 && m.c1 >= rg.c1 && m.c2 <= rg.c2)); }); return; }
    if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return toast('Select more than one cell to merge');
    wb.mutate(() => {
      const ranges = v === 'across' ? Array.from({ length: rg.r2 - rg.r1 + 1 }, (_, i) => ({ r1: rg.r1 + i, r2: rg.r1 + i, c1: rg.c1, c2: rg.c2 })) : [{ ...rg }];
      sh.merges = sh.merges.filter(m => !(m.r2 < rg.r1 || m.r1 > rg.r2 || m.c2 < rg.c1 || m.c1 > rg.c2));
      for (const m of ranges) {
        // keep the top-left value only, as Excel does
        for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (!(r === m.r1 && c === m.c1)) { const x = sh.get(r, c); if (x) { const n = { ...x }; delete n.v; delete n.f; wb.setCellObj(sh, r, c, n); } }
        sh.merges.push(m);
      }
    });
    if (v === 'center') tab.wb.setStyle(tab.wb.active, { r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c1 }, { ha: 'center' });
    select(tab, rg.r1, rg.c1, rg.r2, rg.c2);
  },
  cellstyle: (tab, v) => { if (v && CELL_STYLES[v] && !prot(tab)) { const patch = { ...CELL_STYLES[v] }; tab.wb.setStyle(tab.wb.active, sel2(tab), patch); } },
  formatcells: async tab => {
    if (prot(tab)) return;
    const st = tab.wb.cellStyle(curSheet(tab), tab.sel.ar, tab.sel.ac), rg = sel2(tab);
    const known = NUM_FORMATS.find(f => f[1] === (st.nf || 'General'));
    const v = await ask('Format cells', [
      { label: 'Number format', name: 'preset', type: 'select', opts: [...NUM_FORMATS, ['Custom (use the box below)', '__custom']], value: known ? known[1] : '__custom' },
      { label: 'Custom format code', name: 'custom', value: st.nf || '' },
      { label: 'Horizontal alignment', name: 'ha', type: 'select', opts: [['General', ''], ['Left', 'left'], ['Center', 'center'], ['Right', 'right'], ['Justify', 'justify']], value: st.ha || '' },
      { label: 'Vertical alignment', name: 'va', type: 'select', opts: [['Bottom', ''], ['Middle', 'middle'], ['Top', 'top']], value: st.va || '' },
      { label: 'Wrap text', name: 'wrap', type: 'select', opts: [['No', ''], ['Yes', '1']], value: st.wrap ? '1' : '' },
      { label: 'Indent', name: 'ind', type: 'number', value: st.ind || 0, min: 0, max: 15 }], 'Apply');
    if (!v) return;
    const nf = v.preset === '__custom' ? v.custom.trim() : v.preset;
    tab.wb.setStyle(tab.wb.active, rg, { nf: !nf || nf === 'General' ? null : nf, ha: v.ha || null, va: v.va || null, wrap: v.wrap ? true : null, ind: +v.ind || null });
  },
  painter: tab => {
    if (tab.painter) { tab.painter = null; refreshState(); return toast('Format painter off'); }
    tab.painter = { style: { ...tab.wb.cellStyle(curSheet(tab), tab.sel.ar, tab.sel.ac) } };
    refreshState(); toast('Click a cell or drag a range to paint the format');
  },

  /* ---- insert / delete / format cells ---- */
  insertcmd: (tab, v) => {
    if (!v || prot(tab)) return; const rg = sel2(tab), si = tab.wb.active;
    if (v === 'row') tab.wb.structure(si, 'r', rg.r1, rg.r2 - rg.r1 + 1);
    else if (v === 'col') tab.wb.structure(si, 'c', rg.c1, rg.c2 - rg.c1 + 1);
    else if (v === 'sheet') SC.addsheet(tab);
  },
  deletecmd: (tab, v) => {
    if (!v || prot(tab)) return; const rg = sel2(tab), si = tab.wb.active;
    if (v === 'row') tab.wb.structure(si, 'r', rg.r1, -(rg.r2 - rg.r1 + 1));
    else if (v === 'col') tab.wb.structure(si, 'c', rg.c1, -(rg.c2 - rg.c1 + 1));
    else if (v === 'sheet') SC.deletesheet(tab, si);
  },
  formatcmd: async (tab, v) => {
    if (!v) return; const rg = sel2(tab), sh = curSheet(tab), wb = tab.wb;
    const rows = () => { const a = []; for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 5000); r++) a.push(r); return a; };
    const cols = () => { const a = []; for (let c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 500); c++) a.push(c); return a; };
    if (v === 'rowh') { const x = await ask('Row height', [{ label: 'Height (pixels)', name: 'h', type: 'number', value: sh.rowH.get(rg.r1) || DH, min: 2, max: 500 }]); if (x) wb.mutate(() => rows().forEach(r => sh.rowH.set(r, +x.h))); }
    else if (v === 'colw') { const x = await ask('Column width', [{ label: 'Width (pixels)', name: 'w', type: 'number', value: sh.colW.get(rg.c1) || DW, min: 4, max: 1000 }]); if (x) wb.mutate(() => cols().forEach(c => sh.colW.set(c, +x.w))); }
    else if (v === 'autorow') rows().forEach(r => SC.autofitRow(tab, r, true)), wb.changed();
    else if (v === 'autocol') cols().forEach(c => SC.autofitCol(tab, c, true)), wb.changed();
    else if (v === 'hiderows') SC.hideRows(tab); else if (v === 'hidecols') SC.hideCols(tab);
    else if (v === 'unhiderows') wb.mutate(() => { for (let r = Math.max(0, rg.r1 - 1); r <= rg.r2 + 1; r++) sh.hiddenRows.delete(r); });
    else if (v === 'unhidecols') wb.mutate(() => { for (let c = Math.max(0, rg.c1 - 1); c <= rg.c2 + 1; c++) sh.hiddenCols.delete(c); });
    else if (v === 'rename') SC.renamesheet(tab, wb.active); else if (v === 'tabcolor') SC.tabcolor(tab); else if (v === 'protect') SC.protect(tab); else if (v === 'cells') SC.formatcells(tab);
  },
  hideRows: tab => { const rg = sel2(tab), sh = curSheet(tab); tab.wb.mutate(() => { for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 5000); r++) sh.hiddenRows.add(r); }); },
  hideCols: tab => { const rg = sel2(tab), sh = curSheet(tab); tab.wb.mutate(() => { for (let c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 500); c++) sh.hiddenCols.add(c); }); },
  autofitCol: (tab, c, quiet) => {
    const sh = curSheet(tab), wb = tab.wb, si = wb.active, u = wb.used(si); let w = 24;
    for (let r = 0; r <= Math.min(u.rAll, 5000); r++) { const x = sh.get(r, c); if (!x) continue; const st = wb.style(x.s), t = wb.display(si, r, c).text; w = Math.max(w, t.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * 7.2 * ((st.fs || 11) / 11) * (st.b ? 1.08 : 1) + 14); }
    sh.colW.set(c, Math.min(600, Math.round(w))); if (!quiet) wb.changed();
  },
  autofitRow: (tab, r, quiet) => {
    const sh = curSheet(tab), wb = tab.wb, si = wb.active, u = wb.used(si); let h = DH;
    for (let c = 0; c <= Math.min(u.cAll, 500); c++) { const x = sh.get(r, c); if (!x) continue; const st = wb.style(x.s); const lines = st.wrap ? Math.max(1, Math.ceil(wb.display(si, r, c).text.length * 7.2 / Math.max(20, (sh.colW.get(c) || DW) - 6))) : wb.display(si, r, c).text.split('\n').length; h = Math.max(h, lines * (st.fs || 11) * 1.45 + 4); }
    sh.rowH.set(r, Math.round(h)); if (!quiet) wb.changed();
  },
  fillcmd: (tab, dir) => {
    if (!dir || prot(tab)) return; const rg = sel2(tab), wb = tab.wb;
    const one = rg.r1 === rg.r2 && rg.c1 === rg.c2;
    if (one || (dir === 'down' && rg.r1 === rg.r2) || (dir === 'right' && rg.c1 === rg.c2)) return toast('Select the source cell and the cells to fill');
    const src = dir === 'down' ? { ...rg, r2: rg.r1 } : dir === 'up' ? { ...rg, r1: rg.r2 } : dir === 'right' ? { ...rg, c2: rg.c1 } : { ...rg, c1: rg.c2 };
    wb.fill(wb.active, src, dir, dir === 'down' || dir === 'up' ? rg.r2 - rg.r1 : rg.c2 - rg.c1);
  },
  fillcmd2: (tab, v) => v && SC.fillcmd(tab, v),
  insertnow: (tab, kind) => { if (prot(tab)) return; const d = new Date(); const v = kind === 'date' ? Math.floor(dateToSerial(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))) : (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; tab.wb.tx(() => { tab.wb.setInput(tab.wb.active, tab.sel.ar, tab.sel.ac, ''); const c = { ...(curSheet(tab).get(tab.sel.ar, tab.sel.ac) || {}), v }; c.s = tab.wb.styleId({ ...tab.wb.style(c.s), nf: kind === 'date' ? 'yyyy-mm-dd' : 'hh:mm' }); tab.wb.setCellObj(curSheet(tab), tab.sel.ar, tab.sel.ac, c); }); },
  autosum: tab => {
    if (prot(tab)) return; const wb = tab.wb, si = wb.active, rg = sel2(tab);
    const isNum = (r, c) => typeof wb.evalCell(si, r, c) === 'number';
    if (rg.r1 === rg.r2 && rg.c1 === rg.c2) {
      const r = rg.r1, c = rg.c1; let a = r - 1;
      while (a >= 0 && isNum(a, c)) a--;
      if (a < r - 1) return wb.setInput(si, r, c, `=SUM(${addr(a + 1, c)}:${addr(r - 1, c)})`), select(tab, r, c);
      let b = c - 1; while (b >= 0 && isNum(r, b)) b--;
      if (b < c - 1) return wb.setInput(si, r, c, `=SUM(${addr(r, b + 1)}:${addr(r, c - 1)})`), select(tab, r, c);
      startEdit(tab, '=SUM(', 'enter');
    } else {
      wb.tx(() => { for (let c = rg.c1; c <= rg.c2; c++) wb.setInput(si, rg.r2 + 1, c, `=SUM(${addr(rg.r1, c)}:${addr(rg.r2, c)})`); });
      select(tab, rg.r2 + 1, rg.c1, rg.r2 + 1, rg.c2);
    }
  },

  /* ---- sorting and filtering ---- */
  sortcmd: async (tab, v) => {
    if (!v || prot(tab)) return; const wb = tab.wb, si = wb.active, sh = curSheet(tab);
    if (v === 'clearfilter') { if (sh.filter) wb.mutate(() => { sh.filter.crit = null; wb.applyFilter(si); }); return; }
    if (v === 'filter') return SC.filter(tab);
    let rg = sel2(tab); if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(tab, rg.r1, rg.c1);
    if (rg.r1 === rg.r2) return toast('Select a range with at least two rows to sort');
    let header = guessHeader(tab, rg), keys;
    if (v === 'custom') {
      const colOpts = []; for (let c = rg.c1; c <= rg.c2; c++) { const t = wb.display(si, rg.r1, c).text; colOpts.push([`Column ${colName(c)}${t ? ' (' + t.slice(0, 20) + ')' : ''}`, String(c)]); }
      const x = await ask('Sort', [{ label: 'Sort by', name: 'c1', type: 'select', opts: colOpts, value: String(tab.sel.ac) }, { label: 'Order', name: 'o1', type: 'select', opts: [['A to Z / smallest first', 'asc'], ['Z to A / largest first', 'desc']] },
        { label: 'Then by', name: 'c2', type: 'select', opts: [['(none)', ''], ...colOpts] }, { label: 'Then order', name: 'o2', type: 'select', opts: [['A to Z / smallest first', 'asc'], ['Z to A / largest first', 'desc']] },
        { label: 'My data has headers', name: 'h', type: 'select', opts: [['Yes', '1'], ['No', '']], value: header ? '1' : '' }], 'Sort');
      if (!x) return; header = !!x.h; keys = [{ c: +x.c1, asc: x.o1 === 'asc' }]; if (x.c2 !== '') keys.push({ c: +x.c2, asc: x.o2 === 'asc' });
    } else keys = [{ c: Math.min(Math.max(tab.sel.ac, rg.c1), rg.c2), asc: v === 'asc' }];
    wb.sortRange(si, rg, keys, header); requestDraw(tab);
  },
  filter: tab => {
    const wb = tab.wb, si = wb.active, sh = curSheet(tab);
    if (sh.filter) { wb.mutate(() => { sh.filter = null; wb.applyFilter(si); }); tab.fFilter = false; refreshState(); return; }
    let rg = sel2(tab); if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(tab, rg.r1, rg.c1);
    if (rg.r1 === rg.r2) return toast('Select a range of data first');
    wb.mutate(() => { sh.filter = { ...rg, crit: null }; }); tab.fFilter = true; refreshState();
  },
  filterMenu: (tab, c, anchor) => {
    const wb = tab.wb, si = wb.active, sh = curSheet(tab), f = sh.filter; if (!f) return;
    const seen = new Map();
    for (let r = f.r1 + 1; r <= Math.min(f.r2, f.r1 + 20000); r++) { const t = wb.display(si, r, c).text; seen.set(t, (seen.get(t) || 0) + 1); }
    const vals = [...seen.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 500);
    const allowed = new Set(f.crit && f.crit[c] ? f.crit[c] : vals);
    closeMenu();
    const m = document.createElement('div'); m.className = 'ctxmenu fmenu'; m.id = 'ctxmenu';
    m.innerHTML = `<button data-a="asc">Sort A to Z</button><button data-a="desc">Sort Z to A</button><hr><input class="fsearch" placeholder="Search" aria-label="Search values"><div class="flist"></div><div class="frow"><button data-a="ok" class="primary">OK</button><button data-a="cancel">Cancel</button></div>`;
    const list = $('.flist', m);
    const draw = q => { list.innerHTML = `<label><input type="checkbox" data-all> (Select all)</label>` + vals.filter(v => v.toLowerCase().includes(q.toLowerCase())).map((v, i) => `<label><input type="checkbox" data-i="${i}" ${allowed.has(v) ? 'checked' : ''}> ${escH(v || '(blanks)')}</label>`).join(''); };
    draw('');
    const shown = () => vals.filter(v => v.toLowerCase().includes($('.fsearch', m).value.toLowerCase()));
    m.addEventListener('input', e => { if (e.target.classList.contains('fsearch')) draw(e.target.value); });
    m.addEventListener('change', e => { const t = e.target; if (t.dataset.all !== undefined) { shown().forEach(v => (t.checked ? allowed.add(v) : allowed.delete(v))); draw($('.fsearch', m).value); } else if (t.dataset.i !== undefined) { const v = shown()[+t.dataset.i]; if (t.checked) allowed.add(v); else allowed.delete(v); } });
    m.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'cancel') return closeMenu();
      if (a === 'asc' || a === 'desc') { closeMenu(); wb.sortRange(si, { r1: f.r1, c1: f.c1, r2: f.r2, c2: f.c2 }, [{ c, asc: a === 'asc' }], true); return requestDraw(tab); }
      closeMenu();
      wb.mutate(() => { const crit = { ...(f.crit || {}) }; if (vals.every(v => allowed.has(v))) delete crit[c]; else crit[c] = [...allowed]; f.crit = Object.keys(crit).length ? crit : null; wb.applyFilter(si); });
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - 240) + 'px'; m.style.top = (r.bottom + 2) + 'px';
    setTimeout(() => document.addEventListener('mousedown', outsideClose, true), 0);
  },
  find: tab => { const b = $('#shFind'); b.hidden = false; const s = tab.wb.display(tab.wb.active, tab.sel.ar, tab.sel.ac).text; if (s && s.length < 60) $('#shFindIn').value = s; $('#shFindIn').focus(); $('#shFindIn').select(); },
  replace: tab => { SC.find(tab); $('#shRepIn').focus(); },
  findcmd: (tab, v) => { if (v === 'find') SC.find(tab); else if (v === 'replace') SC.replace(tab); else if (v === 'goto') SC.goto(tab); else if (v === 'all') select(tab, 0, 0, MAXR - 1, MAXC - 1); },
  goto: async tab => { const v = await ask('Go to', [{ label: 'Cell, range or name', name: 'a', value: '' }], 'Go'); if (v) SC.gotoName(tab, v.a); },
  gotoName: (tab, text) => {
    const t = String(text).trim(); if (!t) return;
    const wb = tab.wb, nm = wb.names[t.toLowerCase()];
    const m = /^(?:('(?:[^']|'')+'|[^!]+)!)?(.+)$/.exec(nm ? nm.ref : t);
    let rg = m && parseRange(m[2]);
    if (m && m[1]) { const i = wb.sheetIndex(m[1].replace(/^'|'$/g, '')); if (i >= 0 && i !== wb.active) { tab.sel = { ar: 0, ac: 0, er: 0, ec: 0 }; wb.active = i; renderSheets(tab); } }
    if (rg) return select(tab, rg.r1, rg.c1, rg.r2, rg.c2);
    if (/^[A-Za-z_][\w.]*$/.test(t) && !/^[A-Za-z]{1,3}\d+$/.test(t)) { const s = sel2(tab); wb.names[t.toLowerCase()] = { name: t, ref: `${quoteSheet(curSheet(tab).name)}!${rangeAddr(s).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}` }; wb.changed(); return toast(`Named the selection "${t}"`); }
    toast('That is not a valid cell, range or name');
  },

  /* ---- validation, conditional formatting, tables ---- */
  validation: async tab => {
    if (prot(tab)) return; const rg = sel2(tab), sh = curSheet(tab);
    const cur = tab.wb.validation(tab.wb.active, rg.r1, rg.c1) || {};
    const v = await ask('Data validation', [
      { label: 'Allow', name: 'type', type: 'select', opts: [['Any value (remove rule)', ''], ['List', 'list'], ['Whole number', 'whole'], ['Decimal', 'decimal'], ['Date (serial number)', 'date'], ['Text length', 'length']], value: cur.type || '' },
      { label: 'List items (a,b,c) or a range like =Sheet1!$A$1:$A$5', name: 'list', value: cur.list || '' },
      { label: 'Number rule', name: 'op', type: 'select', opts: [['between', 'between'], ['not between', 'notbetween'], ['equal to', 'eq'], ['not equal to', 'ne'], ['greater than', 'gt'], ['less than', 'lt'], ['greater or equal', 'ge'], ['less or equal', 'le']], value: cur.op || 'between' },
      { label: 'Minimum / value', name: 'v1', value: cur.v1 ?? '' }, { label: 'Maximum', name: 'v2', value: cur.v2 ?? '' },
      { label: 'Error message', name: 'msg', value: cur.msg || '' }], 'Apply');
    if (!v) return;
    tab.wb.mutate(() => {
      sh.dv = sh.dv.filter(d => d.r2 < rg.r1 || d.r1 > rg.r2 || d.c2 < rg.c1 || d.c1 > rg.c2);
      if (v.type) sh.dv.push({ ...rg, type: v.type, list: v.list, op: v.op, v1: v.v1, v2: v.v2, msg: v.msg, blank: true });
    });
  },
  cfdialog: async tab => {
    if (prot(tab)) return; const rg = sel2(tab), sh = curSheet(tab);
    const v = await ask('Conditional formatting', [
      { label: 'Rule', name: 'type', type: 'select', opts: [['Cell value greater than', 'cell:gt'], ['Cell value less than', 'cell:lt'], ['Cell value equal to', 'cell:eq'], ['Cell value between', 'cell:between'], ['Text contains', 'text:contains'], ['Text begins with', 'text:begins'], ['Duplicate values', 'dupe'], ['Unique values', 'unique'], ['Top N items', 'top'], ['Bottom N items', 'bottom'], ['Above average', 'above'], ['Below average', 'below'], ['Blank cells', 'blank'], ['Cells with errors', 'error'], ['Color scale (2 colors)', 'scale2'], ['Color scale (3 colors)', 'scale3'], ['Data bars', 'bar'], ['Clear rules from selection', 'clearsel'], ['Clear rules from whole sheet', 'clearall']] },
      { label: 'Value (or N, or text)', name: 'v1' }, { label: 'Second value (for between)', name: 'v2' },
      { label: 'Format', name: 'fmt', type: 'select', opts: Object.keys(CF_PRESETS).map(k => [k, k]) }], 'Apply');
    if (!v) return;
    tab.wb.mutate(() => {
      if (v.type === 'clearall') { sh.cf = []; return; }
      if (v.type === 'clearsel') { sh.cf = sh.cf.filter(r => r.r2 < rg.r1 || r.r1 > rg.r2 || r.c2 < rg.c1 || r.c1 > rg.c2); return; }
      const [type, op] = v.type.split(':');
      const rule = { id: Date.now() % 1e9 + sh.cf.length, ...rg, type, op, v1: v.v1, v2: v.v2 };
      if (!['scale2', 'scale3', 'bar'].includes(type)) rule.fmt = CF_PRESETS[v.fmt];
      sh.cf.unshift(rule);
    });
  },
  tabledialog: async tab => {
    if (prot(tab)) return; let rg = sel2(tab); if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(tab, rg.r1, rg.c1);
    if (rg.r1 === rg.r2) return toast('Select a range of data first');
    const v = await ask('Format as table', [{ label: 'Table style', name: 'style', type: 'select', opts: [['Blue', 'blue'], ['Green', 'green'], ['Orange', 'orange'], ['Gray', 'gray'], ['Pink', 'pink']] }], 'Create');
    if (!v) return; const sh = curSheet(tab);
    tab.wb.mutate(() => { sh.tables = sh.tables.filter(t => t.r2 < rg.r1 || t.r1 > rg.r2 || t.c2 < rg.c1 || t.c1 > rg.c2); sh.tables.push({ ...rg, style: v.style, banded: true }); if (!sh.filter) sh.filter = { ...rg, crit: null }; });
    select(tab, rg.r1, rg.c1, rg.r2, rg.c2);
  },
  textcols: async tab => {
    if (prot(tab)) return; const rg = sel2(tab);
    const v = await ask('Text to columns', [{ label: 'Split on', name: 'd', type: 'select', opts: [['Comma', ','], ['Semicolon', ';'], ['Tab', '\t'], ['Space', ' '], ['Other (type below)', '__']] }, { label: 'Other separator', name: 'o', value: '' }], 'Split');
    if (!v) return; const d = v.d === '__' ? v.o : v.d; if (!d) return toast('Type a separator');
    tab.wb.textToColumns(tab.wb.active, rg, d);
  },
  dedupe: async tab => {
    if (prot(tab)) return; let rg = sel2(tab); if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(tab, rg.r1, rg.c1);
    const hdr = guessHeader(tab, rg);
    const v = await ask('Remove duplicates', [{ label: 'My data has headers', name: 'h', type: 'select', opts: [['Yes', '1'], ['No', '']], value: hdr ? '1' : '' }], 'Remove');
    if (!v) return; const cols = []; for (let c = rg.c1; c <= rg.c2; c++) cols.push(c);
    const n = tab.wb.removeDuplicates(tab.wb.active, rg, cols, !!v.h); toast(n ? `Removed ${n} duplicate row${n > 1 ? 's' : ''}` : 'No duplicates found');
  },
  importcsv: tab => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.txt,text/csv,text/plain';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; if (f.size > 40e6) return toast('That file is larger than 40 MB');
      const text = await f.text(), wb = tab.wb;
      wb.mutate(() => { const sh = new Sheet(wb.uniqueName(f.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Imported')); wb.sheets.push(sh); wb.active = wb.sheets.length - 1; });
      importText(wb, wb.active, text); tab.sel = { ar: 0, ac: 0, er: 0, ec: 0 }; renderSheets(tab); toast(`Imported ${f.name}`);
    };
    inp.click();
  },
  hyperlink: async tab => {
    if (prot(tab)) return; const cell = curSheet(tab).get(tab.sel.ar, tab.sel.ac);
    const v = await ask('Hyperlink', [{ label: 'Address (https://…)', name: 'u', value: (cell && cell.link) || '' }, { label: 'Text to display', name: 't', value: cell && cell.v !== undefined ? String(cell.v) : '' }], 'OK');
    if (!v) return; const u = v.u.trim();
    if (u && !/^(https?:\/\/|mailto:)/i.test(u)) return toast('Use https://, http:// or mailto:');
    tab.wb.tx(() => { const c = { ...(cell || {}) }; if (u) { c.link = u; if (v.t || c.v === undefined) c.v = v.t || u; delete c.f; } else delete c.link; tab.wb.setCellObj(curSheet(tab), tab.sel.ar, tab.sel.ac, c); });
  },
  newnote: async tab => {
    if (prot(tab)) return; const cell = curSheet(tab).get(tab.sel.ar, tab.sel.ac);
    const v = await ask('Note', [{ label: 'Note text', name: 't', type: 'textarea', rows: 4, value: (cell && cell.n) || '' }], 'Save'); if (!v) return;
    tab.wb.tx(() => tab.wb.setCellObj(curSheet(tab), tab.sel.ar, tab.sel.ac, { ...(cell || {}), n: v.t.trim() || undefined }));
  },
  delnote: tab => { const cell = curSheet(tab).get(tab.sel.ar, tab.sel.ac); if (!cell || !cell.n) return toast('This cell has no note'); tab.wb.tx(() => tab.wb.setCellObj(curSheet(tab), tab.sel.ar, tab.sel.ac, { ...cell, n: undefined })); },
  protect: tab => { const sh = curSheet(tab); tab.wb.mutate(() => { sh.protect = !sh.protect; }); syncFlags(tab); refreshState(); toast(sh.protect ? 'Sheet protected (this guards against accidental edits only)' : 'Sheet unprotected'); },

  /* ---- names and functions ---- */
  definename: async tab => {
    const s = sel2(tab), v = await ask('Define name', [{ label: 'Name', name: 'n' }, { label: 'Refers to', name: 'r', value: `${quoteSheet(curSheet(tab).name)}!${rangeAddr(s).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}` }], 'OK');
    if (!v) return; const n = v.n.trim();
    if (!/^[A-Za-z_][\w.]*$/.test(n) || /^[A-Za-z]{1,3}\d+$/.test(n)) return toast('Names must start with a letter and cannot look like a cell address');
    tab.wb.mutate(() => { tab.wb.names[n.toLowerCase()] = { name: n, ref: v.r.trim() }; });
  },
  namemgr: async tab => {
    const names = Object.values(tab.wb.names); let del = null;
    await dialog({ title: 'Name manager', ok: '', html: names.length ? `<div class="srclist">${names.map((n, i) => `<div class="nmrow"><b>${escH(n.name)}</b><span>${escH(n.ref)}</span><button type="button" class="btn" data-i="${i}">Delete</button></div>`).join('')}</div>` : '<p class="muted">No names yet. Select cells and use Define Name, or type a name in the Name Box.</p>',
      onBuild: (b, d) => $$('button', b).forEach(x => x.addEventListener('click', () => { del = names[+x.dataset.i].name; d.close('cancel'); })) });
    if (del) tab.wb.mutate(() => { delete tab.wb.names[del.toLowerCase()]; });
  },
  insertfn: async (tab, cat) => {
    const categories = Object.keys(FN_CATS); let pick = null;
    if (cat && FN_CATS[cat]) { /* open directly on a category */ }
    await dialog({ title: 'Insert function', ok: '', html: `<label>Category <select id="fnCat">${categories.map(c => `<option${c === cat ? ' selected' : ''}>${c}</option>`).join('')}</select></label><div class="gallery fnlist" id="fnList"></div>`,
      onBuild: (b, d) => { const fill = () => { $('#fnList', b).innerHTML = FN_CATS[$('#fnCat', b).value].map(n => `<button type="button" class="gl fnb" data-fn="${n}">${n}</button>`).join(''); $$('.fnb', b).forEach(x => x.addEventListener('click', () => { pick = x.dataset.fn; d.close('cancel'); })); }; $('#fnCat', b).addEventListener('change', fill); fill(); } });
    if (!pick) return;
    if (tab.edit) { const ed = $('#cellEditor'), p = ed.selectionStart; ed.value = ed.value.slice(0, p) + pick + '(' + ed.value.slice(ed.selectionEnd); ed.setSelectionRange(p + pick.length + 1, p + pick.length + 1); syncFx(tab); ed.focus(); }
    else startEdit(tab, '=' + pick + '(', 'enter');
  },
  fncat: (tab, v) => { if (v) SC.insertfn(tab, v); },
  showformulas: tab => { tab.showFormulas = !tab.showFormulas; requestDraw(tab); refreshState(); },
  calcnow: tab => { tab.wb.touch(); tab._geomKey = null; requestDraw(tab); toast('Calculated'); },
  dropdown: tab => {
    const wb = tab.wb, dv = wb.validation(wb.active, tab.sel.ar, tab.sel.ac); if (!dv || dv.type !== 'list') return;
    const opts = wb.listOptions(wb.active, dv); closeMenu();
    const m = document.createElement('div'); m.className = 'ctxmenu'; m.id = 'ctxmenu';
    m.innerHTML = opts.slice(0, 200).map((o, i) => `<button data-i="${i}">${escH(o)}</button>`).join('') || '<button disabled>(no choices)</button>';
    m.addEventListener('click', e => { const i = e.target.dataset && e.target.dataset.i; if (i === undefined) return; closeMenu(); wb.setInput(wb.active, tab.sel.ar, tab.sel.ac, opts[+i]); requestDraw(tab); });
    document.body.appendChild(m);
    const a = cellRect(tab, tab.sel.ar, tab.sel.ac), r = $('#gscroll').getBoundingClientRect(), v = tab._view;
    m.style.left = Math.min(innerWidth - 220, r.left + a.x - v.sx * (tab.sel.ac < v.fc ? 0 : 1)) + 'px'; m.style.top = (r.top + a.y + a.h - (tab.sel.ar < v.fr ? 0 : v.sy)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', outsideClose, true), 0);
  },

  /* ---- view, page and sheets ---- */
  zoom: (tab, d) => { const sh = curSheet(tab); sh.zoom = d === 0 ? 100 : Math.min(400, Math.max(25, sh.zoom + d)); tab._geomKey = null; drawGrid(tab); syncZoomLabel(tab); },
  zoomsel: tab => { const rg = sel2(tab), v = tab._view, sh = curSheet(tab); const w = (rg.c2 - rg.c1 + 1) * DW, h = (rg.r2 - rg.r1 + 1) * DH; sh.zoom = Math.max(25, Math.min(400, Math.floor(Math.min((v.vw - HW) / w, (v.vh - HH) / h) * 100))); tab._geomKey = null; drawGrid(tab); syncZoomLabel(tab); },
  grid: tab => { const sh = curSheet(tab); sh.showGrid = !sh.showGrid; syncFlags(tab); requestDraw(tab); refreshState(); },
  headings: tab => { const sh = curSheet(tab); sh.showHeadings = !sh.showHeadings; syncFlags(tab); tab._geomKey = null; requestDraw(tab); refreshState(); },
  fbar: tab => { tab.fBar = !tab.fBar; $('#fxbar').hidden = !tab.fBar; refreshState(); },
  printgrid: tab => { const sh = curSheet(tab); sh.page.printGrid = !sh.page.printGrid; syncFlags(tab); refreshState(); },
  freeze: (tab, v) => {
    if (!v) return; const sh = curSheet(tab), s = tab.sel;
    tab.wb.mutate(() => { sh.freeze = v === 'none' ? { r: 0, c: 0 } : v === 'row' ? { r: 1, c: 0 } : v === 'col' ? { r: 0, c: 1 } : { r: s.ar, c: s.ac }; });
  },
  smargin: (tab, v) => { curSheet(tab).page.margin = +v; tab.wb.changed(); },
  sorient: (tab, v) => { curSheet(tab).page.orient = v; tab.wb.changed(); },
  spsize: (tab, v) => { curSheet(tab).page.size = v; tab.wb.changed(); },
  printarea: tab => { curSheet(tab).page.area = { ...sel2(tab) }; tab.wb.changed(); toast('Print area set'); },
  clearprintarea: tab => { curSheet(tab).page.area = null; tab.wb.changed(); toast('Print area cleared'); },
  addsheet: tab => { const wb = tab.wb; wb.mutate(() => { wb.sheets.splice(wb.active + 1, 0, new Sheet(wb.uniqueName('Sheet' + (wb.sheets.length + 1)))); wb.active++; }); tab.sel = { ar: 0, ac: 0, er: 0, ec: 0 }; renderSheets(tab); },
  deletesheet: async (tab, i) => {
    const wb = tab.wb; if (wb.sheets.length < 2) return toast('A workbook needs at least one sheet');
    const v = await ask('Delete sheet', [], 'Delete', `<p>Delete “${escH(wb.sheets[i].name)}”? You can undo this.</p>`); if (!v) return;
    wb.mutate(() => { wb.sheets.splice(i, 1); wb.active = Math.min(wb.active, wb.sheets.length - 1); }); tab.sel = { ar: 0, ac: 0, er: 0, ec: 0 }; renderSheets(tab);
  },
  renamesheet: async (tab, i) => {
    const wb = tab.wb, v = await ask('Rename sheet', [{ label: 'Sheet name', name: 'n', value: wb.sheets[i].name }], 'Rename'); if (!v) return;
    const n = v.n.trim().replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    if (!n) return; if (wb.sheetIndex(n) >= 0 && wb.sheetIndex(n) !== i) return toast('A sheet with that name already exists');
    wb.mutate(() => { const old = wb.sheets[i].name; wb.sheets[i].name = n; for (const s of wb.sheets) for (const c of s.cells.values()) if (c.f !== undefined) c.f = renameInFormula(c.f, old, n); for (const nm of Object.values(wb.names)) nm.ref = renameInFormula(nm.ref, old, n); });
  },
  dupsheet: tab => { const wb = tab.wb, src = curSheet(tab); wb.mutate(() => { const copy = JSON.parse(JSON.stringify(wb.toJSON(false).sheets[wb.active])); const tmp = Workbook.fromJSON({ v: 1, styles: wb.styles, sheets: [copy] }).sheets[0]; tmp.name = wb.uniqueName(src.name + ' (copy)'); wb.sheets.splice(wb.active + 1, 0, tmp); wb.active++; }); renderSheets(tab); },
  movesheet: (tab, d) => { const wb = tab.wb, i = wb.active, j = i + d; if (j < 0 || j >= wb.sheets.length) return; wb.mutate(() => { [wb.sheets[i], wb.sheets[j]] = [wb.sheets[j], wb.sheets[i]]; wb.active = j; }); },
  tabcolor: async tab => { const v = await ask('Tab color', [{ label: 'Color', name: 'c', type: 'color', value: curSheet(tab).tabColor || '#12a37a' }], 'OK'); if (v) tab.wb.mutate(() => { curSheet(tab).tabColor = v.c; }); },
  shortcuts: () => dialog({ title: 'Keyboard shortcuts', ok: '', html: `<dl class="info"><dt>Arrows / Tab / Enter</dt><dd>Move</dd><dt>Ctrl+Arrows</dt><dd>Jump to data edge</dd><dt>Shift+Arrows</dt><dd>Extend selection</dd><dt>F2</dt><dd>Edit cell</dd>
    <dt>Ctrl+C / X / V</dt><dd>Copy / Cut / Paste</dd><dt>Ctrl+Z / Y</dt><dd>Undo / Redo</dd><dt>Ctrl+B / I / U</dt><dd>Bold / Italic / Underline</dd><dt>Ctrl+D / R</dt><dd>Fill down / right</dd><dt>Ctrl+; / :</dt><dd>Insert date / time</dd>
    <dt>Alt+=</dt><dd>AutoSum</dd><dt>Ctrl+F / H</dt><dd>Find / Replace</dd><dt>Ctrl+1</dt><dd>Format cells</dd><dt>Ctrl+Shift+L</dt><dd>Filter</dd><dt>Ctrl+S</dt><dd>Save</dd></dl>` }),
  about: () => dialog({ title: 'About DigiCre8 Sheets', ok: '', html: '<p>DigiCre8 Sheets, part of DigiCre8 Office 0.5.0.</p>' })
});
const quoteSheet = n => (/^[A-Za-z_][\w.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
function renameInFormula(f, from, to) {
  return mapRefs(f, (sh, ref) => {
    if (!sh) return ref;
    const name = sh.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'");
    return name.toLowerCase() === from.toLowerCase() ? quoteSheet(to) + '!' + ref : sh + ref;
  });
}
function stepFont(tab, dir) {
  const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72], cur = tab.wb.cellStyle(curSheet(tab), tab.sel.ar, tab.sel.ac).fs || 11;
  const next = dir > 0 ? sizes.find(s => s > cur) : [...sizes].reverse().find(s => s < cur);
  if (next) SC.ssize(tab, next);
}

/* ================= Charts ================= */
function niceTicks(min, max, n = 5) {
  if (min === max) max = min + 1;
  const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi: ticks[ticks.length - 1], ticks };
}
const fmtTick = v => (Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e4 ? +(v / 1e3).toFixed(1) + 'k' : String(+v.toFixed(6)));
function chartData(tab, ch) {
  const wb = tab.wb, m = /^(?:('(?:[^']|'')+'|[^!]+)!)?(.+)$/.exec(ch.ref || ''); if (!m) return null;
  const si = m[1] ? wb.sheetIndex(m[1].replace(/^'|'$/g, '').replace(/''/g, "'")) : wb.active, rg = parseRange(m[2]);
  if (si < 0 || !rg || (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1) > 20000) return null;
  const M = [];
  for (let r = rg.r1; r <= rg.r2; r++) { const row = []; for (let c = rg.c1; c <= rg.c2; c++) row.push({ v: wb.evalCell(si, r, c), t: wb.display(si, r, c).text }); M.push(row); }
  const isTxt = x => typeof x.v === 'string' && x.v !== '';
  const header = M.length > 1 && M[0].slice(rg.c2 > rg.c1 ? 1 : 0).some(isTxt);
  const body = header ? M.slice(1) : M;
  const hasCat = M[0].length > 1 && (body.some(row => isTxt(row[0])) || (header && !M[0][0].v));
  const start = hasCat ? 1 : 0, num = x => (typeof x.v === 'number' ? x.v : typeof x.v === 'boolean' ? +x.v : 0);
  const series = []; for (let j = start; j < M[0].length; j++) series.push({ name: header && M[0][j].t ? M[0][j].t : `Series ${j - start + 1}`, vals: body.map(row => num(row[j])) });
  return { cats: body.map((row, i) => (hasCat ? row[0].t : String(i + 1))), xs: hasCat ? body.map(row => (typeof row[0].v === 'number' ? row[0].v : NaN)) : null, series };
}
function sheetChartSvg(ch, data, W, H) {
  const { cats, series } = data, pal = PALETTE, isPie = ch.type === 'pie';
  const esc2 = escH, titleH = ch.title ? 30 : 8;
  const legendItems = isPie ? cats.map((c, i) => ({ n: c, c: pal[i % pal.length] })) : series.length > 1 ? series.map((s, i) => ({ n: s.name, c: pal[i % pal.length] })) : [];
  let lx = 14, ly = H - 8; const legend = [];
  if (legendItems.length) { let x = 14, rows = 1; for (const it of legendItems) { const w = 22 + Math.min(it.n.length, 18) * 6.5; if (x + w > W - 8) { x = 14; rows++; } legend.push({ ...it, x, row: rows }); x += w + 8; } ly = H - 6 - rows * 16; lx = rows; }
  const legH = legendItems.length ? lx * 16 + 8 : 0;
  const padL = 46, padR = 14, y0 = titleH, y1 = H - 26 - legH, x0 = padL, x1 = W - padR;
  let body = '';
  if (isPie) {
    const vals = (series[0] ? series[0].vals : []).map(v => Math.max(0, v)), total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = (y0 + H - legH) / 2 + 4, R = Math.max(20, Math.min(W / 2 - 20, (H - legH - y0) / 2 - 8));
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + v / total * Math.PI * 2, c = pal[i % pal.length];
      body += vals.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c}"/>` : `<path d="M${cx} ${cy}L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}z" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
      if (v / total > 0.05) { const am = (a0 + a1) / 2; body += `<text x="${cx + R * 0.62 * Math.cos(am)}" y="${cy + R * 0.62 * Math.sin(am) + 4}" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">${Math.round(v / total * 100)}%</text>`; }
      a0 = a1;
    });
  } else {
    const all = series.flatMap(s => s.vals), horizontal = ch.type === 'bar', scatter = ch.type === 'scatter';
    let mn = Math.min(0, ...all, 0), mx = Math.max(0, ...all, 0); if (scatter) { mn = Math.min(...all, 0); mx = Math.max(...all, 1); }
    const T = niceTicks(mn, mx), n = Math.max(1, cats.length);
    const plotW = x1 - x0, plotH = y1 - y0;
    const vx = v => x0 + (v - T.lo) / (T.hi - T.lo) * plotW, vy = v => y1 - (v - T.lo) / (T.hi - T.lo) * plotH;
    if (horizontal) T.ticks.forEach(t => { body += `<line x1="${vx(t)}" y1="${y0}" x2="${vx(t)}" y2="${y1}" stroke="#e3e5ee"/><text x="${vx(t)}" y="${y1 + 14}" text-anchor="middle" fill="#666" font-size="10">${fmtTick(t)}</text>`; });
    else T.ticks.forEach(t => { body += `<line x1="${x0}" y1="${vy(t)}" x2="${x1}" y2="${vy(t)}" stroke="#e3e5ee"/><text x="${x0 - 6}" y="${vy(t) + 3}" text-anchor="end" fill="#666" font-size="10">${fmtTick(t)}</text>`; });
    body += `<path d="M${x0} ${y0}V${y1}H${x1}" stroke="#999" fill="none"/>`;
    const k = series.length;
    if (ch.type === 'column') {
      const gw = plotW / n;
      series.forEach((s, si2) => s.vals.forEach((v, i) => { const bw = gw * 0.72 / k, bx = x0 + i * gw + gw * 0.14 + si2 * bw, top = vy(Math.max(v, 0)), bot = vy(Math.min(v, 0)); body += `<rect x="${bx}" y="${top}" width="${Math.max(1, bw - 1)}" height="${Math.max(0.5, bot - top)}" fill="${pal[si2 % pal.length]}"/>`; }));
      cats.forEach((c, i) => { body += `<text x="${x0 + i * gw + gw / 2}" y="${y1 + 14}" text-anchor="middle" fill="#444" font-size="10">${esc2(c.slice(0, Math.max(3, Math.floor(gw / 6))))}</text>`; });
    } else if (horizontal) {
      const gh = plotH / n;
      series.forEach((s, si2) => s.vals.forEach((v, i) => { const bh = gh * 0.72 / k, by = y0 + i * gh + gh * 0.14 + si2 * bh, l = vx(Math.min(v, 0)), r = vx(Math.max(v, 0)); body += `<rect x="${l}" y="${by}" width="${Math.max(0.5, r - l)}" height="${Math.max(1, bh - 1)}" fill="${pal[si2 % pal.length]}"/>`; }));
      cats.forEach((c, i) => { body += `<text x="${x0 - 6}" y="${y0 + i * gh + gh / 2 + 3}" text-anchor="end" fill="#444" font-size="10">${esc2(c.slice(0, 8))}</text>`; });
    } else if (scatter) {
      const xsv = data.xs && data.xs.every(Number.isFinite) ? data.xs : cats.map((_, i) => i + 1), XT = niceTicks(Math.min(...xsv), Math.max(...xsv)), px = v => x0 + (v - XT.lo) / (XT.hi - XT.lo) * plotW;
      XT.ticks.forEach(t => { body += `<text x="${px(t)}" y="${y1 + 14}" text-anchor="middle" fill="#666" font-size="10">${fmtTick(t)}</text>`; });
      series.forEach((s, si2) => s.vals.forEach((v, i) => { body += `<circle cx="${px(xsv[i])}" cy="${vy(v)}" r="4" fill="${pal[si2 % pal.length]}"/>`; }));
    } else { // line and area
      const px = i => x0 + (n === 1 ? plotW / 2 : i / (n - 1) * plotW);
      series.forEach((s, si2) => {
        const pts = s.vals.map((v, i) => [px(i), vy(v)]), c = pal[si2 % pal.length];
        if (ch.type === 'area') body += `<polygon points="${[[pts[0][0], vy(0)], ...pts, [pts[pts.length - 1][0], vy(0)]].map(p => p.join(',')).join(' ')}" fill="${c}" fill-opacity="0.35"/>`;
        body += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
        if (ch.type === 'line') pts.forEach(p => { body += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${c}"/>`; });
      });
      cats.forEach((c, i) => { if (n <= 14 || i % Math.ceil(n / 14) === 0) body += `<text x="${px(i)}" y="${y1 + 14}" text-anchor="middle" fill="#444" font-size="10">${esc2(c.slice(0, 8))}</text>`; });
    }
  }
  const leg = legend.map(l => `<rect x="${l.x}" y="${H - 6 - (lx - l.row + 1) * 16 + 2}" width="10" height="10" rx="2" fill="${l.c}"/><text x="${l.x + 14}" y="${H - 6 - (lx - l.row + 1) * 16 + 11}" fill="#333" font-size="11">${esc2(l.n.slice(0, 18))}</text>`).join('');
  void ly;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${ch.title ? `<text x="${W / 2}" y="21" text-anchor="middle" font-size="14" font-weight="600" fill="#1b1b1f">${esc2(ch.title)}</text>` : ''}${body}${leg}</svg>`;
}
function drawCharts(tab) {
  const layer = $('#chartlayer'), v = tab._view; if (!layer || !v) return;
  const sh = curSheet(tab), wb = tab.wb, k = [wb.version, wb.active, v.z, tab.selChart || '', v.hw, sh.charts.length].join(':');
  if (layer.dataset.k === k) return; layer.dataset.k = k;
  layer.innerHTML = sh.charts.map(ch => {
    const d = chartData(tab, ch), z = v.z, w = Math.round(ch.w * z), h = Math.round(ch.h * z);
    const x = v.hw + v.G.col.left(ch.c) + ch.dx * z, y = v.hh + v.G.row.left(ch.r) + ch.dy * z;
    return `<div class="chartbox${tab.selChart === ch.id ? ' sel' : ''}" data-id="${ch.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${d ? sheetChartSvg(ch, d, w, h) : '<div class="chartmsg">Chart data not found</div>'}<i class="chh"></i></div>`;
  }).join('');
}
function bindChartLayer(tab) {
  const layer = $('#chartlayer'); if (!layer) return;
  layer.addEventListener('mousedown', e => {
    const box = e.target.closest('.chartbox'); if (!box) return;
    e.stopPropagation(); e.preventDefault();
    const sh = curSheet(tab), ch = sh.charts.find(c => String(c.id) === box.dataset.id); if (!ch) return;
    tab.selChart = ch.id; $('#gridwrap').focus({ preventScroll: true }); layer.dataset.k = ''; drawCharts(tab);
    if (curSheet(tab).protect) return;
    const resize = e.target.classList.contains('chh'), start = { x: e.clientX, y: e.clientY, w: ch.w, h: ch.h, r: ch.r, c: ch.c, dx: ch.dx, dy: ch.dy }, z = sh.zoom / 100;
    const move = ev => {
      const dX = (ev.clientX - start.x) / z, dY = (ev.clientY - start.y) / z;
      if (resize) { ch.w = Math.max(160, Math.round(start.w + dX)); ch.h = Math.max(110, Math.round(start.h + dY)); }
      else { ch.dx = Math.round(start.dx + dX); ch.dy = Math.round(start.dy + dY); }
      layer.dataset.k = ''; drawCharts(tab);
    };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      const fin = { w: ch.w, h: ch.h, dx: ch.dx, dy: ch.dy };
      Object.assign(ch, { w: start.w, h: start.h, dx: start.dx, dy: start.dy });
      if (fin.w !== start.w || fin.h !== start.h || fin.dx !== start.dx || fin.dy !== start.dy) {
        tab.wb.mutate(() => {
          Object.assign(ch, fin);
          // re-anchor to the cell under the new top-left so the chart stays attached when rows or columns change
          const G = tab._view.G, ax = G.col.left(ch.c) + ch.dx * z, ay = G.row.left(ch.r) + ch.dy * z;
          const nc = G.col.at(Math.max(0, ax)), nr = G.row.at(Math.max(0, ay));
          ch.dx = Math.round((ax - G.col.left(nc)) / z); ch.dy = Math.round((ay - G.row.left(nr)) / z); ch.c = nc; ch.r = nr;
        });
      }
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  layer.addEventListener('dblclick', e => { const box = e.target.closest('.chartbox'); if (box) editChart(tab, box.dataset.id); });
}
function deleteChart(tab) {
  const sh = curSheet(tab), id = tab.selChart; if (id === undefined || id === null) return;
  tab.wb.mutate(() => { sh.charts = sh.charts.filter(c => c.id !== id); }); tab.selChart = null;
}
async function editChart(tab, id) {
  const sh = curSheet(tab), ch = sh.charts.find(c => String(c.id) === String(id)); if (!ch) return;
  const v = await ask('Edit chart', [{ label: 'Chart type', name: 'type', type: 'select', opts: [['Column', 'column'], ['Bar', 'bar'], ['Line', 'line'], ['Area', 'area'], ['Pie', 'pie'], ['Scatter', 'scatter']], value: ch.type },
    { label: 'Title', name: 'title', value: ch.title }, { label: 'Data range (first row = series names, first column = labels)', name: 'ref', value: ch.ref }], 'Apply');
  if (!v) return;
  tab.wb.mutate(() => { ch.type = v.type; ch.title = v.title; if (v.ref.trim()) ch.ref = v.ref.trim(); });
}
SC.chart = async (tab, type) => {
  if (prot(tab)) return;
  let rg = sel2(tab); if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(tab, rg.r1, rg.c1);
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2 && !hasData(tab, rg.r1, rg.c1)) return toast('Select some data first, then insert a chart');
  const sh = curSheet(tab), ref = `${quoteSheet(sh.name)}!${rangeAddr(rg)}`;
  const v = await ask('Insert chart', [{ label: 'Chart type', name: 'type', type: 'select', opts: [['Column', 'column'], ['Bar', 'bar'], ['Line', 'line'], ['Area', 'area'], ['Pie', 'pie'], ['Scatter', 'scatter']], value: type || 'column' },
    { label: 'Title', name: 'title', value: '' }, { label: 'Data range', name: 'ref', value: ref }], 'Insert');
  if (!v) return;
  const G = tab._view.G, z = sh.zoom / 100, sx = tab._view.sx / z, sy = tab._view.sy / z;
  const anchorC = Math.max(rg.c2 + 1, 0), id = Date.now() % 1e9 + sh.charts.length;
  tab.wb.mutate(() => { sh.charts.push({ id, type: v.type, title: v.title, ref: v.ref.trim() || ref, r: Math.max(0, rg.r1), c: anchorC, dx: 12, dy: 4, w: 420, h: 260 }); });
  void G; void sx; void sy; tab.selChart = id; requestDraw(tab);
};
async function chartImages(tab) {
  const out = [];
  for (const [si, sh] of tab.wb.sheets.entries()) {
    for (const ch of sh.charts) {
      const prev = tab.wb.active; // chartData evaluates by reference; no need to switch sheets
      void prev;
      const d = chartData(tab, ch); if (!d) continue;
      try {
        const svgEl = new DOMParser().parseFromString(sheetChartSvg(ch, d, ch.w, ch.h), 'image/svg+xml').documentElement;
        const png = (await svgToPng(svgEl, ch.w, ch.h)).replace(/^data:image\/png;base64,/, '');
        out.push({ sheet: si, r: ch.r, c: ch.c, w: ch.w, h: ch.h, png });
      } catch (e) { /* skip charts that cannot be drawn */ }
    }
  }
  return out;
}

/* ================= Context menus ================= */
function closeMenu() { const m = $('#ctxmenu'); if (m) m.remove(); document.removeEventListener('mousedown', outsideClose, true); }
function outsideClose(e) { const m = $('#ctxmenu'); if (m && !m.contains(e.target)) closeMenu(); }
function showContext(tab, e, h) {
  closeMenu();
  const clip = [['Cut', () => SC.copy(tab, true)], ['Copy', () => SC.copy(tab, false)], ['Paste', () => SC.paste(tab)]];
  const items = h.kind === 'colhdr' || h.kind === 'colresize' ? [...clip, '-', ['Insert column', () => SC.insertcmd(tab, 'col')], ['Delete column', () => SC.deletecmd(tab, 'col')], ['Clear contents', () => SC.clear(tab, 'contents')], '-', ['Column width…', () => SC.formatcmd(tab, 'colw')], ['Hide', () => SC.hideCols(tab)], ['Unhide', () => SC.formatcmd(tab, 'unhidecols')]]
    : h.kind === 'rowhdr' || h.kind === 'rowresize' ? [...clip, '-', ['Insert row', () => SC.insertcmd(tab, 'row')], ['Delete row', () => SC.deletecmd(tab, 'row')], ['Clear contents', () => SC.clear(tab, 'contents')], '-', ['Row height…', () => SC.formatcmd(tab, 'rowh')], ['Hide', () => SC.hideRows(tab)], ['Unhide', () => SC.formatcmd(tab, 'unhiderows')]]
    : h.kind === 'sheettab' ? [['Insert sheet', () => SC.addsheet(tab)], ['Rename…', () => SC.renamesheet(tab, h.i)], ['Delete', () => SC.deletesheet(tab, h.i)], ['Duplicate', () => SC.dupsheet(tab)], '-', ['Move left', () => SC.movesheet(tab, -1)], ['Move right', () => SC.movesheet(tab, 1)], ['Tab color…', () => SC.tabcolor(tab)], ['Protect sheet', () => SC.protect(tab)]]
    : [...clip, ['Paste values only', () => SC.paste(tab, 'values')], '-', ['Insert row', () => SC.insertcmd(tab, 'row')], ['Insert column', () => SC.insertcmd(tab, 'col')], ['Delete row', () => SC.deletecmd(tab, 'row')], ['Delete column', () => SC.deletecmd(tab, 'col')], ['Clear contents', () => SC.clear(tab, 'contents')], '-',
      ['Sort A to Z', () => SC.sortcmd(tab, 'asc')], ['Sort Z to A', () => SC.sortcmd(tab, 'desc')], ['Filter', () => SC.filter(tab)], '-', ['Format cells…', () => SC.formatcells(tab)], ['Note…', () => SC.newnote(tab)], ['Hyperlink…', () => SC.hyperlink(tab)], ['Define name…', () => SC.definename(tab)]];
  const m = document.createElement('div'); m.className = 'ctxmenu'; m.id = 'ctxmenu';
  items.forEach((it, i) => { if (it === '-') { m.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.textContent = it[0]; b.addEventListener('click', () => { closeMenu(); it[1](); }); void i; m.appendChild(b); });
  document.body.appendChild(m);
  m.style.left = Math.min(e.clientX, innerWidth - 210) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - m.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outsideClose, true), 0);
}
function applyPainterSheet(tab) {
  const p = tab.painter; tab.painter = null; if (!p || prot(tab)) { refreshState(); return; }
  const keys = ['ff', 'fs', 'b', 'i', 'u', 'st', 'fc', 'bg', 'ha', 'va', 'wrap', 'ind', 'nf', 'bt', 'br', 'bb', 'bl'], patch = {};
  keys.forEach(k => { patch[k] = p.style[k] === undefined ? null : p.style[k]; });
  tab.wb.setStyle(tab.wb.active, selRange(tab), patch); refreshState();
}

/* ================= Ribbon ================= */
const PCT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const R1 = (cmd, label, opts, def, extra) => ({ ...SEL(cmd, label, opts, def), reset: 1, ...(extra || {}) });
const SHEET_RIBBON = {
  Home: [
    ['Clipboard', [B('Paste', 'paste', { big: 1, ic: 'paste' }), R1('pastemode', 'Paste options', [['Paste special…', ''], ['Values only', 'values'], ['Formats only', 'formats'], ['Formulas only', 'formulas']], ''), B('Cut', 'cutcmd'), B('Copy', 'copycmd'), B('Format Painter', 'painter', { flag: 'painter' })]],
    ['Font', [SEL('sfont', 'Font', FONTS.map(f => [f, f]), 'Calibri'), SEL('ssize', 'Font size', PCT_SIZES.map(p => [p, p]), 11), B('A▲', 'fsinc', { title: 'Increase font size' }), B('A▼', 'fsdec', { title: 'Decrease font size' }),
      B('B', 'togglestyle', { arg: 'b', cls: 'b', sty: 'b', title: 'Bold (Ctrl+B)' }), B('I', 'togglestyle', { arg: 'i', cls: 'i', sty: 'i', title: 'Italic (Ctrl+I)' }), B('U', 'togglestyle', { arg: 'u', cls: 'u', sty: 'u', title: 'Underline (Ctrl+U)' }), B('abc', 'togglestyle', { arg: 'st', cls: 's', sty: 'st', title: 'Strikethrough' }),
      R1('border', 'Borders', [['Borders…', ''], ['All borders', 'all'], ['Outside borders', 'outside'], ['Thick outside border', 'thick'], ['Top border', 'top'], ['Bottom border', 'bottom'], ['Left border', 'left'], ['Right border', 'right'], ['Double bottom border', 'double'], ['No border', 'none']], ''),
      COL('sfill', 'Fill color', '#ffe600', 'Fill'), COL('sfontcolor', 'Font color', '#d62828', 'A')]],
    ['Alignment', [SEL('valign', 'Vertical alignment', [['Bottom', 'bottom'], ['Middle', 'middle'], ['Top', 'top']], 'bottom'), B('Left', 'align', { arg: 'left', sty: 'ha:left' }), B('Center', 'align', { arg: 'center', sty: 'ha:center' }), B('Right', 'align', { arg: 'right', sty: 'ha:right' }), B('Wrap Text', 'togglestyle', { arg: 'wrap', sty: 'wrap' }),
      R1('mergeop', 'Merge cells', [['Merge…', ''], ['Merge & center', 'center'], ['Merge across', 'across'], ['Merge cells', 'cells'], ['Unmerge cells', 'unmerge']], ''), B('◀ Indent', 'indent', { arg: -1 }), B('Indent ▶', 'indent', { arg: 1 })]],
    ['Number', [SEL('numfmt', 'Number format', NUM_FORMATS, 'General'), B('$', 'numquick', { arg: '$#,##0.00', title: 'Currency' }), B('%', 'numquick', { arg: '0%', title: 'Percent' }), B(',', 'numquick', { arg: '#,##0', title: 'Comma style' }), B('.0←', 'decimals', { arg: -1, title: 'Decrease decimals' }), B('.00→', 'decimals', { arg: 1, title: 'Increase decimals' })]],
    ['Styles', [B('Conditional Formatting', 'cfdialog', { big: 1, ic: 'chart' }), B('Format as Table', 'tabledialog', { big: 1, ic: 'table' }), R1('cellstyle', 'Cell styles', [['Cell styles…', ''], ['Good', 'good'], ['Bad', 'bad'], ['Neutral', 'neutral'], ['Heading', 'heading'], ['Title', 'title'], ['Total', 'total'], ['Input', 'input'], ['Note', 'note']], '')]],
    ['Cells', [R1('insertcmd', 'Insert', [['Insert…', ''], ['Insert sheet rows', 'row'], ['Insert sheet columns', 'col'], ['Insert sheet', 'sheet']], ''), R1('deletecmd', 'Delete', [['Delete…', ''], ['Delete sheet rows', 'row'], ['Delete sheet columns', 'col'], ['Delete sheet', 'sheet']], ''),
      R1('formatcmd', 'Format', [['Format…', ''], ['Row height…', 'rowh'], ['Column width…', 'colw'], ['AutoFit row height', 'autorow'], ['AutoFit column width', 'autocol'], ['Hide rows', 'hiderows'], ['Hide columns', 'hidecols'], ['Unhide rows', 'unhiderows'], ['Unhide columns', 'unhidecols'], ['Rename sheet…', 'rename'], ['Tab color…', 'tabcolor'], ['Protect sheet', 'protect'], ['Format cells…', 'cells']], '')]],
    ['Editing', [B('AutoSum', 'autosum', { big: 1, ic: 'count' }), R1('fillcmd2', 'Fill', [['Fill…', ''], ['Down', 'down'], ['Right', 'right'], ['Up', 'up'], ['Left', 'left']], ''), R1('clearcmd', 'Clear', [['Clear…', ''], ['Clear all', 'all'], ['Clear formats', 'formats'], ['Clear contents', 'contents'], ['Clear notes', 'notes']], ''),
      R1('sortcmd', 'Sort & filter', [['Sort & filter…', ''], ['Sort A to Z', 'asc'], ['Sort Z to A', 'desc'], ['Custom sort…', 'custom'], ['Filter', 'filter'], ['Clear filter', 'clearfilter']], ''), R1('findcmd', 'Find & select', [['Find & select…', ''], ['Find…', 'find'], ['Replace…', 'replace'], ['Go to…', 'goto'], ['Select all', 'all']], '')]]
  ],
  Insert: [
    ['Tables', [B('Table', 'tabledialog', { big: 1, ic: 'table' }), D('PivotTable', { title: 'PivotTables arrive in a later update' })]],
    ['Charts', [B('Column', 'chart', { arg: 'column', big: 1, ic: 'chart' }), B('Bar', 'chart', { arg: 'bar' }), B('Line', 'chart', { arg: 'line' }), B('Area', 'chart', { arg: 'area' }), B('Pie', 'chart', { arg: 'pie' }), B('Scatter', 'chart', { arg: 'scatter' })]],
    ['Illustrations', [D('Pictures', { title: 'Pictures in sheets arrive in a later update' }), D('Shapes', { title: 'Shapes in sheets arrive in a later update' })]],
    ['Sparklines', [D('Line', { title: 'Sparklines arrive in a later update' }), D('Column', { title: 'Sparklines arrive in a later update' })]],
    ['Links', [B('Link', 'hyperlink', { big: 1, ic: 'link' })]]
  ],
  'Page Layout': [
    ['Page Setup', [SEL('smargin', 'Margins', [['Normal', 48], ['Narrow', 24], ['Wide', 96]], t => curSheet(t).page.margin), SEL('sorient', 'Orientation', [['Portrait', 'portrait'], ['Landscape', 'landscape']], t => curSheet(t).page.orient),
      SEL('spsize', 'Size', ['A4', 'Letter', 'Legal', 'A5'].map(k => [k, k]), t => curSheet(t).page.size), B('Print Area', 'printarea'), B('Clear Print Area', 'clearprintarea')]],
    ['Sheet Options', [B('Gridlines', 'grid', { flag: 'fGrid' }), B('Headings', 'headings', { flag: 'fHead' }), B('Print Gridlines', 'printgrid', { flag: 'fPrintGrid' })]]
  ],
  Formulas: [
    ['Function Library', [B('Insert Function', 'insertfn', { big: 1, ic: 'eq' }), B('AutoSum', 'autosum', { big: 1, ic: 'count' }), R1('fncat', 'Function categories', [['Browse by category…', ''], ...Object.keys(FN_CATS).map(k => [k, k])], '')]],
    ['Defined Names', [B('Name Manager', 'namemgr'), B('Define Name', 'definename')]],
    ['Formula Auditing', [B('Show Formulas', 'showformulas', { flag: 'showFormulas' })]],
    ['Calculation', [B('Calculate Now', 'calcnow')]]
  ],
  Data: [
    ['Get Data', [B('From Text/CSV', 'importcsv', { big: 1, ic: 'table' })]],
    ['Sort & Filter', [B('Sort A→Z', 'sortcmd', { arg: 'asc' }), B('Sort Z→A', 'sortcmd', { arg: 'desc' }), B('Sort…', 'sortcmd', { arg: 'custom' }), B('Filter', 'filter', { flag: 'fFilter' }), B('Clear', 'sortcmd', { arg: 'clearfilter' })]],
    ['Data Tools', [B('Text to Columns', 'textcols'), B('Remove Duplicates', 'dedupe'), B('Data Validation', 'validation')]],
    ['Outline', [D('Group', { title: 'Grouping arrives in a later update' }), D('Subtotal', { title: 'Subtotals arrive in a later update' })]]
  ],
  Review: [
    ['Notes', [B('New Note', 'newnote', { big: 1, ic: 'note' }), B('Delete Note', 'delnote')]],
    ['Protect', [B('Protect Sheet', 'protect', { flag: 'fProtect', big: 1, ic: 'shield' })]]
  ],
  View: [
    ['Show', [B('Formula Bar', 'fbar', { flag: 'fBar' }), B('Gridlines', 'grid', { flag: 'fGrid' }), B('Headings', 'headings', { flag: 'fHead' })]],
    ['Zoom', [B('Zoom Out', 'zoom', { arg: -10 }), B('Zoom In', 'zoom', { arg: 10 }), B('100%', 'zoom', { arg: 0 }), B('Zoom to Selection', 'zoomsel')]],
    ['Window', [R1('freeze', 'Freeze panes', [['Freeze panes…', ''], ['Freeze panes at selection', 'sel'], ['Freeze top row', 'row'], ['Freeze first column', 'col'], ['Unfreeze panes', 'none']], '')]]
  ],
  Help: [['Help', [B('Keyboard Shortcuts', 'shortcuts'), B('About', 'about')]]]
};

/* ================= File menu, saving and printing ================= */
const SHEET_TYPES = {
  xlsx: { name: 'Excel workbook', extensions: ['xlsx'] }, csv: { name: 'CSV (current sheet only)', extensions: ['csv'] },
  dcsheet: { name: 'DigiCre8 workbook (keeps every feature)', extensions: ['dcsheet'] }
};
async function saveSheet(tab, saveAs, prefer = 'xlsx') {
  if (tab.app !== 'sheets') return;
  await commitEdit(tab, 0, 0);
  const wb = tab.wb; let target = tab.path;
  if (!target || saveAs) {
    const order = [prefer, ...['xlsx', 'dcsheet', 'csv'].filter(k => k !== prefer)];
    target = await window.digicre8.chooseSave({ suggestedName: baseName(tab) + '.' + prefer, filters: order.map(k => SHEET_TYPES[k]) });
    if (!target) return;
  }
  let res = null, note = '';
  if (/\.xlsx$/i.test(target)) {
    res = await window.digicre8.saveXlsx({ path: target, model: wb.toJSON(true), images: await chartImages(tab) });
    const sheets = wb.sheets, lost = [];
    if (sheets.some(s => s.charts.length)) lost.push('charts become pictures');
    if (sheets.some(s => s.cf.some(r => ['dupe', 'unique', 'top', 'bottom', 'above', 'below', 'bar', 'blank', 'error'].includes(r.type)))) lost.push('some conditional formats');
    if (sheets.some(s => s.filter && s.filter.crit)) lost.push('filter selections');
    if (res && lost.length && !tab.lossNoted) { note = ` In Excel files ${lost.join(' and ')}.`; tab.lossNoted = true; }
  } else if (/\.csv$/i.test(target)) res = await window.digicre8.saveFile({ path: target, content: toCSV(wb, wb.active) });
  else res = await window.digicre8.saveFile({ path: target, content: JSON.stringify(wb.toJSON(false)) });
  if (!res) return;
  tab.path = res.path; tab.title = res.name; tab.dirty = false; state.settings.recent = res.recent;
  renderTabs(); toast('Saved ' + res.name + '.' + note);
}
function openSheetFromResult(res) {
  const ext = ((res.name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
  let wb;
  if (res.kind === 'xlsx') wb = Workbook.fromJSON(res.model);
  else if (ext === 'csv' || ext === 'tsv') { wb = new Workbook(); importText(wb, 0, res.content, ext === 'tsv' ? '\t' : undefined); }
  else if (ext === 'dcsheet') { try { const m = JSON.parse(res.content); if (!m || !Array.isArray(m.sheets)) throw new Error('bad'); wb = Workbook.fromJSON(m); } catch (e) { toast('That file is not a valid DigiCre8 workbook'); return true; } }
  else return false;
  wb.undoStack = []; wb.redoStack = [];
  const extra = { title: res.name, path: res.path, wb, dirty: false, sel: null };
  const cur = activeTab();
  if (cur && cur.app === 'home') { Object.assign(cur, extra, { app: 'sheets' }); render(); } else newTab('sheets', extra);
  toast('Opened ' + res.name);
  return true;
}
function sheetPrintHTML(tab) {
  const wb = tab.wb, si = wb.active, sh = curSheet(tab), u = wb.used(si);
  const a = sh.page.area || { r1: 0, c1: 0, r2: Math.max(0, u.rAll), c2: Math.max(0, u.cAll) };
  const cols = [], rows = [];
  for (let c = a.c1; c <= Math.min(a.c2, a.c1 + 300); c++) if (!sh.hiddenCols.has(c)) cols.push(c);
  for (let r = a.r1; r <= Math.min(a.r2, a.r1 + 5000); r++) if (!sh.hiddenRows.has(r) && !sh.filteredRows.has(r)) rows.push(r);
  const widths = cols.map(c => sh.colW.get(c) || DW), grid = sh.page.printGrid ? '1px solid #bbb' : 'none';
  const { anchors, covered } = (() => { const an = new Map(), co = new Set(); for (const m of sh.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) { if (r === m.r1 && c === m.c1) an.set(key(r, c), m); else co.add(key(r, c)); } return { anchors: an, covered: co }; })();
  let html = `<table class="ptable" style="border-collapse:collapse;table-layout:fixed;width:${widths.reduce((x, y) => x + y, 0)}px"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>`;
  for (const r of rows) {
    html += `<tr style="height:${sh.rowH.get(r) || DH}px">`;
    for (const c of cols) {
      const k = key(r, c); if (covered.has(k)) continue;
      const cell = sh.get(r, c), st = cellStyleFor(tab, sh, r, c, wb.style(cell && cell.s)), cf = sh.cf.length ? wb.cfAt(si, r, c) : null, eff = cf ? { ...st, ...cf } : st;
      const d = cell ? wb.display(si, r, c) : { text: '' }, m = anchors.get(k);
      let s = `border:${grid};padding:0 3px;overflow:hidden;white-space:${eff.wrap ? 'pre-wrap' : 'nowrap'};text-align:${eff.ha || (d.num ? 'right' : 'left')};vertical-align:${eff.va === 'middle' ? 'middle' : eff.va === 'top' ? 'top' : 'bottom'};font-size:${(eff.fs || 11) * 4 / 3}px;`;
      if (eff.bg) s += `background:${eff.bg};`; if (eff.fc) s += `color:${eff.fc};`; if (eff.b) s += 'font-weight:700;'; if (eff.i) s += 'font-style:italic;'; if (eff.u) s += 'text-decoration:underline;'; if (eff.ff) s += `font-family:'${String(eff.ff).replace(/'/g, '')}';`;
      for (const [kk, side] of [['bt', 'top'], ['br', 'right'], ['bb', 'bottom'], ['bl', 'left']]) if (st[kk] && BORDER_CSS[st[kk].s]) s += `border-${side}:${BORDER_CSS[st[kk].s]} ${st[kk].c || '#000'};`;
      html += `<td style="${s}"${m ? ` colspan="${Math.min(m.c2, a.c2) - m.c1 + 1}" rowspan="${Math.min(m.r2, a.r2) - m.r1 + 1}"` : ''}>${escH(d.text)}</td>`;
    }
    html += '</tr>';
  }
  return { html: html + '</table>', width: widths.reduce((x, y) => x + y, 0) || 1 };
}
async function printSheet(tab, savePath) {
  await commitEdit(tab, 0, 0);
  const sh = curSheet(tab), pg = sh.page, [w0, h0] = PAGES[pg.size] || PAGES.A4, land = pg.orient === 'landscape';
  const W = land ? h0 : w0, Hh = land ? w0 : h0, m = pg.margin, pr = sheetPrintHTML(tab), scale = Math.min(1, (W - 2 * m) / pr.width);
  let st = $('#sheetPageStyle'); if (!st) { st = document.createElement('style'); st.id = 'sheetPageStyle'; document.head.appendChild(st); }
  st.textContent = `@page { size: ${W}px ${Hh}px; margin: ${m}px; }`;
  $('#sheetPrint').innerHTML = `<div style="zoom:${scale}">${pr.html}</div>`;
  document.body.classList.add('printing-sheet');
  await new Promise(r => setTimeout(r, 150));
  const opts = { width: W, height: Hh, margin: m, header: '', footer: '<p style="text-align:center">{page} of {pages}</p>' };
  try {
    if (savePath) { const res = await window.digicre8.exportPdf({ suggestedName: baseName(tab) + '.pdf', ...opts }); if (res) toast('Created ' + res.name); }
    else { const res = await window.digicre8.printPdf(opts); toast(res ? 'Opened a print-ready PDF. Press Ctrl+P in the viewer to print.' : 'Could not prepare the print file'); }
  } finally { document.body.classList.remove('printing-sheet'); $('#sheetPrint').innerHTML = ''; }
}
const SBS = [['info', 'Info'], ['new', 'New'], ['open', 'Open'], ['save', 'Save'], ['saveas', 'Save As'], ['print', 'Print'], ['export', 'Export'], ['close', 'Close'], ['options', 'Options']];
function showSheetBackstage(tab, section = 'info') {
  closeBackstage();
  const el = document.createElement('div'); el.id = 'backstage'; el.className = 'backstage'; el.style.setProperty('--accent', SHEET_COLOR);
  el.innerHTML = `<nav><button class="bs-back" aria-label="Back to workbook" title="Back (Esc)">←</button>${SBS.map(([k, l]) => `<button class="bs-item" data-k="${k}">${l}</button>`).join('')}</nav><section class="bs-panel" id="bsPanel"></section>`;
  view.appendChild(el);
  $('.bs-back', el).addEventListener('click', closeBackstage);
  $$('.bs-item', el).forEach(b => b.addEventListener('click', () => sbsGo(tab, b.dataset.k)));
  sbsGo(tab, section);
}
async function sbsGo(tab, k) {
  const direct = { save: () => saveSheet(tab, false), saveas: () => saveSheet(tab, true), print: () => printSheet(tab), close: () => closeTab(tab.id) };
  if (direct[k]) { closeBackstage(); return direct[k](); }
  $$('.bs-item').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  const p = $('#bsPanel'), wb = tab.wb;
  if (k === 'info') {
    const cells = wb.sheets.reduce((n, s) => n + s.cells.size, 0);
    p.innerHTML = `<h2>Info</h2><dl class="info"><dt>Name</dt><dd>${escH(tab.title)}</dd><dt>Location</dt><dd>${tab.path ? escH(tab.path) : 'Not saved yet'}</dd><dt>Sheets</dt><dd>${wb.sheets.length}</dd><dt>Cells with content</dt><dd>${cells.toLocaleString()}</dd><dt>Charts</dt><dd>${wb.sheets.reduce((n, s) => n + s.charts.length, 0)}</dd></dl>`;
  } else if (k === 'new') {
    p.innerHTML = `<h2>New</h2><button class="tile" id="bsBlank" style="--accent:${SHEET_COLOR}"><span class="mono">Sh</span><span><div class="name">Blank workbook</div><div class="desc">Start with an empty sheet</div></span></button>`;
    $('#bsBlank').addEventListener('click', () => { closeBackstage(); newTab('sheets', { title: 'Untitled workbook' }); });
  } else if (k === 'open') {
    p.innerHTML = `<h2>Open</h2><button class="btn primary" id="bsBrowse">Browse for a file…</button><h3>Recent</h3><div class="recent" id="bsRecent"></div>`;
    $('#bsBrowse').addEventListener('click', () => { closeBackstage(); openFileDialog(); }); fillRecent($('#bsRecent'));
  } else if (k === 'export') {
    p.innerHTML = `<h2>Export</h2><div class="bs-actions"><button class="btn" id="exX"><b>Excel workbook (.xlsx)</b><br><span class="muted">Opens in Microsoft Excel and other apps</span></button><button class="btn" id="exP"><b>Create PDF</b><br><span class="muted">Prints the used range of this sheet</span></button>
      <button class="btn" id="exC"><b>CSV (.csv)</b><br><span class="muted">Current sheet as plain text</span></button><button class="btn" id="exD"><b>DigiCre8 workbook (.dcsheet)</b><br><span class="muted">Keeps every feature</span></button></div>`;
    $('#exX').addEventListener('click', () => { closeBackstage(); saveSheet(tab, true, 'xlsx'); }); $('#exC').addEventListener('click', () => { closeBackstage(); saveSheet(tab, true, 'csv'); });
    $('#exD').addEventListener('click', () => { closeBackstage(); saveSheet(tab, true, 'dcsheet'); }); $('#exP').addEventListener('click', () => { closeBackstage(); printSheet(tab, true); });
  } else if (k === 'options') {
    p.innerHTML = `<h2>Options</h2><label class="opt">Color theme<select id="optTheme" class="rsel">${THEMES.map(t => `<option value="${t}"${t === state.settings.theme ? ' selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>`;
    $('#optTheme').addEventListener('change', async e => { state.settings = await window.digicre8.setSettings({ theme: e.target.value }); applyTheme(); });
  }
}
