/** Detect printed single-best-answer questions without altering their source pages. */
export function detectQuestions(pages) {
  const found = new Map();
  let current = null;
  let scanning = false;
  let candidateLines = [];
  const finish = () => {
    if (!current || current.options.length) return;
    const tail = candidateLines.slice(-5);
    const samePage = tail.length === 5 && tail.every(t => t.page === tail[0].page);
    const evenlySpaced = tail.every((t, i) => !i || Math.abs((tail[i - 1].y - t.y) - (tail[0].y - tail[1].y)) < 2);
    const sameColumn = tail.every(t => Math.abs(t.x - tail[0].x) < 2);
    const brief = tail.every(t => t.text.length > 1 && t.text.length < 85 && !/^Q\s*[-–]/i.test(t.text));
    if (samePage && evenlySpaced && sameColumn && brief && tail[0].y > tail[4].y) {
      current.options = tail.map((t, i) => ({ letter: 'ABCDE'[i], page: t.page, x: t.x, y: t.y }));
    }
  };
  for (let pi = 0; pi < pages.length; pi++) {
    for (const item of pages[pi]) {
      const text = item.str?.trim();
      if (!text) continue;
      const q = /^Q\s*[-–]\s*(\d+)\b/i.exec(text);
      if (q) {
        finish();
        const number = Number(q[1]);
        current = { number, page: pi + 1, options: [] };
        found.set(number, current);
        scanning = true;
        candidateLines = [];
        continue;
      }
      if (/^(ANSWER|EXPLANATION)\s*:/i.test(text)) {
        finish();
        scanning = false;
        candidateLines = [];
        continue;
      }
      if (!scanning || !current) continue;
      const x = item.transform[4], y = item.transform[5];
      const option = /^([A-E])[.)](?:\s|$)/.exec(text);
      if (option) {
        current.options.push({ letter: option[1], page: pi + 1, x, y });
        continue;
      }
      if (item.height > 0 && text !== ' ' && !/^[A-E][.)]$/.test(text)) {
        candidateLines.push({ text, page: pi + 1, x, y });
      }
    }
  }
  finish();
  return [...found.values()].sort((a,b) => a.number-b.number).filter(q => q.options.length === 5 && q.options.every((o,i) => o.letter === 'ABCDE'[i]));
}

export function addMcqWidgets(doc, questions) {
  const form = doc.getForm();
  const unique = `mcq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let count = 0;
  for (const q of questions) {
    const group = form.createRadioGroup(`${unique}_question_${q.number}`);
    for (const opt of q.options) {
      const page = doc.getPage(opt.page-1);
      const x = Math.max(1, opt.x-16), y = Math.max(1,opt.y-3);
      if (x+12 >= page.getWidth() || y+12 >= page.getHeight()) continue;
      group.addOptionToPage(opt.letter, page, {
        x, y, width: 11, height: 11, borderWidth: 1,
        borderColor: globalThis.PDFLib.rgb(.18,.3,.85),
        backgroundColor: globalThis.PDFLib.rgb(1,1,1)
      });
    }
    count++;
  }
  return count;
}
