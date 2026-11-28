/* All processing is local. No file bytes leave the browser. */
const $ = id => document.getElementById(id);
const allowed = new Set('pdf docx pptx xlsx xls csv tsv txt md json html htm png jpg jpeg webp bmp gif'.split(' '));
let queue = [], outputs = [], busy = false, cancelRequested = false;
let combineQueue = [], combinedUrl = null;

const ext = name => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const stem = name => name.replace(/\.[^.]+$/, '');
const human = n => n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const pluralFiles = n => `${n} ${n === 1 ? 'file' : 'files'}`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function relPath(file) {
  return file._relativePath || file.webkitRelativePath || file.name;
}

function render() {
  $('count').textContent = pluralFiles(queue.length);
  $('queue').replaceChildren();
  if (!queue.length) {
    const empty = el('div', 'empty', 'Your conversion queue will appear here.');
    empty.append(document.createElement('br'), el('small', '', 'Files are processed one by one. A failure in one file will not stop the rest.'));
    $('queue').append(empty);
  }
  for (const item of queue) {
    const row = el('div', 'file');
    row.append(el('div', 'fileicon', (ext(item.file.name) || 'FILE').toUpperCase().slice(0, 5)));
    const info = el('div', 'fileinfo');
    info.append(
      el('div', 'filename', relPath(item.file)),
      el('div', 'filemeta' + (item.error ? ' error' : item.warn ? ' warn' : ''), item.error || `${human(item.file.size)} · ${item.state || 'Ready'}`)
    );
    const itemOutputs = outputs.filter(o => o.sourceItem === item);
    row.append(info);
    if (itemOutputs.length) {
      const primary = itemOutputs[0];
      const download = el('a', 'download', itemOutputs.length > 1 ? `Download (${itemOutputs.length})` : 'Download');
      download.href = primary.url;
      download.download = primary.name;
      row.append(download);
    }
    const remove = el('button', 'textbtn', '×');
    remove.setAttribute('aria-label', 'Remove ' + item.file.name);
    remove.disabled = busy;
    remove.onclick = () => { queue = queue.filter(i => i !== item); render(); };
    row.append(remove);
    $('queue').append(row);
  }
  $('convert').disabled = busy || !queue.length;
  $('cancel').hidden = !busy;
  $('cancel').disabled = cancelRequested;
  $('clear').disabled = busy || !queue.length;
  $('files').disabled = busy;
  if ($('folder')) $('folder').disabled = busy;
  $('demo').disabled = busy;
  $('title').disabled = busy;
}

function add(files) {
  if (busy) return;
  let added = 0;
  for (const file of files) {
    const path = relPath(file);
    if (queue.some(i => relPath(i.file) === path && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue;
    const bad = !allowed.has(ext(file.name));
    queue.push({
      file,
      unsupported: bad,
      error: null,
      state: bad ? 'Unsupported format · original download only' : 'Ready'
    });
    added++;
  }
  render();
  $('status').textContent = added
    ? `${pluralFiles(added)} added. Click Convert to process sequentially.`
    : 'These files are already in your queue.';
}

async function collectDroppedEntries(dataTransfer) {
  const items = dataTransfer?.items ? [...dataTransfer.items] : [];
  const entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer?.files || [])];
  const collected = [];
  async function walk(entry, prefix = '') {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      const fullPath = prefix ? `${prefix}/${file.name}` : file.name;
      try { Object.defineProperty(file, '_relativePath', { value: fullPath, configurable: true }); } catch {}
      collected.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name);
      } while (batch.length);
    }
  }
  for (const entry of entries) await walk(entry);
  return collected;
}

$('files').onchange = e => { add(e.target.files); e.target.value = ''; };
if ($('folder')) $('folder').onchange = e => { add(e.target.files); e.target.value = ''; };
$('drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('files').click(); } };
for (const type of ['dragenter', 'dragover']) $('drop').addEventListener(type, e => { e.preventDefault(); $('drop').classList.add('drag'); });
for (const type of ['dragleave', 'drop']) $('drop').addEventListener(type, e => { e.preventDefault(); $('drop').classList.remove('drag'); });
$('drop').addEventListener('drop', async e => {
  const files = await collectDroppedEntries(e.dataTransfer);
  add(files);
});
$('clear').onclick = () => {
  outputs.forEach(o => URL.revokeObjectURL(o.url));
  outputs = [];
  queue = [];
  showOutputs();
  render();
  $('progress').hidden = true;
  $('status').textContent = 'Add a file to get started.';
};
$('cancel').onclick = () => {
  if (!busy) return;
  cancelRequested = true;
  $('cancel').disabled = true;
  $('status').textContent = 'Cancelling after current step… completed downloads remain available.';
};
$('demo').onclick = () => add([new File([
  'Q1. What is the first-line lifestyle advice for impaired fasting glucose?\nA. Antibiotics\nB. Diet and exercise\nC. Anticoagulation\nD. Surgery\nAnswer: B\nExplanation: Diet and exercise are the initial measures.'
], 'Sample question bank.txt', { type: 'text/plain' })]);

async function rasterImage(data) {
  const url = data instanceof Blob ? URL.createObjectURL(data) : data;
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const scale = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, im.naturalWidth * scale);
    c.height = Math.max(1, im.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .92);
  } finally {
    if (data instanceof Blob) URL.revokeObjectURL(url);
  }
}

