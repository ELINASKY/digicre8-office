'use strict';
/* DigiCre8 Sheets: grid, selection, editing and navigation. Commands, dialogs and charts are in sheets-plus.js. */

const SHEET_COLOR = '#12A37A';
const HW = 46, HH = 22, DW = 64, DH = 20;
const SC = {}; // ribbon command table, filled in sheets-plus.js
const TABLE_PALETTE = { blue: ['#4f6bf2', '#e8ecfe'], green: ['#12a37a', '#e3f6ef'], orange: ['#f2701b', '#fdebdd'], gray: ['#5a6280', '#eef0f5'], pink: ['#d63a7c', '#fbe6ee'] };
const BORDER_CSS = { thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', hair: '1px dotted', mediumDashed: '2px dashed' };
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= Geometry: row and column positions ================= */
function makeAxis(def, sizes, hidden, z, max) {
  const D = def * z, exc = [];
  const idx = new Set([...sizes.keys(), ...hidden]);
  for (const i of [...idx].sort((a, b) => a - b)) { const sz = hidden.has(i) ? 0 : sizes.get(i) * z; if (sz !== D) exc.push([i, sz]); }
  const pre = []; let acc = 0;
  for (const [, sz] of exc) { pre.push(acc); acc += sz - D; }
  const countBefore = i => { let lo = 0, hi = exc.length; while (lo < hi) { const m = (lo + hi) >> 1; if (exc[m][0] < i) lo = m + 1; else hi = m; } return lo; };
  const left = i => { const k = countBefore(i); return i * D + (k ? pre[k - 1] + exc[k - 1][1] - D : 0); };
  const size = i => { const k = countBefore(i); return k < exc.length && exc[k][0] === i ? exc[k][1] : D; };
  const at = x => { let lo = 0, hi = max - 1; if (x <= 0) return 0; while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (left(m) <= x) lo = m; else hi = m - 1; } return lo; };
  return { left, size, at, total: left(max) };
}
function geomOf(tab) {
  const wb = tab.wb, sh = wb.sheets[wb.active], key2 = wb.version + ':' + wb.active + ':' + sh.zoom + ':' + sh.hiddenRows.size + ':' + sh.filteredRows.size + ':' + sh.freeze.r;
  if (tab._geom && tab._geomKey === key2) return tab._geom;
  const z = sh.zoom / 100, hiddenR = new Set([...sh.hiddenRows, ...sh.filteredRows]);
  tab._geom = { col: makeAxis(DW, sh.colW, sh.hiddenCols, z, MAXC), row: makeAxis(DH, sh.rowH, hiddenR, z, Math.min(MAXR, 1048576)) };
  tab._geomKey = key2;
  return tab._geom;
}
const curSheet = tab => tab.wb.sheets[tab.wb.active];
const selRange = tab => { const s = tab.sel; return { r1: Math.min(s.ar, s.er), c1: Math.min(s.ac, s.ec), r2: Math.max(s.ar, s.er), c2: Math.max(s.ac, s.ec) }; };
function mergeInfo(tab) {
  const wb = tab.wb, sh = curSheet(tab), k = wb.version + ':' + wb.active;
  if (tab._merge && tab._mergeKey === k) return tab._merge;
  const anchors = new Map(), covered = new Set();
  for (const m of sh.merges) for (let r = m.r1; r <= Math.min(m.r2, m.r1 + 2000); r++) for (let c = m.c1; c <= Math.min(m.c2, m.c1 + 200); c++) { if (r === m.r1 && c === m.c1) anchors.set(key(r, c), m); else covered.add(key(r, c)); }
  tab._merge = { anchors, covered }; tab._mergeKey = k;
  return tab._merge;
}
const mergeAt = (tab, r, c) => curSheet(tab).merges.find(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) || null;
function expandForMerges(tab, rg) {
  const sh = curSheet(tab); let ch = true, g = { ...rg };
  while (ch) { ch = false; for (const m of sh.merges) if (!(m.r2 < g.r1 || m.r1 > g.r2 || m.c2 < g.c1 || m.c1 > g.c2)) { const n = { r1: Math.min(g.r1, m.r1), c1: Math.min(g.c1, m.c1), r2: Math.max(g.r2, m.r2), c2: Math.max(g.c2, m.c2) }; if (n.r1 !== g.r1 || n.c1 !== g.c1 || n.r2 !== g.r2 || n.c2 !== g.c2) { g = n; ch = true; } } }
  return g;
}

