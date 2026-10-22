// IndexedDB transactions serialize concurrent tabs. Revisions reject stale writes.
export class PracticeConflict extends Error {}
export function createPracticeStore(factory = globalThis.indexedDB) {
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('Local saving is unavailable. Enable browser storage.')); return; }
      const request = factory.open('pdf-interactive-cbt', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attempts', {keyPath: 'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other practice tabs and reload.'));
    });
    return connection;
  }
  async function transaction(operation, write = false) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attempts', write ? 'readwrite' : 'readonly');
      let result, error;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error || tx.error || new Error('Saving was interrupted.'));
      tx.onerror = () => {}; // onabort handles the transaction error once.
      const fail = reason => { error = reason; tx.abort(); };
      operation(tx.objectStore('attempts'), value => { result = value; }, fail);
    });
  }
  async function list() {
    return transaction((store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result.sort((a, b) => b.startedAt - a.startedAt));
    });
  }
  async function get(id) {
    return transaction((store, done) => {
      const request = store.get(id);
      request.onsuccess = () => done(request.result || null);
    });
  }
  async function start(attempt, now = Date.now()) {
    return transaction((store, done, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        for (const prior of request.result) {
          if (prior.submittedAt != null) continue;
          if (prior.endsAt > now) { fail(new PracticeConflict('Another paper is already active. It has been resumed.')); return; }
          store.put({...prior, submittedAt: prior.endsAt, revision: (prior.revision || 0) + 1});
        }
        const saved = {...attempt, revision: 0};
        store.add(saved);
        done(saved);
      };
    }, true);
  }
  async function update(id, revision, patch = {}, submit = false, now = Date.now()) {
    return transaction((store, done, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const saved = request.result;
        if (!saved) { fail(new Error('This saved paper could not be found.')); return; }
        if (saved.submittedAt != null) { done(saved); return; }
        // Expiry submits the stored answers, never stale answers from another tab.
        if (now >= saved.endsAt) {
          const ended = {...saved, submittedAt: saved.endsAt, revision: (saved.revision || 0) + 1};
          store.put(ended); done(ended); return;
        }
        if ((saved.revision || 0) !== revision) {
          fail(new PracticeConflict('Another tab changed this paper. The latest saved answers have been restored.'));
          return;
        }
        const allowed = {};
        for (const key of ['answers', 'flags', 'bookmarks', 'index']) if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
        const next = {...saved, ...allowed, revision: revision + 1, submittedAt: submit ? now : null};
        store.put(next); done(next);
      };
    }, true);
  }
  async function close() { if (connection) (await connection).close(); connection = null; }
  return {list, get, start, update, close};
}