async function contentBlocks(file) {
  const type = ext(file.name), buf = await file.arrayBuffer();
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(type)) return [{ image: await rasterImage(file), isScan: true }];
  if (type === 'docx') {
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const dom = new DOMParser().parseFromString(result.value, 'text/html');
    const blocks = [];
    for (const node of dom.body.children) {
      if (node.textContent.trim()) blocks.push({ text: node.textContent });
      for (const im of node.querySelectorAll('img')) {
        if (im.src.startsWith('data:image/')) {
          try { blocks.push({ image: await rasterImage(im.src) }); }
          catch { blocks.push({ text: '[An embedded image could not be converted.]' }); }
        }
      }
    }
    return blocks;
  }
  if (type === 'pptx') {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]));
    const blocks = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const dom = new DOMParser().parseFromString(await zip.file(name).async('text'), 'application/xml');
      const texts = Array.from(dom.getElementsByTagNameNS('*', 't')).map(n => n.textContent);
      blocks.push({ text: `Slide ${i + 1}\n\n${texts.join('\n')}`, newPage: true });
      const relName = name.replace('/slides/', '/slides/_rels/') + '.rels';
      const relFile = zip.file(relName);
      if (relFile) {
        const rel = new DOMParser().parseFromString(await relFile.async('text'), 'application/xml');
        const targets = new Map(Array.from(rel.getElementsByTagName('Relationship'))
          .filter(n => n.getAttribute('TargetMode') !== 'External')
          .map(n => [n.getAttribute('Id'), n.getAttribute('Target')]));
        for (const blip of Array.from(dom.getElementsByTagNameNS('*', 'blip'))) {
          const rid = blip.getAttribute('r:embed'), target = targets.get(rid);
          if (!target) continue;
          const parts = ('ppt/slides/' + target).split('/'), clean = [];
          for (const p of parts) { if (p === '..') clean.pop(); else if (p !== '.') clean.push(p); }
          const asset = zip.file(clean.join('/'));
          if (asset) {
            try { blocks.push({ image: await rasterImage(new Blob([await asset.async('uint8array')])) }); }
            catch { blocks.push({ text: '[Unsupported slide graphic. Export the presentation to PDF for full fidelity.]' }); }
          }
        }
      }
    }
    return blocks;
  }
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(type)) {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    return wb.SheetNames.map(n => ({ text: n + '\n\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: '  |  ' }), newPage: true }));
  }
  let text = await file.text();
  if (type === 'html' || type === 'htm') {
    const dom = new DOMParser().parseFromString(text, 'text/html');
    dom.querySelectorAll('script,style,iframe,object,embed').forEach(n => n.remove());
    dom.querySelectorAll('p,div,br,li,h1,h2,h3,tr').forEach(n => n.append('\n'));
    text = dom.body.textContent;
  }
  return [{ text }];
}

// Create a true A4 (595.28 x 841.89 pt) PDF with selectable 14 pt vector text.
async function makeSource(file, titleText = '') {
  if (ext(file.name) === 'pdf') {
    try {
      return await PDFLib.PDFDocument.load(await file.arrayBuffer());
    } catch {
      throw new Error('This PDF is corrupt or password-protected and cannot be opened.');
    }
  }
  const { A4_WIDTH, A4_HEIGHT, safeTextForFont, embedStudioFonts } = await import('./quiz.mjs?v=20261124c');
  const { PDFDocument, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const { regular, bold, unicode } = await embedStudioFonts(doc);
  const fallbackTracker = { transliterated: new Set(), unmapped: new Set() };
  const safe = t => safeTextForFont(t, regular, unicode, fallbackTracker);
  const ink = rgb(.09, .14, .22), grey = rgb(.42, .48, .58);
  const heading = safe(titleText || stem(file.name));
  const raw = await contentBlocks(file);
  const blocks = [];
  for (const b of raw) {
    const prev = blocks[blocks.length - 1];
    if (b.text && prev?.text && !b.newPage) prev.text += '\n\n' + b.text;
    else blocks.push(b);
  }

  const fontSize = 14, lineHeight = 19.6, left = 42, maxW = A4_WIDTH - 84, topY = A4_HEIGHT - 68, bottomY = 52;
  const newA4Page = () => {
    const p = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    let short = heading;
    while (short.length && bold.widthOfTextAtSize(short, 11) > maxW) short = short.slice(0, -1);
    if (short !== heading) short = short.slice(0, -3) + '...';
    p.drawText(short, { x: left, y: A4_HEIGHT - 32, size: 11, font: bold, color: grey });
    p.drawLine({ start: { x: left, y: A4_HEIGHT - 40 }, end: { x: A4_WIDTH - left, y: A4_HEIGHT - 40 }, thickness: .5, color: rgb(.84, .87, .92) });
    return p;
  };

  for (const b of blocks) {
    if (b.image) {
      const im = await doc.embedJpg(b.image);
      const page = newA4Page();
      const k = Math.min(maxW / im.width, (topY - bottomY) / im.height);
      page.drawImage(im, {
        x: (A4_WIDTH - im.width * k) / 2,
        y: bottomY + (topY - bottomY - im.height * k) / 2,
        width: im.width * k,
        height: im.height * k
      });
      continue;
    }
    const text = safeTextForFont((b.text || '').replace(/\r/g, '').replace(/\t/g, '    '), regular, unicode, fallbackTracker);
    if (!text.trim()) continue;
    let page = newA4Page(), y = topY;
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { y -= lineHeight * .6; if (y < bottomY) { page = newA4Page(); y = topY; } continue; }
      let line = '';
      for (let word of words) {
        if (regular.widthOfTextAtSize((line ? line + ' ' : '') + word, fontSize) <= maxW) {
          line += (line ? ' ' : '') + word;
          continue;
        }
        if (line) {
          if (y < bottomY) { page = newA4Page(); y = topY; }
          page.drawText(line, { x: left, y, size: fontSize, font: regular, color: ink });
          y -= lineHeight;
          line = '';
        }
        while (regular.widthOfTextAtSize(word, fontSize) > maxW) {
          let chunk = '';
          for (const ch of word) {
            if (regular.widthOfTextAtSize(chunk + ch, fontSize) > maxW) break;
            chunk += ch;
          }
          if (!chunk) break;
          if (y < bottomY) { page = newA4Page(); y = topY; }
          page.drawText(chunk, { x: left, y, size: fontSize, font: regular, color: ink });
          y -= lineHeight;
          word = word.slice(chunk.length);
        }
        line = word;
      }
      if (line) {
        if (y < bottomY) { page = newA4Page(); y = topY; }
        page.drawText(line, { x: left, y, size: fontSize, font: regular, color: ink });
        y -= lineHeight;
      }
    }
  }
  if (fallbackTracker.unmapped.size > 0) {
    const sample = [...fallbackTracker.unmapped].slice(0, 5).join(', ');
    throw new Error(`Unsupported script/characters (${sample}) cannot be rendered legibly with bundled fonts without script shaping; unchanged original kept downloadable.`);
  }
  if (!doc.getPageCount()) throw new Error('No readable text or images were found in this file.');
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const label = `Page ${i + 1} of ${pages.length}`;
    pages[i].drawText(label, { x: A4_WIDTH - left - regular.widthOfTextAtSize(label, 9), y: 20, size: 9, font: regular, color: grey });
  }
  return doc;
}

function uniqueOutputName(baseOrDesired, suffix = '') {
  const lower = s => s.toLowerCase();
  if (!suffix) {
    const m = /^(.*?)(-partial-quiz\.pdf|-quiz\.pdf|-A4-formatted\.pdf|-conversion-report\.txt)$/i.exec(baseOrDesired);
    if (m) { baseOrDesired = m[1]; suffix = m[2]; }
  }
  let name = baseOrDesired + suffix, n = 2;
  while (outputs.some(o => lower(o.name) === lower(name))) {
    if (suffix) name = `${baseOrDesired}-${n}${suffix}`;
    else {
      const dot = baseOrDesired.lastIndexOf('.');
      name = dot > 0 ? `${baseOrDesired.slice(0, dot)}-${n}${baseOrDesired.slice(dot)}` : `${baseOrDesired}-${n}`;
    }
    n++;
  }
  return name;
}

function showOutputs() {
  $('results').hidden = !outputs.length;
  $('zip').hidden = outputs.length <= 1;
  $('outputs').replaceChildren();

  const grouped = new Map();
  for (const o of outputs) {
    const key = o.groupKey || o.name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(o);
  }

  for (const [, list] of grouped) {
    if (list.length > 1 && list.some(o => o.isPart)) {
      const headerRow = el('div', 'output');
      const title = el('div', 'filename', list[0].sourceName || list[0].name);
      title.append(el('small', '', `${list.length} parts · ${list.reduce((s, o) => s + (o.mcqs || 0), 0)} total MCQs`));
      headerRow.append(el('div', 'fileicon', 'PDF'), title);
      $('outputs').append(headerRow);
      const wrap = el('div', 'part-group');
      for (const o of list) wrap.append(renderOutputRow(o));
      $('outputs').append(wrap);
    } else {
      for (const o of list) $('outputs').append(renderOutputRow(o));
    }
  }
}

function renderOutputRow(o) {
  const row = el('div', 'output');
  const info = el('div', 'filename', o.name);
  let meta = '';
  if (o.resultType === 'original') {
    meta = `Original download — formatting unavailable. ${o.reason || ''}`;
  } else if (o.resultType === 'already-interactive') {
    meta = `Already interactive — unchanged. ${o.mcqs} questions · ${o.pages} pages · ${human(o.blob.size)}`;
  } else if (o.resultType === 'formatted') {
    meta = `A4 formatted copy — not interactive. ${o.pages} pages · ${human(o.blob.size)}${o.note ? ' · ' + o.note : ''}`;
  } else if (o.resultType === 'partial-quiz') {
    meta = `Partial interactive quiz. ${o.mcqs} MCQs · ${o.pages} pages · ${human(o.blob.size)}${o.note ? ' · ' + o.note : ''}`;
  } else if (o.resultType === 'report') {
    meta = `Conversion report · ${human(o.blob.size)}`;
  } else {
    meta = `Interactive quiz. ${o.mcqs} MCQs · ${o.pages} pages · ${human(o.blob.size)}`;
  }
  info.append(el('small', '', meta));
  const a = el('a', 'download', o.resultType === 'report' ? 'Download report' : o.resultType === 'original' ? 'Download original' : 'Download PDF');
  a.href = o.url;
  a.download = o.name;
  row.append(el('div', 'fileicon', o.resultType === 'report' ? 'TXT' : 'PDF'), info, a);
  return row;
}

async function formattedFallback(item, reason) {
  const file = item.file, title = $('title').value.trim() || stem(file.name);
  const safeBase = (title.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 90) || stem(file.name));
  if (item.unsupported) {
    outputs.push({
      sourceItem: item, blob: file, url: URL.createObjectURL(file),
      name: uniqueOutputName(file.name), resultType: 'original',
      reason: 'Unsupported file type.', pages: 0, mcqs: 0
    });
    item.state = 'Original download — formatting unavailable (unsupported format).';
    return;
  }
  try {
    let source = await makeSource(file, title);
    let reflowed = ext(file.name) !== 'pdf';
    if (ext(file.name) === 'pdf') {
      if (!source.getPages().some(p => p.node.Resources()?.lookup(PDFLib.PDFName.of('XObject')))) {
        const { getDocument, GlobalWorkerOptions } = await import('./vendor/pdf.mjs');
        GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', location.href).href;
        const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
          const texts = []; let safe = true;
          const { textLinesFromItems } = await import('./quiz.mjs?v=20261124c');
          for (let n = 1; n <= pdf.numPages; n++) {
            const p = await pdf.getPage(n), items = (await p.getTextContent()).items;
            const ops = await p.getOperatorList();
            if (ops.fnArray.some(op => op === 91) || !items.some(i => i.str?.trim())) safe = false;
            texts.push(textLinesFromItems(items).join('\n'));
            p.cleanup?.();
          }
          const { embedStudioFonts, hasGlyph } = await import('./quiz.mjs?v=20261124c');
          if (safe) {
            const probeDoc = await PDFLib.PDFDocument.create();
            const probeFonts = await embedStudioFonts(probeDoc);
            const allTxt = texts.join('');
            const hasUnrenderable = [...allTxt].some(ch => ch !== '\n' && !hasGlyph(probeFonts.regular, ch, probeFonts.unicode));
            if (hasUnrenderable) safe = false;
          }
          if (safe) {
            source = await makeSource(new File([texts.join('\n\n')], stem(file.name) + '.txt'), title);
            reflowed = true;
          }
        } finally { await pdf.destroy(); }
      }
      if (!reflowed) {
        const { A4_WIDTH, A4_HEIGHT } = await import('./quiz.mjs?v=20261124c');
        source = await PDFLib.PDFDocument.load(new Uint8Array(await source.save()));
        const doc = await PDFLib.PDFDocument.create();
        for (const page of source.getPages()) {
          const embedded = await doc.embedPage(page);
          const out = doc.addPage([A4_WIDTH, A4_HEIGHT]);
          const k = Math.min((A4_WIDTH - 40) / embedded.width, (A4_HEIGHT - 40) / embedded.height);
          out.drawPage(embedded, {
            x: (A4_WIDTH - embedded.width * k) / 2,
            y: (A4_HEIGHT - embedded.height * k) / 2,
            width: embedded.width * k,
            height: embedded.height * k
          });
        }
        source = doc;
      }
    }
    source.setTitle(title);
    source.setCreator('PDF Interactive Studio - A4 formatted copy');
    const blob = new Blob([await source.save()], { type: 'application/pdf' });
    const name = uniqueOutputName(`${safeBase}-A4-formatted.pdf`);
    const note = reflowed
      ? 'Reflowed selectable text: 14 pt on true A4.'
      : 'Original visual content scaled proportionally onto A4; embedded lettering remains part of the image.';
    outputs.push({
      sourceItem: item, blob, url: URL.createObjectURL(blob),
      name, pages: source.getPageCount(), mcqs: 0,
      resultType: 'formatted', formatted: true, note
    });
    item.state = `A4 formatted copy — not an interactive quiz. ${note}`;
  } catch (e) {
    outputs.push({
      sourceItem: item, blob: file, url: URL.createObjectURL(file),
      name: uniqueOutputName(file.name), resultType: 'original',
      reason: e.message || reason || 'Formatting could not complete.', pages: 0, mcqs: 0
    });
    item.state = 'Original download — formatting unavailable: ' + (e.message || reason);
  }
}

