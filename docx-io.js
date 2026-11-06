'use strict';
/* Word (.docx) import and export for DigiCre8 Writer. Runs in the Electron main process. */
const fs = require('fs');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const HTMLtoDOCX = require('html-to-docx');

const TWIPS_PER_PX = 15;
const SIZES = { A4: [11906, 16838], Letter: [12240, 15840], Legal: [12240, 20160], A5: [8391, 11906] };
const MAX_BYTES = 60e6;

/* Read page size, orientation and margin from the last section of a .docx. */
async function readPageSetup(buf) {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file('word/document.xml');
  if (!f) return {};
  const xml = await f.async('string');
  const sects = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g);
  if (!sects) return {};
  const s = sects[sects.length - 1];
  const attr = (tag, name) => { const m = (s.match(new RegExp('<w:' + tag + '\\b[^>]*>')) || [''])[0].match(new RegExp('w:' + name + '="(-?\\d+|[a-z]+)"')); return m ? m[1] : null; };
  const w = +attr('pgSz', 'w'), h = +attr('pgSz', 'h'), left = +attr('pgMar', 'left');
  const out = {};
  if (w > 0 && h > 0) {
    const lo = Math.min(w, h), hi = Math.max(w, h);
    let best = null, bestErr = 0.04;
    for (const [name, [sw, sh]] of Object.entries(SIZES)) {
      const err = Math.abs(lo - sw) / sw + Math.abs(hi - sh) / sh;
      if (err / 2 < bestErr) { bestErr = err / 2; best = name; }
    }
    if (best) out.size = best;
    out.landscape = attr('pgSz', 'orient') === 'landscape' || w > h;
  }
  if (left >= 0 && Number.isFinite(left)) out.margin = Math.min(200, Math.round(left / TWIPS_PER_PX));
  return out;
}

/* Mammoth ignores colour, font size, alignment and indent. We tag them with private-use markers
   inside the XML before conversion, then turn the markers into inline styles afterwards. */
const OPEN = '\uE000', CLOSE = '\uE001';
const HIGHLIGHTS = { yellow: 'ffff00', green: '00ff00', cyan: '00ffff', magenta: 'ff00ff', blue: '0000ff', red: 'ff0000', darkBlue: '000080',
  darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'c0c0c0', black: '000000', white: 'ffffff' };
const marker = spec => `<w:t xml:space="preserve">${OPEN}${spec}${CLOSE}</w:t>`;

function tagFormatting(xml) {
  const val = (src, tag, attr = 'val') => { const m = src.match(new RegExp('<w:' + tag + '\\b[^>]*\\sw:' + attr + '="([^"]*)"')); return m ? m[1] : null; };
  xml = xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, run => {
    const rpr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const spec = [];
    const c = val(rpr, 'color'); if (c && /^[0-9a-fA-F]{6}$/.test(c)) spec.push('c:' + c);
    const sz = val(rpr, 'sz'); if (sz && /^\d+$/.test(sz) && +sz >= 2 && +sz <= 800) spec.push('s:' + (+sz / 2));
    const hl = val(rpr, 'highlight'); const fill = val(rpr, 'shd', 'fill');
    const hex = (hl && HIGHLIGHTS[hl]) || (fill && /^[0-9a-fA-F]{6}$/.test(fill) ? fill : null);
    if (hex) spec.push('h:' + hex);
    const f = val(rpr, 'rFonts', 'ascii'); if (f && /^[\w \-]{1,40}$/.test(f)) spec.push('f:' + f);
    if (!spec.length) return run;
    const afterProps = rpr ? run.indexOf('</w:rPr>') + 8 : run.indexOf('>') + 1;
    return run.slice(0, afterProps) + marker(spec.join(';')) + run.slice(afterProps, run.length - 6) + marker('/') + '</w:r>';
  });
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, para => {
    const ppr = (para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const spec = [];
    const jc = (ppr.match(/<w:jc\b[^>]*\sw:val="([a-z]+)"/) || [])[1];
    if (['center', 'right', 'both', 'end'].includes(jc)) spec.push('a:' + jc);
    const left = (ppr.match(/<w:ind\b[^>]*\sw:(?:left|start)="(\d+)"/) || [])[1];
    if (left && +left > 0 && +left < 20000 && !/<w:numPr>/.test(ppr)) spec.push('i:' + Math.round(+left / TWIPS_PER_PX));
    if (!spec.length) return para;
    const at = ppr ? para.indexOf('</w:pPr>') + 8 : para.indexOf('>') + 1;
    return para.slice(0, at) + `<w:r>${marker('p:' + spec.join(';'))}</w:r>` + para.slice(at);
  });
}

