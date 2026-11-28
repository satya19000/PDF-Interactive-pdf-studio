const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://example.test/' });
const w = dom.window;
w.Blob = Blob; w.File = File;
w.URL.createObjectURL = () => 'blob:test';
w.URL.revokeObjectURL = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.eval(fs.readFileSync('dist/vendor/pdf-lib.min.js', 'utf8'));
const app = fs.readFileSync('dist/app.js', 'utf8')
  .replace(/await import\('\.\/quiz\.mjs\?[^']+'\)/g, 'globalThis.__quizModule')
  .replaceAll("await import('./vendor/pdf.mjs')", 'globalThis.__pdfjs');
w.eval(app + ';globalThis.__getOutputs=()=>outputs;globalThis.__getQueue=()=>queue;');

(async () => {
  const quiz = await import('./dist/quiz.mjs');
  const PDFLib = require('pdf-lib');
  globalThis.PDFLib = PDFLib;
  w.__quizModule = quiz;

  // 1. Visual option bank
  const visualRows = [
    ['A 26-year-old patient has a cough.', 65, 650], ['Which diagnosis is most likely?', 65, 625],
    ['A', 72, 555], ['First option', 98, 555], ['B', 72, 520], ['Second option', 98, 520],
    ['C', 72, 485], ['Correct option', 98, 485], ['D', 72, 450], ['Fourth option', 98, 450],
    ['E', 72, 415], ['Fifth option', 98, 415], ['Explanation', 65, 380],
    ['C', 72, 345], ['Correct option', 98, 345], ['The correct explanation.', 65, 320]
  ].map(([str, x, y]) => ({ str, width: str.length * 5, transform: [1, 0, 0, 1, x, y] }));
  const visualQuestions = quiz.parseVisualOptionBank([visualRows]);
  assert.equal(visualQuestions.length, 1);
  assert.equal(visualQuestions[0].answer, 2);

  // 2. Split text & Q-1 format
  const spans = [
    ['Q-1', 40, 700], ['Which choice?', 40, 680], ['A.', 40, 650], ['First', 58, 650],
    ['B.', 40, 630], ['Second', 58, 630], ['ANSWER:', 40, 600], ['Second', 40, 580]
  ].map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] }));
  assert.equal(quiz.parseStructured(quiz.textLinesFromItems(spans).join('\n'))[0].answer, 1);

  // 3. Folder upload with duplicate filenames in subfolders
  const folderA = new File(['Q1. A?\nA. Yes\nB. No'], 'same.txt');
  const folderB = new File(['Q1. B?\nA. Yes\nB. No'], 'same.txt');
  Object.defineProperty(folderA, 'webkitRelativePath', { value: 'Subject/A/same.txt' });
  Object.defineProperty(folderB, 'webkitRelativePath', { value: 'Subject/B/same.txt' });
  w.add([folderA, folderB]);
  assert.equal(w.document.querySelectorAll('#queue .file').length, 2);
  assert(w.document.getElementById('queue').textContent.includes('Subject/B/same.txt'));

  // 4. Sequential conversion: separate quiz PDFs + A4 formatted fallback for non-MCQ
  w.document.getElementById('clear').click();
  w.add([
    new File(['Q1. Separate first?\nA. Yes\nB. No\nAnswer: A'], 'first-separate.txt'),
    new File(['Plain notes with no MCQs.'], 'notes.txt')
  ]);
  await w.convert();
  const outs = w.__getOutputs();
  assert.equal(outs.length, 2);
  assert.equal(outs[0].name, 'first-separate-quiz.pdf');
  assert.equal(outs[0].resultType, 'quiz');
  assert.equal(outs[1].name, 'notes-A4-formatted.pdf');
  assert.equal(outs[1].resultType, 'formatted');

  // 5. Partial extraction outputs partial quiz + conversion report + A4 fallback
  w.document.getElementById('clear').click();
  w.add([new File(['Q1. Valid question?\nA. Yes\nB. No\nAnswer: A\n2. Broken question without options'], 'partial.txt')]);
  await w.convert();
  const partialOuts = w.__getOutputs();
  assert.equal(partialOuts.some(o => o.resultType === 'partial-quiz'), true);
  assert.equal(partialOuts.some(o => o.resultType === 'report'), true);
  assert.equal(partialOuts.some(o => o.resultType === 'formatted'), true);

  // 6. Existing quiz continuation on true A4
  const base = await quiz.buildQuizPdf(quiz.parseStructured('Q1. Original question?\nA. Old correct\nB. Old wrong\nAnswer: A\nExplanation: Original explanation.'), 'Combined subject');
  const baseDoc = await PDFLib.PDFDocument.load(base.bytes);
  const continued = await quiz.buildQuizPdf(
    quiz.parseStructured('Q1. Added question?\nA. New wrong\nB. New correct\nAnswer: B'),
    'Combined subject', () => {}, { doc: baseDoc, questionCount: 1, originalPageCount: base.pages }
  );
  const contDoc = await PDFLib.PDFDocument.load(continued.bytes);
  assert.equal(contDoc.getPageCount(), base.pages + 2);
  assert.equal(contDoc.getPage(0).getWidth(), 595.28);
  assert.equal(contDoc.getPage(base.pages).getWidth(), 595.28);
  assert.equal(contDoc.getKeywords().includes('question-count:2'), true);

  console.log('PASS: batch-test.cjs (folder queue, separate outputs, partial quiz+report, A4 continuation).');
})().catch(e => { console.error(e); process.exitCode = 1; });