/* ================= Drawing ================= */
const requestDraw = tab => { if (tab._raf) return; tab._raf = requestAnimationFrame(() => { tab._raf = 0; drawGrid(tab); }); };
function cellStyleFor(tab, sh, r, c, st) {
  const wb = tab.wb, out = { ...st };
  for (const t of sh.tables) {
    if (r < t.r1 || r > t.r2 || c < t.c1 || c > t.c2) continue;
    const pal = TABLE_PALETTE[t.style] || TABLE_PALETTE.blue;
    if (r === t.r1) { if (!out.bg) out.bg = pal[0]; if (!out.fc) out.fc = '#ffffff'; out.b = true; }
    else if (t.banded !== false && (r - t.r1) % 2 === 0 && !out.bg) out.bg = pal[1];
  }
  void wb;
  return out;
}
function drawGrid(tab) {
  const wrap = $('#gscroll'); if (!wrap || tab.app !== 'sheets') return;
  const wb = tab.wb, si = wb.active, sh = wb.sheets[si], G = geomOf(tab);
  const sx = wrap.scrollLeft, sy = wrap.scrollTop, vw = wrap.clientWidth || 900, vh = wrap.clientHeight || 500;
  const z = sh.zoom / 100, hw = sh.showHeadings ? HW * z : 0, hh = sh.showHeadings ? HH * z : 0, fr = sh.freeze.r, fc = sh.freeze.c;
  const FW = G.col.left(fc), FH = G.row.left(fr);
  const c0 = Math.max(fc, G.col.at(sx + FW)), c1 = G.col.at(sx + vw - hw), r0 = Math.max(fr, G.row.at(sy + FH)), r1 = G.row.at(sy + vh - hh);
  const cols = [], rows = [];
  for (let c = 0; c < fc && c < 100; c++) if (G.col.size(c) > 0) cols.push(c);
  for (let c = c0; c <= c1 + 1 && c < MAXC; c++) if (G.col.size(c) > 0) cols.push(c);
  for (let r = 0; r < fr && r < 1000; r++) if (G.row.size(r) > 0) rows.push(r);
  for (let r = r0; r <= r1 + 1 && r < MAXR; r++) if (G.row.size(r) > 0) rows.push(r);
  const X = c => hw + G.col.left(c) + (c < fc ? sx : 0), Y = r => hh + G.row.left(r) + (r < fr ? sy : 0);
  const W = c => G.col.size(c), Hh = r => G.row.size(r);
  const { anchors, covered } = mergeInfo(tab);
  const rg = selRange(tab), ar = tab.sel.ar, ac = tab.sel.ac;
  const showF = !!tab.showFormulas, gridCls = sh.showGrid ? '' : ' ng';
  const out = [];
  const filterRange = sh.filter, fbCols = filterRange ? filterRange.c2 : -1;
  const draw1 = (r, c, m) => {
    const cell = sh.get(r, c), base = wb.style(cell && cell.s);
    const st = cellStyleFor(tab, sh, r, c, base), cf = sh.cf.length ? wb.cfAt(si, r, c) : null;
    const eff = cf ? { ...st, ...cf } : st;
    let text = '', cls = 'c' + gridCls, extra = '', numAlign = false, w = m ? sumW(m.c1, m.c2) : W(c), h = m ? sumH(m.r1, m.r2) : Hh(r);
    if (cell) {
      const d = wb.display(si, r, c);
      text = showF && cell.f !== undefined ? '=' + cell.f : d.text;
      numAlign = !!d.num;
      if (d.color && !eff.fc) extra += `color:${d.color};`;
      if (d.err) cls += ' err';
      if (d.num && !showF && text.length * 7.2 * z * ((eff.fs || 11) / 11) > w - 4 && !eff.wrap) text = '#'.repeat(Math.max(1, Math.floor((w - 4) / (7 * z))));
    }
    const inSel = r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2;
    if (inSel) cls += (r === ar && c === ac) ? ' act' : ' sel';
    if (cell && cell.n) cls += ' note';
    if (cell && cell.link) cls += ' lnk';
    const ha = eff.ha || (numAlign ? 'right' : (cell && typeof wb.evalCell(si, r, c) === 'boolean') || (text && text[0] === '#' && cell && wb.evalCell(si, r, c) instanceof ErrVal) ? 'center' : 'left');
    const jc = ha === 'center' ? 'center' : ha === 'right' ? 'flex-end' : 'flex-start';
    const ai = eff.va === 'top' ? 'flex-start' : eff.va === 'middle' ? 'center' : 'flex-end';
    let s = `left:${X(c)}px;top:${Y(r)}px;width:${w}px;height:${h}px;justify-content:${jc};align-items:${eff.wrap && !eff.va ? 'flex-start' : ai};`;
    if (eff.bg) s += `background:${eff.bg};`;
    if (eff.fc) s += `color:${eff.fc};`;
    if (eff.b) s += 'font-weight:700;'; if (eff.i) s += 'font-style:italic;';
    if (eff.u || eff.st) s += `text-decoration:${[eff.u ? 'underline' : '', eff.st ? 'line-through' : ''].join(' ').trim()};`;
    if (eff.ff) s += `font-family:'${String(eff.ff).replace(/'/g, '')}',sans-serif;`;
    if (eff.fs) s += `font-size:${(eff.fs * 4 / 3 * z).toFixed(2)}px;`;
    if (eff.wrap) s += 'white-space:pre-wrap;word-break:break-word;text-align:' + (ha === 'general' ? 'left' : ha) + ';'; 
    if (eff.ind) s += `padding-left:${eff.ind * 9 * z}px;`;
    for (const [k, side] of [['bt', 'top'], ['br', 'right'], ['bb', 'bottom'], ['bl', 'left']]) if (st[k] && BORDER_CSS[st[k].s]) s += `border-${side}:${BORDER_CSS[st[k].s]} ${st[k].c || '#000'};`;
    s += extra;
    if (r < fr || c < fc) cls += r < fr && c < fc ? ' fz3' : ' fz2';
    let inner = escH(text);
    if (eff.bar) inner = `<i class="dbar" style="width:${eff.bar.pct}%;background:${eff.bar.color}"></i><span>${inner}</span>`;
    if (filterRange && r === filterRange.r1 && c >= filterRange.c1 && c <= fbCols) inner += `<b class="fbtn" data-fc="${c}"></b>`;
    out.push(`<div class="${cls}" style="${s}">${inner}</div>`);
  };
  const sumW = (a, b) => { let t = 0; for (let c = a; c <= b; c++) t += W(c); return t; };
  const sumH = (a, b) => { let t = 0; for (let r = a; r <= b; r++) t += Hh(r); return t; };
  for (const r of rows) for (const c of cols) { const k = key(r, c); if (covered.has(k) || anchors.has(k)) continue; draw1(r, c, null); }
  for (const m of sh.merges) { if (m.r2 < rows[0] || m.r1 > rows[rows.length - 1] || m.c2 < cols[0] || m.c1 > cols[cols.length - 1]) continue; if (G.row.size(m.r1) > 0 && G.col.size(m.c1) > 0) draw1(m.r1, m.c1, m); }
  // headers
  if (sh.showHeadings) {
    const hs = [];
    const selC = (c) => c >= rg.c1 && c <= rg.c2, selR = (r) => r >= rg.r1 && r <= rg.r2;
    for (const c of cols) hs.push(`<div class="ch${selC(c) ? ' hs' : ''}${c < fc ? ' fz2' : ''}" style="left:${X(c)}px;top:${sy}px;width:${W(c)}px;height:${hh}px">${colName(c)}</div>`);
    for (const r of rows) hs.push(`<div class="rh${selR(r) ? ' hs' : ''}${r < fr ? ' fz2' : ''}" style="left:${sx}px;top:${Y(r)}px;width:${hw}px;height:${Hh(r)}px">${r + 1}</div>`);
    hs.push(`<div class="corner" style="left:${sx}px;top:${sy}px;width:${hw}px;height:${hh}px"></div>`);
    out.push(hs.join(''));
  }
  $('#gcells').innerHTML = out.join('');
  // spacer size
  const sp = $('#gspacer');
  sp.style.width = (hw + Math.min(G.col.total, 3e7)) + 'px'; sp.style.height = (hh + Math.min(G.row.total, 3e7)) + 'px';
  tab._view = { sx, sy, hw, hh, fr, fc, FW, FH, X, Y, W, Hh, G, z, vw, vh };
  drawOverlays(tab);
}
function cellRect(tab, r, c) {
  const v = tab._view; if (!v) return null;
  const m = mergeAt(tab, r, c), a = m ? { r: m.r1, c: m.c1 } : { r, c };
  const w = m ? (() => { let t = 0; for (let k = m.c1; k <= m.c2; k++) t += v.W(k); return t; })() : v.W(c);
  const h = m ? (() => { let t = 0; for (let k = m.r1; k <= m.r2; k++) t += v.Hh(k); return t; })() : v.Hh(r);
  return { x: v.X(a.c), y: v.Y(a.r), w, h };
}
function drawOverlays(tab) {
  const v = tab._view; if (!v) return;
  const rg = selRange(tab), tl = cellRect(tab, rg.r1, rg.c1), br = cellRect(tab, rg.r2, rg.c2);
  const box = $('#selbox'), fh = $('#fillh');
  if (tl && br) {
    box.style.cssText = `display:block;left:${tl.x - 1}px;top:${tl.y - 1}px;width:${br.x + br.w - tl.x + 1}px;height:${br.y + br.h - tl.y + 1}px`;
    fh.style.cssText = `display:${tab.edit || curSheet(tab).protect ? 'none' : 'block'};left:${br.x + br.w - 4}px;top:${br.y + br.h - 4}px`;
  }
  const cb = $('#clipbox');
  if (tab.clip && tab.clip.sheetIdx === tab.wb.active) {
    const a = cellRect(tab, tab.clip.rg.r1, tab.clip.rg.c1), b = cellRect(tab, tab.clip.rg.r2, tab.clip.rg.c2);
    cb.style.cssText = `display:block;left:${a.x}px;top:${a.y}px;width:${b.x + b.w - a.x}px;height:${b.y + b.h - a.y}px`;
  } else cb.style.display = 'none';
  const ed = $('#cellEditor');
  if (tab.edit) {
    const a = cellRect(tab, tab.sel.ar, tab.sel.ac);
    ed.style.cssText = `display:block;left:${a.x}px;top:${a.y}px;min-width:${a.w}px;min-height:${a.h}px;`;
  } else ed.style.display = 'none';
  const dd = $('#ddbtn'), dv = tab.wb.validation(tab.wb.active, tab.sel.ar, tab.sel.ac);
  if (dv && dv.type === 'list' && !tab.edit) { const a = cellRect(tab, tab.sel.ar, tab.sel.ac); dd.style.cssText = `display:block;left:${a.x + a.w - 18}px;top:${a.y + 2}px;height:${a.h - 4}px`; } else dd.style.display = 'none';
  drawCharts(tab);
}

