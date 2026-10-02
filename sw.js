// Bump this version string every time you deploy a new index.html so
// returning visitors actually get the update instead of a stale cache.
const CACHE_NAME = 'mba-planner-v26';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './app.js?v=15',
  './data.js',
  './icon-192.png',
  './icon-512.png',
  './views/plan.html',
  './views/daily.html',
  './views/master.html',
  './views/att.html',
  './views/compare.html',
  './views/mess.html',
  './views/admin.html',
  './components/alert-modal.html',
  './components/export-modal.html',
];

// Third-party libraries loaded by index.html. Cached so the app can boot with
// no internet. Pinned versions, so they never go stale.
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
];
const CDN_ORIGINS = ['https://cdnjs.cloudflare.com', 'https://www.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all([
      // cache: 'reload' skips the browser's HTTP cache, so a new version
      // never gets stuck with stale copies of the files.
      cache.addAll(SHELL_FILES.map(url => new Request(url, { cache: 'reload' }))),
      // A flaky CDN shouldn't block the whole install — the fetch handler
      // will pick up anything missed here on the next online load.
      ...CDN_FILES.map(url => cache.add(url).catch(err => console.warn('SW: could not cache', url, err))),
    ]))
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

  // Handle GET requests for our own origin (the static shell) and the pinned
  // CDN libraries. Everything else — Firebase reads/writes and the mess-menu
  // iframe — always goes straight to the network; Firebase handles its own
  // offline behaviour and caching it would break live data.
  const isSameOrigin = url.origin === self.location.origin;
  if (event.request.method !== 'GET' || (!isSameOrigin && !CDN_ORIGINS.includes(url.origin))) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Cache a copy of any new asset we haven't seen before. CDN script
        // tags are no-cors, so their responses are opaque (status 0).
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => {
        // Offline and not cached: for a page navigation, fall back to the
        // cached shell rather than showing the browser's default error page.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        // e.g. app.js?v=15 after a version bump — serve whichever copy we have.
        return caches.match(event.request, { ignoreSearch: true });
      });
    })
  );
});
