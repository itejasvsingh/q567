// Bump this version string every time you deploy a new index.html so
// returning visitors actually get the update instead of a stale cache.
const CACHE_NAME = 'mba-planner-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests for our own origin (the static shell). Everything
  // else — Firebase reads/writes, the CDN scripts (html2canvas, xlsx, gstatic
  // firebase SDKs), and the mess-menu iframe — always goes straight to the
  // network. Caching those would either break live data (Firebase) or serve
  // stale third-party scripts.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Cache a copy of any new same-origin asset we haven't seen before.
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return res;
      }).catch(() => {
        // Offline and not cached: for a page navigation, fall back to the
        // cached shell rather than showing the browser's default error page.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
