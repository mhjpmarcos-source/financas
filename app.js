'use strict';
/* Finanças · Fase 0 — prova de conceito: login Google + gravar/ler um arquivo no Drive do usuário.
   Escopo drive.file: o app só acessa arquivos que ele mesmo criou. */

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Finanças (app)';
const FILE = 'teste-conexao.json';
const LS = { cid: 'fin.cfg.clientId', tok: 'fin.auth.token', state: 'fin.auth.state' };

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* bloqueado */ } }
};

/* ---------- registro na tela ---------- */
function log(msg, kind = '') {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = new Date().toLocaleTimeString('pt-BR') + ' · ' + msg;
  $('#log').prepend(li);
}

/* ---------- ambiente ---------- */
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function deviceLabel() {
  const ua = navigator.userAgent;
  const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'outro';
  const br = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge'
    : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'outro';
  return dev + ' · ' + br;
}

function storageOk() {
  try { localStorage.setItem('fin.t', '1'); localStorage.removeItem('fin.t'); return true; } catch { return false; }
}

async function renderEnv() {
  const rows = [
    ['Modo', isStandalone() ? 'App instalado' : 'Navegador'],
    ['Aparelho', deviceLabel()],
    ['Endereço seguro', location.protocol === 'https:' || location.hostname === 'localhost' ? 'Sim' : 'Não (login não funciona)'],
    ['Armazenamento local', storageOk() ? 'Disponível' : 'Bloqueado'],
    ['Banco local (IndexedDB)', 'indexedDB' in window ? 'Disponível' : 'Indisponível'],
    ['Funciona sem internet', 'serviceWorker' in navigator ? 'Preparando…' : 'Não suportado'],
    ['Conexão', navigator.onLine ? 'Online' : 'Offline']
  ];
  $('#envList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd data-k="${k}">${v}</dd>`).join('');
}
function setEnv(k, v) { const dd = document.querySelector(`#envList dd[data-k="${k}"]`); if (dd) dd.textContent = v; }

/* ---------- configuração ---------- */
const redirectUri = () => location.origin + location.pathname;

function clientId(silent) {
  const cid = (window.FIN_CONFIG && FIN_CONFIG.clientId) || store.get(LS.cid) || '';
  if (!cid && !silent) log('Informe o ID do cliente na seção 2 antes de entrar.', 'err');
  return cid;
}

function saveClientId() {
  const v = $('#cid').value.trim();
  if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { log('Esse ID não parece um ID de cliente do Google (deve terminar em .apps.googleusercontent.com).', 'err'); return; }
  store.set(LS.cid, v || null);
  log(v ? 'ID do cliente salvo neste aparelho.' : 'ID do cliente apagado.', 'ok');
  tokenClient = null;
  prepGis();
  render();
}

/* ---------- sessão ---------- */
let token = null;

function loadToken() {
  try {
    const t = JSON.parse(store.get(LS.tok) || 'null');
    if (t && t.exp > Date.now() + 60_000) token = t; else store.set(LS.tok, null);
  } catch { store.set(LS.tok, null); }
}

function saveToken(access, expiresIn, method) {
  token = { access, exp: Date.now() + expiresIn * 1000, method };
  store.set(LS.tok, JSON.stringify(token));
  render();
  showAccount();
}

function clearToken() { token = null; store.set(LS.tok, null); render(); }

/* login por redirecionamento: a página vai ao Google e volta com o acesso no endereço */
function loginRedirect() {
  const cid = clientId(); if (!cid) return;
  const state = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(36)).join('');
  store.set(LS.state, state);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: cid, redirect_uri: redirectUri(), response_type: 'token',
    scope: SCOPE, include_granted_scopes: 'true', state, prompt: 'select_account'
  });
  log('Indo para o login do Google…');
  location.assign(u.toString());
}

