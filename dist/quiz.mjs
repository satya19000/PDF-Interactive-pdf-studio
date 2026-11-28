// A clean question bank is built from source text, never by covering printed answers.
const letters = 'ABCDE';
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Preserve WinAnsi symbols directly and transliterate common medical/math Unicode
// characters meaningfully instead of replacing them with '?'.
const unicodeMap = {
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '∼': '~',
  '→': '->', '←': '<-', '↔': '<->', '↑': 'up ', '↓': 'down ',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'Δ': 'Delta',
  'ε': 'epsilon', 'θ': 'theta', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'u', 'µ': 'u',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi', 'ω': 'omega', 'Ω': 'Ohm',
  '∞': 'infinity', '√': 'sqrt', '∑': 'sum', '∫': 'int',
  '✓': '[v]', '✔': '[v]', '✗': '[x]', '✘': '[x]',
  '₀': '_0', '₁': '_1', '₂': '_2', '₃': '_3', '₄': '_4', '₅': '_5', '₆': '_6', '₇': '_7', '₈': '_8', '₉': '_9',
  '⁰': '^0', '¹': '^1', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
  '⁺': '+', '⁻': '-', '‐': '-', '‑': '-', '‒': '-', '−': '-', '…': '...',
  '½': '1/2', '¼': '1/4', '¾': '3/4'
};
// WinAnsi (ISO-8859-1 + CP1252 printable) characters supported by StandardFonts.Helvetica
const winAnsiExtras = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178
]);
export function pdfSafeText(value, fallbackTracker = null) {
  let out = '';
  for (const ch of String(value || '')) {
    const code = ch.codePointAt(0);
    if ((code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || winAnsiExtras.has(code)) {
      out += ch;
    } else if (unicodeMap[ch]) {
      out += unicodeMap[ch];
      if (fallbackTracker) fallbackTracker.transliterated.add(ch);
    } else if (code === 0x09 || code === 0x0A || code === 0x0D) {
      out += ' ';
    } else {
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      out += `[U+${hex}]`;
      if (fallbackTracker) fallbackTracker.unmapped.add(ch);
    }
  }
  return out;
}

export function hasGlyph(font, ch, unicode = false) {
  const cp = ch.codePointAt(0);
  if (cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D) return true;
  if (!unicode) {
    return (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || winAnsiExtras.has(cp);
  }
  try {
    const nativeFont = font?.embedder?.font;
    if (nativeFont && typeof nativeFont.hasGlyphForCodePoint === 'function') {
      return nativeFont.hasGlyphForCodePoint(cp);
    }
    font.encodeText(ch);
    return true;
  } catch {
    return false;
  }
}

export function safeTextForFont(value, font, unicode = false, fallbackTracker = null) {
  if (!unicode) return pdfSafeText(value, fallbackTracker);
  let out = '';
  for (const ch of String(value || '')) {
    const cp = ch.codePointAt(0);
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) { out += ' '; continue; }
    if (hasGlyph(font, ch, true)) {
      out += ch;
    } else if (unicodeMap[ch]) {
      out += unicodeMap[ch];
      if (fallbackTracker) fallbackTracker.transliterated.add(ch);
    } else {
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');
      out += `[U+${hex}]`;
      if (fallbackTracker) fallbackTracker.unmapped.add(ch);
    }
  }
  return out;
}

export async function embedStudioFonts(doc) {
  const { StandardFonts } = globalThis.PDFLib;
  if (globalThis.fontkit) {
    try {
      let regularBytes, boldBytes;
      if (typeof fetch === 'function' && typeof location !== 'undefined') {
        const [r1, r2] = await Promise.all([
          fetch(new URL('./vendor/fonts/DejaVuSans.ttf', location.href)),
          fetch(new URL('./vendor/fonts/DejaVuSans-Bold.ttf', location.href))
        ]);
        if (r1.ok && r2.ok) {
          regularBytes = new Uint8Array(await r1.arrayBuffer());
          boldBytes = new Uint8Array(await r2.arrayBuffer());
        }
      } else if (typeof process !== 'undefined' && process.versions?.node) {
        const fs = await import('node:fs');
        const url = await import('node:url');
        const path = await import('node:path');
        const dir = path.dirname(url.fileURLToPath(import.meta.url));
        const rPath = path.join(dir, 'vendor', 'fonts', 'DejaVuSans.ttf');
        const bPath = path.join(dir, 'vendor', 'fonts', 'DejaVuSans-Bold.ttf');
        if (fs.existsSync(rPath) && fs.existsSync(bPath)) {
          regularBytes = fs.readFileSync(rPath);
          boldBytes = fs.readFileSync(bPath);
        }
      }
      if (regularBytes && boldBytes) {
        doc.registerFontkit(globalThis.fontkit);
        const regular = await doc.embedFont(regularBytes, { subset: true });
        const bold = await doc.embedFont(boldBytes, { subset: true });
        return { regular, bold, unicode: true };
      }
    } catch {}
  }
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    unicode: false
  };
}

export function textLinesFromItems(items) {
  const lines = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform || item.transform.length < 6) continue;
    const y = item.transform[5], x = item.transform[4], last = lines.at(-1);
    if (last && Math.abs(last.y - y) < 2 && x >= last.x - 1) { last.parts.push(item.str); last.x = x; }
    else lines.push({ y, x, parts: [item.str] });
  }
  return lines.map(line => clean(line.parts.join(' '))).filter(Boolean);
}

