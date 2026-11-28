import assert from 'node:assert/strict';
import {
  A4_WIDTH, A4_HEIGHT, pdfSafeText, textLinesFromItems, visualPageLines,
  parseVisualOptionBank, shadedOptionRows, imageQuizContentBounds,
  splitAnswerKey, hasStructuredAnswerKey, structuredQuestionCount,
  structuredSpreadsheet, parseStructured, parseBmj, parseMyPastest,
  validateQuiz, splitQuestionsIntoParts, findDuplicateQuestions,
  hasGlyph, safeTextForFont
} from '../dist/quiz.mjs';

// 1. True A4 dimensions
assert.equal(A4_WIDTH, 595.28);
assert.equal(A4_HEIGHT, 841.89);

// 2. Symbol preservation (never replace with '?')
const sym = pdfSafeText('Dose ≥ 5 mg/kg, ≤ 10 µg, α-blocker → Δ 2×10⁻³ ± 1°');
assert(!sym.includes('?'), 'Should not replace symbols with ?');
assert(sym.includes('>=') && sym.includes('<=') && sym.includes('alpha') && sym.includes('->'));

// 3. Inline options + trailing answer key protection
const inlineKey = '1. First question?\n(a) Alpha (b) Beta (c) Gamma (d) Delta\n2. Second question?\nA) One B) Two C) Three D) Four\nANSWER KEY\n1-B 2-A';
assert.equal(hasStructuredAnswerKey(inlineKey), true);
assert.equal(structuredQuestionCount(inlineKey), 2);
const qInline = parseStructured(inlineKey);
assert.equal(qInline.length, 2);
assert.deepEqual(qInline.map(q => q.answer), [1, 0]);
assert(!JSON.stringify(qInline).includes('ANSWER KEY'));

// 4. Lowercase bracketed answer + Q-1 format
const qDash = parseStructured('Q-1\nWhich choice?\nA. First\nB. Second\nAns: (b)\nExplanation: Second is right.');
assert.equal(qDash.length, 1);
assert.equal(qDash[0].answer, 1);
assert.equal(qDash[0].explanation, 'Second is right.');

// 5. Conflicting answer key -> unknown (null)
const conflict = parseStructured('1. Conflicting?\nA. Yes\nB. No\nANSWER KEY 1-A 1-B');
assert.equal(conflict.length, 1);
assert.equal(conflict[0].answer, null);

// 6. Missing answer -> retained with null answer, valid for export
const missingAns = parseStructured('1. Unknown answer?\nA. Yes\nB. No');
assert.equal(missingAns.length, 1);
assert.equal(missingAns[0].answer, null);
assert.equal(validateQuiz(missingAns).length, 0);

// 7. Numbered list inside Explanation must NOT inflate question count or split into fake questions
const numberedExp = `1. What is the diagnosis?
A. Asthma
B. COPD
Answer: A
Explanation: Key features include:
1. Reversible airflow obstruction
2. Diurnal variation
2. Second real question?
A. Yes
B. No
Answer: B`;
assert.equal(structuredQuestionCount(numberedExp), 2);
const qExp = parseStructured(numberedExp);
assert.equal(qExp.length, 2);
assert(qExp[0].explanation.includes('Reversible airflow obstruction'));

// 8. Plain notes with no MCQs
assert.equal(parseStructured('Today we reviewed heart failure guidelines and diuretic dosing.').length, 0);

// 9. Spreadsheet table conversion
const sheetText = structuredSpreadsheet([
  ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation'],
  ['Spreadsheet question?', 'One', 'Two', 'Three', 'Four', '(b)', 'Because two.']
]);
const qSheet = parseStructured(sheetText);
assert.equal(qSheet.length, 1);
assert.equal(qSheet[0].answer, 1);
assert.equal(qSheet[0].explanation, 'Because two.');

