/* Source-aware printed question-bank extraction. No network or AI calls. */
const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const normal = value => compact(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const foreignLetter = ch => /\p{L}/u.test(ch) && !/[\p{Script=Latin}\p{Script=Greek}µℓ℮ℏ]/u.test(ch);

export function cleanEnglishText(value, stats = null) {
  const input = String(value ?? '');
  let removed = 0, foreignRun = false;
  const text = [...input].map(ch => {
    const n = ch.codePointAt(0);
    if (foreignLetter(ch)) { foreignRun = true; removed++; return ''; }
    if ((/\p{M}/u.test(ch) && (foreignRun || !/[\p{Script=Latin}\p{Script=Greek}\p{Script=Inherited}]/u.test(ch))) || (n >= 0xE000 && n <= 0xF8FF) || /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u.test(ch)) { removed++; return ''; }
    if (/\p{L}|\s/u.test(ch)) foreignRun = false;
    return ch;
  }).join('');
  if (stats) stats.removedCharacters = (stats.removedCharacters || 0) + removed;
  return text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function cleanQuestionEnglish(q, stats = null) {
  const cleaned = { ...q, stem: cleanEnglishText(q.stem, stats), options: q.options.map(t => cleanEnglishText(t, stats)), explanation: cleanEnglishText(q.explanation, stats) };
  if (q.explanationSections) cleaned.explanationSections = q.explanationSections.map(section => typeof section === 'string' ? cleanEnglishText(section, stats) : {
    ...section, heading: cleanEnglishText(section.heading, stats), text: cleanEnglishText(section.text, stats)
  });
  if (q.stemBlocks) cleaned.stemBlocks = q.stemBlocks.map(block => block.type === 'table' ? { ...block, rows: block.rows.map(row => row.map(cell => cleanEnglishText(cell, stats))) } : { ...block, text: cleanEnglishText(block.text, stats) });
  return cleaned;
}

// Group superscripts with their actual baseline instead of making a standalone
// '9' line before a WCC result. Retain x positions for labels and clinical tables.
export function printedPageRows(items, pageNumber = 1) {
  const groups = [];
  for (const item of items.filter(i => i.str?.trim() && i.transform)) {
    const y = item.transform[5], x = item.transform[4];
    const match = groups.find(row => Math.abs(row.y - y) <= 4.5);
    if (match) match.items.push(item);
    else groups.push({ y, items: [item] });
  }
  return groups.sort((a, b) => b.y - a.y).map(row => {
    const parts = row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    const baseline = Math.min(...parts.map(i => i.transform[5]));
    const textOf = subset => {
      let text = '', end = -Infinity;
      for (const item of subset) {
        let value = cleanEnglishText(item.str);
        if (!value) continue;
        const superscript = item.transform[5] - baseline > 2 && /^[0-9+−-]+$/.test(value);
        if (superscript) value = '^' + value;
        if (text && !superscript && item.transform[4] - end > 1.5) text += ' ';
        text += value;
        end = item.transform[4] + (item.width || 0);
      }
      return text.replace(/\s+([.,;:)])/g, '$1');
    };
    const labelItem = parts.find(item => /^[A-E]$/.test(item.str.trim()));
    const after = labelItem && parts.filter(i => i !== labelItem && i.transform[4] > labelItem.transform[4] + 2);
    const gap = after?.length ? after[0].transform[4] - labelItem.transform[4] - (labelItem.width || 0) : 0;
    const label = after?.length && labelItem.transform[4] < 180 && gap > Math.max(4, Math.abs(labelItem.transform[3]) * .5) ? labelItem.str.trim() : null;
    const cellItems = [];
    let lastEnd = -Infinity;
    for (const item of parts) {
      const text = textOf([item]);
      if (!text) continue;
      const x = item.transform[4];
      if (!cellItems.length || x - lastEnd > 14) cellItems.push([item]); else cellItems[cellItems.length - 1].push(item);
      lastEnd = Math.max(lastEnd, x + (item.width || 0));
    }
    return { page: pageNumber, y: baseline, x: Math.min(...parts.map(i => i.transform[4])), right: Math.max(...parts.map(i => i.transform[4] + (i.width || 0))),
      text: compact(textOf(parts)), letter: label, optionText: label ? compact(textOf(after)) : '', cells: cellItems.map(textOf), items: parts };
  }).filter(row => row.text);
}

const timer = /^(?:\d{1,2}:\d{2}:\d{2}\s*\/\s*\d{1,2}:\d{2}:\d{2})$/;
const explanation = /^Explanation\b/i;
const endUi = /^(?:Rate this question|Next Question|Previous Question|Tag Question|Feedback|End Review|End Session|Peer Responses|Difficulty\s*:|Q\.\s*Answered|Answered\s+Flagged)/i;
const nuisance = /^(?:Pastest\+?|MyPastest|Question\s+\d+\s+of\s+\d+|Your answer was\b|Page\s+\d+\s*(?:of\s*\d+)?$)/i;

export function parsePrintedQuestionBank(pages) {
  const all = pages.flatMap((items, index) => printedPageRows(items, index + 1));
  const starts = all.flatMap((row, index) => timer.test(row.text.replace(/\s/g, '')) ? [index] : []);
  if (!starts.length || !all.some(row => explanation.test(row.text))) return null;
  const questions = [], unresolved = [], candidates = [];
  const stats = { removedCharacters: 0, removedPages: [] };
  pages.forEach((items, index) => {
    const raw = items.map(i => i.str || '').join(' ');
    const cleaned = cleanEnglishText(raw, stats);
    if (/\p{L}/u.test(raw) && !/[\p{Script=Latin}]/u.test(cleaned)) stats.removedPages.push(index + 1);
  });
  for (let qi = 0; qi < starts.length; qi++) {
    const rawBlock = all.slice(starts[qi] + 1, starts[qi + 1] ?? all.length);
    const cut = rawBlock.findIndex(row => endUi.test(row.text));
    const block = (cut < 0 ? rawBlock : rawBlock.slice(0, cut)).filter(row => !nuisance.test(row.text));
    if (cut >= 0 && /^\d{4,7}$/.test(block.at(-1)?.text || '')) block.pop();
    const ex = block.findIndex(row => explanation.test(row.text));
    const before = ex < 0 ? block : block.slice(0, ex);
    const firstOption = before.findIndex(row => row.letter === 'A');
    const sourcePages = [...new Set(rawBlock.map(r => r.page))];
    const candidate = { index: qi + 1, sourcePage: all[starts[qi]].page, sourcePages };
    candidates.push(candidate);
    if (ex < 0 || firstOption < 0) { unresolved.push({ ...candidate, reason: 'Question/options or explanation boundary not recognized' }); continue; }
    const optionRows = before.slice(firstOption), options = [], optionLabels = [];
    let invalid = false;
    for (const row of optionRows) {
      if (row.letter) {
        if (optionLabels.includes(row.letter)) { invalid = true; break; }
        optionLabels.push(row.letter); options.push(row.optionText);
      } else if (options.length) options[options.length - 1] = compact(options.at(-1) + ' ' + row.text);
    }
    const stemRows = before.slice(0, firstOption);
    const stem = compact(stemRows.map(r => r.text).join(' '));
    if (invalid || options.length < 2 || options.some(o => !o) || stem.length < 12) { unresolved.push({ ...candidate, reason: 'Incomplete options or stem' }); continue; }
    const feedback = block.slice(ex + 1);
    const firstLabel = feedback.findIndex(row => row.letter);
    let answer = null;
    if (firstLabel >= 0) {
      const marker = feedback[firstLabel], oi = optionLabels.indexOf(marker.letter);
      const a = normal(marker.optionText), b = oi >= 0 ? normal(options[oi]) : '';
      if (oi >= 0 && a && b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))))) answer = oi;
    }
    const sections = [];
    let current = { heading: '', text: '' };
    const flush = () => { if (current.heading || current.text) sections.push({ ...current, text: compact(current.text) }); };
    for (let i = 0; i < feedback.length; i++) {
      const row = feedback[i];
      if (row.letter && optionLabels.includes(row.letter)) {
        flush();
        // The initial repeated answer label is already shown prominently once.
        current = { heading: i === firstLabel && answer !== null ? '' : `${row.letter}. ${row.optionText}`, text: '', optionLabel: row.letter, correct: optionLabels.indexOf(row.letter) === answer };
      } else current.text += ' ' + row.text;
    }
    flush();
    const tableStart = stemRows.findIndex(row => /^Investigations?\s*[:;]/i.test(row.text));
    const stemBlocks = [];
    if (tableStart >= 0) {
      const tableEnd = stemRows.findIndex((row, index) => index > tableStart && /^(?:Which|What|How|The most|Choose)\b/i.test(row.text));
      const stop = tableEnd < 0 ? stemRows.length : tableEnd;
      stemBlocks.push({ type: 'paragraph', text: stemRows.slice(0, tableStart).map(r => r.text).join(' ') });
      const tableRows = stemRows.slice(tableStart + 1, stop).map(r => {
        if (r.cells.length > 1) return r.cells;
        // Some source rows use a normal word-space, not a wide column gap.
        // Split only the value of an investigation row, never arbitrary prose.
        const value = r.text.match(/^([^0-9]+?)\s+(\d.*)$/);
        return value ? [value[1], value[2]] : [r.text];
      });
      stemBlocks.push({ type: 'table', rows: tableRows });
      if (tableEnd >= 0) stemBlocks.push({ type: 'paragraph', text: stemRows.slice(tableEnd).map(r => r.text).join(' ') });
    } else stemBlocks.push({ type: 'paragraph', text: stem });
    questions.push({ id: `printed-${qi + 1}`, sourceNumber: qi + 1, sourcePage: candidate.sourcePage, sourcePages,
      stem, stemBlocks, options, optionLabels, answer, explanation: sections.map(s => [s.heading, s.text].filter(Boolean).join('\n')).join('\n\n'), explanationSections: sections,
      verified: Number.isInteger(answer), printedBank: true,
      questionRegions: stemRows.length ? [{ page: stemRows[0].page, top: stemRows[0].y + 18, bottom: stemRows.at(-1).y - 6 }] : [] });
  }
  return { questions, expectedCount: starts.length, candidates, unresolved, language: stats };
}
