/* Login com o Google. Padrão: janela (biblioteca oficial). Reserva: redirecionamento, se a janela for bloqueada.
   O acesso dura cerca de 1 hora e app só de navegador não recebe chave para renovar em segundo plano.
   Renovação silenciosa: ao abrir o app (ou voltar a ele) sem acesso válido, passa pela página do Google com
   prompt=none: se a pessoa continua logada e já autorizou, volta conectada em 1–2 s, sem tocar em nada;
   se o Google pedir alguma interação, volta sem acesso e o app mostra "Reconectar", como antes. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const K = { tok: 'fin.auth.token', state: 'fin.auth.state', hint: 'fin.auth.hint', silent: 'fin.auth.silent', silentFail: 'fin.auth.silentFail' };
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* bloqueado */ } }
};

let clientId = '', token = null, tokenClient = null, gisPromise = null, pending = null;
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn(token));

export function init(cid) {
  clientId = cid;
  try { const t = JSON.parse(ls.get(K.tok) || 'null'); if (t && t.exp > Date.now() + 60_000) token = t; else ls.set(K.tok, null); } catch { ls.set(K.tok, null); }
  handleRedirectReturn();
  if (navigator.onLine) prepare();
  addEventListener('online', prepare);
}

export const accessToken = () => (token && token.exp > Date.now() + 30_000 ? token.access : null);
export const isSignedIn = () => !!accessToken();
export const hint = () => ls.get(K.hint) || '';
export function setHint(email) { ls.set(K.hint, email || null); }

function save(access, expiresIn) {
  token = { access, exp: Date.now() + (expiresIn || 3600) * 1000 };
  ls.set(K.tok, JSON.stringify(token));
  emit();
}

export function expire() { token = null; ls.set(K.tok, null); emit(); }

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res;
    s.onerror = () => { gisPromise = null; s.remove(); rej(new Error('Não foi possível carregar o login do Google.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function prepare() {
  if (!clientId || tokenClient) return;
  try {
    await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: r => {
        const p = pending; pending = null;
        if (r.error) { p && p.rej(new Error('Login não concluído (' + r.error + ').')); return; }
        save(r.access_token, Number(r.expires_in));
        p && p.res(token.access);
      },
      error_callback: e => {
        const p = pending; pending = null;
        if (e.type === 'popup_failed_to_open') { redirect(); return; }
        p && p.rej(new Error(e.type === 'popup_closed' ? 'A janela de login foi fechada antes de terminar.' : 'Login não concluído.'));
      }
    });
    emit();
  } catch { /* sem internet: tenta de novo quando voltar */ }
}

export const ready = () => !!tokenClient;

/* precisa ser chamado direto no toque do usuário (sem espera antes), senão o iPhone bloqueia a janela */
export function signIn({ selectAccount } = {}) {
  if (!navigator.onLine) return Promise.reject(new Error('Sem internet. Os dados continuam salvos neste aparelho.'));
  if (!tokenClient) { prepare(); return Promise.reject(new Error('O login do Google ainda está carregando. Tente de novo em alguns segundos.')); }
  return new Promise((res, rej) => {
    pending = { res, rej };
    const h = hint();
    tokenClient.requestAccessToken(selectAccount || !h ? { prompt: 'select_account' } : { prompt: '', login_hint: h });
  });
}

function redirect(silent = false) {
  const state = (silent ? 's' : 'i') + Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(36)).join('');
  ls.set(K.state, state);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const p = { client_id: clientId, redirect_uri: location.origin + location.pathname, response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state };
  const h = hint(); if (h) p.login_hint = h; else p.prompt = 'select_account';
  if (silent) p.prompt = 'none';
  u.search = new URLSearchParams(p);
  location.assign(u.toString());
}

function handleRedirectReturn() {
  if (!/access_token=|error=/.test(location.hash)) return;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = ls.get(K.state); ls.set(K.state, null);
  if (!expected || p.get('state') !== expected) return;
  if (p.get('error')) { if (expected[0] === 's') ls.set(K.silentFail, String(Date.now())); return; }
  ls.set(K.silentFail, null);
  save(p.get('access_token'), Number(p.get('expires_in')));
}

/* tenta renovar sem toque. Só com internet, com a conta já conhecida, e no máximo uma vez a cada 10 minutos
   (se o Google pediu interação há pouco, não insiste: fica o botão "Reconectar"). Devolve true se saiu da página. */
export function silentRenew() {
  if (!clientId || isSignedIn() || !hint() || !navigator.onLine) return false;
  const now = Date.now(), last = +ls.get(K.silent) || 0, fail = +ls.get(K.silentFail) || 0;
  if (now - last < 10 * 60_000 || now - fail < 60 * 60_000) return false;
  ls.set(K.silent, String(now));
  redirect(true);
  return true;
}

export const lastSilentFailed = () => (+ls.get(K.silentFail) || 0) > Date.now() - 60 * 60_000;

export function signOut() {
  if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token.access), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  ls.set(K.hint, null);
  expire();
}