/* ================= Selection and navigation ================= */
function updateBars(tab) {
  const nb = $('#nameBox'), fx = $('#fxInput'); if (!nb) return;
  const rg = selRange(tab), a = addr(tab.sel.ar, tab.sel.ac);
  if (document.activeElement !== nb) nb.value = rg.r1 === rg.r2 && rg.c1 === rg.c2 ? a : rangeAddr(rg);
  const cell = curSheet(tab).get(tab.sel.ar, tab.sel.ac);
  if (!tab.edit && document.activeElement !== fx) fx.value = cell ? (cell.f !== undefined ? '=' + cell.f : cell.v === undefined || cell.v === null ? '' : String(cell.v)) : '';
  // statistics for the status bar
  const st = $('#sstats'); if (!st) return;
  const wb = tab.wb, si = wb.active; let n = 0, sum = 0, cnt = 0, big = (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1) > 200000;
  if (!big) for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) { const x = curSheet(tab).get(r, c); if (!x) continue; const v = wb.evalCell(si, r, c); if (v !== null && v !== '') cnt++; if (typeof v === 'number') { n++; sum += v; } }
  st.textContent = !big && cnt > 1 ? `Average: ${formatNumber(n ? sum / n : 0, '#,##0.####').text}    Count: ${cnt}    Sum: ${formatNumber(sum, '#,##0.####').text}` : '';
  $('#addrinfo') && ($('#addrinfo').textContent = '');
  refreshState();
}
function ensureVisible(tab, r, c) {
  const wrap = $('#gscroll'), v = tab._view; if (!wrap || !v) return;
  const G = v.G, fr = v.fr, fc = v.fc;
  if (c >= fc) {
    const left = G.col.left(c), right = left + G.col.size(c);
    if (left < wrap.scrollLeft + v.FW) wrap.scrollLeft = Math.max(0, left - v.FW);
    else if (right > wrap.scrollLeft + v.vw - v.hw - 17) wrap.scrollLeft = right - (v.vw - v.hw - 17);
  }
  if (r >= fr) {
    const top = G.row.left(r), bottom = top + G.row.size(r);
    if (top < wrap.scrollTop + v.FH) wrap.scrollTop = Math.max(0, top - v.FH);
    else if (bottom > wrap.scrollTop + v.vh - v.hh - 17) wrap.scrollTop = bottom - (v.vh - v.hh - 17);
  }
}
function select(tab, ar, ac, er = ar, ec = ac, keepAnchor) {
  ar = Math.max(0, Math.min(MAXR - 1, ar)); ac = Math.max(0, Math.min(MAXC - 1, ac)); er = Math.max(0, Math.min(MAXR - 1, er)); ec = Math.max(0, Math.min(MAXC - 1, ec));
  tab.sel = { ar, ac, er, ec };
  const g = expandForMerges(tab, selRange(tab));
  if (g.r2 !== Math.max(ar, er) || g.c2 !== Math.max(ac, ec) || g.r1 !== Math.min(ar, er) || g.c1 !== Math.min(ac, ec)) { tab.sel = { ar: ar <= er ? g.r1 : g.r2, ac: ac <= ec ? g.c1 : g.c2, er: ar <= er ? g.r2 : g.r1, ec: ac <= ec ? g.c2 : g.c1 }; if (ar === er && ac === ec) { const m = mergeAt(tab, ar, ac); if (m) tab.sel = { ar: m.r1, ac: m.c1, er: m.r2, ec: m.c2 }; } }
  void keepAnchor;
  ensureVisible(tab, er, ec);
  requestDraw(tab); updateBars(tab);
}
const hasData = (tab, r, c) => { const x = curSheet(tab).get(r, c); return !!x && (x.f !== undefined || (x.v !== undefined && x.v !== null && x.v !== '')); };
function jump(tab, r, c, dr, dc) { // Ctrl+arrow: move to the edge of a data block
  const u = tab.wb.used(tab.wb.active); const maxR = Math.max(u.r, 0), maxC = Math.max(u.c, 0);
  let rr = r + dr, cc = c + dc;
  const inb = (a, b) => a >= 0 && b >= 0 && a < MAXR && b < MAXC;
  if (!inb(rr, cc)) return { r, c };
  if (hasData(tab, r, c) && hasData(tab, rr, cc)) { while (inb(rr + dr, cc + dc) && hasData(tab, rr + dr, cc + dc)) { rr += dr; cc += dc; } return { r: rr, c: cc }; }
  while (inb(rr, cc) && !hasData(tab, rr, cc)) { if ((dr > 0 && rr > maxR + 1) || (dc > 0 && cc > maxC + 1)) return { r: dr > 0 ? Math.min(MAXR - 1, maxR + 1) : rr, c: dc > 0 ? Math.min(MAXC - 1, maxC + 1) : cc }; rr += dr; cc += dc; }
  return inb(rr, cc) ? { r: rr, c: cc } : { r: Math.max(0, Math.min(MAXR - 1, rr - dr)), c: Math.max(0, Math.min(MAXC - 1, cc - dc)) };
}
function moveActive(tab, dr, dc, extend, ctrl) {
  const s = tab.sel, rg = selRange(tab);
  if (!extend && (rg.r1 !== rg.r2 || rg.c1 !== rg.c2) && tab.moveInSel) { // Enter/Tab cycle inside a range
    let r = s.ar + dr, c = s.ac + dc;
    if (c > rg.c2) { c = rg.c1; r++; } if (c < rg.c1) { c = rg.c2; r--; } if (r > rg.r2) { r = rg.r1; c++; if (c > rg.c2) c = rg.c1; } if (r < rg.r1) { r = rg.r2; c--; if (c < rg.c1) c = rg.c2; }
    tab.sel = { ...s, ar: r, ac: c }; ensureVisible(tab, r, c); requestDraw(tab); updateBars(tab); return;
  }
  const base = extend ? { r: s.er, c: s.ec } : { r: s.ar, c: s.ac };
  let p = { r: base.r + dr, c: base.c + dc };
  if (ctrl) p = jump(tab, base.r, base.c, dr, dc);
  else { const m = mergeAt(tab, base.r, base.c); if (m && !extend) { p = { r: dr > 0 ? m.r2 + 1 : dr < 0 ? m.r1 - 1 : base.r, c: dc > 0 ? m.c2 + 1 : dc < 0 ? m.c1 - 1 : base.c }; } }
  const G = tab._view && tab._view.G;
  if (G) { // skip hidden rows/columns
    while (p.r >= 0 && p.r < MAXR - 1 && G.row.size(p.r) === 0) p.r += dr || 1; while (p.c >= 0 && p.c < MAXC - 1 && G.col.size(p.c) === 0) p.c += dc || 1;
  }
  p.r = Math.max(0, Math.min(MAXR - 1, p.r)); p.c = Math.max(0, Math.min(MAXC - 1, p.c));
  if (extend) select(tab, s.ar, s.ac, p.r, p.c); else select(tab, p.r, p.c);
}