function applyMarkers(html) {
  const o = OPEN, c = CLOSE;
  html = html.replace(new RegExp(`<(p|h[1-6]|li)((?: [^>]*)?)>((?:<[^>/][^>]*>)*)${o}p:([^${c}]*)${c}`, 'g'), (m, tag, attrs, pre, spec) => {
    const st = [];
    for (const part of spec.split(';')) {
      const [k, v] = part.split(':');
      if (k === 'a') st.push('text-align:' + ({ both: 'justify', end: 'right' }[v] || v));
      else if (k === 'i' && /^\d+$/.test(v)) st.push('margin-left:' + v + 'px');
    }
    return `<${tag}${attrs}${st.length ? ` style="${st.join(';')}"` : ''}>${pre}`;
  });
  html = html.replace(new RegExp(`${o}([cshf]:[^${c}]*)${c}`, 'g'), (m, spec) => {
    const st = [];
    for (const part of spec.split(';')) {
      const i = part.indexOf(':'), k = part.slice(0, i), v = part.slice(i + 1);
      if (k === 'c' && /^[0-9a-fA-F]{6}$/.test(v)) st.push('color:#' + v);
      else if (k === 's' && /^[\d.]+$/.test(v)) st.push('font-size:' + v + 'pt');
      else if (k === 'h' && /^[0-9a-fA-F]{6}$/.test(v)) st.push('background-color:#' + v);
      else if (k === 'f' && /^[\w \-]{1,40}$/.test(v)) st.push(`font-family:'${v}'`);
    }
    return `<span style="${st.join(';')}">`;
  });
  html = html.replace(new RegExp(`${o}/${c}`, 'g'), '</span>');
  html = html.replace(new RegExp(`${o}[^${c}]*${c}`, 'g'), '');
  return html.replace(/<span style="[^"]*"><\/span>/g, '');
}

/* Text of the default header or footer, with page-number fields turned into {page}/{pages}. */
async function readHeaderFooter(zip, sectXml, kind) {
  const ref = sectXml.match(new RegExp(`<w:${kind}Reference\\b[^>]*w:type="default"[^>]*r:id="([^"]+)"`)) ||
    sectXml.match(new RegExp(`<w:${kind}Reference\\b[^>]*r:id="([^"]+)"[^>]*w:type="default"`));
  if (!ref) return '';
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!relsFile) return '';
  const rels = await relsFile.async('string');
  const tag = (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${ref[1]}"[^>]*>`)) || [''])[0];
  const target = (tag.match(/Target="([^"]+)"/) || [])[1];
  if (!target || !/^[\w.\-]+\.xml$/.test(target)) return '';
  const part = zip.file('word/' + target);
  if (!part) return '';
  const xml = (await part.async('string')).replace(/<(\/?)[\w]+:/g, '<$1').replace(/(\s)[\w]+:([\w]+=")/g, '$1$2');
  const noResults = xml
    .replace(/<fldSimple\b[^>]*\sinstr="([^"]*)"[^>]*>[\s\S]*?<\/fldSimple>/g, '<instrText>$1</instrText>')
    .replace(/<fldChar\b[^>]*type="separate"[^>]*\/>[\s\S]*?<fldChar\b[^>]*type="end"[^>]*\/>/g, '');
  const esc = t => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const paras = (noResults.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g) || []).map(p => {
    const jc = (p.match(/<jc\b[^>]*\sval="([a-z]+)"/) || [])[1];
    let text = '';
    const re = /<t(?:\s[^>]*)?>([^<]*)<\/t>|<instrText[^>]*>([^<]*)<\/instrText>|<fldSimple\b[^>]*\sinstr="([^"]*)"/g;
    let m;
    while ((m = re.exec(p))) {
      if (m[1] !== undefined) text += esc(m[1]);
      else if (/\bNUMPAGES\b/.test(m[2] || m[3] || '')) text += '{pages}';
      else if (/\bPAGE\b/.test(m[2] || m[3] || '')) text += '{page}';
    }
    text = text.replace(/\{page\}(\s*)\{page\}/g, '{page}');
    return text.trim() ? `<p${['center', 'right'].includes(jc) ? ` style="text-align:${jc}"` : ''}>${text}</p>` : '';
  }).filter(Boolean);
  return paras.join('');
}

