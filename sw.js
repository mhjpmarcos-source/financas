// Guarda os arquivos do próprio app para abrir sem internet. Nada do Google (login, Drive) passa por aqui.
// Ao mudar qualquer arquivo do app, aumente VERSION para os aparelhos baixarem a versão nova.
const VERSION = 'v0.1.1';
const SHELL = ['./', 'index.html', 'style.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/auth.js', 'js/calc.js', 'js/drive.js', 'js/model.js', 'js/store.js', 'js/sync.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache:'reload' ignora o cache do navegador; sem isso, a instalação podia guardar uma versão velha (defeito da Fase 0)
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // rede primeiro (sem cache do navegador), cópia guardada se estiver sem internet
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