function setProgress(value, message) {
  $('progress').hidden = false;
  $('progress').value = Math.max(0, Math.min(100, value));
  $('progress').setAttribute('aria-label', message);
  $('status').textContent = message;
}

function docxQuizText(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body, lines = [];
  function visit(node, depth = 0) {
    if (!/^(OL|UL)$/.test(node.tagName)) {
      if (node.querySelector('ol,ul')) for (const child of node.children) visit(child, depth);
      else if (node.textContent.trim()) lines.push(node.textContent.trim());
      return;
    }
    const items = [...node.children].filter(x => x.tagName === 'LI');
    let n = Number(node.getAttribute('start') || 1);
    for (const li of items) {
      if (li.hasAttribute('value')) n = Number(li.getAttribute('value'));
      const copy = li.cloneNode(true); copy.querySelectorAll('ol,ul').forEach(x => x.remove());
      const t = copy.textContent.trim();
      const labelled = /^(?:(?:Q(?:uestion)?\s*)?\d+[.)]|[A-E][.)]|\([A-E]\)|ans(?:wer)?\b|explanation\b)/i.test(t);
      const alpha = /^[aA]$/.test(node.getAttribute('type') || '') || (depth > 0 && items.length >= 2 && items.length <= 5);
      if (t) lines.push((labelled ? '' : alpha && n >= 1 && n <= 5 ? 'ABCDE'[n - 1] + '. ' : node.tagName === 'OL' && !depth ? n + '. ' : '') + t);
      for (const list of li.querySelectorAll('ol,ul')) if (list.parentElement.closest('li') === li) visit(list, depth + 1);
      n++;
    }
  }
  for (const node of body.children) visit(node);
  return lines.join('\n');
}