/* ================= Editing ================= */
const FN_NAMES = ['ABS', 'AND', 'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'CEILING', 'CHAR', 'CHOOSE', 'COLUMN', 'CONCAT', 'CONCATENATE', 'COUNT', 'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS', 'DATE', 'DATEDIF', 'DAY', 'DAYS', 'EDATE', 'EOMONTH', 'EXACT', 'EXP', 'FIND', 'FLOOR', 'FV', 'HLOOKUP', 'HOUR', 'HYPERLINK', 'IF', 'IFERROR', 'IFNA', 'IFS', 'INDEX', 'INDIRECT', 'INT', 'IPMT', 'IRR', 'ISBLANK', 'ISERROR', 'ISEVEN', 'ISNA', 'ISNUMBER', 'ISODD', 'ISTEXT', 'LARGE', 'LEFT', 'LEN', 'LN', 'LOG', 'LOG10', 'LOOKUP', 'LOWER', 'MATCH', 'MAX', 'MAXIFS', 'MEDIAN', 'MID', 'MIN', 'MINIFS', 'MINUTE', 'MOD', 'MODE', 'MONTH', 'NETWORKDAYS', 'NOT', 'NOW', 'NPER', 'NPV', 'OFFSET', 'OR', 'PERCENTILE', 'PI', 'PMT', 'POWER', 'PPMT', 'PROPER', 'PV', 'QUARTILE', 'RAND', 'RANDBETWEEN', 'RANK', 'RATE', 'REPLACE', 'REPT', 'RIGHT', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'ROW', 'ROWS', 'SEARCH', 'SECOND', 'SIGN', 'SLOPE', 'SMALL', 'SQRT', 'STDEV', 'SUBSTITUTE', 'SUBTOTAL', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'SWITCH', 'TEXT', 'TEXTJOIN', 'TIME', 'TODAY', 'TRANSPOSE', 'TRIM', 'TRUE', 'UPPER', 'VALUE', 'VAR', 'VLOOKUP', 'WEEKDAY', 'XLOOKUP', 'XOR', 'YEAR'];
function startEdit(tab, initial, mode) {
  const sh = curSheet(tab);
  if (sh.protect) return toast('This sheet is protected. Unprotect it to make changes.');
  const cell = sh.get(tab.sel.ar, tab.sel.ac);
  const orig = cell ? (cell.f !== undefined ? '=' + cell.f : cell.v === undefined || cell.v === null ? '' : String(cell.v)) : '';
  tab.edit = { mode: mode || (initial === undefined ? 'edit' : 'enter'), orig };
  const ed = $('#cellEditor'); ed.value = initial === undefined ? orig : initial;
  drawOverlays(tab);
  ed.focus();
  if (initial === undefined) ed.setSelectionRange(ed.value.length, ed.value.length);
  autosizeEditor(tab); syncFx(tab);
}
function autosizeEditor(tab) {
  const ed = $('#cellEditor'); if (!ed || !tab.edit) return;
  ed.style.height = 'auto'; ed.style.width = 'auto';
  const rect = cellRect(tab, tab.sel.ar, tab.sel.ac);
  ed.style.width = Math.max(rect.w, Math.min(500, ed.value.length * 8 + 24)) + 'px'; ed.style.height = Math.max(rect.h, ed.scrollHeight) + 'px';
}
function syncFx(tab) { const fx = $('#fxInput'), ed = $('#cellEditor'); if (fx && tab.edit && document.activeElement !== fx) fx.value = ed.value; showHint(tab); }
function showHint(tab) {
  const box = $('#fnhint'); if (!box) return;
  const ed = $('#cellEditor'), t = ed.value, pos = ed.selectionStart || t.length;
  if (!tab.edit || t[0] !== '=') { box.style.display = 'none'; return; }
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(t.slice(0, pos));
  if (!m || /^[A-Z]{1,3}\d+$/i.test(m[1])) { box.style.display = 'none'; return; }
  const list = FN_NAMES.filter(n => n.startsWith(m[1].toUpperCase())).slice(0, 8);
  if (!list.length || (list.length === 1 && list[0] === m[1].toUpperCase())) { box.style.display = 'none'; return; }
  const a = cellRect(tab, tab.sel.ar, tab.sel.ac);
  box.innerHTML = list.map((n, i) => `<div class="fh${i === 0 ? ' on' : ''}" data-fn="${n}">${n}</div>`).join('');
  box.style.cssText = `display:block;left:${a.x}px;top:${a.y + a.h + 2}px`;
  box.dataset.prefix = m[1];
}
function acceptHint(tab) {
  const box = $('#fnhint'); if (!box || box.style.display === 'none') return false;
  const pick = $('.fh.on', box) || $('.fh', box); if (!pick) return false;
  const ed = $('#cellEditor'), pos = ed.selectionStart, pre = box.dataset.prefix;
  ed.value = ed.value.slice(0, pos - pre.length) + pick.dataset.fn + '(' + ed.value.slice(pos);
  const np = pos - pre.length + pick.dataset.fn.length + 1; ed.setSelectionRange(np, np);
  box.style.display = 'none'; syncFx(tab); autosizeEditor(tab);
  return true;
}
async function commitEdit(tab, dr = 1, dc = 0) {
  if (!tab.edit) return true;
  const ed = $('#cellEditor'), text = ed.value, sh = curSheet(tab), wb = tab.wb, si = wb.active, r = tab.sel.ar, c = tab.sel.ac;
  const bad = wb.validate(si, r, c, text);
  if (bad) {
    const v = await dialog({ title: 'Invalid entry', ok: 'Retry', html: `<p>${escH(bad)}</p>` });
    if (v) { ed.focus(); return false; }
    return cancelEdit(tab);
  }
  tab.edit = null; $('#fnhint').style.display = 'none';
  const cell = sh.get(r, c), same = (cell ? (cell.f !== undefined ? '=' + cell.f : cell.v === undefined || cell.v === null ? '' : String(cell.v)) : '') === text;
  if (!same) { const m = mergeAt(tab, r, c); wb.setInput(si, m ? m.r1 : r, m ? m.c1 : c, text); }
  $('#gridwrap').focus({ preventScroll: true });
  moveActive(tab, dr, dc, false, false);
  requestDraw(tab);
  return true;
}
function cancelEdit(tab) {
  if (!tab.edit) return true;
  tab.edit = null; $('#fnhint').style.display = 'none';
  $('#gridwrap').focus({ preventScroll: true });
  requestDraw(tab); updateBars(tab);
  return true;
}
function canInsertRef(text, pos) { const before = text.slice(0, pos).trimEnd(); return text[0] === '=' && (before === '=' || /[=+\-*/^&,(<>:;%]$/.test(before)); }
function insertRef(tab, ref, replaceLast) {
  const ed = $('#cellEditor'); let t = ed.value, pos = ed.selectionStart;
  if (replaceLast && tab.edit.refSpan) { t = t.slice(0, tab.edit.refSpan[0]) + t.slice(tab.edit.refSpan[1]); pos = tab.edit.refSpan[0]; }
  ed.value = t.slice(0, pos) + ref + t.slice(pos);
  tab.edit.refSpan = [pos, pos + ref.length];
  ed.setSelectionRange(pos + ref.length, pos + ref.length); syncFx(tab); autosizeEditor(tab);
}

/* ================= Hit testing and mouse ================= */
function hit(tab, e) {
  const wrap = $('#gscroll'), v = tab._view; if (!v) return { kind: 'none' };
  const rect = wrap.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (px > wrap.clientWidth || py > wrap.clientHeight) return { kind: 'scrollbar' };
  const G = v.G, cx = px - v.hw, cy = py - v.hh;
  const col = Math.min(MAXC - 1, cx < v.FW ? G.col.at(Math.max(0, cx)) : G.col.at(cx + v.sx));
  const row = Math.min(MAXR - 1, cy < v.FH ? G.row.at(Math.max(0, cy)) : G.row.at(cy + v.sy));
  const inX = v.hw > 0 && px < v.hw, inY = v.hh > 0 && py < v.hh;
  const colRight = c => v.X(c) + v.W(c) - v.sx * 0 - (0), rowBottom = r => v.Y(r) + v.Hh(r);
  const screenColRight = c => (c < v.fc ? v.hw + G.col.left(c) + v.W(c) : v.hw + G.col.left(c) + v.W(c) - v.sx);
  const screenRowBottom = r => (r < v.fr ? v.hh + G.row.left(r) + v.Hh(r) : v.hh + G.row.left(r) + v.Hh(r) - v.sy);
  void colRight; void rowBottom;
  if (inX && inY) return { kind: 'corner' };
  if (inY) { const edgeCol = Math.abs(px - screenColRight(col)) <= 4 ? col : (Math.abs(px - screenColRight(col - 1)) <= 4 && col > 0 ? col - 1 : -1); return edgeCol >= 0 ? { kind: 'colresize', c: edgeCol } : { kind: 'colhdr', c: col }; }
  if (inX) { const edgeRow = Math.abs(py - screenRowBottom(row)) <= 4 ? row : (Math.abs(py - screenRowBottom(row - 1)) <= 4 && row > 0 ? row - 1 : -1); return edgeRow >= 0 ? { kind: 'rowresize', r: edgeRow } : { kind: 'rowhdr', r: row }; }
  return { kind: 'cell', r: row, c: col };
}
const a1 = (r, c) => addr(r, c);
function onMouseDown(tab, e) {
  if (e.button === 2) return;
  const t = e.target;
  if (t.id === 'fillh') { startDrag(tab, { type: 'fill', src: selRange(tab) }); e.preventDefault(); return; }
  if (t.id === 'ddbtn') return;
  if (t.classList && t.classList.contains('fbtn')) return;
  const h = hit(tab, e);
  if (h.kind === 'scrollbar' || h.kind === 'none') return;
  if (tab.edit) {
    const ed = $('#cellEditor');
    if (h.kind === 'cell' && canInsertRef(ed.value, ed.selectionStart)) { insertRef(tab, a1(h.r, h.c), false); startDrag(tab, { type: 'ref', r: h.r, c: h.c }); e.preventDefault(); return; }
    if (tab.edit.refSpan && h.kind === 'cell' && /[A-Z]\d+(:[A-Z]+\d+)?$/.test(ed.value.slice(0, ed.selectionStart)) && ed.value[0] === '=') { insertRef(tab, a1(h.r, h.c), true); startDrag(tab, { type: 'ref', r: h.r, c: h.c }); e.preventDefault(); return; }
    commitEdit(tab, 0, 0);
  }
  $('#gridwrap').focus({ preventScroll: true });
  if (tab.selChart !== undefined && tab.selChart !== null) { tab.selChart = null; }
  const sh = curSheet(tab), G = tab._view.G;
  switch (h.kind) {
    case 'corner': select(tab, 0, 0, MAXR - 1, MAXC - 1); break;
    case 'colhdr': { const s = tab.sel; if (e.shiftKey) select(tab, 0, s.ac, MAXR - 1, h.c); else select(tab, 0, h.c, MAXR - 1, h.c); startDrag(tab, { type: 'cols', anchor: e.shiftKey ? s.ac : h.c }); break; }
    case 'rowhdr': { const s = tab.sel; if (e.shiftKey) select(tab, s.ar, 0, h.r, MAXC - 1); else select(tab, h.r, 0, h.r, MAXC - 1); startDrag(tab, { type: 'rows', anchor: e.shiftKey ? s.ar : h.r }); break; }
    case 'colresize': startDrag(tab, { type: 'colsize', c: h.c, x0: e.clientX, w0: G.col.size(h.c) / (sh.zoom / 100) }); break;
    case 'rowresize': startDrag(tab, { type: 'rowsize', r: h.r, y0: e.clientY, h0: G.row.size(h.r) / (sh.zoom / 100) }); break;
    case 'cell': {
      const s = tab.sel;
      if (e.shiftKey) select(tab, s.ar, s.ac, h.r, h.c); else { tab.moveInSel = false; select(tab, h.r, h.c); }
      startDrag(tab, { type: 'select' });
      break;
    }
    default: break;
  }
  e.preventDefault();
}
function startDrag(tab, d) {
  tab.drag = d;
  const move = ev => onDragMove(tab, ev), up = ev => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); clearInterval(tab._autoscroll); onDragEnd(tab, ev); tab.drag = null; };
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  tab._autoscroll = setInterval(() => autoScroll(tab), 40);
}
function autoScroll(tab) {
  const wrap = $('#gscroll'), ev = tab._lastMove; if (!wrap || !ev || !tab.drag) return;
  const rect = wrap.getBoundingClientRect(), d = 24;
  if (ev.clientY > rect.bottom - 17) wrap.scrollTop += d; else if (ev.clientY < rect.top + 20) wrap.scrollTop -= d;
  if (ev.clientX > rect.right - 17) wrap.scrollLeft += d; else if (ev.clientX < rect.left + 40) wrap.scrollLeft -= d;
  onDragMove(tab, ev);
}
function onDragMove(tab, ev) {
  tab._lastMove = ev;
  const d = tab.drag; if (!d) return;
  const sh = curSheet(tab);
  if (d.type === 'colsize') { const w = Math.max(4, Math.round(d.w0 + (ev.clientX - d.x0) / (sh.zoom / 100))); const rg = selRange(tab); const cols = rg.c1 <= d.c && rg.c2 >= d.c && rg.r1 === 0 && rg.r2 >= MAXR - 1 ? [rg.c1, rg.c2] : [d.c, d.c]; for (let c = cols[0]; c <= cols[1]; c++) sh.colW.set(c, w); d.moved = true; tab.wb.touch(); drawGrid(tab); return; }
  if (d.type === 'rowsize') { const h = Math.max(2, Math.round(d.h0 + (ev.clientY - d.y0) / (sh.zoom / 100))); const rg = selRange(tab); const rows = rg.r1 <= d.r && rg.r2 >= d.r && rg.c1 === 0 && rg.c2 >= MAXC - 1 ? [rg.r1, rg.r2] : [d.r, d.r]; for (let r = rows[0]; r <= Math.min(rows[1], rows[0] + 2000); r++) sh.rowH.set(r, h); d.moved = true; tab.wb.touch(); drawGrid(tab); return; }
  const p = hit(tab, ev);
  if (d.type === 'select' && p.kind === 'cell') select(tab, tab.sel.ar, tab.sel.ac, p.r, p.c);
  else if (d.type === 'cols' && (p.kind === 'colhdr' || p.kind === 'cell' || p.kind === 'colresize')) select(tab, 0, d.anchor, MAXR - 1, p.c);
  else if (d.type === 'rows' && (p.kind === 'rowhdr' || p.kind === 'cell' || p.kind === 'rowresize')) select(tab, d.anchor, 0, p.r, MAXC - 1);
  else if (d.type === 'ref' && p.kind === 'cell') { const ref = (p.r === d.r && p.c === d.c) ? a1(d.r, d.c) : a1(d.r, d.c) + ':' + a1(p.r, p.c); insertRef(tab, ref, true); }
  else if (d.type === 'fill' && p.kind === 'cell') {
    const s = d.src, dr = p.r > s.r2 ? p.r - s.r2 : p.r < s.r1 ? p.r - s.r1 : 0, dc = p.c > s.c2 ? p.c - s.c2 : p.c < s.c1 ? p.c - s.c1 : 0;
    d.dir = Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 'down' : dr < 0 ? 'up' : null) : (dc > 0 ? 'right' : dc < 0 ? 'left' : null); d.n = Math.abs(Math.abs(dr) >= Math.abs(dc) ? dr : dc);
    const g = { ...s }; if (d.dir === 'down') g.r2 += d.n; if (d.dir === 'up') g.r1 -= d.n; if (d.dir === 'right') g.c2 += d.n; if (d.dir === 'left') g.c1 -= d.n;
    tab.sel = { ar: g.r1, ac: g.c1, er: g.r2, ec: g.c2 }; requestDraw(tab);
  }
}
function onDragEnd(tab) {
  const d = tab.drag; if (!d) return;
  if (d.type === 'select' && tab.painter) applyPainterSheet(tab);
  if ((d.type === 'colsize' || d.type === 'rowsize') && d.moved) { const sh = curSheet(tab); const snapshot = { colW: new Map(sh.colW), rowH: new Map(sh.rowH) }; void snapshot; tab.wb.changed(); }
  if (d.type === 'fill' && d.dir && d.n > 0) {
    tab.wb.fill(tab.wb.active, d.src, d.dir, d.n);
    const s = d.src, g = { ...s }; if (d.dir === 'down') g.r2 += d.n; if (d.dir === 'up') g.r1 -= d.n; if (d.dir === 'right') g.c2 += d.n; if (d.dir === 'left') g.c1 -= d.n;
    select(tab, g.r1, g.c1, g.r2, g.c2);
  } else if (d.type === 'fill') select(tab, d.src.r1, d.src.c1, d.src.r2, d.src.c2);
  const ed = $('#cellEditor'); if (d.type === 'ref' && ed) ed.focus();
}
function onDblClick(tab, e) {
  const h = hit(tab, e), sh = curSheet(tab);
  if (h.kind === 'cell') { select(tab, h.r, h.c); startEdit(tab); }
  else if (h.kind === 'colresize') { SC.autofitCol(tab, h.c); }
  else if (h.kind === 'rowresize') { SC.autofitRow(tab, h.r); }
  void sh;
}

