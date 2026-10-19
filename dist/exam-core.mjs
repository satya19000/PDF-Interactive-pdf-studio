export const DEFAULT_COUNT = 100, DEFAULT_MINUTES = 180;
export function eligible(sources) {
  const seen = new Set(), valid = [], rejected = [];
  for (const source of sources) for (const q of source.questions || []) {
    const options = q.options || [];
    const answerImages = Array.isArray(q.imageAnswerPagesData) && q.imageAnswerPagesData.length > 0;
    let reason = '';
    if (!q.stem?.trim()) reason = 'Missing question text';
    else if (options.length !== 5 || options.some(o => typeof o !== 'string' || !o.trim()) || new Set(options.map(o => o.trim())).size !== 5) reason = 'Five distinct answer options required';
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) reason = 'No reliable answer key';
    else if (q.imageQuestionData && !answerImages) reason = 'Original answer image is missing';
    else if (!q.explanation?.trim() && !answerImages) reason = 'No explanation in the source';
    else if (q.hasVisual && !q.visualData && !q.imageQuestionData) reason = 'Source figure is missing';
    if (reason) { rejected.push({file: source.name, id: q.id || 'unknown', reason}); continue; }
    const key = [source.name, q.id, q.stem, ...options].join('|');
    if (seen.has(key)) continue;
    seen.add(key); valid.push({...q, source: source.name, key});
  }
  return {valid, rejected};
}
export function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function remaining(attempt, now = Date.now()) { return Math.max(0, attempt.endsAt - now); }
export function score(attempt) {
  const detail = attempt.questions.map((q, index) => ({index, source: q.source,
    selected: attempt.answers[index] ?? null, correct: q.answer,
    status: attempt.answers[index] === undefined ? 'unanswered' : attempt.answers[index] === q.answer ? 'correct' : 'incorrect', question: q}));
  const correct = detail.filter(d => d.status === 'correct').length;
  const attempted = detail.filter(d => d.status !== 'unanswered').length;
  function groups(key) {
    const map = new Map();
    for (const d of detail) {
      const name = d.question[key];
      if (!name) continue;
      const group = map.get(name) || {name, source: name, total: 0, correct: 0};
      group.total++; if (d.status === 'correct') group.correct++;
      map.set(name, group);
    }
    return [...map.values()];
  }
  return {detail, total: detail.length, attempted, correct, incorrect: attempted - correct,
    unanswered: detail.length - attempted, percent: detail.length ? Math.round(correct / detail.length * 100) : 0,
    bySource: groups('source'), byTopic: groups('topic')};
}
export function practicePool(sources, attempts) {
  const extracted = eligible(sources);
  const pool = new Map();
  for (const a of [...attempts].reverse()) for (const q of a.questions || []) pool.set(q.key, q);
  for (const q of extracted.valid) pool.set(q.key, q);
  return {...extracted, valid: [...pool.values()]};
}
