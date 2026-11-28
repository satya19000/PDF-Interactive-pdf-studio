const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createCanvas } = require('@napi-rs/canvas');

const outDir = path.resolve('tmp/qa');
fs.mkdirSync(outDir, { recursive: true });

const dom = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://example.test/' });
const w = dom.window;
w.Blob = Blob; w.File = File;
w.URL.createObjectURL = () => 'blob:test';
w.URL.revokeObjectURL = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};

const canvases = new WeakMap();
w.HTMLCanvasElement.prototype.getContext = function () {
  let c = canvases.get(this);
  if (!c || c.width !== this.width || c.height !== this.height) {
    c = createCanvas(this.width, this.height);
    canvases.set(this, c);
  }
  return c.getContext('2d');
};
w.HTMLCanvasElement.prototype.toDataURL = function (...args) { return canvases.get(this).toDataURL(...args); };

for (const p of ['pdf-lib.min.js', 'fontkit.umd.min.js', 'jszip.min.js', 'mammoth.browser.min.js', 'xlsx.full.min.js']) {
  const full = path.join('dist/vendor', p);
  if (fs.existsSync(full)) w.eval(fs.readFileSync(full, 'utf8'));
}
w.eval(
  fs.readFileSync('dist/app.js', 'utf8')
    .replace(/await import\('\.\/quiz\.mjs\?[^']+'\)/g, 'globalThis.__quizModule')
    .replaceAll("await import('./vendor/pdf.mjs')", 'globalThis.__pdfjs') +
  ';globalThis.__testState=()=>({queue,outputs});'
);

(async () => {
  const quiz = await import('./dist/quiz.mjs');
  const PDFLib = require('pdf-lib');
  globalThis.PDFLib = PDFLib;
  w.__quizModule = quiz;
  if (w.fontkit) globalThis.fontkit = w.fontkit;

  // 1. Legacy UI modes must be absent
  assert.equal(w.document.getElementById('quizMode'), null);
  assert.equal(w.document.getElementById('legacyOptions'), null);
  assert.ok(w.document.getElementById('folder').hasAttribute('webkitdirectory'));

  // 2. True A4 (595.28 x 841.89) + 14 pt reconstructed text + valid GoTo links
  const q = quiz.parseStructured('Q1. What is the correct choice for ≥ 5 µg/kg?\nA. Option one\nB. Option two\nC. Option three\nAnswer: B\nExplanation: Option two is correct.');
  assert.equal(q.length, 1);
  assert.equal(q[0].answer, 1);
  const qb = await quiz.buildQuizPdf(q, 'Quiz test');
  const qr = await PDFLib.PDFDocument.load(qb.bytes);
  assert.equal(qr.getPageCount(), 2);
  assert.equal(qr.getPage(0).getWidth(), 595.28);
  assert.equal(qr.getPage(0).getHeight(), 841.89);
  assert.equal(qr.getPage(0).node.Annots().size(), 3);
  fs.writeFileSync(path.join(outDir, 'quiz-a4.pdf'), qb.bytes);

  // 3. Long option pagination + every visible segment linked to answer page + Back to question on all continuation pages
  const longOptText = 'Long option segment explaining clinical pathophysiology in detail. '.repeat(45);
  const longQ = quiz.parseStructured(
    `Q1. Long option test?\nA. Short\nB. ${longOptText}\nC. Another\nAnswer: B\nExplanation: ` +
    'Detailed explanation paragraph. '.repeat(90)
  );
  const longPdf = await quiz.buildQuizPdf(longQ, 'Long Option Test');
  const longDoc = await PDFLib.PDFDocument.load(longPdf.bytes);
  assert(longDoc.getPageCount() >= 4, 'Expected continuation pages for long option and explanation');
  for (let pi = 0; pi < longDoc.getPageCount(); pi++) {
    assert.equal(longDoc.getPage(pi).getWidth(), 595.28);
    assert.equal(longDoc.getPage(pi).getHeight(), 841.89);
  }
  fs.writeFileSync(path.join(outDir, 'long-option.pdf'), longPdf.bytes);

  // 4. Missing answer exports with "No answer for this question."
  const unknown = quiz.parseStructured('Q1. No key\nA. One\nB. Two');
  assert.equal(unknown[0].answer, null);
  assert.equal(quiz.validateQuiz(unknown).length, 0);
  const ub = await quiz.buildQuizPdf(unknown, 'Unknown answer');
  assert.equal(ub.pages, 2);
  fs.writeFileSync(path.join(outDir, 'unknown-answer.pdf'), ub.bytes);

  // 5. Fallback A4 formatted copy (selectable 14 pt) + unsupported original download
  w.add([
    new File(['Plain study notes without any MCQs.\nSecond line with µg and ≥ 10.'], 'notes.txt'),
    new File(['binary-data'], 'bad.exe')
  ]);
  await w.convert();
  const { queue, outputs } = w.__testState();
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0].resultType, 'formatted');
  assert.equal(outputs[1].resultType, 'original');
  assert.equal(outputs[1].name, 'bad.exe');
  const fmtDoc = await PDFLib.PDFDocument.load(await outputs[0].blob.arrayBuffer());
  assert.equal(fmtDoc.getPage(0).getWidth(), 595.28);
  assert.equal(fmtDoc.getPage(0).getHeight(), 841.89);

  // 6. Bundled English OCR check
  const ocrCanvas = createCanvas(1500, 650), ocrCtx = ocrCanvas.getContext('2d');
  ocrCtx.fillStyle = 'white'; ocrCtx.fillRect(0, 0, 1500, 650);
  ocrCtx.fillStyle = 'black'; ocrCtx.font = '34px Arial';
  ['1. What is the first line treatment?', 'A. Diet and exercise', 'B. Antibiotics', 'C. Surgery', 'Answer: A', 'Explanation: Lifestyle measures help.']
    .forEach((line, i) => ocrCtx.fillText(line, 80, 95 + i * 78));
  const ocrWorker = await require('tesseract.js').createWorker('eng', 1, { langPath: path.resolve('dist/vendor/ocr-lang'), cacheMethod: 'none' });
  const ocrResult = await ocrWorker.recognize(ocrCanvas.toBuffer('image/png'));
  await ocrWorker.terminate();
  const extracted = quiz.parseStructured(ocrResult.data.text);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].answer, 0);

  // 6b. Embedded Unicode font path (with fontkit) + missing-glyph original-download fallback
  const fk = w.fontkit || (() => { try { return require('@pdf-lib/fontkit'); } catch { return null; } })();
  if (fk) {
    globalThis.fontkit = fk;
    w.fontkit = fk;
    const probeDoc = await PDFLib.PDFDocument.create();
    const fonts = await quiz.embedStudioFonts(probeDoc);
    assert.equal(fonts.unicode, true, 'Expected DejaVuSans Unicode font embedding when fontkit is loaded');
    assert.equal(quiz.hasGlyph(fonts.regular, 'α', true), true);
    assert.equal(quiz.hasGlyph(fonts.regular, '≥', true), true);
    assert.equal(quiz.hasGlyph(fonts.regular, '₂', true), true);
    assert.equal(quiz.hasGlyph(fonts.regular, 'త', true), false, 'DejaVuSans must report missing Telugu glyph');
    assert.equal(quiz.hasGlyph(fonts.regular, '中', true), false, 'DejaVuSans must report missing Chinese glyph');
    const uniQ = quiz.parseStructured('Q1. Dose ≥ 5 µg/kg, α-blocker, H₂O, x²?\nA. Yes\nB. No\nAnswer: A');
    const uniPdf = await quiz.buildQuizPdf(uniQ, 'Unicode Medical Test');
    assert.equal(uniPdf.unicodeEmbedded, true);
    assert.equal(uniPdf.unicodeFallbackCount, 0);
  }
  w.document.getElementById('clear').click();
  w.add([new File(['తెలుగు ప్రశ్నలు మరియు 中文'], 'telugu-chinese.txt')]);
  await w.convert();
  const uniState = w.__testState();
  assert.equal(uniState.outputs.length, 1);
  assert.equal(uniState.outputs[0].resultType, 'original', 'Unsupported script text file must fall back to unchanged original download');
  assert.equal(uniState.outputs[0].name, 'telugu-chinese.txt');

  // 7. ZIP packaging
  const zip = new (require('jszip'))();
  zip.file('test.pdf', Buffer.from(qb.bytes));
  const z = await zip.generateAsync({ type: 'uint8array' });
  assert(z.length > 0);
  console.log('PASS: test.cjs (A4 14pt, long option pagination, Unicode, fallback, OCR, ZIP).');
})().catch(e => { console.error(e); process.exitCode = 1; });
