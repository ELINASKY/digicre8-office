'use strict';
/* DigiCre8 Sheets: data model, formulas, number formats and spreadsheet operations.
   Pure logic with no DOM access, so it can run (and be tested) in Node as well as in the app. */

const MAXR = 1048576, MAXC = 16384;

/* ================= Addresses ================= */
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const addr = (r, c, absR, absC) => (absC ? '$' : '') + colName(c) + (absR ? '$' : '') + (r + 1);
function parseAddr(a) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(a).trim());
  if (!m) return null;
  const r = +m[2] - 1, c = colIndex(m[1]);
  return r >= 0 && r < MAXR && c < MAXC ? { r, c } : null;
}
function parseRange(a) {
  const s = String(a).replace(/\$/g, '').trim();
  let m;
  if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(s))) { const x = colIndex(m[1]), y = colIndex(m[2]); return { r1: 0, c1: Math.min(x, y), r2: MAXR - 1, c2: Math.max(x, y) }; }
  if ((m = /^(\d+):(\d+)$/.exec(s))) { const x = +m[1] - 1, y = +m[2] - 1; return { r1: Math.min(x, y), c1: 0, r2: Math.max(x, y), c2: MAXC - 1 }; }
  const [x, y] = s.split(':'), p = parseAddr(x), q = y ? parseAddr(y) : p;
  if (!p || !q) return null;
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
}
const rangeAddr = g => (g.r1 === g.r2 && g.c1 === g.c2 ? addr(g.r1, g.c1) : addr(g.r1, g.c1) + ':' + addr(g.r2, g.c2));
const key = (r, c) => r * MAXC + c;
const unkey = k => ({ r: Math.floor(k / MAXC), c: k % MAXC });

/* ================= Errors and values ================= */
class ErrVal { constructor(code) { this.code = code; } toString() { return this.code; } }
const isErr = v => v instanceof ErrVal;
const ERR_CODES = ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!', '#ERROR!', '#CIRC!'];

/* ================= Dates ================= */
const EPOCH = Date.UTC(1899, 11, 30);
const serialToDate = s => new Date(EPOCH + Math.round(s * 86400000));
const dateToSerial = d => (d.getTime() - EPOCH) / 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dateOrder() {
  try {
    const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2001, 10, 22)).filter(p => ['day', 'month', 'year'].includes(p.type)).map(p => p.type[0]);
    return parts.join('') || 'dmy';
  } catch (e) { return 'dmy'; }
}
function parseDateText(s, order = dateOrder()) {
  s = s.trim();
  let m, y, mo, d;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
    if (order === 'mdy') { mo = +m[1]; d = +m[2]; } else { d = +m[1]; mo = +m[2]; }
  } else if ((m = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,-]+(\d{2,4})$/.exec(s))) {
    d = +m[1]; mo = MONTHS.findIndex(n => n.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3))) + 1; y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
  } else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(s))) {
    mo = MONTHS.findIndex(n => n.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3))) + 1; d = +m[2]; y = +m[3];
  } else return null;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dateToSerial(dt);
}
function parseTimeText(s) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = +m[1]; const mi = +m[2], se = +(m[3] || 0);
  if (m[4]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0); }
  if (h > 23 || mi > 59 || se > 59) return null;
  return (h * 3600 + mi * 60 + se) / 86400;
}

/* ================= Number formats ================= */
function generalText(n) {
  if (!isFinite(n)) return String(n);
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e11 || a < 1e-9) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e+', 'E+').replace('e-', 'E-').replace(/E([+-])(\d)$/, 'E$10$2');
  return String(+n.toPrecision(11));
}
function groupDigits(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
const COLORS = { red: '#c62828', green: '#1a7f37', blue: '#1f4fd6', black: '#000000', magenta: '#a0209a', cyan: '#00838f', yellow: '#a07800', white: '#ffffff' };
function splitSections(code) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < code.length; i++) { const ch = code[i]; if (ch === '"') q = !q; if (ch === ';' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur);
  return out;
}
function formatDateCode(serial, code) {
  const d = serialToDate(serial);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), W = d.getUTCDay();
  const secs = Math.round((serial - Math.floor(serial)) * 86400) % 86400, H = Math.floor(secs / 3600), Mi = Math.floor(secs % 3600 / 60), S = secs % 60;
  const ampm = /AM\/PM|A\/P/i.test(code);
  const p2 = n => String(n).padStart(2, '0');
  const tokens = [];
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i), ch = code[i];
    let m;
    if (ch === '"') { const j = code.indexOf('"', i + 1); tokens.push({ lit: code.slice(i + 1, j < 0 ? code.length : j) }); i = j < 0 ? code.length : j + 1; }
    else if (ch === '\\') { tokens.push({ lit: code[i + 1] || '' }); i += 2; }
    else if (ch === '[') { const j = code.indexOf(']', i); i = j < 0 ? code.length : j + 1; }
    else if ((m = /^(AM\/PM|A\/P)/i.exec(rest))) { tokens.push({ t: 'ap', s: m[1] }); i += m[1].length; }
    else if ((m = /^(y{1,4}|m{1,5}|d{1,4}|h{1,2}|s{1,2})/i.exec(rest))) { tokens.push({ t: m[1][0].toLowerCase(), n: m[1].length }); i += m[1].length; }
    else if (ch === '_' || ch === '*') i += 2;
    else { tokens.push({ lit: ch }); i++; }
  }
  // "m" right after h or before s means minutes
  tokens.forEach((t, k) => {
    if (t.t !== 'm') return;
    const prev = tokens.slice(0, k).reverse().find(x => x.t), next = tokens.slice(k + 1).find(x => x.t);
    if ((prev && prev.t === 'h') || (next && next.t === 's')) t.t = 'min';
  });
  return tokens.map(t => {
    if (t.lit !== undefined) return t.lit;
    switch (t.t) {
      case 'y': return t.n <= 2 ? p2(Y % 100) : String(Y);
      case 'm': return t.n === 1 ? String(Mo + 1) : t.n === 2 ? p2(Mo + 1) : t.n === 3 ? MONTHS[Mo].slice(0, 3) : t.n === 4 ? MONTHS[Mo] : MONTHS[Mo][0];
      case 'd': return t.n === 1 ? String(D) : t.n === 2 ? p2(D) : t.n === 3 ? DAYS[W].slice(0, 3) : DAYS[W];
      case 'h': { const h = ampm ? (H % 12 || 12) : H; return t.n === 2 ? p2(h) : String(h); }
      case 'min': return t.n === 2 ? p2(Mi) : String(Mi);
      case 's': return t.n === 2 ? p2(S) : String(S);
      case 'ap': return H < 12 ? (t.s.length > 1 && /am/i.test(t.s[0] + 'M') ? 'AM' : 'AM') : 'PM';
      default: return '';
    }
  }).join('');
}
const isDateCode = code => /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').replace(/General|E[+-]/gi, ''));