function handleRedirectReturn() {
  if (!/access_token=|error=/.test(location.hash)) return;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = store.get(LS.state); store.set(LS.state, null);
  if (p.get('error')) { log('Login não concluído: ' + p.get('error'), 'err'); return; }
  if (!expected || p.get('state') !== expected) { log('Resposta de login descartada: o código de verificação não confere.', 'err'); return; }
  saveToken(p.get('access_token'), Number(p.get('expires_in')) || 3600, 'redirecionamento');
  log('Login por redirecionamento concluído.', 'ok');
}

/* login por janela (biblioteca oficial do Google) */
let gisPromise = null, tokenClient = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res;
    s.onerror = () => { gisPromise = null; rej(new Error('Não foi possível carregar o login do Google (sem internet?).')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function prepGis() {
  const cid = clientId(true); if (!cid) return;
  try {
    await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cid, scope: SCOPE, prompt: 'select_account',
      callback: r => {
        if (r.error) { log('Login não concluído: ' + r.error, 'err'); return; }
        saveToken(r.access_token, Number(r.expires_in) || 3600, 'janela');
        log('Login por janela concluído.', 'ok');
      },
      error_callback: e => {
        const why = { popup_failed_to_open: 'o aparelho bloqueou a janela', popup_closed: 'a janela foi fechada antes de terminar' }[e.type] || e.type || 'erro';
        log('Login por janela: ' + why + '.', 'err');
      }
    });
    render();
  } catch (e) { log(e.message, 'err'); }
}

function loginPopup() {
  if (!clientId()) return;
  if (!tokenClient) { log('O login por janela ainda está carregando. Tente em alguns segundos.', 'err'); return; }
  tokenClient.requestAccessToken(); // precisa ser chamado direto no toque, sem espera antes
}

function logout() {
  if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token.access), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  clearToken();
  $('#driveOut').innerHTML = '';
  log('Saiu. O acesso deste aparelho ao Drive foi revogado.', 'ok');
}