async function importDocx(filePath) {
  if (fs.statSync(filePath).size > MAX_BYTES) throw new Error('That file is larger than 60 MB.');
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('This does not look like a Word (.docx) file.');
  const xml = await docFile.async('string');
  const tagged = new JSZip();
  await Promise.all(Object.keys(zip.files).map(async name => {
    const f = zip.files[name];
    if (f.dir) return;
    tagged.file(name, name === 'word/document.xml' ? tagFormatting(xml) : await f.async('nodebuffer'));
  }));
  const result = await mammoth.convertToHtml({ buffer: await tagged.generateAsync({ type: 'nodebuffer' }) }, {
    convertImage: mammoth.images.imgElement(async img => ({ src: `data:${img.contentType};base64,${await img.read('base64')}` })),
    styleMap: [
      "p[style-name='Title'] => h1.title:fresh",
      "p[style-name='Subtitle'] => p.subtitle:fresh",
      "p[style-name='Quote'] => blockquote:fresh",
      "p[style-name='Intense Quote'] => blockquote:fresh",
      'u => u'
    ]
  });
  let meta = {};
  try {
    meta = await readPageSetup(buf);
    const sects = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g);
    if (sects) {
      const last = sects[sects.length - 1];
      const header = await readHeaderFooter(zip, last, 'header'), footer = await readHeaderFooter(zip, last, 'footer');
      if (header) { meta.header = header; meta.hOn = true; }
      if (footer) { meta.footer = footer; meta.fOn = true; }
    }
  } catch (e) { /* page setup, headers and footers are optional */ }
  return { html: applyMarkers(result.value), meta, notes: result.messages.length };
}

/* Header/footer HTML: {page} and {pages} become real Word page-number fields after the library has run. */
const hasTokens = html => /\{pages?\}/.test(html || '');
const dropOtherTokens = html => String(html || '').replace(/\{date\}|\{title\}/g, '');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
async function insertPageFields(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n));
  for (const name of names) {
    let xml = await zip.file(name).async('string');
    if (!/\{pages?\}/.test(xml)) continue;
    xml = xml.replace(/<r>\s*((?:<rPr\/>|<rPr>[\s\S]*?<\/rPr>)?)\s*<t(?:\s[^>]*)?>([^<]*\{pages?\}[^<]*)<\/t>\s*<\/r>/g, (m, rpr, text) => {
      return text.split(/(\{pages?\})/).filter(x => x !== '').map(part => {
        if (part === '{page}' || part === '{pages}') {
          return `<fldSimple xmlns:w="${W_NS}" w:instr="${part === '{page}' ? 'PAGE' : 'NUMPAGES'}"><r>${rpr}<t>1</t></r></fldSimple>`;
        }
        return `<r>${rpr}<t xml:space="preserve">${part}</t></r>`;
      }).join('');
    });
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* The converter drops a space that sits alone between two formatted runs ("<b>a</b> <i>b</i>").
   Move it onto the end of the previous text so it survives. */
function keepSpaces(html) {
  return String(html).replace(/([^<>\s])((?:<\/[a-z0-9]+>)+)([ \t\r\n]+)(?=<(?:a|b|i|u|s|em|strong|span|sup|sub|font|mark|code|img)\b)/gi, '$1$3$2');
}

async function exportDocx({ html, header, footer, size, landscape, margin, title, font }) {
  const [pw, ph] = SIZES[size] || SIZES.A4;
  const m = Math.round(Math.min(200, Math.max(0, Number(margin) || 96)) * TWIPS_PER_PX);
  const hdr = dropOtherTokens(header), ftr = dropOtherTokens(footer);
  const hasH = !!hdr.replace(/<[^>]*>/g, '').trim(), hasF = !!ftr.replace(/<[^>]*>/g, '').trim();
  const opts = {
    title: String(title || 'Document').slice(0, 200),
    orientation: landscape ? 'landscape' : 'portrait',
    pageSize: { width: pw, height: ph },
    margins: { top: m, right: m, bottom: m, left: m, header: Math.min(720, m), footer: Math.min(720, m), gutter: 0 },
    font: font || 'Segoe UI',
    fontSize: 22,
    header: hasH,
    footer: hasF,
    pageNumber: false,
    table: { row: { cantSplit: true } }
  };
  const out = await HTMLtoDOCX(keepSpaces(html || '<p></p>'), hasH ? hdr : null, opts, hasF ? ftr : null);
  const buf = Buffer.from(out instanceof ArrayBuffer ? new Uint8Array(out) : out);
  return (hasTokens(hdr) || hasTokens(ftr)) ? insertPageFields(buf) : buf;
}

module.exports = { importDocx, exportDocx, readPageSetup };
