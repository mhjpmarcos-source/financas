/* Bloqueio do app neste aparelho: PIN (guardado só como hash PBKDF2) e, se quiser, Face ID / Touch ID (WebAuthn).
   Fica só no aparelho (não vai para o Drive). É uma tranca de tela: impede que alguém com o celular desbloqueado
   abra o app; a cópia local continua no armazenamento do navegador. Esqueceu o PIN: apaga a cópia deste aparelho
   e entra de novo com a conta Google (os dados estão no Drive). */
import * as store from './store.js';

let cfg = null, locked = false, hiddenAt = 0;
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn(locked));

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function hash(pin, salt, iter) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, k, 256));
}
const save = () => cfg ? store.set('lock', cfg) : store.del('lock');

export async function load() {
  cfg = (await store.get('lock')) || null;
  locked = enabled();
  return locked;
}
export const enabled = () => !!(cfg && cfg.pinHash);
export const isLocked = () => locked;
export const settings = () => cfg ? { after: cfg.after, pinLen: cfg.pinLen, bio: !!cfg.bio } : null;

export async function setPin(pin, after) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('O PIN deve ter de 4 a 6 números.');
  const salt = rand(16), iter = 150000;
  cfg = { ...(cfg || {}), pinSalt: b64(salt), iter, pinHash: await hash(pin, salt, iter), pinLen: pin.length, after: after ?? (cfg ? cfg.after : 0), fails: 0, until: 0 };
  await save();
}
export async function setAfter(min) { if (cfg) { cfg.after = +min || 0; await save(); } }
export async function disable() { cfg = null; locked = false; await save(); emit(); }

/* tentativas erradas: a partir da 5ª, espera 30 s, 60 s, 120 s… */
export const waitSeconds = () => cfg && cfg.until > Date.now() ? Math.ceil((cfg.until - Date.now()) / 1000) : 0;
export async function tryPin(pin) {
  if (!cfg) return true;
  if (waitSeconds()) return false;
  const ok = (await hash(pin, unb64(cfg.pinSalt), cfg.iter)) === cfg.pinHash;
  if (ok) { cfg.fails = 0; cfg.until = 0; await save(); unlock(); return true; }
  cfg.fails = (cfg.fails || 0) + 1;
  if (cfg.fails >= 5) cfg.until = Date.now() + 30000 * 2 ** Math.min(6, cfg.fails - 5);
  await save();
  return false;
}
export async function checkPin(pin) { return !!cfg && (await hash(pin, unb64(cfg.pinSalt), cfg.iter)) === cfg.pinHash; }

export async function bioAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
export async function enrollBio() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), rp: { name: 'Níquel', id: location.hostname },
    user: { id: rand(16), name: 'financas', displayName: 'Níquel' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000
  } });
  cfg.bio = b64(cred.rawId); await save();
}
export async function removeBio() { if (cfg) { delete cfg.bio; await save(); } }
export async function tryBio() {
  if (!cfg || !cfg.bio) return false;
  try {
    await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(cfg.bio) }], userVerification: 'required', timeout: 60000 } });
    cfg.fails = 0; cfg.until = 0; await save(); unlock(); return true;
  } catch { return false; }
}

export function lock() { if (enabled() && !locked) { locked = true; emit(); } }
function unlock() { locked = false; emit(); }

document.addEventListener('visibilitychange', () => {
  if (!enabled()) return;
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if (!cfg.after) lock(); }
  else if (hiddenAt && Date.now() - hiddenAt >= (cfg.after || 0) * 60000) lock();
});