// Recover reading order from PDFs whose text stream places options after the
// explanation, even though the options are visibly above it on the page.
export function visualPageLines(items) {
  const rows = new Map();
  for (const item of items) {
    if (!item.str || !item.transform || item.transform.length < 6) continue;
    const y = Math.round(item.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(item);
  }
  return [...rows].sort((a, b) => b[0] - a[0]).map(([y, parts]) => {
    parts.sort((a, b) => a.transform[4] - b.transform[4]);
    const marker = parts.find(i => /^[A-E]$/.test(i.str?.trim()) && i.transform[4] < 90);
    const next = marker && parts.find(i => i !== marker && i.str?.trim() && i.transform[4] > marker.transform[4]);
    const option = marker && next && next.transform[4] > marker.transform[4] + marker.width + 10;
    return {
      y,
      text: clean(parts.map(i => i.str).join('')),
      letter: option ? marker.str.trim() : null,
      optionText: option ? clean(parts.filter(i => i !== marker).map(i => i.str).join('')) : ''
    };
  }).filter(row => row.text);
}

export function parseVisualOptionBank(pages) {
  const questions = [];
  for (let pi = 0; pi < pages.length; pi++) {
    const rows = visualPageLines(pages[pi]).filter(r => r.y > 75 && r.y < 700);
    for (let start = 0; start < rows.length; start++) {
      if (rows[start].letter !== 'A') continue;
      const options = [], indices = []; let end = start;
      for (let letter = 0; letter < 5; letter++) {
        while (end < rows.length && !rows[end].letter) {
          if (options.length && rows[end].y > 75 && !/^Explanation\b/i.test(rows[end].text)) options[options.length - 1] += ' ' + rows[end].text;
          end++;
        }
        if (rows[end]?.letter !== 'ABCDE'[letter] || !rows[end].optionText) break;
        options.push(rows[end].optionText); indices.push(end); end++;
      }
      if (options.length !== 5 || !rows.slice(end, end + 3).some(r => /^Explanation\b/i.test(r.text))) continue;
      const intro = rows.slice(0, start).filter(r => !r.letter && !/^\d{1,2}:\d{2}:\d{2}/.test(r.text));
      const tableIndex = intro.findIndex(r => /^Investigations?\s*:/i.test(r.text));
      const stem = tableIndex < 0 ? clean(intro.map(r => r.text).join(' ')) :
        clean([...intro.slice(0, tableIndex).map(r => r.text), 'Investigations: view the source figure below.',
          ...intro.slice(tableIndex + 1).filter(r => /[?]$/.test(r.text)).map(r => r.text)].join(' '));
      if (stem.length < 25) continue;
      let answer = null, explanation = '';
      const labelIndex = rows.findIndex((r, j) => j > end && r.letter && options['ABCDE'.indexOf(r.letter)] === r.optionText);
      if (labelIndex >= 0) {
        answer = 'ABCDE'.indexOf(rows[labelIndex].letter);
        const detail = [];
        for (let j = labelIndex + 1; j < rows.length && !rows[j].letter; j++) detail.push(rows[j].text);
        if (!detail.length && pages[pi + 1]) {
          for (const row of visualPageLines(pages[pi + 1]).filter(r => r.y > 75 && r.y < 790 && !/^MRCP Part 1 Study Library/i.test(r.text))) {
            if (row.letter || /^(?:Rate this question|Next Question|Previous Question)/i.test(row.text)) break;
            detail.push(row.text);
          }
        }
        explanation = clean(detail.join(' '));
      }
      questions.push({
        id: `visual-${pi + 1}-${start}`, stem, options, answer,
        explanation, sourcePage: pi + 1, verified: Number.isInteger(answer),
        hasVisual: tableIndex >= 0, sourceFigureBottom: rows[start].y
      });
      break;
    }
  }
  return questions;
}

export async function captureVisualFigures(pdfjs, questions) {
  for (const q of questions.filter(question => question.hasVisual)) {
    const page = await pdfjs.getPage(q.sourcePage), scale = 1.4, viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const crop = document.createElement('canvas');
    try {
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const x = Math.round(56 * scale), top = Math.round((page.view[3] - 690) * scale);
      const bottom = Math.round((page.view[3] - q.sourceFigureBottom - 8) * scale);
      crop.width = Math.round(Math.min(485 * scale, canvas.width - x)); crop.height = Math.max(1, bottom - top);
      crop.getContext('2d').drawImage(canvas, x, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
      q.visualData = crop.toDataURL('image/jpeg', .92);
    } finally { canvas.width = 0; canvas.height = 0; crop.width = 0; crop.height = 0; page.cleanup?.(); }
  }
}

// Detect the five shaded answer rows in image-only question banks.
export function shadedOptionRows(imageData, width, height, xFraction = .93) {
  const x = Math.floor(width * xFraction), rows = [];
  const at = y => {
    const offset = (y * width + x) * 4, r = imageData[offset], g = imageData[offset + 1], b = imageData[offset + 2];
    if (g > r + 18 && g > b + 10 && g > 100) return 'green';
    if (r >= 210 && r < 241 && g >= 198 && g < 239 && b >= 185 && b < 232 && r >= g && g >= b) return 'gray';
    return null;
  };
  let kind = null, start = 0;
  for (let y = 0; y <= height; y++) {
    const next = y < height ? at(y) : null;
    if (next === kind) continue;
    if (kind && y - start >= Math.max(10, height * .009)) rows.push({ kind, top: start, bottom: y });
    kind = next; start = y;
  }
  for (let i = 0; i + 4 < rows.length; i++) {
    const group = rows.slice(i, i + 5), height0 = group[0].bottom - group[0].top;
    if (group.every((row, j) => !j || row.top - group[j - 1].bottom <= Math.max(12, height0 * .35))) return { group, rows };
  }
  return { group: null, rows };
}

// PASTEST / screenshot paired exports put each unmarked question on an odd page
// and its marked answer on the following page.
export async function extractPairedImageBank(pdfjs, onProgress = () => {}, options = {}) {
  const { allowPartial = false, shouldCancel = () => false } = options;
  if (pdfjs.numPages % 2 && !allowPartial) {
    throw new Error('This paired question bank has an unmatched page. Check the source PDF.');
  }
  const questions = [];
  const unresolvedPairs = [];
  const totalPairs = Math.floor(pdfjs.numPages / 2);

  for (let number = 1; number + 1 <= pdfjs.numPages; number += 2) {
    if (shouldCancel()) throw new Error('Conversion cancelled by user.');
    const pairIndex = (number + 1) / 2;
    const capture = async pageNumber => {
      const page = await pdfjs.getPage(pageNumber), ops = await page.getOperatorList();
      const viewport = page.getViewport({ scale: .25 }), preview = document.createElement('canvas');
      preview.width = Math.ceil(viewport.width); preview.height = Math.ceil(viewport.height);
      const crop = document.createElement('canvas');
      try {
        await page.render({ canvasContext: preview.getContext('2d'), viewport }).promise;
        const embedded = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
          const args = ops.argsArray[i];
          if (!Array.isArray(args) || typeof args[0] !== 'string' || !args[0].startsWith('img_') || !Number(args[1]) || !Number(args[2])) continue;
          // Exclude wide horizontal banner/logo strips (e.g. MRCP ROAD) safely.
          if (args[1] >= 1000 && args[2] <= 300 && args[1] / args[2] > 4) continue;
          const image = page.objs.has(args[0]) ? page.objs.get(args[0]) : await new Promise(resolve => page.objs.get(args[0], resolve));
          if (!image?.width || !image?.height) continue;
          embedded.push(image);
        }
        if (!embedded.length) throw new Error(`Source page ${pageNumber}: question screenshot was not found.`);
        crop.width = Math.max(...embedded.map(image => image.width));
        crop.height = embedded.reduce((height, image) => height + image.height + 8, 0) - 8;
        const ctx = crop.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, crop.width, crop.height);
        let top = 0;
        for (const image of embedded) {
          const tile = document.createElement('canvas'); tile.width = image.width; tile.height = image.height;
          if (image.data) {
            const pixels = new Uint8ClampedArray(image.width * image.height * 4);
            if (image.data.length === pixels.length) pixels.set(image.data);
            else for (let p = 0; p < image.width * image.height; p++) {
              const channels = image.data.length === image.width * image.height ? 1 : 3;
              pixels[p * 4] = image.data[p * channels]; pixels[p * 4 + 1] = image.data[p * channels + (channels > 1 ? 1 : 0)];
              pixels[p * 4 + 2] = image.data[p * channels + (channels > 1 ? 2 : 0)]; pixels[p * 4 + 3] = 255;
            }
            tile.getContext('2d').putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
          } else tile.getContext('2d').drawImage(image.bitmap || image, 0, 0);
          ctx.drawImage(tile, 0, top); top += image.height + 8; tile.width = tile.height = 0;
        }
        const pixels = crop.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, crop.width, crop.height).data;
        const candidates = [.93, .85, .75, .65, .55, .45, .35, .25, .2, .15, .1].map(x => shadedOptionRows(pixels, crop.width, crop.height, x));
        const found = candidates.find(c => c.group?.some(row => row.kind === 'green')) || candidates.find(c => c.group) || candidates[0];
        return { crop, found };
      } finally {
        preview.width = preview.height = 0;
        page.cleanup?.();
      }
    };

    let question = null, answer = null;
    try {
      question = await capture(number);
      answer = await capture(number + 1);
      if (question.found.group?.length !== 5 || answer.found.group?.length !== 5) {
        throw new Error(`Source pages ${number}-${number + 1}: could not verify five question and answer option rows.`);
      }
      const qImage = question.crop.toDataURL('image/png');
      const { group, rows } = answer.found;
      const correct = group?.findIndex(row => row.kind === 'green') ?? -1;
      const greenRows = rows.filter(row => row.kind === 'green');
      const repeat = greenRows[1];
      const from = greenRows[0]?.bottom || group?.[4]?.bottom || 0;
      const top = repeat && from ? Math.min(answer.crop.height - 1, Math.max(from + 2, repeat.top - 60)) : 0;
      const bottom = answer.crop.height;
      const answerCrop = document.createElement('canvas');
      answerCrop.width = answer.crop.width; answerCrop.height = Math.max(1, bottom - top);
      answerCrop.getContext('2d').drawImage(answer.crop, 0, top, answer.crop.width, answerCrop.height, 0, 0, answerCrop.width, answerCrop.height);
      const answerPixels = answerCrop.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, answerCrop.width, answerCrop.height).data;
      const content = imageQuizContentBounds(answerPixels, answerCrop.width, answerCrop.height);
      const trimmed = document.createElement('canvas'); trimmed.width = content.width; trimmed.height = answerCrop.height - content.y;
      trimmed.getContext('2d').drawImage(answerCrop, content.x, content.y, content.width, trimmed.height, 0, 0, content.width, trimmed.height);

      if (repeat) {
        const ctx = trimmed.getContext('2d', { willReadFrequently: true });
        for (const row of rows) {
          if (row.kind !== 'gray' || row.top <= repeat.bottom || row.bottom - row.top > 80) continue;
          const y = Math.max(0, row.top - top - content.y), end = Math.min(trimmed.height, row.bottom - top - content.y);
          if (end <= y) continue;
          const strip = ctx.getImageData(0, y, trimmed.width, end - y), pixels = strip.data;
          for (let p = 0; p < pixels.length; p += 4) {
            const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
            if (r >= 210 && r < 241 && g >= 198 && g < 239 && b >= 185 && b < 232 && r >= g && g >= b) {
              pixels[p] = 249; pixels[p + 1] = 216; pixels[p + 2] = 219;
            }
          }
          ctx.putImageData(strip, 0, y);
        }
      }
      const answerPages = [];
      const maxHeight = Math.max(1, Math.floor(665 * trimmed.width / 510));
      const pageHeight = trimmed.height <= maxHeight * 1.3 ? trimmed.height : maxHeight;
      const answerInk = trimmed.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, trimmed.width, trimmed.height).data;
      for (let start = 0; start < trimmed.height;) {
        let end = Math.min(trimmed.height, start + pageHeight);
        if (end < trimmed.height) {
          const first = Math.max(start + Math.floor(pageHeight * .68), end - 160);
          let best = end, bestScore = -Infinity, runStart = -1;
          const consider = runEnd => {
            if (runStart < 0) return;
            const length = runEnd - runStart, middle = Math.floor((runStart + runEnd) / 2);
            const score = length * 10 + (middle - first) / (end - first);
            if (length >= 4 && score > bestScore) { bestScore = score; best = middle; }
            runStart = -1;
          };
          for (let y = first; y < end; y++) {
            let ink = 0;
            for (let x = 12; x < trimmed.width - 12; x += 2) {
              const offset = (y * trimmed.width + x) * 4;
              if (answerInk[offset] < 155 && answerInk[offset + 1] < 155 && answerInk[offset + 2] < 155) ink++;
            }
            if (ink <= 2) { if (runStart < 0) runStart = y; } else consider(y);
          }
          consider(end);
          end = best;
        }
        const slice = document.createElement('canvas'); slice.width = trimmed.width; slice.height = end - start;
        slice.getContext('2d').drawImage(trimmed, 0, start, trimmed.width, slice.height, 0, 0, trimmed.width, slice.height);
        answerPages.push(slice.toDataURL('image/png')); slice.width = slice.height = 0; start = end;
      }
      questions.push({
        id: `paired-${number}`, stem: `Source question ${pairIndex}`, options: ['A', 'B', 'C', 'D', 'E'],
        answer: correct >= 0 ? correct : null, explanation: '', sourcePage: number, verified: correct >= 0,
        imageQuestionData: qImage, imageQuestionWidth: question.crop.width, imageQuestionHeight: question.crop.height,
        imageQuestionRows: question.found.group?.map(row => ({ top: row.top, bottom: row.bottom })) || [],
        imageAnswerPagesData: answerPages
      });
      answerCrop.width = 0; answerCrop.height = 0; trimmed.width = 0; trimmed.height = 0;
    } catch (err) {
      if (!allowPartial) throw err;
      unresolvedPairs.push({ index: pairIndex, pages: `${number}-${number + 1}`, reason: err.message });
    } finally {
      if (question?.crop) { question.crop.width = 0; question.crop.height = 0; }
      if (answer?.crop) { answer.crop.width = 0; answer.crop.height = 0; }
    }
    onProgress(pairIndex, totalPairs);
    if (number % 10 === 1) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!allowPartial && questions.length !== totalPairs) {
    throw new Error('Question count mismatch. No incomplete quiz was exported.');
  }
  if (allowPartial) return { questions, unresolvedPairs, totalPairs };
  return questions;
}