let ocrScriptPromise;
function loadOcrEngine() {
  if (!ocrScriptPromise) ocrScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'vendor/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('OCR engine could not load.'));
    document.head.append(script);
  });
  return ocrScriptPromise;
}

async function ocrPdfPages(pdfjs, pages, report, recognizeScannedPage) {
  await loadOcrEngine();
  const root = new URL('./vendor/', location.href).href;
  let worker; const recognized = new Map(), imageQuestions = [];
  try {
    report(0, `Loading English OCR model for ${pages.length} scanned page(s)…`);
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: root + 'worker.min.js', corePath: root + 'ocr-core', langPath: root + 'ocr-lang', workerBlobURL: false
    });
    for (let index = 0; index < pages.length; index++) {
      if (cancelRequested) throw new Error('Conversion cancelled by user.');
      const number = pages[index], page = await pdfjs.getPage(number), base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 2400 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const result = await recognizeScannedPage(canvas, worker, number, imageQuestions.at(-1));
        if (result.kind === 'question') imageQuestions.push(result.question);
        else if (result.kind === 'feedback') {
          const question = imageQuestions.at(-1);
          question.answer = result.answer; question.explanation = result.explanation; question.verified = true;
        } else recognized.set(number, result.text || '');
        report((index + 1) / pages.length, `OCR page ${index + 1} of ${pages.length} · source page ${number} · ${imageQuestions.length} MCQs found`);
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup?.(); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally { await worker?.terminate(); }
  return { recognized, imageQuestions };
}

