/* GS Stats PRO — service worker (shell offline + atualização automática) */
const CACHE = 'gs-stats-pro-shell-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api-client.js',
  './manifest.webmanifest',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Dados externos (ESPN, odds) passam direto pela rede.
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  // Sempre rede primeiro para nunca servir código antigo; cache só como fallback offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