/* ================= Keyboard ================= */
async function gridKey(tab, e) {
  if (tab.edit) return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey, s = tab.sel;
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (arrows[k]) { e.preventDefault(); if (alt && k === 'ArrowDown') return SC.dropdown(tab); moveActive(tab, arrows[k][0], arrows[k][1], shift, ctrl); return; }
  if (ctrl) {
    const lk = k.toLowerCase();
    const map = { c: () => SC.copy(tab, false), x: () => SC.copy(tab, true), v: () => SC.paste(tab), z: () => SC.undo(tab), y: () => SC.redo(tab), b: () => SC.togglestyle(tab, 'b'), i: () => SC.togglestyle(tab, 'i'), u: () => SC.togglestyle(tab, 'u'),
      d: () => SC.fillcmd(tab, 'down'), r: () => SC.fillcmd(tab, 'right'), f: () => SC.find(tab), h: () => SC.replace(tab), '1': () => SC.formatcells(tab), a: () => select(tab, 0, 0, MAXR - 1, MAXC - 1),
      ';': () => SC.insertnow(tab, 'date'), ':': () => SC.insertnow(tab, 'time'), home: () => select(tab, 0, 0), end: () => { const u = tab.wb.used(tab.wb.active); select(tab, Math.max(0, u.r), Math.max(0, u.c)); }, ' ': () => select(tab, 0, s.ac, MAXR - 1, s.ac), l: () => shift && SC.filter(tab), '9': () => SC.hideRows(tab), '0': () => SC.hideCols(tab), k: () => SC.hyperlink(tab) };
    const fn = map[lk] || map[k];
    if (fn) { e.preventDefault(); await fn(); return; }
    return;
  }
  if (k === ' ' && shift) { e.preventDefault(); select(tab, s.ar, 0, s.ar, MAXC - 1); return; }
  switch (k) {
    case 'Enter': e.preventDefault(); tab.moveInSel = true; moveActive(tab, shift ? -1 : 1, 0, false, false); break;
    case 'Tab': e.preventDefault(); tab.moveInSel = true; moveActive(tab, 0, shift ? -1 : 1, false, false); break;
    case 'Home': e.preventDefault(); select(tab, s.ar, 0, shift ? s.er : s.ar, shift ? 0 : 0); break;
    case 'PageDown': case 'PageUp': { e.preventDefault(); const rows = Math.max(1, Math.floor(((tab._view ? tab._view.vh : 500) - 40) / (DH * curSheet(tab).zoom / 100))); moveActive(tab, k === 'PageDown' ? rows : -rows, 0, shift, false); break; }
    case 'Delete': case 'Backspace': e.preventDefault(); SC.clear(tab, 'contents'); break;
    case 'F2': e.preventDefault(); startEdit(tab); break;
    case 'F4': e.preventDefault(); break;
    case 'Escape': if (tab.clip) { tab.clip = null; requestDraw(tab); } break;
    case 'ContextMenu': e.preventDefault(); break;
    default:
      if (alt && k === '=') { e.preventDefault(); SC.autosum(tab); return; }
      if (k.length === 1 && !alt) { e.preventDefault(); startEdit(tab, k, 'enter'); }
  }
}
async function editorKey(tab, e) {
  const k = e.key, ed = $('#cellEditor'), shift = e.shiftKey;
  const hint = $('#fnhint');
  const hintOpen = hint && hint.style.display !== 'none';
  if (hintOpen && (k === 'ArrowDown' || k === 'ArrowUp')) { e.preventDefault(); const items = $$('.fh', hint), i = items.findIndex(x => x.classList.contains('on')), n = (i + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, j) => x.classList.toggle('on', j === n)); return; }
  if (hintOpen && (k === 'Tab' || (k === 'Enter' && false))) { e.preventDefault(); acceptHint(tab); return; }
  if (k === 'Enter' && !e.altKey) { e.preventDefault(); await commitEdit(tab, shift ? -1 : 1, 0); tab.moveInSel = true; }
  else if (k === 'Enter' && e.altKey) { e.preventDefault(); const p = ed.selectionStart; ed.value = ed.value.slice(0, p) + '\n' + ed.value.slice(ed.selectionEnd); ed.setSelectionRange(p + 1, p + 1); autosizeEditor(tab); syncFx(tab); }
  else if (k === 'Tab') { e.preventDefault(); await commitEdit(tab, 0, shift ? -1 : 1); tab.moveInSel = true; }
  else if (k === 'Escape') { e.preventDefault(); cancelEdit(tab); }
  else if (tab.edit && tab.edit.mode === 'enter' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !(ed.value[0] === '=' && canInsertRef(ed.value, ed.selectionStart))) {
    e.preventDefault();
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    await commitEdit(tab, d[0], d[1]);
  } else if (k === 'F2') { e.preventDefault(); tab.edit.mode = tab.edit.mode === 'edit' ? 'enter' : 'edit'; }
  else if (e.ctrlKey && k.toLowerCase() === 'z') { /* native undo inside the editor */ }
}