// 10. Visual option bank
const visualRows = [
  ['A 26-year-old patient has a cough.', 65, 650], ['Which diagnosis is most likely?', 65, 625],
  ['A', 72, 555], ['First option', 98, 555], ['B', 72, 520], ['Second option', 98, 520],
  ['C', 72, 485], ['Correct option', 98, 485], ['D', 72, 450], ['Fourth option', 98, 450],
  ['E', 72, 415], ['Fifth option', 98, 415], ['Explanation', 65, 380],
  ['C', 72, 345], ['Correct option', 98, 345], ['The correct explanation.', 65, 320]
].map(([str, x, y]) => ({ str, width: str.length * 5, transform: [1, 0, 0, 1, x, y] }));
const vq = parseVisualOptionBank([visualRows]);
assert.equal(vq.length, 1);
assert.equal(vq[0].answer, 2);

// 11. Shaded option rows (synthetic RGBA buffer)
const w = 100, h = 400;
const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
const fillRow = (y0, y1, r, g, b) => {
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  }
};
fillRow(100, 130, 230, 225, 220);
fillRow(135, 165, 230, 225, 220);
fillRow(170, 200, 180, 230, 180); // green
fillRow(205, 235, 230, 225, 220);
fillRow(240, 270, 230, 225, 220);
const shaded = shadedOptionRows(rgba, w, h, 0.5);
assert.equal(shaded.group?.length, 5);
assert.equal(shaded.group[2].kind, 'green');
assert.equal(shadedOptionRows(rgba, w, h, 0.5, 4).group?.length, 4);
const bounds = imageQuizContentBounds(rgba, w, h);
assert(bounds.height > 100);

// 12. Splitting & Duplicate detection
const many = Array.from({ length: 250 }, (_, i) => ({ stem: `Question ${i + 1}`, options: ['A', 'B'] }));
const parts = splitQuestionsIntoParts(many, 120);
assert.deepEqual(parts.map(p => p.length), [120, 120, 10]);

const dupes = findDuplicateQuestions([
  { stem: 'What is the first-line drug for hypertension?', options: ['Amlodipine', 'Insulin'] },
  { stem: 'What is the first-line drug for diabetes?', options: ['Metformin', 'Insulin'] },
  { stem: 'What is the first-line drug for hypertension?', options: ['Amlodipine', 'Insulin'] }
]);
assert.equal(dupes.length, 1);
assert.equal(dupes[0].firstIndex, 1);
assert.equal(dupes[0].duplicateIndex, 3);

console.log('ALL UNIT TESTS PASSED (12/12 groups)');

// 13. Explicit Unicode fallback (never silent space) & 99-question 40/40/19 split
const tracker = { transliterated: new Set(), unmapped: new Set() };
const fallbackOut = pdfSafeText('H₂O, x², x⁴, ≥ 5, ★', tracker);
assert(!fallbackOut.includes('?'), 'Never replace with ?');
assert(fallbackOut.includes('_2') && fallbackOut.includes('²') && fallbackOut.includes('^4') && fallbackOut.includes('>='));
assert(fallbackOut.includes('[U+2605]'), 'Unmapped star must be explicit [U+2605], not silent space');
assert.equal(tracker.unmapped.size, 1);

const paired99 = Array.from({ length: 99 }, (_, i) => ({ stem: `Source question ${i + 1}`, options: ['A', 'B', 'C', 'D', 'E'] }));
const split99 = splitQuestionsIntoParts(paired99, 40);
assert.deepEqual(split99.map(p => p.length), [40, 40, 19]);
console.log('ALL REGRESSION UNIT TESTS PASSED (13/13 groups)');

// 14. Missing-glyph handling for non-Latin scripts (Telugu & Chinese)
const scriptTracker = { transliterated: new Set(), unmapped: new Set() };
const teluguChinese = safeTextForFont('తెలుగు 中文 ≥ 5', null, false, scriptTracker);
assert(!teluguChinese.includes('?'), 'Never replace with ?');
assert(teluguChinese.includes('[U+0C24]') && teluguChinese.includes('[U+4E2D]'), 'Missing glyphs must be explicit [U+XXXX], never silent space');
assert(scriptTracker.unmapped.size >= 2);
console.log('ALL REGRESSION UNIT TESTS PASSED (14/14 groups)');
