export const failureId = record => JSON.stringify([record.path || record.name, record.size, record.lastModified || 0]);
export function createFailureStore(factory = globalThis.indexedDB) {
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('Browser storage is unavailable.')); return; }
      const request = factory.open('pdf-interactive-failed-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', {keyPath: 'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other PDF Studio tabs and retry.'));
    });
    return connection;
  }
  async function transaction(write, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', write ? 'readwrite' : 'readonly');
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error || new Error('Saving was interrupted.'));
      tx.onerror = () => {};
      action(tx.objectStore('files'), result => { value = result; });
    });
  }
  return {
    list: () => transaction(false, (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result); }),
    put: record => transaction(true, store => store.put(record)),
    remove: id => transaction(true, store => store.delete(id)),
    async close() { if (connection) (await connection).close(); connection = null; }
  };
}
export function safeZipPath(path) {
  return String(path).replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..')
    .map(part => part.replace(/[\x00-\x1f<>:"|?*]/g, '_')).join('/') || 'source-file';
}
export async function buildFailureZip(records, createZip) {
  const zip = createZip(), used = new Set(), report = [];
  for (const record of records) {
    let path = 'originals/' + safeZipPath(record.path || record.name), count = 2;
    const base = path;
    while (used.has(path)) path = base + ` (${count++})`;
    used.add(path);
    zip.file(path, await record.blob.arrayBuffer());
    report.push({originalPath: record.path, savedPath: path, name: record.name, size: record.size,
      lastModified: record.lastModified, mode: record.mode, error: record.error,
      expectedMCQs: record.expectedMCQs, extractedMCQs: record.extractedMCQs, savedAt: record.updatedAt});
  }
  zip.file('failure-report.json', JSON.stringify({version: 1, files: report}, null, 2));
  zip.file('README.txt', 'These are unchanged originals that failed PDF conversion or were skipped.\nSee failure-report.json for each error. Extract originals/ and upload the files to PDF Interactive Studio to retry.\nNo automatic repair or content removal has been applied.\n');
  return zip.generateAsync({type: 'blob', compression: 'STORE'});
}