export function imageQuizContentBounds(imageData, width, height) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = Math.floor(height * .045); y < height * .955; y += 4) {
    for (let x = Math.floor(width * .03); x < width * .97; x += 4) {
      const i = (y * width + x) * 4;
      if (imageData[i] >= 248 && imageData[i + 1] >= 248 && imageData[i + 2] >= 248) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) return { x: 0, y: 0, width, height };
  const margin = 8, x = Math.max(0, left - margin), y = Math.max(0, top - margin);
  return { x, y, width: Math.min(width, right + margin) - x, height: Math.min(height, bottom + margin) - y };
}

export async function recognizeScannedPage(canvas, worker, sourcePage, previousQuestion) {
  const make = (width, height) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height)); return c; };
  const bounds = imageQuizContentBounds(canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  const crop = make(bounds.width, bounds.height);
  crop.getContext('2d').drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, crop.width, crop.height);
  const { group, rows } = shadedOptionRows(crop.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, crop.width, crop.height).data, crop.width, crop.height);
  const region = (x, y, width, height, minWidth = 1100) => {
    const scale = Math.max(1, Math.min(2.5, minWidth / width));
    const out = make(width * scale, height * scale);
    out.getContext('2d').drawImage(crop, x, y, width, height, 0, 0, out.width, out.height);
    return out;
  };
  const read = async c => { try { return (await worker.recognize(c)).data.text || ''; } finally { c.width = 0; c.height = 0; } };
  try {
    if (group?.every(row => row.kind === 'gray') && group[0].top > 35) {
      const stem = clean(await read(region(0, 0, crop.width, group[0].top - 4)));
      const startX = Math.round(crop.width * .08), stripWidth = Math.round(crop.width * .88);
      const strip = make(stripWidth, group.reduce((n, row) => n + row.bottom - row.top + 12, 0));
      let offset = 0;
      for (const row of group) { strip.getContext('2d').drawImage(crop, startX, row.top, stripWidth, row.bottom - row.top, 0, offset, stripWidth, row.bottom - row.top); offset += row.bottom - row.top + 12; }
      const scaled = make(Math.max(1100, strip.width), Math.max(1100, strip.width) * strip.height / strip.width);
      scaled.getContext('2d').drawImage(strip, 0, 0, scaled.width, scaled.height); strip.width = 0; strip.height = 0;
      let options = (await read(scaled)).split(/\r?\n/).map(clean).filter(Boolean);
      if (options.length !== 5) { options = []; for (const row of group) options.push(clean(await read(region(startX, row.top, stripWidth, row.bottom - row.top)))); }
      options = options.map(value => value.replace(/^[^A-Za-z]+(?=[A-Za-z])/, '').trim());
      if (stem.length >= 20 && options.length === 5 && options.every(value => value.length >= 2)) return { kind: 'question', question: { id: `scan-${sourcePage}`, stem, options, answer: null, explanation: '', sourcePage, verified: false } };
    }
    if (group?.some(row => row.kind === 'green') && previousQuestion?.sourcePage === sourcePage - 1) {
      const answer = group.findIndex(row => row.kind === 'green');
      const repeat = rows.find(row => row.kind === 'green' && row.top > group[4].bottom + 8);
      const from = repeat?.bottom || group[4].bottom;
      const next = rows.find(row => row.kind === 'gray' && row.top > from + 10);
      const to = Math.min(crop.height, next?.top || from + crop.height * .22);
      const explanation = to > from + 15 ? clean(await read(region(0, from, crop.width, to - from))) : '';
      return { kind: 'feedback', answer, explanation };
    }
    return { kind: 'text', text: await read(region(0, 0, crop.width, crop.height, 1200)) };
  } finally { crop.width = 0; crop.height = 0; }
}

