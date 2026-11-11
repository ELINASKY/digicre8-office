'use strict';
/* Bundles third-party browser code (the spreadsheet formula engine) into src/vendor/. Runs before start and dist. */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, '..', 'src', 'vendor');
fs.mkdirSync(out, { recursive: true });
const entry = `
  const FP = require('fast-formula-parser');
  window.FormulaParser = FP;
`;
esbuild.build({
  stdin: { contents: entry, resolveDir: path.join(__dirname, '..'), loader: 'js' },
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'chrome120',
  outfile: path.join(out, 'formula-parser.js'),
  define: { 'process.env.NODE_ENV': '"production"', global: 'window' },
  legalComments: 'none', logLevel: 'warning'
}).then(() => console.log('vendor bundle built:', (fs.statSync(path.join(out, 'formula-parser.js')).size / 1024).toFixed(0) + ' KB'))
  .catch(e => { console.error(e); process.exit(1); });
