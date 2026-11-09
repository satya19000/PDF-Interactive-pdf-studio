const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'vendor');
fs.mkdirSync(output, { recursive: true });
const assets = {
  'pdf-lib/dist/pdf-lib.min.js': 'pdf-lib.min.js',
  'pdf-lib/LICENSE.md': 'pdf-lib-LICENSE.md',
  'jszip/dist/jszip.min.js': 'jszip.min.js',
  'jszip/LICENSE.markdown': 'jszip-LICENSE.md',
  'mammoth/mammoth.browser.min.js': 'mammoth.browser.min.js',
  'mammoth/LICENSE': 'mammoth-LICENSE.txt',
  'xlsx/dist/xlsx.full.min.js': 'xlsx.full.min.js',
  'xlsx/LICENSE': 'xlsx-LICENSE.txt',
  'pdfjs-dist/build/pdf.mjs': 'pdf.mjs',
  'pdfjs-dist/build/pdf.worker.mjs': 'pdf.worker.mjs',
  'pdfjs-dist/LICENSE': 'pdfjs-LICENSE.txt',
};
for (const [source, target] of Object.entries(assets)) {
  fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, target));
}
console.log('Ready: dist/ contains the complete application and bundled dependencies.');