function formatNumber(n, code) {
  if (!code || /^general$/i.test(code)) return { text: generalText(n) };
  const secs = splitSections(code);
  let sec = secs[0], useAbs = false;
  if (n < 0 && secs.length > 1) { sec = secs[1]; useAbs = true; }
  else if (n === 0 && secs.length > 2) sec = secs[2];
  let color;
  sec = sec.replace(/\[(red|green|blue|black|magenta|cyan|yellow|white)\]/gi, (m, c) => { color = COLORS[c.toLowerCase()]; return ''; }).replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, '$1').replace(/\[[^\]]*\]/g, '');
  if (isDateCode(sec)) return { text: formatDateCode(n, sec), color };
  let v = useAbs ? Math.abs(n) : n;
  const unq = sec.replace(/"[^"]*"|\\./g, '');
  const pct = (unq.match(/%/g) || []).length;
  v = v * Math.pow(100, pct);
  const sci = /E[+-]0+/i.exec(unq);
  // locate the numeric pattern (placeholders) inside the section
  let pattern = '', pre = '', post = '', phase = 0;
  for (let i = 0; i < sec.length; i++) {
    const ch = sec[i];
    if (ch === '"') { const j = sec.indexOf('"', i + 1), t = sec.slice(i + 1, j < 0 ? sec.length : j); if (phase === 0) pre += t; else { post += t; phase = 2; } i = j < 0 ? sec.length : j; continue; }
    if (ch === '\\') { const t = sec[++i] || ''; (phase === 0 ? (pre += t) : phase === 1 ? (post += t, phase = 2) : (post += t)); continue; }
    if (ch === '_' || ch === '*') { i++; if (ch === '_') (phase === 0 ? (pre += ' ') : (post += ' ')); continue; }
    if (/[0#?.,]/.test(ch) || (sci && phase === 1 && /[E+\-]/i.test(ch))) { if (phase === 2) { post += ch; continue; } phase = 1; pattern += ch; continue; }
    if (ch === '%') { (phase === 0 ? (pre += '%') : (post += '%', phase = 2)); continue; }
    if (phase === 1) phase = 2;
    (phase === 0 ? (pre += ch) : (post += ch));
  }
  let body;
  if (sci) {
    const m = /^([0#?,.]*)E([+-])(0+)$/i.exec(pattern);
    const dec = m ? (m[1].split('.')[1] || '').length : 2, ew = m ? m[3].length : 2;
    const e = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v)));
    const mant = v / Math.pow(10, e);
    body = mant.toFixed(dec) + 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(ew, '0');
  } else {
    const [ip = '', dp = ''] = pattern.replace(/,(?=[0#?]*\.|$)/g, c => c).split('.');
    const decimals = (dp.match(/[0#?]/g) || []).length, minDec = (dp.match(/0/g) || []).length;
    const thousands = /[0#?],[0#?]/.test(ip);
    const scaleDown = (ip.match(/,+$/) || [''])[0].length;
    if (scaleDown) v = v / Math.pow(1000, scaleDown);
    const minInt = (ip.match(/0/g) || []).length;
    let s = Math.abs(v).toFixed(decimals);
    let [i2, d2 = ''] = s.split('.');
    d2 = d2.replace(/0+$/, '');
    while (d2.length < minDec) d2 += '0';
    if (i2 === '0' && minInt === 0 && decimals > 0 && d2) i2 = '';
    i2 = i2.padStart(minInt, '0');
    if (thousands) i2 = groupDigits(i2);
    body = i2 + (decimals > 0 && (d2 || /\.0/.test('.' + dp.slice(0, 1))) ? '.' + d2 : '');
    if (decimals > 0 && !d2) body = body.replace(/\.$/, '');
    if (v < 0 && !useAbs && Number(s) !== 0) body = '-' + body;
  }
  return { text: pre + body + post, color };
}
function formatValue(v, code) {
  if (v === null || v === undefined || v === '') return { text: '' };
  if (isErr(v)) return { text: v.code, err: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', center: true };
  if (typeof v === 'number') return { ...formatNumber(v, code), num: true };
  if (code && code.includes('@')) return { text: code.replace(/"[^"]*"/g, m => m.slice(1, -1)).replace('@', String(v)) };
  return { text: String(v) };
}

/* ================= Typed input -> cell content ================= */
function parseInput(text) {
  if (text === null || text === undefined) return { v: null };
  if (typeof text !== 'string') return { v: text };
  const t = text.trim();
  if (t === '') return { v: null };
  if (text.startsWith("'")) return { v: text.slice(1) };
  if (t[0] === '=' && t.length > 1) return { f: t.slice(1) };
  if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true' };
  let m;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return { v: +t };
  if ((m = /^[-+]?(\d{1,3}(,\d{3})+)(\.\d+)?$/.exec(t))) return { v: +t.replace(/,/g, ''), nf: m[3] ? '#,##0.' + '0'.repeat(m[3].length - 1) : '#,##0' };
  if ((m = /^([-+]?(?:\d+\.?\d*|\.\d+))%$/.exec(t))) return { v: +m[1] / 100, nf: m[1].includes('.') ? '0.' + '0'.repeat(m[1].split('.')[1].length) + '%' : '0%' };
  if ((m = /^([$€£¥₵])\s?(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)$/.exec(t))) { const dec = (m[2].split('.')[1] || '').length; return { v: +m[2].replace(/,/g, ''), nf: m[1] + '#,##0' + (dec ? '.' + '0'.repeat(dec) : '') }; }
  const d = parseDateText(t);
  if (d !== null) return { v: d, nf: 'yyyy-mm-dd' };
  const tm = parseTimeText(t);
  if (tm !== null) return { v: tm, nf: 'h:mm AM/PM'.includes('AM') && /am|pm/i.test(t) ? 'h:mm AM/PM' : 'hh:mm' };
  return { v: text };
}

/* ================= Formula references ================= */
const REF_RE = /(?<![\w.$!'"])((?:'[^']+'|[A-Za-z_][\w.]*)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+)(?![\w(])/g;
function mapRefs(formula, fn) {
  // leave text inside double quotes untouched
  return String(formula).split(/("(?:[^"]|"")*")/).map((part, i) => (i % 2 ? part : part.replace(REF_RE, (m, sh, ref) => fn(sh || '', ref, m)))).join('');
}
function splitEndpoint(p) {
  let m;
  if ((m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(p))) return { ac: !!m[1], c: colIndex(m[2]), ar: !!m[3], r: +m[4] - 1 };
  if ((m = /^(\$?)([A-Z]{1,3})$/.exec(p))) return { ac: !!m[1], c: colIndex(m[2]) };
  if ((m = /^(\$?)(\d+)$/.exec(p))) return { ar: !!m[1], r: +m[2] - 1 };
  return null;
}
const joinEndpoint = e => (e.c !== undefined ? (e.ac ? '$' : '') + colName(e.c) : '') + (e.r !== undefined ? (e.ar ? '$' : '') + (e.r + 1) : '');
function shiftFormula(f, dr, dc) {
  return mapRefs(f, (sh, ref) => {
    const parts = ref.split(':').map(splitEndpoint);
    if (parts.some(p => !p)) return sh + ref;
    for (const p of parts) {
      if (p.r !== undefined && !p.ar) p.r += dr;
      if (p.c !== undefined && !p.ac) p.c += dc;
      if ((p.r !== undefined && (p.r < 0 || p.r >= MAXR)) || (p.c !== undefined && (p.c < 0 || p.c >= MAXC))) return '#REF!';
    }
    return sh + parts.map(joinEndpoint).join(':');
  });
}
/* axis 'r' or 'c'; count > 0 inserts, count < 0 deletes -count lines at idx */
function adjustFormula(f, ownSheet, targetSheet, axis, idx, count) {
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  return mapRefs(f, (sh, ref) => {
    const shName = sh ? sh.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : ownSheet;
    if (!sameName(shName, targetSheet)) return sh + ref;
    const parts = ref.split(':').map(splitEndpoint);
    if (parts.some(p => !p)) return sh + ref;
    if (parts.every(p => p[axis] === undefined)) return sh + ref;
    const n = -count;
    if (count > 0) {
      for (const p of parts) if (p[axis] !== undefined && p[axis] >= idx) p[axis] += count;
    } else if (parts.length === 1) {
      const p = parts[0];
      if (p[axis] >= idx && p[axis] < idx + n) return '#REF!';
      if (p[axis] >= idx + n) p[axis] -= n;
    } else {
      let [a, b] = parts;
      if (a[axis] !== undefined) {
        if (a[axis] >= idx + n) { a[axis] -= n; b[axis] -= n; }
        else {
          if (a[axis] >= idx) { a[axis] = idx; }
          if (b[axis] >= idx + n) b[axis] -= n; else if (b[axis] >= idx) b[axis] = idx - 1;
          if (b[axis] < a[axis]) return '#REF!';
        }
      }
    }
    return sh + parts.map(joinEndpoint).join(':');
  });
}

/* ================= Criteria matching (COUNTIF family) ================= */
function wildcardRe(s) { return new RegExp('^' + s.replace(/~([*?~])|[.+^${}()|[\]\\]|(\*)|(\?)/g, (m, esc, st, q) => (esc ? '\\' + esc : st ? '.*' : q ? '.' : '\\' + m)) + '$', 'i'); }
function criteria(c) {
  if (typeof c === 'number') return v => (typeof v === 'number' ? v === c : typeof v === 'string' && v.trim() !== '' && +v === c);
  if (typeof c === 'boolean') return v => v === c;
  let s = c === null || c === undefined ? '' : String(c), op = '=';
  const m = /^(<=|>=|<>|<|>|=)([\s\S]*)$/.exec(s);
  if (m) { op = m[1]; s = m[2]; }
  const num = s.trim() !== '' && !isNaN(+s) ? +s : null;
  if (['<', '>', '<=', '>='].includes(op)) {
    return v => {
      let a = v, b = num !== null ? num : s;
      if (typeof a === 'number' && typeof b === 'number') { /* numeric */ }
      else if (typeof a === 'string' && typeof b === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); }
      else return false;
      return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    };
  }
  let test;
  if (s === '') test = v => v === null || v === undefined || v === '';
  else if (num !== null) test = v => (typeof v === 'number' && v === num) || (typeof v === 'string' && v.trim() !== '' && +v === num);
  else if (/^(true|false)$/i.test(s)) test = v => typeof v === 'boolean' && v === (s.toLowerCase() === 'true');
  else { const re = wildcardRe(s); test = v => (typeof v === 'string' || typeof v === 'number') && re.test(String(v)); }
  return op === '<>' ? v => !test(v) : test;
}

/* ================= Extra spreadsheet functions (the formula library lacks these) ================= */
function buildFunctions(wb) {
  const FE = () => FormulaParser.FormulaError;
  const isFE = v => v instanceof FormulaParser.FormulaError;
  const flat = a => (Array.isArray(a.value) ? a.value.flat(Infinity) : [a.value]);
  const scalar = a => (Array.isArray(a.value) ? a.value[0][0] : a.value);
  const nums = args => {
    const out = [];
    for (const a of args) {
      if (a.omitted) continue;
      for (const v of flat(a)) {
        if (isFE(v)) throw v;
        if (typeof v === 'number') out.push(v);
        else if (!a.isArray && !a.isRangeRef && !a.isCellRef) {
          if (typeof v === 'boolean') out.push(+v);
          else if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) out.push(+v);
          else if (typeof v === 'string' && v !== '') throw FE().VALUE;
        }
      }
    }
    return out;
  };
  const num = a => { const v = scalar(a); if (isFE(v)) throw v; const n = typeof v === 'boolean' ? +v : typeof v === 'string' && v.trim() !== '' ? +v : v === null || v === '' ? 0 : v; if (typeof n !== 'number' || isNaN(n)) throw FE().VALUE; return n; };
  const str = a => { const v = scalar(a); if (isFE(v)) throw v; return v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v); };
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = (xs, sample) => { if (xs.length < (sample ? 2 : 1)) throw FE().DIV0; const m = mean(xs); return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - (sample ? 1 : 0)); };
  const pct = (xs, k) => { if (!xs.length || k < 0 || k > 1) throw FE().NUM; const s = [...xs].sort((a, b) => a - b), p = (s.length - 1) * k, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
  const shape = a => (Array.isArray(a.value) ? [a.value.length, a.value[0].length] : [1, 1]);
  const cells2 = a => (Array.isArray(a.value) ? a.value : [[a.value]]);
  const condRows = (pairs, rows, cols) => {
    const tests = pairs.map(([rng, cr]) => ({ vals: cells2(rng), t: criteria(scalar(cr)) }));
    const hit = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (tests.every(x => x.vals[r] && x.t(x.vals[r][c]))) hit.push([r, c]);
    }
    return hit;
  };
  const pairs = args => { const p = []; for (let i = 0; i + 1 < args.length; i += 2) p.push([args[i], args[i + 1]]); return p; };
  const ifsSum = (args, fn) => {
    const target = args[0], [rows, cols] = shape(target), p = pairs(args.slice(1));
    for (const [rg] of p) { const s = shape(rg); if (s[0] !== rows || s[1] !== cols) throw FE().VALUE; }
    const tv = cells2(target);
    return fn(condRows(p, rows, cols).map(([r, c]) => tv[r][c]).filter(v => typeof v === 'number'));
  };
  const lookupIdx = (v, arr, type) => {
    const t = typeof v === 'string' ? v.toLowerCase() : v;
    const norm = x => (typeof x === 'string' ? x.toLowerCase() : x);
    if (type === 0) {
      if (typeof v === 'string' && /[*?]/.test(v)) { const re = wildcardRe(v); return arr.findIndex(x => typeof x === 'string' && re.test(x)); }
      return arr.findIndex(x => norm(x) === t && typeof x === typeof v);
    }
    let best = -1;
    for (let i = 0; i < arr.length; i++) {
      const x = norm(arr[i]);
      if (typeof x !== typeof t || x === null) continue;
      if (type > 0 ? x <= t : x >= t) { if (best < 0 || (type > 0 ? x >= norm(arr[best]) : x <= norm(arr[best]))) best = i; }
    }
    return best;
  };
  const fin = {
    pmt: (r, n, pv, fv, t) => (r === 0 ? -(pv + fv) / n : -(r * (pv * (1 + r) ** n + fv)) / ((1 + r * t) * ((1 + r) ** n - 1))),
    fv: (r, n, p, pv, t) => (r === 0 ? -(pv + p * n) : -(pv * (1 + r) ** n + p * (1 + r * t) * ((1 + r) ** n - 1) / r)),
    pv: (r, n, p, fv, t) => (r === 0 ? -(fv + p * n) : -(fv + p * (1 + r * t) * ((1 + r) ** n - 1) / r) / (1 + r) ** n)
  };
  const solve = (f, guess) => {
    let x = guess;
    for (let i = 0; i < 100; i++) {
      const y = f(x), h = 1e-7, d = (f(x + h) - y) / h;
      if (!isFinite(d) || d === 0) break;
      const nx = x - y / d;
      if (Math.abs(nx - x) < 1e-10) return nx;
      x = nx;
    }
    let lo = -0.99, hi = 10, flo = f(lo);
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  };
  const opt = (a, d) => (!a || a.omitted ? d : num(a));
  const parseRef = (text, here) => {
    const m = /^(?:('(?:[^']|'')+'|[^!]+)!)?(.+)$/.exec(String(text).trim());
    if (!m) return null;
    const sh = m[1] ? m[1].replace(/^'|'$/g, '').replace(/''/g, "'") : here;
    const si = wb.sheetIndex(sh), rg = parseRange(m[2]);
    return si < 0 || !rg ? null : { si, rg };
  };
  const grid = ({ si, rg }) => {
    const out = [];
    for (let r = rg.r1; r <= rg.r2; r++) { const row = []; for (let c = rg.c1; c <= rg.c2; c++) { const v = wb.evalCell(si, r, c); row.push(isErr(v) ? wb.toFE(v) : v); } out.push(row); }
    return out.length === 1 && out[0].length === 1 ? out[0][0] : out;
  };
  const SUBTOTALS = { 1: 'avg', 2: 'count', 3: 'counta', 4: 'max', 5: 'min', 6: 'prod', 7: 'sd', 8: 'sdp', 9: 'sum', 10: 'var', 11: 'varp' };

  const functions = {
    MIN: (...a) => { const x = nums(a); return x.length ? Math.min(...x) : 0; },
    MAX: (...a) => { const x = nums(a); return x.length ? Math.max(...x) : 0; },
    MEDIAN: (...a) => { const x = nums(a).sort((p, q) => p - q); if (!x.length) throw FE().NUM; const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; },
    COUNTA: (...a) => a.reduce((n, x) => n + flat(x).filter(v => v !== null && v !== undefined && !x.omitted).length, 0),
    COUNTBLANK: (...a) => a.reduce((n, x) => n + flat(x).filter(v => v === null || v === '').length, 0),
    LARGE: (r, k) => { const x = nums([r]).sort((p, q) => q - p), i = num(k); if (i < 1 || i > x.length) throw FE().NUM; return x[i - 1]; },
    SMALL: (r, k) => { const x = nums([r]).sort((p, q) => p - q), i = num(k); if (i < 1 || i > x.length) throw FE().NUM; return x[i - 1]; },
    RANK: (v, r, o) => { const n = num(v), x = nums([r]); if (!x.includes(n)) throw FE().NA; const asc = opt(o, 0) !== 0; return 1 + x.filter(y => (asc ? y < n : y > n)).length; },
    MODE: (...a) => { const x = nums(a), cnt = new Map(); x.forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1)); let best = null, bc = 1; for (const v of x) if (cnt.get(v) > bc) { best = v; bc = cnt.get(v); } if (best === null) throw FE().NA; return best; },
    STDEV: (...a) => Math.sqrt(variance(nums(a), true)), VAR: (...a) => variance(nums(a), true),
    PERCENTILE: (r, k) => pct(nums([r]), num(k)),
    QUARTILE: (r, q) => { const i = num(q); if (i < 0 || i > 4 || i !== Math.floor(i)) throw FE().NUM; return pct(nums([r]), i / 4); },
    SLOPE: (ys, xs) => { const y = flat(ys).filter(v => typeof v === 'number'), x = flat(xs).filter(v => typeof v === 'number'); if (y.length !== x.length || y.length < 2) throw FE().NA; const mx = mean(x), my = mean(y); const d = x.reduce((a, b) => a + (b - mx) ** 2, 0); if (!d) throw FE().DIV0; return x.reduce((a, b, i) => a + (b - mx) * (y[i] - my), 0) / d; },
    COUNTIFS: (...a) => { const [rows, cols] = shape(a[0]); return condRows(pairs(a), rows, cols).length; },
    SUMIFS: (...a) => ifsSum(a, v => v.reduce((p, q) => p + q, 0)),
    AVERAGEIFS: (...a) => ifsSum(a, v => { if (!v.length) throw FE().DIV0; return mean(v); }),
    MAXIFS: (...a) => ifsSum(a, v => (v.length ? Math.max(...v) : 0)),
    MINIFS: (...a) => ifsSum(a, v => (v.length ? Math.min(...v) : 0)),
    MATCH: (v, arr, t) => { const i = lookupIdx(scalar(v), flat(arr), opt(t, 1)); if (i < 0) throw FE().NA; return i + 1; },
    LOOKUP: (v, lv, rv) => { const i = lookupIdx(scalar(v), flat(lv), 1); if (i < 0) throw FE().NA; return flat(rv || lv)[i]; },
    XLOOKUP: (v, la, ra, nf, mm) => {
      const mode = opt(mm, 0), arr = flat(la);
      const i = mode === 0 || mode === 2 ? lookupIdx(scalar(v), arr, 0) : lookupIdx(scalar(v), arr, mode);
      if (i < 0) { if (nf && !nf.omitted) return scalar(nf); throw FE().NA; }
      const vals = cells2(ra);
      return shape(la)[0] > 1 ? vals[i][0] : vals[0][i];
    },
    SWITCH: (e, ...rest) => { const x = scalar(e); for (let i = 0; i + 1 < rest.length; i += 2) if (scalar(rest[i]) === x) return scalar(rest[i + 1]); if (rest.length % 2) return scalar(rest[rest.length - 1]); throw FE().NA; },
    UPPER: t => str(t).toUpperCase(),
    VALUE: t => { const s = str(t).trim(); if (s !== '' && !isNaN(+s)) return +s; const p = parseInput(s); if (typeof p.v === 'number') return p.v; throw FE().VALUE; },
    TEXTJOIN: (d, ig, ...ts) => { const del = str(d), skip = scalar(ig) === true || scalar(ig) === 1; return ts.flatMap(flat).filter(v => !(skip && (v === null || v === ''))).map(v => (v === null ? '' : String(v))).join(del); },
    SUBSTITUTE: (t, o, n, k) => { const s = str(t), old = str(o), nw = str(n); if (!old) return s; if (!k || k.omitted) return s.split(old).join(nw); let c = 0; const idx = num(k); return s.split(old).reduce((acc, p, i) => (i === 0 ? p : (++c === idx ? acc + nw + p : acc + old + p)), ''); },
    SUBTOTAL: (f, ...r) => {
      const kind = SUBTOTALS[num(f) % 100]; const x = nums(r);
      switch (kind) {
        case 'avg': if (!x.length) throw FE().DIV0; return mean(x);
        case 'count': return x.length; case 'counta': return r.reduce((n, a) => n + flat(a).filter(v => v !== null).length, 0);
        case 'max': return x.length ? Math.max(...x) : 0; case 'min': return x.length ? Math.min(...x) : 0;
        case 'prod': return x.reduce((a, b) => a * b, 1); case 'sd': return Math.sqrt(variance(x, true)); case 'sdp': return Math.sqrt(variance(x, false));
        case 'sum': return x.reduce((a, b) => a + b, 0); case 'var': return variance(x, true); case 'varp': return variance(x, false);
        default: throw FE().VALUE;
      }
    },
    ISODD: n => Math.floor(Math.abs(num(n))) % 2 === 1,
    HYPERLINK: (u, f) => (f && !f.omitted ? str(f) : str(u)),
    PMT: (r, n, pv, fv, t) => fin.pmt(num(r), num(n), num(pv), opt(fv, 0), opt(t, 0)),
    FV: (r, n, p, pv, t) => fin.fv(num(r), num(n), num(p), opt(pv, 0), opt(t, 0)),
    PV: (r, n, p, fv, t) => fin.pv(num(r), num(n), num(p), opt(fv, 0), opt(t, 0)),
    NPER: (r, p, pv, fv, t) => { const rate = num(r), pm = num(p), pvv = num(pv), fvv = opt(fv, 0), ty = opt(t, 0); if (rate === 0) return -(pvv + fvv) / pm; const x = (pm * (1 + rate * ty) - fvv * rate) / (pm * (1 + rate * ty) + pvv * rate); if (x <= 0) throw FE().NUM; return Math.log(x) / Math.log(1 + rate); },
    RATE: (n, p, pv, fv, t, g) => { const N = num(n), P = num(p), PV = num(pv), F = opt(fv, 0), T = opt(t, 0); return solve(r => (Math.abs(r) < 1e-12 ? PV + P * N + F : PV * (1 + r) ** N + P * (1 + r * T) * ((1 + r) ** N - 1) / r + F), opt(g, 0.1)); },
    NPV: (r, ...v) => { const rate = num(r); return nums(v).reduce((a, x, i) => a + x / (1 + rate) ** (i + 1), 0); },
    IRR: (v, g) => { const x = nums([v]); if (!x.some(y => y > 0) || !x.some(y => y < 0)) throw FE().NUM; return solve(r => x.reduce((a, y, i) => a + y / (1 + r) ** i, 0), opt(g, 0.1)); },
    IPMT: (r, per, n, pv, fv, t) => { const rate = num(r), k = num(per), N = num(n), P = num(pv), F = opt(fv, 0), T = opt(t, 0); const pm = fin.pmt(rate, N, P, F, T); if (T === 1 && k === 1) return 0; const kk = k - (T ? 1 : 0); return -(P * (1 + rate) ** (kk - 1) * rate + pm * ((1 + rate) ** (kk - 1) - 1)); },
    PPMT: (r, per, n, pv, fv, t) => { const rate = num(r), k = num(per), N = num(n), P = num(pv), F = opt(fv, 0), T = opt(t, 0); const pm = fin.pmt(rate, N, P, F, T); const kk = k - (T ? 1 : 0); const ip = T === 1 && k === 1 ? 0 : -(P * (1 + rate) ** (kk - 1) * rate + pm * ((1 + rate) ** (kk - 1) - 1)); return pm - ip; }
  };
  const functionsNeedContext = {
    CHOOSE: (ctx, i, ...vals) => { const k = num(i); if (k < 1 || k > vals.length) throw FE().VALUE; return vals[k - 1].value; },
    INDIRECT: (ctx, t) => { const ref = parseRef(str(t), ctx.position.sheet); if (!ref) throw FE().REF; return grid(ref); },
    OFFSET: (ctx, base, rows, cols, h, w) => {
      if (!base || !base.ref) throw FE().VALUE;
      const val = a => { if (a === null || a === undefined) return undefined; const x = ctx.utils.extractRefValue(a).val; return Array.isArray(x) ? x[0][0] : x; };
      const ref = base.ref, from = ref.from || ref, to = ref.to || ref;
      const dr = +val(rows) || 0, dc = +val(cols) || 0;
      const hh = val(h) === undefined ? to.row - from.row + 1 : +val(h), ww = val(w) === undefined ? to.col - from.col + 1 : +val(w);
      const si = wb.sheetIndex(ref.sheet || ctx.position.sheet), r1 = from.row - 1 + dr, c1 = from.col - 1 + dc;
      if (si < 0 || r1 < 0 || c1 < 0 || hh < 1 || ww < 1) throw FE().REF;
      return grid({ si, rg: { r1, c1, r2: r1 + hh - 1, c2: c1 + ww - 1 } });
    }
  };
  functions['STDEV.S'] = functions.STDEV; functions['VAR.S'] = functions.VAR; functions['RANK.EQ'] = functions.RANK;
  functions['MODE.SNGL'] = functions.MODE; functions['PERCENTILE.INC'] = functions.PERCENTILE; functions['QUARTILE.INC'] = functions.QUARTILE;
  functions['STDEV.P'] = (...a) => Math.sqrt(variance(nums(a), false)); functions['VAR.P'] = (...a) => variance(nums(a), false);
  return { functions, functionsNeedContext };
}

/* ================= Sheet and Workbook ================= */
const cloneCell = c => (c ? { ...c } : undefined);
const STYLE_KEYS = ['ff', 'fs', 'b', 'i', 'u', 'st', 'fc', 'bg', 'ha', 'va', 'wrap', 'ind', 'nf', 'bt', 'br', 'bb', 'bl'];

class Sheet {
  constructor(name) {
    this.name = name; this.cells = new Map(); this.colW = new Map(); this.rowH = new Map();
    this.hiddenRows = new Set(); this.hiddenCols = new Set(); this.filteredRows = new Set();
    this.merges = []; this.freeze = { r: 0, c: 0 }; this.charts = []; this.cf = []; this.dv = []; this.tables = [];
    this.filter = null; this.tabColor = null; this.showGrid = true; this.showHeadings = true; this.zoom = 100;
    this.page = { orient: 'portrait', size: 'A4', margin: 48, printGrid: false, area: null }; this.protect = false;
    this._used = null; this._usedV = -1;
  }
  get(r, c) { return this.cells.get(key(r, c)); }
}

class Workbook {
  constructor() {
    this.sheets = [new Sheet('Sheet1')]; this.styles = [{}]; this._styleIdx = new Map([['{}', 0]]);
    this.names = {}; this.active = 0; this.version = 0; this.cache = new Map(); this.busy = new Set();
    this.undoStack = []; this.redoStack = []; this.cur = null; this.depth = 0; this.calcAuto = true; this._parser = null; this.onChange = null;
  }

  /* ---- sheets ---- */
  sheetIndex(name) { const n = String(name).toLowerCase(); return this.sheets.findIndex(s => s.name.toLowerCase() === n); }
  uniqueName(base) { let n = base, i = 2; while (this.sheetIndex(n) >= 0) n = base + ' (' + i++ + ')'; return n; }
  touch() { this.version++; this.cache.clear(); if (this._deps && this._deps.size > 20000) this._deps.clear(); }
  changed() { this.touch(); if (this.onChange) this.onChange(); }

  /* ---- styles ---- */
  styleId(obj) {
    const clean = {};
    for (const k of STYLE_KEYS) { const v = obj[k]; if (v !== undefined && v !== null && v !== false && v !== '' && !(k === 'ha' && v === 'general')) clean[k] = v; }
    const s = JSON.stringify(clean);
    let id = this._styleIdx.get(s);
    if (id === undefined) { id = this.styles.length; this.styles.push(clean); this._styleIdx.set(s, id); }
    return id;
  }
  style(id) { return this.styles[id || 0] || {}; }
  cellStyle(sh, r, c) { const cell = sh.get(r, c); return this.style(cell && cell.s); }

  /* ---- history ---- */
  begin() { if (this.depth++ === 0) this.cur = { before: new Map() }; }
  rec(sh, k) {
    if (!this.cur) return;
    const id = this.sheets.indexOf(sh) + ':' + k;
    if (!this.cur.before.has(id)) this.cur.before.set(id, cloneCell(sh.cells.get(k)));
  }
  end() {
    if (--this.depth > 0) return;
    const cur = this.cur; this.cur = null; this.depth = 0;
    if (!cur || !cur.before.size) return;
    const after = new Map();
    for (const id of cur.before.keys()) { const [si, k] = id.split(':'); after.set(id, cloneCell(this.sheets[+si].cells.get(+k))); }
    this.pushHistory({ kind: 'cells', before: cur.before, after });
    this.changed();
  }
  tx(fn) { this.begin(); try { return fn(); } finally { this.end(); } }
  pushHistory(e) { this.undoStack.push(e); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }
  mutate(fn) {
    const before = JSON.stringify(this.toJSON());
    fn();
    this.pushHistory({ kind: 'snap', before, after: JSON.stringify(this.toJSON()) });
    this.changed();
  }
  _apply(e, dir) {
    if (e.kind === 'snap') { this.loadJSON(JSON.parse(dir === 'undo' ? e.before : e.after)); return; }
    for (const [id, cell] of (dir === 'undo' ? e.before : e.after)) {
      const [si, k] = id.split(':'), sh = this.sheets[+si];
      if (!sh) continue;
      if (cell) sh.cells.set(+k, { ...cell }); else sh.cells.delete(+k);
    }
  }
  undo() { const e = this.undoStack.pop(); if (!e) return false; this._apply(e, 'undo'); this.redoStack.push(e); this.changed(); return true; }
  redo() { const e = this.redoStack.pop(); if (!e) return false; this._apply(e, 'redo'); this.undoStack.push(e); this.changed(); return true; }

  /* ---- cell access ---- */
  setCellObj(sh, r, c, cell) {
    const k = key(r, c);
    this.rec(sh, k);
    if (cell && (cell.v !== undefined && cell.v !== null || cell.f !== undefined || cell.s || cell.n || cell.link)) sh.cells.set(k, cell); else sh.cells.delete(k);
    if (!this.cur) this.changed();
  }
  setInput(si, r, c, text) {
    const sh = this.sheets[si];
    if (r < 0 || c < 0 || r >= MAXR || c >= MAXC) return;
    this.tx(() => {
      const old = sh.get(r, c), p = parseInput(text), cell = { ...(old || {}) };
      delete cell.v; delete cell.f;
      if (p.f !== undefined) cell.f = p.f; else if (p.v !== null) cell.v = p.v;
      if (p.nf && !(old && old.s && this.style(old.s).nf)) cell.s = this.styleId({ ...this.style(cell.s), nf: p.nf });
      this.setCellObj(sh, r, c, cell);
    });
  }
  setStyle(si, rg, patch) {
    const sh = this.sheets[si];
    this.tx(() => {
      const r2 = Math.min(rg.r2, rg.r1 + 5000), c2 = Math.min(rg.c2, rg.c1 + 500);
      for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= c2; c++) {
        const old = sh.get(r, c), cell = { ...(old || {}) };
        const st = { ...this.style(cell.s) };
        for (const [k, v] of Object.entries(typeof patch === 'function' ? patch(st, r, c) : patch)) { if (v === null || v === undefined) delete st[k]; else st[k] = v; }
        cell.s = this.styleId(st);
        this.setCellObj(sh, r, c, cell);
      }
    });
  }
  clear(si, rg, what = 'all') {
    const sh = this.sheets[si];
    this.tx(() => {
      for (const [k, cell] of [...sh.cells]) {
        const { r, c } = unkey(k);
        if (r < rg.r1 || r > rg.r2 || c < rg.c1 || c > rg.c2) continue;
        const n = { ...cell };
        if (what === 'all' || what === 'contents') { delete n.v; delete n.f; }
        if (what === 'all' || what === 'formats') delete n.s;
        if (what === 'all') { delete n.n; delete n.link; }
        this.setCellObj(sh, r, c, n);
      }
    });
  }

  /* ---- used range ---- */
  used(si) {
    const sh = this.sheets[si];
    if (sh._used && sh._usedV === this.version) return sh._used;
    let r = -1, c = -1, ra = -1, ca = -1;
    for (const [k, cell] of sh.cells) {
      const p = unkey(k);
      if (p.r > ra) ra = p.r; if (p.c > ca) ca = p.c;
      if (cell.v !== undefined && cell.v !== null || cell.f !== undefined) { if (p.r > r) r = p.r; if (p.c > c) c = p.c; }
    }
    sh._used = { r, c, rAll: ra, cAll: ca }; sh._usedV = this.version;
    return sh._used;
  }

  /* ---- evaluation ---- */
  toFE(e) {
    const F = FormulaParser.FormulaError, map = { '#DIV/0!': F.DIV0, '#N/A': F.NA, '#NAME?': F.NAME, '#NULL!': F.NULL, '#NUM!': F.NUM, '#REF!': F.REF, '#VALUE!': F.VALUE };
    return map[e.code] || F.REF;
  }
  _makeParser() {
    const wb = this, F = FormulaParser.FormulaError, extra = buildFunctions(this);
    const p = new FormulaParser({
      functions: extra.functions, functionsNeedContext: extra.functionsNeedContext,
      onCell: ({ sheet, row, col }) => {
        const si = wb.sheetIndex(sheet); if (si < 0) throw F.REF;
        const v = wb.evalCell(si, row - 1, col - 1);
        return isErr(v) ? wb.toFE(v) : v;
      },
      onRange: ({ sheet, from, to }) => {
        const si = wb.sheetIndex(sheet); if (si < 0) throw F.REF;
        const u = wb.used(si), r1 = from.row - 1, c1 = from.col - 1;
        let r2 = to.row - 1, c2 = to.col - 1;
        if (r2 - r1 > 5000) r2 = Math.max(r1, u.r);
        if (c2 - c1 > 500) c2 = Math.max(c1, u.c);
        const out = [];
        for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) { const v = wb.evalCell(si, r, c); row.push(isErr(v) ? wb.toFE(v) : v); } out.push(row); }
        return out;
      },
      onVariable: (name, sheetName) => wb._resolveName(name, sheetName)
    });
    p.funsNeedContextAndNoDataRetrieve.push('OFFSET');
    return p;
  }
  _resolveName(name, sheetName) {
    const n = this.names[String(name).toLowerCase()];
    if (!n) return null;
    const m = /^(?:('(?:[^']|'')+'|[^!]+)!)?(.+)$/.exec(n.ref); if (!m) return null;
    const sh = m[1] ? m[1].replace(/^'|'$/g, '').replace(/''/g, "'") : sheetName, rg = parseRange(m[2]); if (!rg) return null;
    return rg.r1 === rg.r2 && rg.c1 === rg.c2 ? { sheet: sh, row: rg.r1 + 1, col: rg.c1 + 1 } : { sheet: sh, from: { row: rg.r1 + 1, col: rg.c1 + 1 }, to: { row: rg.r2 + 1, col: rg.c2 + 1 } };
  }
  _getParser(level) {
    this._parsers = this._parsers || [];
    while (this._parsers.length <= level) this._parsers.push(this._makeParser());
    return this._parsers[level];
  }
  /* Cheap scan for the cells and names a formula mentions (no full parse). */
  _refsOf(f, ownSheet) {
    const refs = [];
    String(f).split(/("(?:[^"]|"")*")/).forEach((part, i) => {
      if (i % 2) return;
      part.replace(REF_RE, (m, sh, ref) => {
        const rg = parseRange(ref); if (!rg) return m;
        const name = sh ? sh.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : ownSheet;
        refs.push({ sheet: name, from: { row: rg.r1 + 1, col: rg.c1 + 1 }, to: { row: rg.r2 + 1, col: rg.c2 + 1 } });
        return m;
      });
      for (const t of part.match(/[A-Za-z_][\w.]*(?!\w|\()/g) || []) {
        const nm = this.names[t.toLowerCase()];
        if (!nm) continue;
        const v = this._resolveName(t, ownSheet);
        if (v) refs.push(v.from ? v : { sheet: v.sheet, from: { row: v.row, col: v.col }, to: { row: v.row, col: v.col } });
      }
    });
    return refs;
  }
  /* Formula cells that a formula reads directly (so they can be calculated first, with no nesting). */
  _precedents(si, r, c) {
    const sh = this.sheets[si], cell = sh.get(r, c);
    this._deps = this._deps || new Map();
    const dk = sh.name + '|' + cell.f;
    let refs = this._deps.get(dk);
    if (!refs) {
      refs = this._refsOf(cell.f, sh.name);
      if (this._deps.size > 50000) this._deps.clear();
      this._deps.set(dk, refs);
    }
    const out = [];
    for (const ref of refs) {
      const di = ref.sheet !== undefined ? this.sheetIndex(ref.sheet) : si;
      if (di < 0) continue;
      const dsh = this.sheets[di];
      const from = ref.from || ref, to = ref.to || ref;
      const r1 = from.row - 1, c1 = from.col - 1, r2 = to.row - 1, c2 = to.col - 1;
      if ((r2 - r1 + 1) * (c2 - c1 + 1) <= 2000) {
        for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) { const x = dsh.get(rr, cc); if (x && x.f !== undefined) out.push({ si: di, r: rr, c: cc }); }
      } else {
        for (const [k, x] of dsh.cells) { if (x.f === undefined) continue; const p = unkey(k); if (p.r >= r1 && p.r <= r2 && p.c >= c1 && p.c <= c2) out.push({ si: di, r: p.r, c: p.c }); }
      }
    }
    return out;
  }
  evalCell(si, r, c) {
    const sh = this.sheets[si], cell = sh && sh.get(r, c);
    if (!cell) return null;
    if (cell.f === undefined) return cell.v === undefined ? null : cell.v;
    const ck = si * 2e10 + key(r, c);
    if (this.cache.has(ck)) return this.cache.get(ck);
    if (this.busy.has(ck)) return new ErrVal('#CIRC!');
    // calculate inputs first using an explicit stack (no deep recursion, no nested parsing)
    const stack = [{ si, r, c, ck }], onStack = new Set([ck]);
    while (stack.length) {
      const fr = stack[stack.length - 1];
      if (!fr.deps) { fr.deps = this._precedents(fr.si, fr.r, fr.c); fr.i = 0; }
      let pushed = false;
      while (fr.i < fr.deps.length) {
        const d = fr.deps[fr.i++], dk = d.si * 2e10 + key(d.r, d.c);
        if (this.cache.has(dk) || onStack.has(dk) || this.busy.has(dk)) continue;
        stack.push({ si: d.si, r: d.r, c: d.c, ck: dk }); onStack.add(dk); pushed = true; break;
      }
      if (pushed) continue;
      stack.pop(); onStack.delete(fr.ck);
      if (!this.cache.has(fr.ck) && !this.busy.has(fr.ck)) this._compute(fr.si, fr.r, fr.c, fr.ck);
    }
    return this.cache.get(ck);
  }
  _compute(si, r, c, ck) {
    const sh = this.sheets[si], cell = sh.get(r, c);
    this.busy.add(ck);
    this._level = this._level || 0;
    let res;
    try { res = this._run(cell.f, sh, r, c, this._level++); } finally { this._level--; this.busy.delete(ck); }
    this.cache.set(ck, res);
    return res;
  }
  _run(f, sh, r, c, level) {
    let v;
    try { v = this._getParser(level).parse(f, { sheet: sh.name, row: r + 1, col: c + 1 }); }
    catch (e) {
      if (e instanceof FormulaParser.FormulaError && e.error && e.error !== '#ERROR!') return new ErrVal(e.error);
      return new ErrVal(/not implemented/i.test(e && e.message) ? '#NAME?' : '#ERROR!');
    }
    return this.normalize(v);
  }
  normalize(v) {
    if (v instanceof FormulaParser.FormulaError) return new ErrVal(ERR_CODES.includes(v.error) ? v.error : '#ERROR!');
    if (Array.isArray(v)) return this.normalize(v[0] && v[0][0] !== undefined ? v[0][0] : v[0]);
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return isNaN(v) ? new ErrVal('#VALUE!') : !isFinite(v) ? new ErrVal('#NUM!') : v;
    if (typeof v === 'object') return v.error ? new ErrVal(v.error) : (v.value !== undefined ? this.normalize(v.value) : 0);
    return v;
  }
  value(si, r, c) { return this.evalCell(si, r, c); }
  display(si, r, c) {
    const v = this.evalCell(si, r, c), st = this.cellStyle(this.sheets[si], r, c);
    return { v, ...formatValue(v, st.nf) };
  }

  /* ---- structure: insert / delete rows and columns ---- */
  structure(si, axis, idx, count) {
    this.mutate(() => {
      const sh = this.sheets[si], n = Math.abs(count);
      const move = p => (count > 0 ? (p >= idx ? p + count : p) : (p >= idx && p < idx + n ? null : p >= idx + n ? p - n : p));
      const span = (lo, hi) => {
        if (count > 0) return [lo >= idx ? lo + count : lo, hi >= idx ? hi + count : hi];
        if (lo >= idx + n) return [lo - n, hi - n];
        let a = lo, b = hi;
        if (a >= idx) a = idx;
        if (b >= idx + n) b -= n; else if (b >= idx) b = idx - 1;
        return b < a ? null : [a, b];
      };
      const next = new Map();
      for (const [k, cell] of sh.cells) {
        const { r, c } = unkey(k), p = move(axis === 'r' ? r : c);
        if (p === null) continue;
        next.set(axis === 'r' ? key(p, c) : key(r, p), cell);
      }
      sh.cells = next;
      for (const s2 of this.sheets) for (const cell of s2.cells.values()) if (cell.f !== undefined) cell.f = adjustFormula(cell.f, s2.name, sh.name, axis, idx, count);
      const remap = m => { const out = new Map(); for (const [k, v] of m) { const p = move(k); if (p !== null) out.set(p, v); } return out; };
      const remapSet = s => new Set([...s].map(move).filter(p => p !== null));
      if (axis === 'r') { sh.rowH = remap(sh.rowH); sh.hiddenRows = remapSet(sh.hiddenRows); } else { sh.colW = remap(sh.colW); sh.hiddenCols = remapSet(sh.hiddenCols); }
      const lo = axis === 'r' ? 'r1' : 'c1', hi = axis === 'r' ? 'r2' : 'c2';
      const fixRanges = list => list.map(g => { const s = span(g[lo], g[hi]); return s ? { ...g, [lo]: s[0], [hi]: s[1] } : null; }).filter(Boolean);
      sh.merges = fixRanges(sh.merges); sh.cf = fixRanges(sh.cf); sh.dv = fixRanges(sh.dv); sh.tables = fixRanges(sh.tables);
      if (sh.filter) { const f = fixRanges([sh.filter])[0]; sh.filter = f || null; }
      for (const ch of sh.charts) { const p = move(axis === 'r' ? ch.r : ch.c); if (p !== null) ch[axis === 'r' ? 'r' : 'c'] = p; }
      for (const s2 of this.sheets) for (const ch of s2.charts) ch.ref = adjustFormula(ch.ref, s2.name, sh.name, axis, idx, count);
      for (const nm of Object.values(this.names)) nm.ref = adjustFormula(nm.ref, sh.name, sh.name, axis, idx, count);
    });
  }

  /* ---- sorting ---- */
  sortRange(si, rg, keys, hasHeader) {
    const sh = this.sheets[si], first = rg.r1 + (hasHeader ? 1 : 0);
    if (first >= rg.r2) return;
    const rows = [];
    for (let r = first; r <= rg.r2; r++) {
      const cells = [];
      for (let c = rg.c1; c <= rg.c2; c++) cells.push(cloneCell(sh.get(r, c)));
      rows.push({ r, cells, k: keys.map(kk => this.evalCell(si, r, kk.c)) });
    }
    const rank = v => (v === null || v === '' ? 4 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 5);
    rows.sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const x = a.k[i], y = b.k[i], rx = rank(x), ry = rank(y);
        if (rx === 4 || ry === 4) { if (rx !== ry) return rx === 4 ? 1 : -1; continue; }
        let d = rx !== ry ? rx - ry : rx === 2 ? String(x).localeCompare(String(y), undefined, { sensitivity: 'base' }) : x < y ? -1 : x > y ? 1 : 0;
        if (d) return keys[i].asc ? d : -d;
      }
      return a.r - b.r;
    });
    this.tx(() => {
      rows.forEach((row, i) => {
        const r = first + i;
        row.cells.forEach((cell, j) => {
          const c = rg.c1 + j;
          let n = cloneCell(cell);
          if (n && n.f !== undefined && row.r !== r) n.f = shiftFormula(n.f, r - row.r, 0);
          this.setCellObj(sh, r, c, n);
        });
      });
    });
  }

  /* ---- filtering ---- */
  applyFilter(si) {
    const sh = this.sheets[si], f = sh.filter;
    sh.filteredRows = new Set();
    if (!f || !f.crit) return;
    for (let r = f.r1 + 1; r <= f.r2; r++) {
      for (const [c, allowed] of Object.entries(f.crit)) {
        const d = this.display(si, r, +c);
        if (!allowed.includes(d.text)) { sh.filteredRows.add(r); break; }
      }
    }
    this.touch();
  }
  rowHidden(sh, r) { return sh.hiddenRows.has(r) || sh.filteredRows.has(r); }

  /* ---- fill ---- */
  fillLine(src, n, backward) {
    const out = [], len = src.length, val = x => (x && x.f === undefined && x.v !== undefined ? x.v : undefined);
    const allNum = src.every(x => typeof val(x) === 'number');
    if (allNum && len >= 2) {
      const xs = src.map((_, i) => i), ys = src.map(val), mx = mean2(xs), my = mean2(ys);
      const d = xs.reduce((a, b) => a + (b - mx) ** 2, 0), slope = xs.reduce((a, b, i) => a + (b - mx) * (ys[i] - my), 0) / d, icpt = my - slope * mx;
      for (let k = 1; k <= n; k++) { const i = backward ? -k : len - 1 + k, base = src[backward ? 0 : len - 1]; out.push({ cell: { ...base, v: Math.round((icpt + slope * i) * 1e10) / 1e10 } }); }
      return out;
    }
    if (len === 1 && typeof val(src[0]) === 'string') {
      const t = val(src[0]);
      let m = /^(.*?)(\d+)$/.exec(t);
      const list = [MONTHS, MONTHS.map(x => x.slice(0, 3)), DAYS, DAYS.map(x => x.slice(0, 3))].find(l => l.some(x => x.toLowerCase() === t.toLowerCase()));
      if (list) { const i0 = list.findIndex(x => x.toLowerCase() === t.toLowerCase()); const up = t === t.toUpperCase() && t.length > 1; for (let k = 1; k <= n; k++) { const w = list[((i0 + (backward ? -k : k)) % list.length + list.length) % list.length]; out.push({ cell: { ...src[0], v: up ? w.toUpperCase() : w } }); } return out; }
      if (m) { for (let k = 1; k <= n; k++) out.push({ cell: { ...src[0], v: m[1] + String(Math.max(0, +m[2] + (backward ? -k : k))).padStart(m[2].length, '0') } }); return out; }
    }
    if (len >= 2 && src.every(x => typeof val(x) === 'string' && /^(.*?)(\d+)$/.test(val(x)))) {
      const ms = src.map(x => /^(.*?)(\d+)$/.exec(val(x))), step = +ms[len - 1][2] - +ms[len - 2][2];
      if (ms.every(m => m[1] === ms[0][1])) { for (let k = 1; k <= n; k++) { const base = backward ? ms[0] : ms[len - 1]; out.push({ cell: { ...src[0], v: base[1] + (+base[2] + step * (backward ? -k : k)) } }); } return out; }
    }
    for (let k = 1; k <= n; k++) {
      const i = backward ? len - 1 - ((k - 1) % len) : (k - 1) % len;
      out.push({ cell: cloneCell(src[i]), srcIdx: i });
    }
    return out;
  }
  fill(si, src, dir, count) {
    const sh = this.sheets[si], vertical = dir === 'down' || dir === 'up', backward = dir === 'up' || dir === 'left';
    this.tx(() => {
      const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1, len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
      for (let l = 0; l < lines; l++) {
        const cells = [];
        for (let i = 0; i < len; i++) cells.push(vertical ? sh.get(src.r1 + i, src.c1 + l) : sh.get(src.r1 + l, src.c1 + i));
        const gen = this.fillLine(cells, count, backward);
        gen.forEach((g, idx) => {
          const k = idx + 1, step = backward ? -k : k;
          const r = vertical ? (backward ? src.r1 + step : src.r2 + step) : src.r1 + l;
          const c = vertical ? src.c1 + l : (backward ? src.c1 + step : src.c2 + step);
          if (r < 0 || c < 0 || r >= MAXR || c >= MAXC) return;
          const cell = cloneCell(g.cell);
          if (cell && cell.f !== undefined && g.srcIdx !== undefined) {
            const origin = (vertical ? src.r1 : src.c1) + g.srcIdx;
            cell.f = shiftFormula(cell.f, vertical ? r - origin : 0, vertical ? 0 : c - origin);
          }
          this.setCellObj(sh, r, c, cell);
        });
      }
    });
  }

  /* ---- copy / paste ---- */
  copy(si, rg) {
    const sh = this.sheets[si], cells = [];
    const r2 = Math.min(rg.r2, rg.r1 + 50000), c2 = Math.min(rg.c2, rg.c1 + 1000);
    for (let r = rg.r1; r <= r2; r++) { const row = []; for (let c = rg.c1; c <= c2; c++) row.push(cloneCell(sh.get(r, c)) || null); cells.push(row); }
    const tsv = cells.map((row, i) => row.map((_, j) => { const d = this.display(si, rg.r1 + i, rg.c1 + j); return d.text.includes('\t') || d.text.includes('\n') ? '"' + d.text.replace(/"/g, '""') + '"' : d.text; }).join('\t')).join('\n');
    return { cells, r: rg.r1, c: rg.c1, rows: cells.length, cols: cells[0] ? cells[0].length : 0, tsv, sheet: si };
  }
  paste(si, r0, c0, clip, mode = 'all', moved = false) {
    const sh = this.sheets[si];
    this.tx(() => {
      clip.cells.forEach((row, i) => row.forEach((cell, j) => {
        const r = r0 + i, c = c0 + j;
        if (r >= MAXR || c >= MAXC) return;
        const old = sh.get(r, c);
        let n = cloneCell(cell) || {};
        if (mode === 'values') { const v = n.f !== undefined ? this.evalCell(clip.sheet, clip.r + i, clip.c + j) : n.v; n = { ...(old || {}) }; delete n.f; n.v = isErr(v) ? undefined : v; }
        else if (mode === 'formats') { n = { ...(old || {}), s: cell ? cell.s : undefined }; }
        else if (mode === 'formulas') { const st = old && old.s; n.s = st; }
        if (n.f !== undefined && !moved) n.f = shiftFormula(n.f, r0 + i - (clip.r + i), c0 + j - (clip.c + j));
        this.setCellObj(sh, r, c, n);
      }));
    });
  }
  pasteText(si, r0, c0, text) {
    const rows = parseTSV(text);
    this.tx(() => rows.forEach((row, i) => row.forEach((t, j) => { if (r0 + i < MAXR && c0 + j < MAXC) this.setInput(si, r0 + i, c0 + j, t); })));
    return rows;
  }

  /* ---- find / replace ---- */
  find(si, text, o = {}, from = null) {
    const sh = this.sheets[si], needle = o.matchCase ? text : text.toLowerCase();
    const hits = [];
    for (const [k, cell] of sh.cells) {
      const { r, c } = unkey(k);
      const shown = o.formulas && cell.f !== undefined ? '=' + cell.f : this.display(si, r, c).text;
      const hay = o.matchCase ? shown : shown.toLowerCase();
      if (hay === '' && needle !== '') continue;
      if (o.wholeCell ? hay === needle : hay.includes(needle)) hits.push({ r, c });
    }
    hits.sort((a, b) => a.r - b.r || a.c - b.c);
    if (!from) return hits;
    return hits.find(h => h.r > from.r || (h.r === from.r && h.c > from.c)) || hits[0] || null;
  }
  replaceAll(si, text, repl, o = {}) {
    let n = 0;
    this.tx(() => {
      const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.matchCase ? 'g' : 'gi');
      for (const h of this.find(si, text, o)) {
        const cell = this.sheets[si].get(h.r, h.c);
        const cur = cell.f !== undefined ? '=' + cell.f : String(cell.v ?? '');
        const next = o.wholeCell ? repl : cur.replace(re, () => repl);
        if (next !== cur) { this.setInput(si, h.r, h.c, next); n++; }
      }
    });
    return n;
  }

  /* ---- data tools ---- */
  removeDuplicates(si, rg, cols, hasHeader) {
    const sh = this.sheets[si], seen = new Set(), keep = [];
    for (let r = rg.r1 + (hasHeader ? 1 : 0); r <= rg.r2; r++) {
      const k = cols.map(c => String(this.evalCell(si, r, c)).toLowerCase()).join('\u0001');
      if (seen.has(k)) continue; seen.add(k); keep.push(r);
    }
    const removed = (rg.r2 - rg.r1 + (hasHeader ? 0 : 1)) - keep.length;
    this.tx(() => {
      const rows = keep.map(r => { const a = []; for (let c = rg.c1; c <= rg.c2; c++) a.push(cloneCell(sh.get(r, c))); return a; });
      const start = rg.r1 + (hasHeader ? 1 : 0);
      for (let r = start; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) this.setCellObj(sh, r, c, r - start < rows.length ? rows[r - start][c - rg.c1] : undefined);
    });
    return removed;
  }
  textToColumns(si, rg, delim) {
    const sh = this.sheets[si];
    this.tx(() => {
      for (let r = rg.r1; r <= rg.r2; r++) {
        const v = this.evalCell(si, r, rg.c1);
        if (typeof v !== 'string') continue;
        v.split(delim).forEach((part, j) => this.setInput(si, r, rg.c1 + j, part.trim()));
      }
    });
    void sh;
  }

  /* ---- conditional formats and validation ---- */
  cfAt(si, r, c) {
    const sh = this.sheets[si];
    if (!sh.cf.length) return null;
    let out = null;
    const v = this.evalCell(si, r, c);
    const memo = this._cfMemo && this._cfMemo.v === this.version ? this._cfMemo : (this._cfMemo = { v: this.version, m: new Map() });
    const stats = rule => {
      const id = si + ':' + rule.id;
      if (memo.m.has(id)) return memo.m.get(id);
      const xs = [], all = [];
      for (let rr = rule.r1; rr <= Math.min(rule.r2, rule.r1 + 20000); rr++) for (let cc = rule.c1; cc <= Math.min(rule.c2, rule.c1 + 200); cc++) { const x = this.evalCell(si, rr, cc); all.push(x); if (typeof x === 'number') xs.push(x); }
      const sorted = [...xs].sort((a, b) => a - b), counts = new Map();
      all.forEach(x => { const k = typeof x + ':' + String(x).toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); });
      const s = { min: sorted[0], max: sorted[sorted.length - 1], avg: xs.length ? mean2(xs) : 0, sorted, counts };
      memo.m.set(id, s);
      return s;
    };
    const lerp = (a, b, t) => '#' + [0, 2, 4].map(i => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) + (parseInt(b.slice(1 + i, 3 + i), 16) - parseInt(a.slice(1 + i, 3 + i), 16)) * t).toString(16).padStart(2, '0')).join('');
    for (const rule of sh.cf) {
      if (r < rule.r1 || r > rule.r2 || c < rule.c1 || c > rule.c2) continue;
      let hit = false;
      const num = typeof v === 'number', txt = typeof v === 'string' ? v.toLowerCase() : '';
      const a = rule.v1 === undefined || rule.v1 === '' ? NaN : +rule.v1, b = +rule.v2;
      switch (rule.type) {
        case 'cell': hit = num && ({ gt: v > a, lt: v < a, ge: v >= a, le: v <= a, eq: v === a, ne: v !== a, between: v >= Math.min(a, b) && v <= Math.max(a, b), notbetween: v < Math.min(a, b) || v > Math.max(a, b) }[rule.op]); break;
        case 'text': { const t = String(rule.v1 || '').toLowerCase(); hit = typeof v === 'string' && ({ contains: txt.includes(t), notcontains: !txt.includes(t), begins: txt.startsWith(t), ends: txt.endsWith(t), eq: txt === t }[rule.op]); break; }
        case 'dupe': case 'unique': { const n = stats(rule).counts.get(typeof v + ':' + String(v).toLowerCase()) || 0; hit = v !== null && v !== '' && (rule.type === 'dupe' ? n > 1 : n === 1); break; }
        case 'top': case 'bottom': { const s = stats(rule).sorted, n = Math.max(1, Math.round(+rule.v1 || 10)); hit = num && s.length && (rule.type === 'top' ? v >= s[Math.max(0, s.length - n)] : v <= s[Math.min(s.length - 1, n - 1)]); break; }
        case 'above': hit = num && v > stats(rule).avg; break;
        case 'below': hit = num && v < stats(rule).avg; break;
        case 'blank': hit = v === null || v === ''; break;
        case 'error': hit = isErr(v); break;
        case 'scale2': case 'scale3': { if (!num) break; const s = stats(rule), t = s.max === s.min ? 0.5 : (v - s.min) / (s.max - s.min); out = { bg: rule.type === 'scale2' ? lerp(rule.c1c || '#ffffff', rule.c2c || '#63be7b', t) : (t < 0.5 ? lerp(rule.c1c || '#f8696b', rule.cmid || '#ffeb84', t * 2) : lerp(rule.cmid || '#ffeb84', rule.c2c || '#63be7b', (t - 0.5) * 2)), ...(out || {}) }; break; }
        case 'bar': { if (!num) break; const s = stats(rule); out = { bar: { pct: s.max === s.min ? 100 : Math.max(4, Math.round((v - Math.min(0, s.min)) / (s.max - Math.min(0, s.min)) * 100)), color: rule.c2c || '#638ec6' }, ...(out || {}) }; break; }
        default: break;
      }
      if (hit && rule.fmt) out = { ...rule.fmt, ...(out || {}) };
    }
    return out;
  }
  validation(si, r, c) { return this.sheets[si].dv.find(d => r >= d.r1 && r <= d.r2 && c >= d.c1 && c <= d.c2) || null; }
  listOptions(si, dv) {
    if (dv.type !== 'list') return [];
    const src = String(dv.list || '');
    if (src.startsWith('=')) {
      const m = /^=(?:('(?:[^']|'')+'|[^!]+)!)?(.+)$/.exec(src); if (!m) return [];
      const sI = m[1] ? this.sheetIndex(m[1].replace(/^'|'$/g, '')) : si, rg = parseRange(m[2]);
      if (sI < 0 || !rg) return [];
      const out = [];
      for (let r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 2000); r++) for (let c = rg.c1; c <= rg.c2; c++) { const t = this.display(sI, r, c).text; if (t !== '') out.push(t); }
      return out;
    }
    return src.split(',').map(s => s.trim()).filter(Boolean);
  }
  validate(si, r, c, input) {
    const dv = this.validation(si, r, c);
    if (!dv) return null;
    const p = parseInput(input);
    if (input === '' || input === null) return dv.blank === false ? 'A value is required.' : null;
    if (p.f !== undefined) return null;
    const v = p.v, a = +dv.v1, b = +dv.v2;
    const cmp = x => ({ between: x >= Math.min(a, b) && x <= Math.max(a, b), notbetween: x < Math.min(a, b) || x > Math.max(a, b), eq: x === a, ne: x !== a, gt: x > a, lt: x < a, ge: x >= a, le: x <= a }[dv.op || 'between']);
    let ok = true;
    if (dv.type === 'list') ok = this.listOptions(si, dv).some(o => o.toLowerCase() === String(input).trim().toLowerCase());
    else if (dv.type === 'whole') ok = typeof v === 'number' && Number.isInteger(v) && cmp(v);
    else if (dv.type === 'decimal') ok = typeof v === 'number' && cmp(v);
    else if (dv.type === 'date') ok = typeof v === 'number' && cmp(v);
    else if (dv.type === 'length') ok = cmp(String(input).length);
    return ok ? null : (dv.msg || 'This value does not match the data validation rules for this cell.');
  }

  /* ---- serialization ---- */
  toJSON(withValues) {
    return {
      v: 1, active: this.active, styles: this.styles, names: this.names, calcAuto: this.calcAuto,
      sheets: this.sheets.map((sh, si) => ({
        name: sh.name, tabColor: sh.tabColor, showGrid: sh.showGrid, showHeadings: sh.showHeadings, zoom: sh.zoom, freeze: sh.freeze, page: sh.page, protect: sh.protect,
        cells: [...sh.cells].map(([k, c]) => { const p = unkey(k); const row = [p.r, p.c, c.v === undefined ? null : c.v, c.f === undefined ? null : c.f, c.s || 0, c.n || null, c.link || null]; if (withValues && c.f !== undefined) { const v = this.evalCell(si, p.r, p.c); row.push(isErr(v) ? { err: v.code } : v); } return row; }),
        colW: [...sh.colW], rowH: [...sh.rowH], hiddenRows: [...sh.hiddenRows], hiddenCols: [...sh.hiddenCols],
        merges: sh.merges, charts: sh.charts, cf: sh.cf, dv: sh.dv, tables: sh.tables, filter: sh.filter
      }))
    };
  }
  loadJSON(m) {
    this.styles = Array.isArray(m.styles) && m.styles.length ? m.styles : [{}];
    this._styleIdx = new Map(this.styles.map((s, i) => [JSON.stringify(s), i]));
    this.names = m.names || {}; this.active = m.active || 0; this.calcAuto = m.calcAuto !== false;
    this.sheets = (m.sheets || []).map(s => {
      const sh = new Sheet(s.name || 'Sheet');
      Object.assign(sh, { tabColor: s.tabColor || null, showGrid: s.showGrid !== false, showHeadings: s.showHeadings !== false, zoom: s.zoom || 100, freeze: s.freeze || { r: 0, c: 0 }, page: { ...sh.page, ...(s.page || {}) }, protect: !!s.protect });
      for (const [r, c, v, f, st, n, link] of s.cells || []) {
        const cell = {};
        if (v !== null && v !== undefined) cell.v = v;
        if (f !== null && f !== undefined) cell.f = f;
        if (st) cell.s = st; if (n) cell.n = n; if (link) cell.link = link;
        sh.cells.set(key(r, c), cell);
      }
      sh.colW = new Map(s.colW || []); sh.rowH = new Map(s.rowH || []); sh.hiddenRows = new Set(s.hiddenRows || []); sh.hiddenCols = new Set(s.hiddenCols || []);
      sh.merges = s.merges || []; sh.charts = s.charts || []; sh.cf = s.cf || []; sh.dv = s.dv || []; sh.tables = s.tables || []; sh.filter = s.filter || null;
      return sh;
    });
    if (!this.sheets.length) this.sheets = [new Sheet('Sheet1')];
    if (this.active >= this.sheets.length) this.active = 0;
    this.sheets.forEach((_, i) => this.applyFilter(i));
    this.touch();
  }
  static fromJSON(m) { const wb = new Workbook(); wb.loadJSON(m); return wb; }
}