/* ================= Clipboard (system clipboard via the main process) ================= */
SC.copy = async (tab, cut) => {
  const rg = selRange(tab), wb = tab.wb;
  if (cut && curSheet(tab).protect) return toast('This sheet is protected.');
  const data = wb.copy(wb.active, rg);
  tab.clip = { rg, sheetIdx: wb.active, data, cut: !!cut };
  try { await window.digicre8.clipboardWrite(data.tsv); } catch (e) { /* keep the internal copy */ }
  requestDraw(tab);
  toast(cut ? 'Cut: choose where to paste' : 'Copied');
};
SC.paste = async (tab, mode = 'all') => {
  const sh = curSheet(tab), wb = tab.wb;
  if (sh.protect) return toast('This sheet is protected.');
  let text = ''; try { text = await window.digicre8.clipboardRead(); } catch (e) { /* ignore */ }
  const rg = selRange(tab), r0 = rg.r1, c0 = rg.c1;
  if (tab.clip && (text === tab.clip.data.tsv || !text)) {
    const c = tab.clip;
    wb.begin();
    try {
      wb.paste(wb.active, r0, c0, c.data, mode, c.cut);
      if (c.cut && mode === 'all') { const src = c.rg; const overlap = !(r0 + c.data.rows - 1 < src.r1 || r0 > src.r2 || c0 + c.data.cols - 1 < src.c1 || c0 > src.c2); if (!overlap || true) { const keep = wb.copy(wb.active, { r1: r0, c1: c0, r2: r0 + c.data.rows - 1, c2: c0 + c.data.cols - 1 }); wb.clear(c.sheetIdx, src, 'all'); wb.paste(wb.active, r0, c0, keep, 'all', true); } tab.clip = null; }
    } finally { wb.end(); }
    select(tab, r0, c0, r0 + c.data.rows - 1, c0 + c.data.cols - 1);
  } else if (text) {
    const rows = wb.pasteText(wb.active, r0, c0, text);
    select(tab, r0, c0, r0 + rows.length - 1, c0 + Math.max(...rows.map(r => r.length)) - 1);
  }
  requestDraw(tab);
};
SC.undo = tab => { cancelEdit(tab); if (!tab.wb.undo()) toast('Nothing to undo'); };
SC.redo = tab => { cancelEdit(tab); if (!tab.wb.redo()) toast('Nothing to redo'); };