async function inspectExistingInteractivePdf(file) {
  if (ext(file.name) !== 'pdf') return null;
  const { getDocument, GlobalWorkerOptions, PDFDataRangeTransport } = await import('./vendor/pdf.mjs');
  GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', location.href).href;
  const useRange = file.size >= 24 * 1024 * 1024;
  let task;
  if (useRange) {
    const first = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    let rejectRead, aborted = false;
    const readError = new Promise((_, reject) => { rejectRead = reject; });
    class FileRange extends PDFDataRangeTransport {
      requestDataRange(begin, end) {
        file.slice(begin, end).arrayBuffer().then(data => { if (!aborted) this.onDataRange(begin, new Uint8Array(data)); }).catch(rejectRead);
      }
      abort() { aborted = true; }
    }
    task = getDocument({ range: new FileRange(file.size, first), disableAutoFetch: true, disableStream: true });
    try {
      const pdf = await Promise.race([task.promise, readError]);
      return await checkInteractiveMetadata(pdf, file);
    } finally { await task.destroy(); }
  } else {
    task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      return await checkInteractiveMetadata(pdf, file);
    } finally { await task.destroy(); }
  }
}

async function checkInteractiveMetadata(pdf, file) {
  const { info } = await pdf.getMetadata();
  const isStudioCreator = info?.Creator === 'PDF Interactive Studio - Quiz PDF';
  const page1 = await pdf.getPage(1);
  const text1 = (await page1.getTextContent()).items.map(i => i.str || '').join(' ');
  const annots1 = await page1.getAnnotations();
  page1.cleanup?.();
  let questionCount = Number(/question-count:(\d+)/.exec(info?.Keywords || '')?.[1]);
  if (!questionCount) questionCount = Number(/QUESTION\s+1\s*\/\s*(\d+)/i.exec(text1)?.[1]);
  const looksInteractive = isStudioCreator || (/QUESTION\s+1\s*\/\s*\d+/i.test(text1) && annots1.some(a => a.subtype === 'Link'));
  if (!looksInteractive) return null;
  return {
    questionCount: Number.isSafeInteger(questionCount) && questionCount > 0 ? questionCount : null,
    originalPageCount: pdf.numPages,
    title: info?.Title || stem(file.name),
    hasMetadata: isStudioCreator
  };
}

