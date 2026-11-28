const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

(async () => {
  const w = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://example.test/' }).window;
  Object.assign(w, { File, Blob });
  let seq = 0;
  w.URL.createObjectURL = () => `blob:test-${++seq}`;
  w.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.eval(fs.readFileSync('dist/vendor/pdf-lib.min.js', 'utf8'));
  global.PDFLib = require('pdf-lib');
  global.fontkit = require('@pdf-lib/fontkit');
  w.quiz = await import('./dist/quiz.mjs');
  const pdfjs = await import(require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
  w.pdfjs = { ...pdfjs, GlobalWorkerOptions: {}, getDocument: options => pdfjs.getDocument({ ...options, ...(options.data ? { data: new Uint8Array(options.data) } : {}), useSystemFonts: true }) };
  w.eval(fs.readFileSync('dist/app.js', 'utf8').replace(/await import\('\.\/quiz\.mjs\?[^']+'\)/g, 'globalThis.quiz').replaceAll("await import('./vendor/pdf.mjs')", 'globalThis.pdfjs') + ';globalThis.state=()=>({queue,outputs});');

  assert.equal(w.quiz.cleanEnglishText('Dose ≥ 5 µg/kg α-blocker 中文 తెలుగు العربية'), 'Dose ≥ 5 µg/kg α-blocker');
  const isolated = w.quiz.prepareQuestions([{ stem: 'Good?', options: ['Yes', 'No'], answer: 0 }, { stem: '', options: ['A'], answer: 0 }]);
  assert.equal(isolated.valid.length, 1);
  assert.equal(isolated.rejected.length, 1);

  // The printed-bank parser is exercised even without private source PDFs.
  const row = (str, y, x = 42) => ({ str, width: str.length * 5, transform: [10, 0, 0, 10, x, y] });
  const option = (letter, text, y) => [row(letter, y), row(text, y, 72)];
  const synthetic = w.quiz.parsePrintedQuestionBank([
    [row('0:00:07/03:00:00', 800), row('A patient has fever. Which diagnosis?', 770), row('Investigations:', 745), row('Creatinine 95 micromol/l', 720), row('Which diagnosis is most likely?', 695), ...option('A', 'First choice', 660), ...option('B', 'Second choice', 630), row('Explanation', 600), ...option('B', 'Second choice', 570), row('Correct discussion begins.', 540)],
    [row('The discussion continues on another page.', 790), ...option('A', 'First choice', 760), row('The first choice is incorrect.', 730), row('Rate this question', 700), row('Peer Responses', 670), row('0:00:08/03:00:00', 620), row('Another clinical question?', 590), ...option('A', 'Alpha', 560), ...option('B', 'Beta', 530), row('Explanation', 500), ...option('A', 'Alpha', 470), row('Second explanation.', 440)]
  ]);
  assert.equal(synthetic.expectedCount, 2);
  assert.equal(synthetic.questions.length, 2);
  assert.deepEqual(Array.from(synthetic.questions, q => q.answer), [1, 0]);
  assert(synthetic.questions[0].explanation.includes('continues on another page'));
  assert(!synthetic.questions[0].explanation.includes('Peer Responses'));
  assert.deepEqual(synthetic.questions[0].stemBlocks.find(b => b.type === 'table').rows[0], ['Creatinine', '95 micromol/l']);

  const sourcePath = process.argv[2];
  if (!sourcePath) { console.log('PASS: language cleaning and invalid-record isolation. Supply May PDF for real-file integration.'); return; }
  w.add([new File([fs.readFileSync(sourcePath)], path.basename(sourcePath))]);
  await w.convert();
  const { queue, outputs } = w.state();
  console.log('STATE', queue[0].state, 'OUTPUTS', outputs.map(o => [o.resultType, o.mcqs]));
  const qs = queue[0].questions;
  assert.equal(qs.length, 100);
  assert.equal(queue[0].countVerified, true);
  assert.equal(queue[0].unresolvedIndices.length, 0);
  assert(qs.every(q => Number.isInteger(q.answer)));
  assert.equal(qs[0].answer, 4);
  assert.equal(qs[1].answer, 1);
  assert(qs[0].explanation.includes('Delayed capillary refill is incorrect. Delayed capillary refill is seen, but it occurs later'));
  assert(qs[0].explanation.includes('systolic blood pressure is therefore maintained'));
  assert.equal(qs[0].explanationSections.length, 5);
  assert(qs[1].stem.includes('7.2 x10^9/l'));
  assert(qs[1].stemBlocks.some(b => b.type === 'table'));
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].resultType, 'quiz');
  const bytes = Buffer.from(await outputs[0].blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let allText = '', questionText = '', currentQuestion = false, links = 0, body14 = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), viewport = page.getViewport({ scale: 1 });
    assert(Math.abs(viewport.width - 595.28) < .02 && Math.abs(viewport.height - 841.89) < .02);
    const items = (await page.getTextContent()).items;
    const text = items.map(i => i.str).join(' ');
    currentQuestion = /QUESTION\s+\d+\s*\/\s*100/.test(text) && !/ANSWER & EXPLANATION/.test(text);
    if (currentQuestion) { questionText += text; assert(!text.includes('Correct answer:')); assert(!text.includes('is incorrect.')); }
    allText += text;
    body14 += items.filter(i => Math.abs(Math.hypot(i.transform[2], i.transform[3]) - 14) < .1).length;
    links += (await page.getAnnotations()).filter(a => a.subtype === 'Link').length;
    page.cleanup();
  }
  assert(!/[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff\u0c00-\u0c7f\u4e00-\u9fff]/.test(allText));
  assert(!/Peer Responses|Rate this question|End Review/.test(allText));
  assert.equal((allText.match(/Correct answer:/g) || []).length, 100);
  assert.equal((allText.match(/Delayed capillary refill is incorrect\./g) || []).length, 1);
  assert(body14 > 1000);
  assert(links >= 600);
  if (process.env.STUDIO_QA_OUTPUT) {
    fs.mkdirSync(process.env.STUDIO_QA_OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(process.env.STUDIO_QA_OUTPUT, 'May_2015_English_Interactive_14pt.pdf'), bytes);
  }
  console.log(`PASS: May 2015: 100/100 keys, complete explanations, English text, true A4, native 14 pt, ${doc.numPages} pages, ${links} links.`);
  await doc.destroy();
})().catch(err => { console.error(err); process.exitCode = 1; });
