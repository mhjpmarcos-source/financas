/* Cópia local no aparelho (IndexedDB). Funciona sem internet. */
const DB = 'financas', ST = 'kv';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, mode), s = t.objectStore(ST);
    const req = fn(s);
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const get = k => tx('readonly', s => s.get(k));
export const set = (k, v) => tx('readwrite', s => s.put(v, k));
export const del = k => tx('readwrite', s => s.delete(k));
export const clear = () => tx('readwrite', s => s.clear());

/* pede ao navegador para não apagar os dados por falta de espaço (quando suportado) */
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* sem suporte */ }
  return false;
}
