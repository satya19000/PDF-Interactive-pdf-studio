import {failureId, createFailureStore, buildFailureZip} from './repair-store.mjs';

export function mountFailedFiles({root, store = createFailureStore(), snapshot = () => window.getFailureCandidates?.() || {files: []}, createZip}) {
  const document = root.ownerDocument, view = document.defaultView;
  const records = new Map(), observed = new Map(), persisted = new Set();
  let conversionBusy = false, actionBusy = false, disposed = false, storageError = '';
  function node(tag, text, cls) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (cls) element.className = cls; return element; }
  function button(text, action) { const element = node('button', text, 'secondary'); element.type = 'button'; element.onclick = action; element.disabled = conversionBusy || actionBusy; return element; }
  function download(blob, name) {
    const url = view.URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove(); view.setTimeout(() => view.URL.revokeObjectURL(url), 60000);
  }
  async function retry(items) {
    if (conversionBusy || actionBusy || !items.length) return;
    actionBusy = true; render();
    view.dispatchEvent(new view.CustomEvent('pdf-retry-failed', {detail: {records: items, complete: () => { actionBusy = false; render(); }}}));
  }
  function render() {
    if (disposed) return;
    root.hidden = records.size === 0; root.replaceChildren();
    if (!records.size) return;
    root.append(node('h2', `Failed files · ${records.size} awaiting repair`));
    root.append(node('p', 'Original files and error details are kept in this browser for later retry. Download a ZIP backup to keep them outside this browser.', 'hint repair-hint'));
    const unsaved = [...records.keys()].filter(id => !persisted.has(id)).length;
    const status = node('p', unsaved ? `${unsaved} file(s) are not saved across refresh. Download the ZIP now. ${storageError}` : 'Originals saved on this device. They remain here after refresh.', unsaved ? 'error' : 'repair-saved');
    status.setAttribute('role', 'status'); root.append(status);
    const actions = node('div', undefined, 'repair-actions');
    actions.append(button('Download failed originals + error report (ZIP)', async () => {
      if (conversionBusy || actionBusy) return;
      actionBusy = true; render();
      try { const blob = await buildFailureZip([...records.values()], createZip || (() => new view.JSZip())); download(blob, 'Failed-files-for-repair.zip'); }
      catch (error) { storageError = 'ZIP could not be created: '+error.message; }
      finally { actionBusy = false; render(); if (storageError) { const message = node('p', storageError, 'error'); message.setAttribute('role', 'status'); root.append(message); } }
    }), button('Retry failed files', () => retry([...records.values()]))); root.append(actions);
    for (const record of records.values()) {
      const row = node('div', undefined, 'repair-file'), info = node('div');
      info.append(node('strong', record.path), node('p', record.error, 'error'), node('small', `${record.mode} · ${record.size.toLocaleString()} bytes · ${persisted.has(record.id) ? 'Saved' : 'Not saved across refresh'}`));
      const actions = node('div', undefined, 'repair-actions');
      actions.append(button('Download original', () => download(record.blob, record.name)), button('Retry this file', () => retry([record])));
      row.append(info, actions); root.append(row);
    }
  }
  const ready = (async () => {
    try { for (const record of await store.list()) { records.set(record.id, record); persisted.add(record.id); } }
    catch (error) { storageError = error.message; }
    render();
  })();
  let pending = ready;
  function sync(state) {
    conversionBusy = !!state.busy;
    pending = pending.then(async () => {
      for (const item of state.files || []) {
        const id = failureId(item), signature = item.success ? 'success' : item.error + '|' + item.mode;
        if (!item.error && !item.success || observed.get(id) === signature) continue;
        observed.set(id, signature);
        if (item.success) {
          if (!records.has(id)) continue;
          try { await store.remove(id); records.delete(id); persisted.delete(id); }
          catch (error) { storageError = 'Converted successfully, but the saved original could not be removed: '+error.message; }
        } else {
          const record = {id, path: item.path, name: item.file.name, size: item.size, lastModified: item.lastModified,
            type: item.file.type, blob: item.file, error: item.error, mode: item.mode,
            expectedMCQs: item.expectedMCQs ?? null, extractedMCQs: item.extractedMCQs ?? null, updatedAt: Date.now()};
          records.set(id, record); persisted.delete(id);
          try { await store.put(record); persisted.add(id); }
          catch (error) { storageError = error.message; }
        }
      }
      render();
    }).catch(error => { storageError = error.message; render(); });
    render(); return pending;
  }
  const listener = event => sync(event.detail);
  view.addEventListener('pdf-conversion-state', listener);
  sync(snapshot());
  return {ready: pending, idle: () => pending, records: () => [...records.values()], destroy() { disposed = true; view.removeEventListener('pdf-conversion-state', listener); }};
}
const root = globalThis.document?.getElementById('failedFiles');
if (root) mountFailedFiles({root});
