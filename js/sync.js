/* Dados do usuário: cópia no aparelho (sempre) + arquivo no Drive (quando há internet e login).
   Cada alteração é salva primeiro no aparelho e enviada ao Drive logo depois.
   Se o Drive tiver mudado por outro aparelho, as duas cópias são juntadas registro a registro. */
import * as store from './store.js';
import * as drive from './drive.js';
import * as auth from './auth.js';
import * as model from './model.js';

let S = null;
let info = { fileId: null, version: null, dirty: false, lastSync: 0, email: '' };
let status = { state: 'local', msg: '' };
let running = false, again = false, timer = null;

const dataListeners = new Set(), statusListeners = new Set();
export const onData = fn => dataListeners.add(fn);
export const onStatus = fn => statusListeners.add(fn);
const emitData = () => dataListeners.forEach(fn => fn(S));
function setStatus(state, msg = '') { status = { state, msg }; statusListeners.forEach(fn => fn(status)); }

export const state = () => S;
export const syncInfo = () => ({ ...info });
export const currentStatus = () => status;

export async function load() {
  S = await store.get('state');
  info = Object.assign(info, (await store.get('sync')) || {});
  if (S) S = model.migrate(S);
  setStatus(navigator.onLine ? (auth.isSignedIn() ? 'local' : 'login') : 'offline');
  return S;
}

const saveInfo = () => store.set('sync', info);

/* aplica uma alteração e grava no aparelho; o envio ao Drive acontece em seguida */
export async function commit(mutator) {
  if (!S) S = model.emptyState();
  mutator(S);
  S.updatedAt = Date.now();
  await store.set('state', S);
  info.dirty = true; await saveInfo();
  emitData();
  schedule(1200);
}

/* substitui tudo (primeira configuração ou importação de backup) */
export async function replace(newState) {
  S = model.migrate(newState);
  S.updatedAt = Date.now();
  await store.set('state', S);
  info.dirty = true; await saveInfo();
  emitData();
  schedule(200);
}

export async function setEmail(email) { info.email = email || ''; await saveInfo(); }

/* apaga a cópia deste aparelho (os dados no Drive continuam) */
export async function forgetDevice() {
  clearTimeout(timer);
  S = null; info = { fileId: null, version: null, dirty: false, lastSync: 0, email: '' };
  await store.clear();
  emitData();
}

export function schedule(ms = 1200) { clearTimeout(timer); timer = setTimeout(() => sync(), ms); }

export async function sync() {
  if (running) { again = true; return; }
  if (!navigator.onLine) { setStatus('offline'); return; }
  if (!auth.isSignedIn()) { setStatus('login'); return; }
  running = true; setStatus('syncing');
  try {
    if (!info.fileId) {
      const f = await drive.findDataFile();
      if (f) { info.fileId = f.id; info.version = null; }
    }
    let remote = null, remoteVer = null;
    if (info.fileId) {
      let m = null;
      try { m = await drive.meta(info.fileId); } catch (e) { if (!/ 404:/.test(e.message)) throw e; }
      if (!m || m.trashed) { info.fileId = null; info.version = null; }
      else {
        remoteVer = String(m.version);
        if (remoteVer !== info.version) {
          remote = await drive.download(info.fileId);
          if (!model.isState(remote)) throw new Error('O arquivo do Drive não está no formato esperado.');
        }
      }
    }

    if (remote) {
      const remoteM = model.migrate(remote);
      const merged = S ? model.merge(S, remoteM) : remoteM;
      const localChanged = !S || model.digest(merged) !== model.digest(S);
      S = merged;
      if (localChanged) { await store.set('state', S); emitData(); }
      info.version = remoteVer;
      info.dirty = model.digest(merged) !== model.digest(remoteM);
    }

    if (S && S.config.setupDone) {
      if (!info.fileId) {
        const c = await drive.create(JSON.stringify(S));
        info.fileId = c.id; info.version = String(c.version); info.dirty = false;
      } else if (info.dirty) {
        const u = await drive.update(info.fileId, JSON.stringify(S));
        info.version = String(u.version); info.dirty = false;
      }
    }
    info.lastSync = Date.now();
    await saveInfo();
    setStatus('ok');
  } catch (e) {
    await saveInfo().catch(() => {});
    if (e instanceof drive.AuthError) setStatus('login', e.message);
    else setStatus(navigator.onLine ? 'error' : 'offline', e.message);
  } finally {
    running = false;
    if (again) { again = false; schedule(300); }
  }
}

/* verifica se há dados no Drive desta conta (usado no primeiro acesso) */
export async function remoteExists() {
  const f = await drive.findDataFile();
  return !!f;
}

addEventListener('online', () => schedule(500));
addEventListener('offline', () => setStatus('offline'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 120_000);
auth.onChange(() => { if (auth.isSignedIn()) schedule(100); else setStatus(navigator.onLine ? 'login' : 'offline'); });