async function extractQuiz(item, report = setProgress) {
  const {
    parseBmj, parseMyPastest, parseStructured, structuredQuestionCount,
    structuredSpreadsheet, hasStructuredAnswerKey, parseVisualOptionBank,
    textLinesFromItems, inferBmjAnswerColors, captureBmjFigures,
    captureMyPastestFigures, captureVisualFigures, recognizeScannedPage,
    extractPairedImageBank
  } = await import('./quiz.mjs?v=20261124c');

  item.unresolvedIndices = [];
  item.countVerified = false;
  item.estimatedMCQs = null;
  item.expectedMCQs = null;

  const structured = text => {
    const count = structuredQuestionCount(text);
    const questions = parseStructured(text);
    item.expectedMCQs = count;
    item.countVerified = count > 0 && questions.length === count;
    if (!questions.length && count) {
      throw new Error('Numbered questions found, but the options format could not be read.');
    }
    if (count > questions.length) {
      const parsedNums = new Set(questions.map(q => q.sourceNumber));
      for (let k = 1; k <= count; k++) if (!parsedNums.has(k)) item.unresolvedIndices.push(k);
    }
    return questions;
  };

  const type = ext(item.file.name);
  if (type === 'docx') {
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await item.file.arrayBuffer() });
    return structured(docxQuizText(value));
  }
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(type)) {
    const book = XLSX.read(new Uint8Array(await item.file.arrayBuffer()), { type: 'array' });
    const sheets = book.SheetNames.map(n => structuredSpreadsheet(XLSX.utils.sheet_to_json(book.Sheets[n], { header: 1, defval: '' }))).filter(Boolean);
    if (!sheets.length) throw new Error('No supported question table found. Use Question, Option A, Option B, and optional Answer columns.');
    const combined = sheets.join('\n');
    return structured(combined);
  }
  if (type === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('./vendor/pdf.mjs');
    GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', location.href).href;
    const pdfjs = await getDocument({ data: new Uint8Array(await item.file.arrayBuffer()), disableFontFace: true }).promise;
    try {
      const pages = [];
      for (let p = 1; p <= pdfjs.numPages; p++) {
        if (cancelRequested) throw new Error('Conversion cancelled by user.');
        const page = await pdfjs.getPage(p);
        pages.push((await page.getTextContent()).items);
        page.cleanup?.();
        if (p % 10 === 0 || p === pdfjs.numPages) {
          item.state = `Reading ${p}/${pdfjs.numPages} pages`;
          report(p / pdfjs.numPages * 50, `${item.file.name}: reading page ${p} of ${pdfjs.numPages}`);
          render();
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // Paired screenshot bank check (allow minor OCR/stream variance, validate actual regions inside extractPairedImageBank)
      const pageLabelHits = pages.filter((items, index) => {
        const compact = items.map(i => i.str || '').join(' ').replace(/\s+/g, ' ').trim();
        return new RegExp('Page\\s*(?:' + (index + 1) + '\\s*of\\s*' + pdfjs.numPages + '|of\\s*' + (index + 1) + '\\s*' + pdfjs.numPages + ')\\b', 'i').test(compact);
      }).length;
      if (pdfjs.numPages >= 2 && pdfjs.numPages % 2 === 0 && pageLabelHits >= Math.max(2, Math.floor(pdfjs.numPages * 0.8))) {
        item.state = `Preserving 0/${pdfjs.numPages / 2} source pairs`; render();
        const { questions, unresolvedPairs, totalPairs } = await extractPairedImageBank(
          pdfjs,
          (done, total) => {
            item.state = `Preserving ${done}/${total} source questions`;
            report(50 + done / total * 35, `${item.file.name}: preserved ${done} of ${total} question/answer pairs`);
            render();
          },
          { allowPartial: true, shouldCancel: () => cancelRequested }
        );
        if (questions.length) {
          item.expectedMCQs = totalPairs;
          item.countVerified = questions.length === totalPairs && unresolvedPairs.length === 0;
          item.unresolvedIndices = unresolvedPairs.map(u => `Q${u.index} (pp. ${u.pages})`);
          return questions;
        }
      }

      const myPastest = parseMyPastest(pages);
      if (myPastest.length) {
        item.expectedMCQs = new Set(pages.flatMap(items => items.map(i => /questionIndex=(\d+)/i.exec(i.str || '')).filter(Boolean).map(m => m[1]))).size;
        item.countVerified = myPastest.length === item.expectedMCQs;
        item.state = 'Preserving clinical figures…'; render();
        await captureMyPastestFigures(pdfjs, myPastest, (done, total) => report(55 + done / total * 30, `${item.file.name}: checking figures ${done}/${total}`));
        return myPastest;
      }

      const bmj = parseBmj(pages);
      if (bmj.length) {
        item.expectedMCQs = new Set(pages.flatMap(items => items.map(i => /Question\s+(\d+)\s+of\s+(\d+)/i.exec(i.str || '')).filter(Boolean).map(m => `${m[2]}-${m[1]}`))).size;
        item.countVerified = bmj.length === item.expectedMCQs;
        await inferBmjAnswerColors(pdfjs, bmj, (done, total) => {
          item.state = `Checking answer key ${done}/${total}`;
          report(50 + done / total * 25, `${item.file.name}: checking answers ${done} of ${total}`);
          render();
        });
        item.state = 'Preserving question & explanation figures…'; report(75, `${item.file.name}: preserving figures`); render();
        await captureBmjFigures(pdfjs, bmj, (done, total) => report(75 + done / total * 5, `${item.file.name}: preserving figure ${done} of ${total}`));
        return bmj;
      }

      const pageTexts = pages.map(items => textLinesFromItems(items).join('\n'));
      const raw = pageTexts.join('\n');
      const count = structuredQuestionCount(raw);
      if (hasStructuredAnswerKey(raw) && !count) throw new Error('Answer key found, but numbered questions could not be matched safely.');
      if (count && (hasStructuredAnswerKey(raw) || (parseStructured(raw).length && pageTexts.every(t => t.trim())))) return structured(raw);

      const visual = parseVisualOptionBank(pages);
      if (visual.length) {
        item.estimatedMCQs = pages.length;
        item.countVerified = false;
        item.state = `Found ${visual.length} questions`;
        report(55, `${item.file.name}: ${visual.length} questions found; preserving source tables`);
        render();
        await captureVisualFigures(pdfjs, visual);
        return visual;
      }

      const scanned = pageTexts.map((text, index) => text.trim().length < 180 ? index + 1 : null).filter(Boolean);
      if (!scanned.length) return structured(raw);

      item.state = `OCR: 0/${scanned.length} pages`; render();
      const { recognized, imageQuestions } = await ocrPdfPages(pdfjs, scanned, (fraction, message) => {
        item.state = `OCR: ${Math.round(fraction * scanned.length)}/${scanned.length} pages`;
        report(50 + fraction * 35, `${item.file.name}: ${message}`);
        render();
      }, recognizeScannedPage);
      for (const [number, text] of recognized) pageTexts[number - 1] = text;
      const ocrText = pageTexts.join('\n');
      const questions = [...parseStructured(ocrText), ...imageQuestions];
      if (!imageQuestions.length) item.estimatedMCQs = structuredQuestionCount(ocrText) || null;
      item.countVerified = false;
      if (!questions.length) { item.skipReason = `OCR read ${scanned.length} page(s); no MCQs recognized`; return []; }
      return questions;
    } finally { await pdfjs.destroy(); }
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(type)) {
    await loadOcrEngine();
    const root = new URL('./vendor/', location.href).href;
    let worker;
    try {
      report(10, `${item.file.name}: loading OCR model`);
      worker = await Tesseract.createWorker('eng', 1, { workerPath: root + 'worker.min.js', corePath: root + 'ocr-core', langPath: root + 'ocr-lang', workerBlobURL: false });
      const { data } = await worker.recognize(await rasterImage(item.file));
      report(80, `${item.file.name}: OCR complete`);
      const qs = parseStructured(data.text || '');
      item.estimatedMCQs = structuredQuestionCount(data.text || '') || qs.length || null;
      item.countVerified = false;
      return qs;
    } finally { await worker?.terminate(); }
  }

  const blocks = await contentBlocks(item.file), text = blocks.map(b => b.text || '').join('\n');
  return structured(text);
}

function buildConversionReport(item, extractedCount, resultLabel) {
  const lines = [
    `PDF Interactive Studio — Conversion Report`,
    `File: ${relPath(item.file)}`,
    `Result: ${resultLabel}`,
    `Verified source count: ${item.countVerified && Number.isInteger(item.expectedMCQs) ? item.expectedMCQs : 'Not verified'}`,
    `Estimated source count: ${!item.countVerified && Number.isInteger(item.estimatedMCQs || item.expectedMCQs) ? (item.estimatedMCQs || item.expectedMCQs) : 'N/A'}`,
    `Successfully converted MCQs: ${extractedCount}`,
    `Unresolved or missing question indices: ${item.unresolvedIndices?.length ? item.unresolvedIndices.join(', ') : 'None recorded'}`,
    `Completeness verified: ${item.countVerified ? 'Yes' : 'No (estimated or partial)'}`,
    `Preserved original-format content: A4 formatted copy and/or unchanged original kept downloadable.`
  ];
  return lines.join('\n');
}

async function convert() {
  if (busy) return;
  busy = true;
  cancelRequested = false;
  outputs.forEach(o => URL.revokeObjectURL(o.url));
  outputs = [];
  showOutputs();
  render();

  const { buildQuizPdf, splitQuestionsIntoParts } = await import('./quiz.mjs?v=20261124c');
  let done = 0;

  try {
    for (const item of queue) {
      if (cancelRequested) {
        item.state = 'Cancelled before processing';
        continue;
      }
      item.error = null;
      item.warn = false;
      item.expectedMCQs = null;
      item.estimatedMCQs = null;
      item.unresolvedIndices = [];
      item.countVerified = false;
      item.skipReason = null;
      item.state = 'Analyzing…';
      render();

      if (item.unsupported) {
        await formattedFallback(item, 'Unsupported file type.');
        done++;
        setProgress(done / queue.length * 100, `Processed ${done} of ${pluralFiles(queue.length)}`);
        render(); showOutputs();
        continue;
      }

      try {
        const previous = await inspectExistingInteractivePdf(item.file);
        if (previous) {
          const isLegacy6Page = previous.questionCount && previous.originalPageCount === previous.questionCount * 6;
          if (!isLegacy6Page) {
            outputs.push({
              sourceItem: item, blob: item.file, url: URL.createObjectURL(item.file),
              name: uniqueOutputName(item.file.name), resultType: 'already-interactive',
              pages: previous.originalPageCount, mcqs: previous.questionCount || 0
            });
            item.state = 'Already interactive — original pages and links retained.';
            done++;
            setProgress(done / queue.length * 100, `Processed ${done} of ${pluralFiles(queue.length)}`);
            render(); showOutputs();
            continue;
          }
          const { getDocument, GlobalWorkerOptions } = await import('./vendor/pdf.mjs');
          const { extractLegacyQuizPdf } = await import('./quiz.mjs?v=20261124c');
          GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', location.href).href;
          const pdfjs = await getDocument({ data: new Uint8Array(await item.file.arrayBuffer()) }).promise;
          try {
            item.questions = await extractLegacyQuizPdf(pdfjs, (current, total) => setProgress((done + current / total * .75) / queue.length * 90, `${item.file.name}: upgrading ${current}/${total}`));
          } finally { await pdfjs.destroy(); }
          item.expectedMCQs = previous.questionCount;
          item.countVerified = item.questions.length === previous.questionCount;
        } else {
          item.questions = await extractQuiz(item, (value, message) => setProgress((done + value / 100) / queue.length * 90, `${item.file.name}: ${message}`));
        }

        if (!item.questions.length) {
          await formattedFallback(item, item.skipReason || 'No MCQs recognized');
        } else {
          const title = $('title').value.trim() || previous?.title || stem(item.file.name);
          const safeBase = title.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 90) || stem(item.file.name);
          const isPartial = !item.countVerified || (Number.isInteger(item.expectedMCQs) && item.questions.length !== item.expectedMCQs);

          const hasImages = item.questions.some(q => q.imageQuestionData);
          const maxPerPart = hasImages ? 40 : 120;
          const parts = splitQuestionsIntoParts(item.questions, maxPerPart);
          let runningStart = 0;

          for (let pi = 0; pi < parts.length; pi++) {
            if (cancelRequested) throw new Error('Conversion cancelled by user.');
            const partQs = parts[pi];
            const result = await buildQuizPdf(
              partQs, title,
              (c, t) => setProgress((done + .75 + c / t * .2) / queue.length * 100, `${item.file.name}: building ${c}/${t}`),
              null,
              { startNumber: runningStart, totalQuestions: item.questions.length }
            );
            runningStart += partQs.length;
            const blob = new Blob([result.bytes], { type: 'application/pdf' });
            const partSuffix = parts.length > 1 ? `-Part-${String(pi + 1).padStart(2, '0')}` : '';
            const defaultName = isPartial ? `${safeBase}${partSuffix}-partial-quiz.pdf` : `${safeBase}${partSuffix}-quiz.pdf`;
            outputs.push({
              ...result,
              sourceItem: item,
              sourceName: item.file.name,
              groupKey: parts.length > 1 ? `group-${item.file.name}-${done}` : null,
              isPart: parts.length > 1,
              blob,
              url: URL.createObjectURL(blob),
              name: uniqueOutputName(defaultName),
              resultType: isPartial ? 'partial-quiz' : 'quiz',
              note: isPartial ? `Coverage warning: ${item.questions.length} of ${item.expectedMCQs || item.estimatedMCQs || '?'} questions converted; completeness not verified.` : '',
              bytes: undefined
            });
          }

          if (isPartial) {
            item.warn = true;
            item.state = `Partial interactive quiz · ${item.questions.length} MCQs converted (completeness not verified).`;
            const reportText = buildConversionReport(item, item.questions.length, 'Partial interactive quiz');
            const reportBlob = new Blob([reportText], { type: 'text/plain' });
            outputs.push({
              sourceItem: item, blob: reportBlob, url: URL.createObjectURL(reportBlob),
              name: uniqueOutputName(`${safeBase}-conversion-report.txt`), resultType: 'report', pages: 0, mcqs: 0
            });
            await formattedFallback(item, 'Partial extraction fallback');
          } else {
            item.state = `Interactive quiz · ${item.questions.length}/${item.expectedMCQs} MCQs`;
          }
        }
      } catch (e) {
        if (cancelRequested) {
          item.state = 'Cancelled by user.';
        } else {
          await formattedFallback(item, e.message || 'Could not extract quiz');
        }
      }

      done++;
      setProgress(done / queue.length * 100, `Processed ${done} of ${pluralFiles(queue.length)}`);
      render();
      showOutputs();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    busy = false;
    cancelRequested = false;
    render();
    showOutputs();
    if (outputs.length) $('results').scrollIntoView?.({ behavior: 'smooth' });
  }
}

$('convert').onclick = convert;
$('zip').onclick = async () => {
  if (!outputs.length) return;
  $('zip').disabled = true; $('zip').textContent = 'Preparing ZIP…';
  try {
    const zip = new JSZip();
    for (const o of outputs) zip.file(o.name, await o.blob.arrayBuffer());
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = 'Interactive-PDFs.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    $('status').textContent = 'ZIP could not be created. Download the files individually.';
  } finally {
    $('zip').disabled = false; $('zip').textContent = 'Download all as ZIP';
  }
};

function renderCombineList() {
  const list = $('combineList');
  if (!list) return;
  list.replaceChildren();
  list.hidden = !combineQueue.length;
  combineQueue.forEach((file, idx) => {
    const row = el('div', 'combine-row');
    row.append(el('span', '', `${idx + 1}. ${file.name} (${human(file.size)})`));
    const up = el('button', 'secondary', '↑'); up.disabled = idx === 0;
    up.onclick = () => { [combineQueue[idx - 1], combineQueue[idx]] = [combineQueue[idx], combineQueue[idx - 1]]; renderCombineList(); };
    const down = el('button', 'secondary', '↓'); down.disabled = idx === combineQueue.length - 1;
    down.onclick = () => { [combineQueue[idx + 1], combineQueue[idx]] = [combineQueue[idx], combineQueue[idx + 1]]; renderCombineList(); };
    const rm = el('button', 'textbtn', '×');
    rm.onclick = () => { combineQueue.splice(idx, 1); renderCombineList(); };
    row.append(up, down, rm);
    list.append(row);
  });
  $('combineDownloaded').disabled = combineQueue.length < 2;
  if ($('combineMergeFallback')) $('combineMergeFallback').hidden = true;
  $('combineDownload').hidden = true;
  $('combineStatus').textContent = combineQueue.length ? `${pluralFiles(combineQueue.length)} selected in the order shown above.` : '';
}

$('combineFiles').onchange = e => {
  combineQueue = [...e.target.files];
  renderCombineList();
};

$('combineDownloaded').onclick = async () => {
  if (combineQueue.length < 2) return;
  $('combineDownloaded').disabled = true;
  $('combineDownload').hidden = true;
  if ($('combineMergeFallback')) $('combineMergeFallback').hidden = true;
  try {
    const { getDocument, GlobalWorkerOptions } = await import('./vendor/pdf.mjs');
    const { buildQuizPdf, findDuplicateQuestions } = await import('./quiz.mjs?v=20261124c');
    GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', location.href).href;
    const all = [];
    for (let i = 0; i < combineQueue.length; i++) {
      $('combineStatus').textContent = `Reading quiz ${i + 1} of ${combineQueue.length}: ${combineQueue[i].name}`;
      const pdf = await getDocument({ data: new Uint8Array(await combineQueue[i].arrayBuffer()) }).promise;
      try {
        const attachment = (await pdf.getAttachments())?.['quiz-data.json'];
        if (!attachment?.content) {
          throw new Error(`${combineQueue[i].name} has no embedded quiz-data.json metadata, so safe continuous renumbering is not possible. You can use "Page-preserving merge" below instead.`);
        }
        const payload = JSON.parse(new TextDecoder().decode(attachment.content));
        if (payload.format !== 'pdf-interactive-studio-questions-v1' || !Array.isArray(payload.questions) || !payload.questions.length) {
          throw new Error(`${combineQueue[i].name}: invalid quiz metadata. Use "Page-preserving merge" below instead.`);
        }
        all.push(...payload.questions);
      } finally { await pdf.destroy(); }
    }
    const dupes = findDuplicateQuestions(all);
    const title = $('combineTitle').value.trim() || stem(combineQueue[0].name).replace(/-quiz$/i, '');
    const result = await buildQuizPdf(all, title, (done, total) => {
      $('combineStatus').textContent = `Building ${done} / ${total} questions…`;
    });
    if (combinedUrl) URL.revokeObjectURL(combinedUrl);
    combinedUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
    const link = $('combineDownload');
    link.href = combinedUrl;
    link.download = (title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'Combined-quiz') + '-combined-quiz.pdf';
    link.hidden = false;
    $('combineStatus').textContent = `Ready: ${all.length} questions from ${pluralFiles(combineQueue.length)}, numbered 1–${all.length}.` +
      (dupes.length ? `\nNote: ${dupes.length} identical duplicate question(s) detected (retained, not deleted): e.g. Q${dupes[0].firstIndex} & Q${dupes[0].duplicateIndex}.` : '');
  } catch (e) {
    $('combineStatus').textContent = e.message || 'Could not combine these PDFs with renumbering.';
    if ($('combineMergeFallback')) $('combineMergeFallback').hidden = false;
  } finally {
    $('combineDownloaded').disabled = combineQueue.length < 2;
  }
};

if ($('combineMergeFallback')) {
  $('combineMergeFallback').onclick = async () => {
    if (combineQueue.length < 2) return;
    $('combineMergeFallback').disabled = true;
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (let i = 0; i < combineQueue.length; i++) {
        $('combineStatus').textContent = `Merging pages from ${combineQueue[i].name} (${i + 1}/${combineQueue.length})…`;
        const src = await PDFLib.PDFDocument.load(await combineQueue[i].arrayBuffer());
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      }
      const title = $('combineTitle').value.trim() || stem(combineQueue[0].name).replace(/-quiz$/i, '');
      merged.setTitle(title);
      merged.setCreator('PDF Interactive Studio - Merged PDF');
      if (combinedUrl) URL.revokeObjectURL(combinedUrl);
      combinedUrl = URL.createObjectURL(new Blob([await merged.save()], { type: 'application/pdf' }));
      const link = $('combineDownload');
      link.href = combinedUrl;
      link.download = (title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'Merged-quiz') + '-merged.pdf';
      link.hidden = false;
      $('combineStatus').textContent = `Page-preserving merge ready (${merged.getPageCount()} pages). Original pages kept without renumbering.`;
    } catch (e) {
      $('combineStatus').textContent = 'Page-preserving merge failed: ' + (e.message || 'Check that none of the PDFs are password-protected.');
    } finally {
      $('combineMergeFallback').disabled = false;
    }
  };
}

if (document.modelContext?.registerTool) {
  try {
    document.modelContext.registerTool({
      name: 'get_conversion_queue',
      description: 'Read local file conversion status and generated PDF names.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        busy,
        files: queue.map(i => ({ name: relPath(i.file), status: i.error || i.state || 'Ready' })),
        outputs: outputs.map(o => ({ name: o.name, pages: o.pages, resultType: o.resultType }))
      })
    });
  } catch (e) { console.warn('Optional agent tools unavailable'); }
}

render();
