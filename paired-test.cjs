const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createCanvas, ImageData } = require('@napi-rs/canvas');

const w = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://example.test' }).window;
Object.assign(w, { File, Blob });
w.URL.createObjectURL = () => 'blob:test';
w.URL.revokeObjectURL = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
const canvases = new WeakMap();
// Match real canvas memory release when production sets width/height to zero.
for (const axis of ['width', 'height']) {
  const descriptor = Object.getOwnPropertyDescriptor(w.HTMLCanvasElement.prototype, axis);
  Object.defineProperty(w.HTMLCanvasElement.prototype, axis, {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(value) { descriptor.set.call(this, value); const backing = canvases.get(this); if (backing) backing[axis] = Math.max(1, Number(value)); }
  });
}
global.document = w.document;
global.ImageData = ImageData;
global.PDFLib = require('pdf-lib');

w.HTMLCanvasElement.prototype.getContext = function () {
  let c = canvases.get(this);
  if (!c || c.width !== this.width || c.height !== this.height) {
    c = createCanvas(this.width, this.height);
    canvases.set(this, c);
    const ctx = c.getContext('2d'), draw = ctx.drawImage.bind(ctx);
    ctx.drawImage = (im, ...args) => draw(canvases.get(im) || im, ...args);
  }
  return c.getContext('2d');
};
w.HTMLCanvasElement.prototype.toDataURL = function (...args) { return canvases.get(this).toDataURL(...args); };
w.eval(fs.readFileSync('dist/vendor/pdf-lib.min.js', 'utf8'));

(async () => {
  w.quiz = await import('./dist/quiz.mjs');
  const pdfjs = await import(require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
  w.pdfjs = { ...pdfjs, GlobalWorkerOptions: {}, getDocument: o => pdfjs.getDocument({ ...o, ...(o.data ? { data: new Uint8Array(o.data) } : {}), useSystemFonts: true }) };
  w.eval(
    fs.readFileSync('dist/app.js', 'utf8')
      .replace(/await import\('\.\/quiz\.mjs\?[^']+'\)/g, 'globalThis.quiz')
      .replaceAll("await import('./vendor/pdf.mjs')", 'globalThis.pdfjs') +
    ';globalThis.state=()=>({queue,outputs})'
  );
  // Skia's test-only raster cache otherwise retains every large decoded scan,
  // unlike browser canvases. Clear it between completed progress updates.
  const progress = w.setProgress;
  w.setProgress = (...args) => { require('@napi-rs/canvas').clearAllCache(); global.gc?.(); return progress(...args); };

  const sourcePath = process.argv[2] || '../../upload/PAST PAPERS (47).pdf';
  const expectedCount = Number(process.argv[3]) || 99;
  if (!fs.existsSync(sourcePath)) {
    console.log('SKIP: paired-test.cjs requires source file:', sourcePath);
    return;
  }

  w.add([new File([fs.readFileSync(sourcePath)], require('node:path').basename(sourcePath))]);
  await w.convert();
  const { queue, outputs } = w.state();
  console.log(queue[0].error || queue[0].state);
  console.log('Coverage:', queue[0].questions?.length, 'unresolved:', queue[0].unresolvedIndices);
  if (process.env.STUDIO_QA_OUTPUT) {
    fs.mkdirSync(process.env.STUDIO_QA_OUTPUT, { recursive: true });
    for (const out of outputs) fs.writeFileSync(require('node:path').join(process.env.STUDIO_QA_OUTPUT, out.name), Buffer.from(await out.blob.arrayBuffer()));
  }

  // Expect 99 questions split into parts of 40, 40, and 19 with continuous numbering
  assert.equal(outputs.length, 3);
  assert.deepEqual(Array.from(outputs.map(o => o.mcqs)), [40, 40, expectedCount - 80]);
  for (const out of outputs) {
    const doc = await global.PDFLib.PDFDocument.load(Buffer.from(await out.blob.arrayBuffer()));
    assert.equal(doc.getPage(0).getWidth(), 595.28);
    assert.equal(doc.getPage(0).getHeight(), 841.89);
  }
    // Verify total MCQs = 99 and every page is true A4
  assert.equal(Array.from(outputs).reduce((s, o) => s + o.mcqs, 0), expectedCount);
  if (expectedCount === 100) {
    assert.equal(queue[0].questions[0].sourcePage, 2, 'Cover must not consume the first question');
    assert.equal(queue[0].questions.at(-1).sourcePage, 200);
    assert(queue[0].questions.every(q => Number.isInteger(q.answer) && [4, 5].includes(q.imageQuestionRows.length) && q.imageAnswerPagesData.length));
    assert(queue[0].questions[67].sourceWarning.includes('4 visible options'));
    assert.equal(queue[0].unresolvedIndices.length, 0);
    assert.equal(queue[0].countVerified, true);
  }
  console.log(`PASS: paired-test.cjs (${expectedCount} MCQs split 40/40/${expectedCount - 80} on true A4).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