/* ---------- Drive ---------- */
async function api(path, opt = {}) {
  if (!token || token.exp < Date.now()) { clearToken(); throw new Error('Sessão vencida. Entre de novo.'); }
  const r = await fetch('https://www.googleapis.com/' + path, {
    ...opt, headers: { Authorization: 'Bearer ' + token.access, ...(opt.headers || {}) }
  });
  if (r.status === 401) { clearToken(); throw new Error('O Google recusou o acesso (sessão vencida). Entre de novo.'); }
  if (!r.ok) {
    const t = await r.text();
    let msg = t; try { msg = JSON.parse(t).error.message; } catch { /* texto puro */ }
    throw new Error(`Drive respondeu ${r.status}: ${String(msg).slice(0, 200)}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const qs = s => encodeURIComponent(s);
const quote = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function findOne(query) {
  const d = await api('drive/v3/files?spaces=drive&fields=files(id,name,modifiedTime)&q=' + qs(query + ' and trashed=false'));
  return d.files[0] || null;
}

async function ensureFolder() {
  const f = await findOne(`name=${quote(FOLDER)} and mimeType='application/vnd.google-apps.folder'`);
  if (f) return f.id;
  const c = await api('drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
  });
  log(`Pasta "${FOLDER}" criada no seu Drive.`, 'ok');
  return c.id;
}

async function showAccount() {
  try {
    const a = await api('drive/v3/about?fields=user(emailAddress,displayName)');
    $('#authStatus').textContent = 'Conectado como ' + a.user.emailAddress + ' (' + token.method + ')';
  } catch (e) { log(e.message, 'err'); }
}

async function writeTest() {
  busy(true);
  try {
    const folder = await ensureFolder();
    const existing = await findOne(`name=${quote(FILE)} and ${quote(folder)} in parents`);
    let prev = null;
    if (existing) { try { prev = await api(`drive/v3/files/${existing.id}?alt=media`); } catch { /* arquivo ilegível: recomeça */ } }
    const entries = (prev && Array.isArray(prev.gravacoes) ? prev.gravacoes : []).slice(-19);
    entries.push({ quando: new Date().toISOString(), aparelho: deviceLabel(), modo: isStandalone() ? 'app instalado' : 'navegador', login: token.method });
    const json = JSON.stringify({ app: 'Finanças', formato: 0, gravacoes: entries }, null, 2);

    if (existing) {
      await api(`upload/drive/v3/files/${existing.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
    } else {
      const b = 'fin' + Math.random().toString(36).slice(2);
      const meta = { name: FILE, parents: [folder], mimeType: 'application/json' };
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
      await api('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    }
    log('Gravação no Drive concluída.', 'ok');
    await readTest(true);
  } catch (e) { log(e.message, 'err'); }
  finally { busy(false); }
}

async function readTest(quiet) {
  if (!quiet) busy(true);
  try {
    const folder = await findOne(`name=${quote(FOLDER)} and mimeType='application/vnd.google-apps.folder'`);
    const f = folder && await findOne(`name=${quote(FILE)} and ${quote(folder.id)} in parents`);
    if (!f) { $('#driveOut').innerHTML = '<p class="hint">Ainda não há gravação. Toque em "Gravar teste".</p>'; return; }
    const d = await api(`drive/v3/files/${f.id}?alt=media`);
    const rows = (d.gravacoes || []).slice().reverse().map(g =>
      `<tr><td>${new Date(g.quando).toLocaleString('pt-BR')}</td><td>${esc(g.aparelho)}</td><td>${esc(g.modo)}</td><td>${esc(g.login)}</td></tr>`).join('');
    $('#driveOut').innerHTML = `<table><thead><tr><th>Quando</th><th>Aparelho</th><th>Modo</th><th>Login</th></tr></thead><tbody>${rows}</tbody></table>`;
    if (!quiet) log('Leitura do Drive concluída: ' + (d.gravacoes || []).length + ' gravação(ões).', 'ok');
  } catch (e) { log(e.message, 'err'); }
  finally { if (!quiet) busy(false); }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- tela ---------- */
let isBusy = false;
function busy(v) { isBusy = v; render(); }

function render() {
  const hasCid = !!clientId(true);
  const on = !!token;
  $('#btnPopup').disabled = !hasCid || !tokenClient || isBusy;
  $('#btnRedirect').disabled = !hasCid || isBusy;
  $('#btnWrite').disabled = !on || isBusy;
  $('#btnRead').disabled = !on || isBusy;
  $('#btnLogout').hidden = !on;
  const st = $('#authStatus');
  st.classList.toggle('on', on);
  if (!on) st.textContent = 'Não conectado.';
}

function copyLog() {
  const txt = [...document.querySelectorAll('#envList dt')].map(dt => dt.textContent + ': ' + dt.nextElementSibling.textContent).join('\n')
    + '\n\n' + [...document.querySelectorAll('#log li')].map(li => li.textContent).join('\n');
  navigator.clipboard.writeText(txt).then(() => log('Registro copiado.', 'ok'), () => log('Não foi possível copiar.', 'err'));
}

/* ---------- início ---------- */
async function init() {
  await renderEnv();
  $('#origin').textContent = location.origin;
  $('#redir').textContent = redirectUri();
  $('#cid').value = clientId(true);
  if (window.FIN_CONFIG && FIN_CONFIG.clientId) { $('#cid').disabled = true; $('#btnSaveCid').hidden = true; }

  $('#btnSaveCid').onclick = saveClientId;
  $('#btnPopup').onclick = loginPopup;
  $('#btnRedirect').onclick = loginRedirect;
  $('#btnLogout').onclick = logout;
  $('#btnWrite').onclick = writeTest;
  $('#btnRead').onclick = () => readTest(false);
  $('#btnCopy').onclick = copyLog;
  addEventListener('online', () => setEnv('Conexão', 'Online'));
  addEventListener('offline', () => setEnv('Conexão', 'Offline'));

  loadToken();
  handleRedirectReturn();
  render();
  if (token) showAccount();
  prepGis();

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); setEnv('Funciona sem internet', 'Sim'); }
    catch { setEnv('Funciona sem internet', 'Não (falha ao preparar)'); }
  }
}
init();