const mean2 = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ================= Text import / export ================= */
function parseDelimited(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const parseTSV = t => { const r = parseDelimited(t.replace(/\n$/, ''), '\t'); return r.length ? r : [['']]; };
function sniffDelimiter(text) {
  const head = text.split('\n').slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map(d => [d, (head.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ',';
}
function toCSV(wb, si, rg) {
  const u = wb.used(si), sh = wb.sheets[si];
  const r2 = rg ? rg.r2 : u.rAll, c2 = rg ? rg.c2 : u.cAll, r1 = rg ? rg.r1 : 0, c1 = rg ? rg.c1 : 0;
  const out = [];
  for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) { const t = wb.display(si, r, c).text; row.push(/[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); } out.push(row.join(',')); }
  void sh;
  return out.join('\r\n');
}
function importText(wb, si, text, delim) {
  const rows = parseDelimited(text, delim || sniffDelimiter(text));
  wb.tx(() => rows.forEach((row, r) => row.forEach((t, c) => { if (t !== '') wb.setInput(si, r, c, t); })));
  return rows.length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Workbook, Sheet, ErrVal, isErr, colName, colIndex, addr, parseAddr, parseRange, rangeAddr, key, unkey, formatNumber, formatValue, parseInput, shiftFormula, adjustFormula,
    criteria, serialToDate, dateToSerial, toCSV, importText, parseDelimited, parseTSV, sniffDelimiter, generalText, MAXR, MAXC };
}