const numberedStart = /^[ \t]*(?:Q(?:uestion)?[ \t]*[-.:#]?[ \t]*(\d+)[.)]?|(\d+)[.)])(?=[ \t]|$)/gim;
const answerKeyStart = /(?:^[ \t]*answer[ \t]+key\b[ \t]*[:–—-]?[ \t]*|^[ \t]*answers[ \t]*[:–—-]?[ \t]*$|\s+answer[ \t]+key\b[ \t]*[:–—-]?[ \t]*(?=\d+[ \t]*[-.:)=–—]))/im;

export function splitAnswerKey(text) {
  const input = String(text).replace(/\r\n?/g, '\n');
  const heading = answerKeyStart.exec(input);
  if (!heading) return [input, new Map()];
  const keySection = input.slice(heading.index + heading[0].length);
  const key = new Map();
  for (const [, number, letter] of keySection.matchAll(/(?:^|[\s,;|])(\d+)[ \t]*[-.:)=–—][ \t]*\(?([A-E])\)?(?=$|[\s,;|.)])/gi)) {
    const n = Number(number), a = letters.indexOf(letter.toUpperCase());
    key.set(n, key.has(n) && key.get(n) !== a ? null : a);
  }
  return [input.slice(0, heading.index), key];
}

export function hasStructuredAnswerKey(text) {
  return answerKeyStart.test(String(text).replace(/\r\n?/g, '\n'));
}

// Count numbered question starts while ignoring numbered lists inside Explanation/Discussion blocks.
export function structuredQuestionCount(text) {
  const [body] = splitAnswerKey(text);
  const allMatches = [...body.matchAll(numberedStart)];
  let count = 0;
  for (let idx = 0; idx < allMatches.length; idx++) {
    const m = allMatches[idx];
    const lineText = body.slice(m.index, body.indexOf('\n', m.index) === -1 ? body.length : body.indexOf('\n', m.index)).trim();
    if (/^\d+[.)]$/.test(lineText)) continue;
    const isExplicitQ = /^Q/i.test(m[0].trim());
    if (!isExplicitQ && idx > 0) {
      const prevIdx = allMatches.slice(0, idx).reverse().find(x => /^Q/i.test(x[0].trim()) || /\n[ \t]*(?:\([A-E]\)|[A-E][.)])\s+/i.test(body.slice(x.index, m.index)))?.index ?? allMatches[idx - 1].index;
      const between = body.slice(prevIdx, m.index);
      const lastEx = between.search(/\n[ \t]*(?:explanation|discussion|rationale)\s*[:\-]?/i);
      if (lastEx >= 0) {
        const lookahead = body.slice(m.index, allMatches[idx + 1]?.index ?? body.length);
        if (!/(?:^|\n|\s)(?:\([A-E]\)|[A-E][.)])\s+/i.test(lookahead)) continue;
      }
    }
    count++;
  }
  return count;
}

export function structuredSpreadsheet(rows) {
  const name = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const header = rows.findIndex(row => row.some(c => ['question', 'questiontext', 'stem'].includes(name(c))) &&
    row.some(c => ['a', 'optiona', 'choicea'].includes(name(c))));
  if (header < 0) return '';
  const heads = rows[header].map(name);
  const find = (...names) => heads.findIndex(h => names.includes(h));
  const question = find('question', 'questiontext', 'stem'), answer = find('answer', 'ans', 'correctanswer', 'answerkey'), explanation = find('explanation', 'rationale', 'discussion');
  const options = [...letters].map(l => find(l.toLowerCase(), 'option' + l.toLowerCase(), 'choice' + l.toLowerCase()));
  const cell = (row, i) => String(row[i] ?? '').trim().replace(/\s+/g, ' ');
  return rows.slice(header + 1).filter(row => row.some(c => String(c ?? '').trim())).map((row, i) => [
    (i + 1) + '. ' + cell(row, question),
    ...options.flatMap((col, j) => col >= 0 && cell(row, col) ? [letters[j] + '. ' + cell(row, col)] : []),
    ...(cell(row, answer) ? ['Answer: ' + cell(row, answer)] : []),
    ...(cell(row, explanation) ? ['Explanation: ' + cell(row, explanation)] : [])
  ].join('\n')).join('\n');
}

export function parseStructured(text) {
  const questions = [];
  const [body, key] = splitAnswerKey(text);
  // Find question starts outside explanation blocks
  const allMatches = [...body.matchAll(numberedStart)];
  const starts = [];
  for (let idx = 0; idx < allMatches.length; idx++) {
    const m = allMatches[idx];
    const isExplicitQ = /^Q/i.test(m[0].trim());
    if (!isExplicitQ && idx > 0) {
      const prevIdx = allMatches.slice(0, idx).reverse().find(x => /^Q/i.test(x[0].trim()) || /\n[ \t]*(?:\([A-E]\)|[A-E][.)])\s+/i.test(body.slice(x.index, m.index)))?.index ?? allMatches[idx - 1].index;
      const between = body.slice(prevIdx, m.index);
      const lastEx = between.search(/\n[ \t]*(?:explanation|discussion|rationale)\s*[:\-]?/i);
      if (lastEx >= 0) {
        // Check if there are options after this number; if not, it's a numbered explanation point.
        const lookahead = body.slice(m.index, allMatches[idx + 1]?.index ?? body.length);
        if (!/(?:^|\n|\s)(?:\([A-E]\)|[A-E][.)])\s+/i.test(lookahead)) continue;
      }
    }
    starts.push(m);
  }

  const indexCounts = new Map();
  for (const m of starts) { const n = Number(m[1] ?? m[2]); indexCounts.set(n, (indexCounts.get(n) || 0) + 1); }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i], number = Number(start[1] ?? start[2]);
    const raw = body.slice(start.index + start[0].length, starts[i + 1]?.index);
    const lines = raw.split('\n').flatMap(line => {
      if (/^\s*(?:(?:correct\s+)?ans(?:wer)?|explanation|discussion|rationale)\b/i.test(line)) return [line];
      const markers = [...line.matchAll(/(?:^|[ \t])(?:\(([A-E])\)|([A-E])[.)])[ \t]+/gi)];
      if (markers.length < 2 || markers.some((m, j) => j > 0 && m[1]?.toUpperCase() === markers[j - 1][1]?.toUpperCase() && m[2]?.toUpperCase() === markers[j - 1][2]?.toUpperCase())) return [line];
      return [line.slice(0, markers[0].index), ...markers.map((m, j) => line.slice(m.index, markers[j + 1]?.index))];
    }).map(x => x.trim()).filter(Boolean);

    const options = [], stem = [], explanation = [];
    let answer = null, answerText = '', inExplanation = false, afterAnswer = false, invalidOptions = false;
    for (const line of lines) {
      const a = /^(?:correct\s+)?ans(?:wer)?\s*[:\-]\s*(.*)$/i.exec(line);
      if (a) { answerText = a[1].trim(); afterAnswer = true; inExplanation = false; continue; }
      if (/^(?:explanation|discussion|rationale)\s*[:\-]?/i.test(line)) {
        inExplanation = true;
        const rest = line.replace(/^(?:explanation|discussion|rationale)\s*[:\-]?\s*/i, '');
        if (rest) explanation.push(rest);
        continue;
      }
      if (afterAnswer && !inExplanation) { answerText += (answerText ? ' ' : '') + line; continue; }
      const o = /^(?:\(([A-E])\)|([A-E])[.)])\s+(.+)/i.exec(line);
      if (o && !inExplanation) {
        if ((o[1] ?? o[2]).toUpperCase() !== letters[options.length]) invalidOptions = true;
        options.push(clean(o[3])); continue;
      }
      if (inExplanation) explanation.push(line);
      else if (options.length) options[options.length - 1] += ' ' + line;
      else stem.push(line);
    }
    const answerLetter = /^(?:\(([A-E])\)|([A-E])(?:[.)](?=\s|$)|$))/i.exec(answerText);
    if (answerLetter) answer = letters.indexOf((answerLetter[1] ?? answerLetter[2]).toUpperCase());
    else if (answerText) { const exact = options.map(norm).findIndex(value => value === norm(answerText)); if (exact >= 0) answer = exact; }
    if (indexCounts.get(number) === 1 && key.has(number)) {
      const keyed = key.get(number);
      answer = answer === null ? keyed : answer === keyed ? answer : null;
    }
    if (!Number.isInteger(answer) || answer >= options.length) answer = null;
    if (!invalidOptions && options.length >= 2 && clean(stem.join(' '))) {
      questions.push({
        id: 'structured-' + (questions.length + 1),
        sourceNumber: number,
        stem: clean(stem.join(' ')),
        options,
        answer,
        explanation: clean(explanation.join(' ')),
        sourcePage: null,
        verified: answer !== null
      });
    }
  }
  return questions;
}

