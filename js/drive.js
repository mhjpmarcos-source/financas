/* Acesso ao Google Drive. Permissão drive.file: o app só enxerga arquivos que ele mesmo criou. */
import * as auth from './auth.js';

export const FOLDER = 'Finanças (app)';
export const FILE = 'financas-dados.json';

export class AuthError extends Error {}

async function api(path, opt = {}) {
  const tk = auth.accessToken();
  if (!tk) throw new AuthError('Conecte-se ao Google para sincronizar.');
  let r;
  try {
    r = await fetch('https://www.googleapis.com/' + path, { ...opt, headers: { Authorization: 'Bearer ' + tk, ...(opt.headers || {}) } });
  } catch { throw new Error('Sem conexão com o Google Drive.'); }
  if (r.status === 401) { auth.expire(); throw new AuthError('O acesso ao Drive venceu. Toque em Reconectar.'); }
  if (!r.ok) {
    const t = await r.text(); let msg = t;
    try { msg = JSON.parse(t).error.message; } catch { /* texto puro */ }
    throw new Error(`Drive respondeu ${r.status}: ${String(msg).slice(0, 160)}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const qs = encodeURIComponent;
const quote = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function findOne(q) {
  const d = await api('drive/v3/files?spaces=drive&fields=files(id,name,version,modifiedTime)&orderBy=modifiedTime desc&q=' + qs(q + ' and trashed=false'));
  return d.files[0] || null;
}

export async function whoAmI() {
  const a = await api('drive/v3/about?fields=user(emailAddress,displayName)');
  return a.user;
}

async function ensureFolder() {
  const f = await findOne(`name=${quote(FOLDER)} and mimeType='application/vnd.google-apps.folder'`);
  if (f) return f.id;
  const c = await api('drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
  });
  return c.id;
}

/* arquivo de dados: procura pelo nome dentro da pasta do app */
export async function findDataFile() {
  const folder = await findOne(`name=${quote(FOLDER)} and mimeType='application/vnd.google-apps.folder'`);
  if (!folder) return null;
  return findOne(`name=${quote(FILE)} and ${quote(folder.id)} in parents`);
}

export const meta = id => api(`drive/v3/files/${id}?fields=id,version,modifiedTime,trashed`);
export const download = id => api(`drive/v3/files/${id}?alt=media`);

export async function create(json) {
  const folder = await ensureFolder();
  const b = 'fin' + Math.random().toString(36).slice(2);
  const m = { name: FILE, parents: [folder], mimeType: 'application/json' };
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(m)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
  return api('upload/drive/v3/files?uploadType=multipart&fields=id,version,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
}

export const update = (id, json) =>
  api(`upload/drive/v3/files/${id}?uploadType=media&fields=id,version,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