/* ================= Screen scaffold ================= */
function renderSheets(tab) {
  if (!tab.wb) { tab.wb = new Workbook(); if (tab.title === 'Untitled' || tab.title === 'Untitled document') tab.title = 'Untitled workbook'; }
  const wb = tab.wb;
  tab.sel = tab.sel || { ar: 0, ac: 0, er: 0, ec: 0 }; tab.edit = null; tab.drag = null; tab.moveInSel = false;
  tab.fBar = tab.fBar !== false;
  view.innerHTML = `
    <div class="ribbon sheets" id="ribbon" style="--accent:${SHEET_COLOR}"><div class="ribbon-tabs" role="tablist"></div><div class="ribbon-body"></div></div>
    <div class="fxbar" id="fxbar"><input id="nameBox" aria-label="Name box" spellcheck="false" autocomplete="off"><button class="fxb" id="fxBtn" title="Insert function" aria-label="Insert function">fx</button><input id="fxInput" aria-label="Formula bar" spellcheck="false" autocomplete="off"></div>
    <div class="findbar" id="shFind" hidden>
      <input id="shFindIn" placeholder="Find" aria-label="Find"><input id="shRepIn" placeholder="Replace with" aria-label="Replace with">
      <button class="btn" id="shNext">Find next</button><button class="btn" id="shRep">Replace</button><button class="btn" id="shAll">Replace all</button><button class="btn" id="shClose" aria-label="Close find">×</button>
    </div>
    <div class="gridwrap" id="gridwrap" tabindex="0" aria-label="Spreadsheet grid">
      <div class="gscroll" id="gscroll">
        <div id="gspacer"></div><div id="gcells"></div><div id="chartlayer"></div>
        <div id="selbox"></div><div id="clipbox"></div><div id="fillh" title="Drag to fill"></div>
        <textarea id="cellEditor" spellcheck="false" aria-label="Cell editor"></textarea><div id="fnhint"></div><button id="ddbtn" aria-label="Show choices">▾</button>
      </div>
    </div>
    <div class="sheettabs" id="sheettabs"></div>
    <footer class="status"><span id="sready">Ready</span><span id="sstats"></span><span class="spacer"></span><button class="zbtn" id="zOut" aria-label="Zoom out">−</button><span id="szoom"></span><button class="zbtn" id="zIn" aria-label="Zoom in">+</button></footer>`;
  renderRibbon(tab);
  $('#fxbar').hidden = !tab.fBar;
  const wrap = $('#gscroll'), gw = $('#gridwrap');
  wrap.addEventListener('scroll', () => { tab.scroll = tab.scroll || {}; tab.scroll[wb.active] = [wrap.scrollLeft, wrap.scrollTop]; drawGrid(tab); });
  bindChartLayer(tab);
  wrap.addEventListener('mousedown', e => onMouseDown(tab, e));
  wrap.addEventListener('dblclick', e => onDblClick(tab, e));
  wrap.addEventListener('contextmenu', e => { e.preventDefault(); const h = hit(tab, e); if (h.kind === 'cell') { const rg = selRange(tab); if (!(h.r >= rg.r1 && h.r <= rg.r2 && h.c >= rg.c1 && h.c <= rg.c2)) select(tab, h.r, h.c); } showContext(tab, e, h); });
  wrap.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); SC.zoom(tab, e.deltaY < 0 ? 10 : -10); } }, { passive: false });
  wrap.addEventListener('click', e => { const t = e.target; if (t.classList && t.classList.contains('fbtn')) SC.filterMenu(tab, +t.dataset.fc, t); else if (t.id === 'ddbtn') SC.dropdown(tab); else if (t.classList && t.classList.contains('fh')) { const ed = $('#cellEditor'); $('#fnhint').querySelectorAll('.fh').forEach(x => x.classList.toggle('on', x === t)); acceptHint(tab); ed.focus(); } else if (t.closest && t.closest('.c.lnk') && (e.ctrlKey || e.metaKey)) { const h = hit(tab, e), cell = curSheet(tab).get(h.r, h.c); if (cell && cell.link) window.digicre8.openExternal(cell.link); } });
  gw.addEventListener('keydown', e => { if (e.target === gw || e.target === wrap) gridKey(tab, e); });
  const ed = $('#cellEditor');
  ed.addEventListener('input', () => { autosizeEditor(tab); syncFx(tab); });
  ed.addEventListener('keydown', e => editorKey(tab, e));
  ed.addEventListener('keyup', () => showHint(tab)); ed.addEventListener('click', () => showHint(tab));
  const fx = $('#fxInput'), nb = $('#nameBox');
  fx.addEventListener('focus', () => { if (!tab.edit && !curSheet(tab).protect) { startEdit(tab, undefined, 'edit'); fx.focus(); } });
  fx.addEventListener('input', () => { if (tab.edit) { ed.value = fx.value; autosizeEditor(tab); } });
  fx.addEventListener('keydown', async e => { if (e.key === 'Enter') { e.preventDefault(); if (tab.edit) { ed.value = fx.value; await commitEdit(tab, 1, 0); } } else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(tab); fx.blur(); } });
  nb.addEventListener('focus', () => nb.select());
  nb.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); SC.gotoName(tab, nb.value); $('#gridwrap').focus(); } else if (e.key === 'Escape') { nb.blur(); updateBars(tab); $('#gridwrap').focus(); } });
  nb.addEventListener('blur', () => updateBars(tab));
  $('#fxBtn').addEventListener('click', () => SC.insertfn(tab));
  $('#zIn').addEventListener('click', () => SC.zoom(tab, 10)); $('#zOut').addEventListener('click', () => SC.zoom(tab, -10));
  $('#fnhint').addEventListener('mousedown', e => e.preventDefault());
  bindSheetFind(tab);
  wb.onChange = () => { markDirty(tab); tab._geomKey = null; requestDraw(tab); updateBars(tab); renderSheetTabs(tab); };
  renderSheetTabs(tab);
  const pos = (tab.scroll || {})[wb.active] || [0, 0];
  drawGrid(tab);
  wrap.scrollLeft = pos[0]; wrap.scrollTop = pos[1];
  drawGrid(tab); updateBars(tab); syncZoomLabel(tab);
  gw.focus({ preventScroll: true });
}
function syncZoomLabel(tab) { const z = $('#szoom'); if (z) z.textContent = curSheet(tab).zoom + '%'; }