// Recover a quiz created by the former five-feedback-page generator.
export async function extractLegacyQuizPdf(pdfjs, onProgress = () => {}) {
  const lines = async number => (await (await pdfjs.getPage(number)).getTextContent()).items.map(i => clean(i.str)).filter(Boolean);
  const first = await lines(1), header = first.find(line => /^QUESTION\s+1\s*\/\s*\d+$/i.test(line));
  const total = Number(/\/\s*(\d+)/.exec(header || '')?.[1]);
  if (!Number.isSafeInteger(total) || total < 1 || pdfjs.numPages !== total * 6)
    throw new Error('This existing quiz is not the five-answer-page layout. Use its original source file to create a new PDF.');
  const questions = [];
  for (let index = 0; index < total; index++) {
    const question = await lines(index * 6 + 1), feedback = await lines(index * 6 + 2);
    const head = question.findIndex(line => line === `QUESTION ${index + 1} / ${total}`);
    const markers = question.map((line, i) => /^[A-E]\.$/.test(line) ? i : -1).filter(i => i >= 0);
    if (head < 0 || markers.length !== 5 || markers.some((i, option) => question[i] !== `${letters[option]}.`))
      throw new Error(`Question ${index + 1}: cannot verify all five source choices. No incomplete PDF exported.`);
    const stem = clean(question.slice(head + 1, markers[0]).join(' '));
    const options = markers.map((start, i) => clean(question.slice(start + 1, markers[i + 1] || question.findIndex((line, j) => j > start && /^Choose one option/i.test(line))).join(' ')));
    const answerLine = feedback.find(line => /^Correct answer:\s*[A-E]\./i.test(line));
    const answer = answerLine ? letters.indexOf(/^Correct answer:\s*([A-E])\./i.exec(answerLine)[1].toUpperCase()) : null;
    const exStart = feedback.findIndex(line => line === 'EXPLANATION');
    const exEnd = feedback.findIndex((line, i) => i > exStart && /^Try this question again$/i.test(line));
    if (!stem || options.some(option => !option) || exStart < 0 || exEnd < 0)
      throw new Error(`Question ${index + 1}: cannot verify its text or explanation. No incomplete PDF exported.`);
    questions.push({ id: `legacy-${index + 1}`, stem, options, answer, explanation: clean(feedback.slice(exStart + 1, exEnd).join(' ')), sourcePage: index * 6 + 1, verified: Number.isInteger(answer) });
    if (index % 10 === 0 || index === total - 1) { onProgress(index + 1, total); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  return questions;
}

export function parseBmj(pages) {
  const groups = [], seen = new Set();
  for (let page = 0; page < pages.length; page++) {
    const header = pages[page].find(i => /Question\s+(\d+)\s+of\s+(\d+)/i.test(i.str || ''));
    const match = header && /Question\s+(\d+)\s+of\s+(\d+)/i.exec(header.str);
    if (!match) continue;
    const id = `${match[2]}-${match[1]}`;
    if (!seen.has(id)) { seen.add(id); groups.push({ id, number: Number(match[1]), total: Number(match[2]), start: page }); }
  }
  if (!groups.length) return [];
  return groups.map((group, gi) => {
    const end = groups[gi + 1]?.start ?? pages.length;
    const options = [], stemItems = [], explanationItems = [], learningItems = [];
    let optionEnd = false, firstOptionY = 0, answerPage = null, hasVisual = false;
    for (let page = group.start; page < end; page++) {
      const items = pages[page], isAnswer = items.some(i => clean(i.str) === 'Key learning points');
      if (isAnswer && items.some(i => /\b(?:Photographic|Figure|ECG|Image|Radiograph|Scan)\b/i.test(i.str || ''))) hasVisual = true;
      if (isAnswer && answerPage === null) answerPage = page;
      if (isAnswer || (answerPage !== null && page > answerPage)) {
        const explanation = items.find(i => clean(i.str) === 'Explanation');
        const learning = items.find(i => clean(i.str) === 'Key learning points');
        const exY = explanation?.transform[5] ?? (isAnswer ? -1 : 1120);
        const learnY = learning?.transform[5] ?? -1;
        for (const item of items) {
          const x = item.transform[4], y = item.transform[5], t = clean(item.str);
          if (x >= 95 && x < 675 && y < exY && y > 35 && t && !/^(?:Incorrect|Correct|Good try!|Common Mistake!|Further Reading|Add revision notes|Save notes|Next question|Time elapsed|My score|Question navigator|Rate this question)/i.test(t)) explanationItems.push({ x, y, text: t });
          if (x >= 120 && x < 675 && y < learnY && y > exY + 5 && t) learningItems.push({ x, y, text: t });
        }
        continue;
      }
      if (optionEnd) continue;
      const button = items.some(i => /Answer question/i.test(i.str || ''));
      for (const item of items) {
        const x = item.transform[4], y = item.transform[5], t = clean(item.str);
        if (x >= 118 && x <= 120 && t && !/^\d+$/.test(t) && y > 28 && y < 1170) options.push({ text: t, page, y });
        if (group.id === '121-64' && t === 'I Thyroid uptake scan') options.push({ text: t, page, y });
      }
      if (page === group.start) {
        const ys = options.filter(o => o.page === page).map(o => o.y);
        firstOptionY = Math.max(...ys, 0);
        for (const item of items) {
          const x = item.transform[4], y = item.transform[5], t = clean(item.str);
          if (x >= 77 && x < 675 && y < 955 && y > firstOptionY + 14 && t && !/^(?:Previous|Next|Exit session|English|French|Question \d+ of \d+|Answer question|High impact question)$/.test(t)) stemItems.push({ x, y, text: t });
        }
      }
      if (button) optionEnd = true;
    }
    options.sort((a, b) => a.page - b.page || b.y - a.y);
    const combined = [];
    for (const option of options) { const previous = combined.at(-1); if (previous && previous.page === option.page && previous.y - option.y < 24) { previous.text += ' ' + option.text; } else combined.push({ ...option }); }
    const sorted = xs => xs.sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.text).join(' ');
    const explanation = clean(sorted(explanationItems));
    const learning = clean(sorted(learningItems));
    const candidates = combined.map((option, index) => ({ index, phrase: norm(option.text) })).filter(o => o.phrase.length >= 5 && (norm(learning).includes(o.phrase) || norm(explanation).includes(o.phrase)));
    const learningHits = candidates.filter(o => norm(learning).includes(o.phrase));
    const answer = learningHits.length === 1 ? learningHits[0].index : null;
    return {
      id: group.id, sourceNumber: group.number, stem: clean(sorted(stemItems)),
      options: combined.map(o => o.text), answer,
      explanation: clean([learning, explanation].filter(Boolean).join(' ')),
      sourcePage: group.start + 1, answerPage: answerPage === null ? null : answerPage + 1,
      endPage: end, optionTopY: firstOptionY, verified: false, hasVisual
    };
  }).filter(q => q.options.length >= 2 && q.options.length <= 5 && q.stem);
}

export async function inferBmjAnswerColors(pdfjs, questions, onProgress = () => {}) {
  const scale = .4;
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi]; if (!q.answerPage) continue;
    const matches = new Set();
    for (let pageNumber = q.answerPage; pageNumber <= Math.min(q.endPage, q.answerPage + 2); pageNumber++) {
      const page = await pdfjs.getPage(pageNumber), items = (await page.getTextContent()).items;
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(page.view[2] * scale); canvas.height = Math.ceil(page.view[3] * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
      for (const item of items) {
        const x = item.transform[4], y = item.transform[5], t = norm(item.str);
        if (x < 90 || x > 110 || !t || y < 30 || y > 1170) continue;
        const py = Math.floor((page.view[3] - y - 8) * scale), px = Math.floor(84 * scale);
        if (py < 0 || py >= canvas.height) continue;
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        if (pixel[1] < pixel[0] + 8 || pixel[1] < pixel[2] + 18) continue;
        q.options.forEach((option, index) => { const optionText = norm(option); if (optionText === t || optionText.startsWith(t + ' ') || t.startsWith(optionText + ' ')) matches.add(index); });
      }
      canvas.width = 0; canvas.height = 0; page.cleanup?.();
      if (matches.size) break;
    }
    if (matches.size === 1) { q.answer = [...matches][0]; q.verified = true; }
    if (qi % 10 === 0) { onProgress(qi + 1, questions.length); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  return questions;
}

export async function captureBmjFigures(pdfjs, questions, onProgress = () => {}) {
  // Check all questions for embedded images regardless of text tags, and preserve explanation figures too.
  const { OPS } = globalThis.pdfjsLib || {};
  for (let index = 0; index < questions.length; index++) {
    const q = questions[index];
    const start = q.sourcePage;
    const end = q.endPage || q.sourcePage;
    for (let pageNum = start; pageNum <= end; pageNum++) {
      const page = await pdfjs.getPage(pageNum);
      try {
        const ops = await page.getOperatorList();
        const hasImg = ops.argsArray.some((args, i) =>
          (OPS ? ops.fnArray[i] === OPS.paintImageXObject : args?.[0]?.startsWith?.('img_')) &&
          Array.isArray(args) && Number(args[1]) >= 180 && Number(args[2]) >= 140 && !(args[1] >= 1000 && args[2] <= 300 && args[1] / args[2] > 4)
        );
        if (!hasImg && !(q.hasVisual && pageNum === q.sourcePage)) continue;
        const scale = .95;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(page.view[2] * scale); canvas.height = Math.ceil(page.view[3] * scale);
        const crop = document.createElement('canvas');
        try {
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }) }).promise;
          if (pageNum === q.sourcePage) {
            const top = 220, bottom = Math.max(top + 80, Math.min(page.view[3] - q.optionTopY - 18, page.view[3] - 45));
            const sourceX = Math.floor(75 * scale), sourceY = Math.floor(top * scale), width = Math.floor(695 * scale), height = Math.floor((bottom - top) * scale);
            crop.width = width; crop.height = height;
            crop.getContext('2d').drawImage(canvas, sourceX, sourceY, width, height, 0, 0, width, height);
            q.visualData = crop.toDataURL('image/jpeg', .88);
            q.hasVisual = true;
          } else if (!q.explanationVisualData) {
            const top = 80, bottom = page.view[3] - 45;
            const sourceX = Math.floor(75 * scale), sourceY = Math.floor(top * scale), width = Math.floor(695 * scale), height = Math.floor((bottom - top) * scale);
            crop.width = width; crop.height = height;
            crop.getContext('2d').drawImage(canvas, sourceX, sourceY, width, height, 0, 0, width, height);
            q.explanationVisualData = crop.toDataURL('image/jpeg', .88);
          }
        } finally { canvas.width = 0; canvas.height = 0; crop.width = 0; crop.height = 0; }
      } finally { page.cleanup?.(); }
    }
    if (index % 10 === 0 || index === questions.length - 1) {
      onProgress(index + 1, questions.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

export function validateQuiz(questions) {
  return questions.filter(q => !q.stem || q.options.length < 2 || q.options.length > 5 || (Number.isInteger(q.answer) && (q.answer < 0 || q.answer >= q.options.length)) || (q.hasVisual && !q.visualData));
}

// Printed MyPastest PDFs identify each question in a footer URL and often
// continue the answer discussion on the following page.
export function parseMyPastest(pages) {
  const starts = [], seen = new Set();
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].map(x => x.str || '').join(' ');
    if (!/MyPastest/i.test(text) || !/questionIndex=\d+/.test(text)) continue;
    const id = Number(/questionIndex=(\d+)/.exec(text)[1]);
    const hasFeedback = pages[i].some(x => /Your answer was (?:correct|incorrect)/i.test(x.str || ''));
    if (hasFeedback && !seen.has(id)) { starts.push({ id, page: i }); seen.add(id); }
  }
  if (!starts.length) return [];
  const toRows = items => {
    const rows = [];
    for (const item of items.filter(x => (x.str || '').trim() && x.transform[4] >= 35 && x.transform[4] < 540)) {
      const x = item.transform[4], y = item.transform[5], same = rows.find(r => Math.abs(r.y - y) < 2);
      if (same) same.items.push({ x, text: item.str.trim() }); else rows.push({ y, items: [{ x, text: item.str.trim() }] });
    }
    return rows.sort((a, b) => b.y - a.y).map(r => ({ y: r.y, x: Math.min(...r.items.map(i => i.x)), text: r.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').replace(/\s+([.,;:])/g, '$1') }));
  };
  const ignored = /^(?:MyPastest|Your answer was|Explanation$|Chat with AI Tutor|Next Question|Previous Question|Tag Question|Feedback|End Session|Rate this question|Diff\s*ficulty:|Peer Responses|Show More Questions|Session Progress|Responses |External Links|https?:|\d+\/\d+\/\d+|\d+\/\d+$)/i;
  return starts.map((entry, index) => {
    const first = toRows(pages[entry.page]);
    const ex = first.find(r => /^Explanation$/.test(r.text));
    const answerMessage = first.find(r => /^Your answer was/.test(r.text));
    if (!ex || !answerMessage) return null;
    const labels = first.filter(r => r.y < answerMessage.y && r.y > ex.y && r.x >= 45 && r.x < 65 && /^[A-E](?:\s|$)/.test(r.text)).slice(0, 5);
    if (labels.length < 2 || labels.some((r, i) => r.text[0] !== letters[i])) return null;
    const stem = first.filter(r => r.y > answerMessage.y + 14 && r.x < 45 && !ignored.test(r.text)).map(r => r.text).join(' ').trim();
    const options = labels.map((label, i) => first.filter(r => r.y <= label.y + 2 && r.y > (labels[i + 1]?.y ?? ex.y) + 2 && r.x >= 45 && r.x < 530).map(r => r.text.replace(/^[A-E]\s+(?=\S)/, '')).join(' ').trim());
    const feedbackRows = first.filter(r => r.y < ex.y - 4 && r.y > 38 && !ignored.test(r.text));
    let answer = null;
    for (const row of feedbackRows) { if (row.x >= 45 && row.x < 65 && /^[A-E](?:\s|$)/.test(row.text)) { answer = letters.indexOf(row.text[0]); break; } }
    const end = starts[index + 1]?.page ?? pages.length;
    for (let p = entry.page + 1; p < end; p++) {
      if (pages[p].some(x => /Your answer was (?:correct|incorrect)/i.test(x.str || ''))) break;
      feedbackRows.push(...toRows(pages[p]).filter(r => r.y > 38 && r.x < 400 && !ignored.test(r.text)));
    }
    const sections = [];
    for (const row of feedbackRows) {
      const text = row.text.replace(/Chat with AI Tutor/gi, '').trim();
      if (!text || ignored.test(text)) continue;
      if (row.x >= 45 && row.x < 65 && /^[A-E](?:\s|$)/.test(text)) sections.push(text);
      else if (sections.length) sections[sections.length - 1] += ' ' + text;
      else sections.push(text);
    }
    const explanation = sections.join(' ');
    return { id: `mypastest-${entry.id}`, stem, options, answer, explanation, explanationSections: sections, sourcePage: entry.page + 1, verified: Number.isInteger(answer) };
  }).filter(q => q && q.stem && q.options.every(Boolean));
}

export async function captureMyPastestFigures(pdfjs, questions, onProgress = () => {}) {
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi], end = questions[qi + 1]?.sourcePage ?? pdfjs.numPages + 1;
    for (let number = q.sourcePage; number < end; number++) {
      const page = await pdfjs.getPage(number), ops = await page.getOperatorList();
      const { OPS } = globalThis.pdfjsLib || {};
      const figures = ops.argsArray.filter((args, i) =>
        (OPS ? ops.fnArray[i] === OPS.paintImageXObject : args?.[0]?.startsWith?.('img_')) &&
        Array.isArray(args) && Number(args[1]) >= 200 && Number(args[2]) >= 150 && Number(args[1]) * Number(args[2]) >= 40000);
      if (!figures.length) { page.cleanup?.(); continue; }
      const base = page.getViewport({ scale: 1 }), scale = Math.min(1.6, 1900 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        q.visualData = canvas.toDataURL('image/jpeg', .88);
        q.hasVisual = true;
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup?.(); }
    }
    if (qi % 10 === 0 || qi === questions.length - 1) { onProgress(qi + 1, questions.length); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
}

export function splitQuestionsIntoParts(questions, maxPerPart = 120) {
  if (questions.length <= maxPerPart) return [questions];
  const parts = [];
  for (let i = 0; i < questions.length; i += maxPerPart) {
    parts.push(questions.slice(i, i + maxPerPart));
  }
  return parts;
}

export function findDuplicateQuestions(questions) {
  const seen = new Map();
  const duplicates = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const sig = norm(q.stem) + '||' + q.options.map(norm).join('|');
    if (seen.has(sig)) {
      duplicates.push({ firstIndex: seen.get(sig) + 1, duplicateIndex: i + 1, stem: q.stem.slice(0, 80) });
    } else {
      seen.set(sig, i);
    }
  }
  return duplicates;
}

export function wrappedLines(text, width, font, size, unicode = false, fallbackTracker = null) {
  const prepared = safeTextForFont(text, font, unicode, fallbackTracker);
  const words = prepared.split(/\s+/), lines = []; let line = '';
  for (const word of words) {
    if (!word) continue;
    if (font.widthOfTextAtSize((line ? line + ' ' : '') + word, size) <= width) line += (line ? ' ' : '') + word;
    else {
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) > width) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > width) { if (chunk) lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function goto(doc, page, rectangle, target) {
  const { PDFName, PDFArray, PDFNumber } = globalThis.PDFLib;
  const destination = PDFArray.withContext(doc.context);
  destination.push(target.ref); destination.push(PDFName.of('XYZ'));
  destination.push(PDFNumber.of(0)); destination.push(PDFNumber.of(target.getHeight())); destination.push(PDFNumber.of(0));
  const annotation = doc.context.obj({ Type: PDFName.of('Annot'), Subtype: PDFName.of('Link'), Rect: rectangle, Border: [0, 0, 0] });
  annotation.set(PDFName.of('A'), doc.context.obj({ S: PDFName.of('GoTo'), D: destination }));
  page.node.addAnnot(doc.context.register(annotation));
}

export async function buildQuizPdf(questions, title, onProgress = () => {}, existing = null, options = {}) {
  if (!questions.length || validateQuiz(questions).length) {
    throw new Error('Some questions could not be extracted. Try a text-based PDF with clear options.');
  }
  const { PDFDocument, rgb } = globalThis.PDFLib;
  const startNumber = options.startNumber ?? existing?.questionCount ?? 0;
  const totalQuestions = options.totalQuestions ?? (startNumber + questions.length);
  const includeMetadata = options.includeMetadata !== false;

  const doc = existing?.doc || await PDFDocument.create();
  const { regular, bold, unicode } = await embedStudioFonts(doc);
  const fallbackTracker = { transliterated: new Set(), unmapped: new Set() };
  const safe = text => safeTextForFont(text, regular, unicode, fallbackTracker);
  const ink = rgb(.11, .17, .27), green = rgb(.08, .47, .28), red = rgb(.76, .22, .24), amber = rgb(.52, .36, .09), blue = rgb(.15, .32, .75), grey = rgb(.39, .45, .54);
  const questionPages = [], lastAnswerPages = [];
  const heading = safe(title.trim().replace(/_/g, ' ') || 'MCQ Question Bank');

  const header = (page, label, color) => {
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 46, width: A4_WIDTH, height: 46, color });
    let short = heading;
    while (short.length && bold.widthOfTextAtSize(short, 12) > 510) short = short.slice(0, -1);
    if (short !== heading) short = short.slice(0, -3) + '...';
    page.drawText(short, { x: 42, y: A4_HEIGHT - 22, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText(label, { x: 42, y: A4_HEIGHT - 38, size: 10, font: bold, color: rgb(1, 1, 1) });
  };

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi], number = startNumber + qi + 1;
    let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    questionPages.push(page);
    header(page, `QUESTION ${number} / ${totalQuestions}`, blue);
    const questionStart = page;

    if (q.imageQuestionData) {
      const picture = await (q.imageQuestionData.startsWith('data:image/png') ? doc.embedPng(q.imageQuestionData) : doc.embedJpg(q.imageQuestionData));
      const ratio = Math.min(511 / picture.width, 675 / picture.height);
      const width = picture.width * ratio, height = picture.height * ratio;
      const left = 42, top = A4_HEIGHT - 64, bottom = top - height;
      page.drawImage(picture, { x: left, y: bottom, width, height });
      let result = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      if (q.imageQuestionRows?.length === 5) {
        for (const row of q.imageQuestionRows) {
          const upper = top - row.top * ratio, lower = top - row.bottom * ratio;
          goto(doc, page, [left, lower, left + width, upper], result);
        }
      } else goto(doc, page, [left, bottom, left + width, top], result);
      page.drawText('Tap an option to view the answer.', { x: 42, y: 42, size: 10, font: regular, color: grey });
      header(result, 'ANSWER & EXPLANATION', green);
      const answerData = q.imageAnswerPagesData || [q.imageAnswerData];
      const imgAnswerPages = [];
      for (let part = 0; part < answerData.length; part++) {
        if (part) { result = doc.addPage([A4_WIDTH, A4_HEIGHT]); header(result, `ANSWER & EXPLANATION · QUESTION ${number} · CONTINUED`, green); }
        imgAnswerPages.push(result);
        const data = answerData[part], answerImage = await (data.startsWith('data:image/png') ? doc.embedPng(data) : doc.embedJpg(data));
        const answerRatio = Math.min(511 / answerImage.width, 665 / answerImage.height);
        result.drawImage(answerImage, { x: 42, y: A4_HEIGHT - 64 - answerImage.height * answerRatio, width: answerImage.width * answerRatio, height: answerImage.height * answerRatio });
      }
      for (const ap of imgAnswerPages) {
        ap.drawText('Back to question', { x: 42, y: 54, size: 11, font: bold, color: blue });
        goto(doc, ap, [40, 48, 210, 68], page);
      }
      lastAnswerPages.push(result);
      if (qi % 5 === 0 || qi === questions.length - 1) { onProgress(qi + 1, questions.length); await new Promise(resolve => setTimeout(resolve, 0)); }
      continue;
    }

    // Reconstructed body text uses 14 pt on true A4 pages with continuation pages as needed.
    const bodySize = 14, bodyLine = 19.6;
    let y = A4_HEIGHT - 74;
    const stemLines = wrappedLines(q.stem, 511, regular, bodySize, unicode, fallbackTracker);

    for (const line of stemLines) {
      if (y < 92) {
        page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
        header(page, `QUESTION ${number} / ${totalQuestions} · CONTINUED`, blue);
        y = A4_HEIGHT - 74;
      }
      page.drawText(line, { x: 42, y, size: bodySize, font: regular, color: ink });
      y -= bodyLine;
    }
    y -= 10;

    const choiceLinks = [];
    const minOptionBottom = 78;
    q.options.forEach((optionText, oi) => {
      let remainingText = safeTextForFont(optionText, regular, unicode, fallbackTracker).trim();
      let segment = 0;
      while (remainingText.length > 0 || segment === 0) {
        if (y - 38 < minOptionBottom) {
          page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
          header(page, `QUESTION ${number} / ${totalQuestions} · CONTINUED`, blue);
          y = A4_HEIGHT - 74;
        }
        const availH = y - minOptionBottom;
        const maxLinesHere = Math.max(1, Math.floor((availH - 18) / 19));
        const textX = segment === 0 ? 82 : 112;
        const segWidth = 553 - textX - 14; // 457 on segment 0, 427 on continuation
        const allLinesForWidth = wrappedLines(remainingText, segWidth, regular, bodySize, unicode, fallbackTracker);
        const slice = allLinesForWidth.length ? allLinesForWidth.slice(0, maxLinesHere) : [''];
        const leftoverLines = allLinesForWidth.slice(maxLinesHere);
        remainingText = leftoverLines.join(' ').trim();

        const segHeight = Math.max(38, slice.length * 19 + 18);
        const bottom = y - segHeight;
        page.drawRectangle({ x: 42, y: bottom, width: 511, height: segHeight, borderWidth: 1, borderColor: rgb(.75, .80, .89), color: rgb(.975, .983, 1) });
        const label = segment === 0 ? `${letters[oi]}.` : `${letters[oi]}. (cont.)`;
        page.drawText(label, { x: 52, y: y - 22, size: segment === 0 ? bodySize : 11, font: bold, color: blue });
        slice.forEach((line, row) => page.drawText(line, { x: textX, y: y - 22 - row * 19, size: bodySize, font: regular, color: ink }));
        choiceLinks.push({ page, rect: [42, bottom, 553, y] });
        segment++;
        y = bottom - 8;
        if (!remainingText) break;
      }
    });

    const result = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    for (const choice of choiceLinks) goto(doc, choice.page, choice.rect, result);
    page.drawText('Choose an option to view the answer.', { x: 42, y: 42, size: 10, font: regular, color: grey });

    const hasAnswer = Number.isInteger(q.answer);
    header(result, hasAnswer ? 'ANSWER & EXPLANATION' : 'NO ANSWER FOR THIS QUESTION.', hasAnswer ? green : amber);
    let ry = A4_HEIGHT - 74, answerPage = result;
    const qAnswerPages = [result];
    const nextAnswerPage = () => {
      const next = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      header(next, `ANSWER & EXPLANATION · QUESTION ${number} · CONTINUED`, hasAnswer ? green : amber);
      answerPage = next;
      qAnswerPages.push(next);
      ry = A4_HEIGHT - 74;
      return next;
    };
    const drawAnswerLine = (text, font, size, color, lineHeight = 19.6) => {
      for (const line of wrappedLines(text, 511, font, size, unicode, fallbackTracker)) {
        if (ry < 92) nextAnswerPage();
        answerPage.drawText(line, { x: 42, y: ry, size, font, color });
        ry -= lineHeight;
      }
    };

    if (hasAnswer) {
      for (let oi = 0; oi < q.options.length; oi++) {
        const correct = oi === q.answer;
        drawAnswerLine(`${letters[oi]}. ${q.options[oi]}${correct ? '  (Correct answer)' : ''}`, correct ? bold : regular, bodySize, correct ? green : red);
        ry -= 4;
      }
      ry -= 8;
    } else {
      drawAnswerLine('No answer for this question.', bold, bodySize, amber);
      ry -= 8;
    }

    if (ry < 120) nextAnswerPage();
    answerPage.drawText('EXPLANATION', { x: 42, y: ry, size: 14, font: bold, color: ink });
    ry -= 24;
    const sections = q.explanationSections?.length ? q.explanationSections : [q.explanation?.trim() || 'No explanation provided.'];
    for (const section of sections) {
      if (ry < 110) nextAnswerPage();
      drawAnswerLine(section, regular, bodySize, ink);
      ry -= 6;
    }

    lastAnswerPages.push(answerPage);
    for (const ap of qAnswerPages) {
      ap.drawText('Back to question', { x: 42, y: 54, size: 11, font: bold, color: blue });
      goto(doc, ap, [40, 48, 210, 68], questionStart);
    }

    if (q.visualData) {
      const figure = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      const image = await doc.embedJpg(q.visualData);
      const ratio = Math.min(511 / image.width, 690 / image.height);
      header(figure, `SOURCE FIGURE · QUESTION ${number}`, blue);
      figure.drawImage(image, { x: 42, y: A4_HEIGHT - 64 - image.height * ratio, width: image.width * ratio, height: image.height * ratio });
      figure.drawText('Back to question', { x: 42, y: 42, size: 11, font: bold, color: blue });
      goto(doc, figure, [40, 35, 210, 60], questionStart);
      questionStart.drawText('View source figure  >', { x: 42, y: 42, size: 10, font: bold, color: blue });
      goto(doc, questionStart, [40, 36, 188, 56], figure);
    }
    if (q.explanationVisualData) {
      const expFig = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      const image = await doc.embedJpg(q.explanationVisualData);
      const ratio = Math.min(511 / image.width, 690 / image.height);
      header(expFig, `EXPLANATION FIGURE · QUESTION ${number}`, green);
      expFig.drawImage(image, { x: 42, y: A4_HEIGHT - 64 - image.height * ratio, width: image.width * ratio, height: image.height * ratio });
      expFig.drawText('Back to answer', { x: 42, y: 42, size: 11, font: bold, color: blue });
      goto(doc, expFig, [40, 35, 210, 60], answerPage);
      answerPage.drawText('View explanation figure  >', { x: 225, y: 54, size: 11, font: bold, color: blue });
      goto(doc, answerPage, [220, 48, 375, 68], expFig);
    }

    if (qi % 5 === 0 || qi === questions.length - 1) { onProgress(qi + 1, questions.length); await new Promise(resolve => setTimeout(resolve, 0)); }
  }

  for (let qi = 0; qi < questionPages.length - 1; qi++) {
    const page = lastAnswerPages[qi], next = questionPages[qi + 1];
    page.drawText('Next question  >', { x: 425, y: 54, size: 11, font: bold, color: blue });
    goto(doc, page, [415, 48, 555, 68], next);
  }

  // Add consistent A4 page numbers to newly created pages
  const allPages = doc.getPages();
  const startPageIdx = existing?.originalPageCount || 0;
  for (let pi = startPageIdx; pi < allPages.length; pi++) {
    const p = allPages[pi];
    const label = `Page ${pi + 1} of ${allPages.length}`;
    p.drawText(label, { x: A4_WIDTH - 42 - regular.widthOfTextAtSize(label, 9), y: 20, size: 9, font: regular, color: grey });
  }

  doc.setTitle(safe(title));
  doc.setCreator('PDF Interactive Studio - Quiz PDF');
  doc.setKeywords(['PDF Interactive Studio quiz', `question-count:${totalQuestions}`]);
  if (!existing && includeMetadata) {
    const payload = JSON.stringify({ format: 'pdf-interactive-studio-questions-v1', title, questions });
    await doc.attach(new TextEncoder().encode(payload), 'quiz-data.json', { mimeType: 'application/json', description: 'Question data for combining PDFs' });
  }
  if (fallbackTracker.unmapped.size > 0) {
    const sample = [...fallbackTracker.unmapped].slice(0, 5).join(', ');
    throw new Error(`Unsupported script/characters (${sample}) cannot be rendered legibly with the bundled font; original visual content or original download preserved.`);
  }
  onProgress(questions.length, questions.length, 'Saving PDF');
  return {
    bytes: await doc.save({ useObjectStreams: true }),
    pages: doc.getPageCount(),
    sourcePages: totalQuestions,
    mcqs: questions.length,
    totalQuestions,
    unicodeEmbedded: unicode,
    unicodeFallbackCount: fallbackTracker.unmapped.size,
    unicodeFallbackChars: [...fallbackTracker.unmapped]
  };
}