/* ================= Sheet tabs ================= */
function renderSheetTabs(tab) {
  const box = $('#sheettabs'); if (!box) return;
  const wb = tab.wb; box.innerHTML = '';
  wb.sheets.forEach((sh, i) => {
    const b = document.createElement('button');
    b.className = 'stab' + (i === wb.active ? ' on' : '');
    b.textContent = sh.name; b.title = sh.name;
    if (sh.tabColor) b.style.borderBottomColor = sh.tabColor;
    b.addEventListener('click', () => switchSheet(tab, i));
    b.addEventListener('dblclick', () => SC.renamesheet(tab, i));
    b.addEventListener('contextmenu', e => { e.preventDefault(); switchSheet(tab, i); showContext(tab, e, { kind: 'sheettab', i }); });
    box.appendChild(b);
  });
  const add = document.createElement('button'); add.className = 'stab add'; add.textContent = '+'; add.title = 'New sheet'; add.setAttribute('aria-label', 'New sheet');
  add.addEventListener('click', () => SC.addsheet(tab)); box.appendChild(add);
}
function switchSheet(tab, i) {
  if (i === tab.wb.active) return;
  commitEdit(tab, 0, 0);
  tab.states = tab.states || {}; tab.states[tab.wb.active] = { sel: tab.sel, scroll: (tab.scroll || {})[tab.wb.active] };
  tab.wb.active = i; tab.clip = null; tab._geomKey = null;
  const st = tab.states[i]; tab.sel = st ? st.sel : { ar: 0, ac: 0, er: 0, ec: 0 };
  renderSheets(tab);
}

/* ================= Find and replace bar ================= */
function bindSheetFind(tab) {
  const fi = $('#shFindIn'), ri = $('#shRepIn');
  const find = () => {
    if (!fi.value) return null;
    const s = tab.sel, hit1 = tab.wb.find(tab.wb.active, fi.value, tab.findOpts || {}, { r: s.ar, c: s.ac });
    if (!hit1) { toast('No results'); return null; }
    select(tab, hit1.r, hit1.c); return hit1;
  };
  $('#shNext').onclick = find;
  fi.addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
  $('#shRep').onclick = () => {
    const s = tab.sel, cell = curSheet(tab).get(s.ar, s.ac);
    if (cell && fi.value && tab.wb.display(tab.wb.active, s.ar, s.ac).text.toLowerCase().includes(fi.value.toLowerCase())) {
      const cur = cell.f !== undefined ? '=' + cell.f : String(cell.v ?? ''), re = new RegExp(fi.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), (tab.findOpts && tab.findOpts.matchCase) ? '' : 'i');
      tab.wb.setInput(tab.wb.active, s.ar, s.ac, cur.replace(re, () => ri.value));
    }
    find();
  };
  $('#shAll').onclick = () => { const n = tab.wb.replaceAll(tab.wb.active, fi.value, ri.value, tab.findOpts || {}); toast(n ? `Replaced ${n} item${n > 1 ? 's' : ''}` : 'No matches'); };
  $('#shClose').onclick = () => { $('#shFind').hidden = true; $('#gridwrap').focus(); };
}
