// Bump this version string every time you deploy a new index.html so
// returning visitors actually get the update instead of a stale cache.
const CACHE_NAME = 'mba-planner-v71';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './app.js?v=46',
  './data.js',
  './firebase-config.js',
  './mess-menu.js',
  './menu.js',
  './icon-192.png',
  './icon-512.png',
  './views/plan.html',
  './views/daily.html',
  './views/master.html',
  './views/att.html',
  './views/compare.html',
  './views/menu.html',
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
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js',
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

  // Our own files: network first, so a deploy shows up on the very next load.
  // The cache is only the offline fallback. Pinned CDN libraries never change,
  // so those stay cache first.
  const networkFirst = isSameOrigin;

  // A weak connection can leave a request hanging for a minute. Give our own
  // files a few seconds, then use the saved copy so the app still opens.
  const NETWORK_TIMEOUT_MS = 4000;
  const fetchWithTimeout = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT_MS);
    fetch(event.request).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });

  const fromNetwork = () => (networkFirst ? fetchWithTimeout() : fetch(event.request)).then(res => {
    // A server error is no use to the app; treat it like being offline.
    if (networkFirst && res.status >= 500) throw new Error('server error ' + res.status);
    // CDN script tags are no-cors, so their responses are opaque (status 0).
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return res;
  });

  const offlineFallback = () => {
    // For a page navigation, fall back to the cached shell rather than the
    // browser's default error page.
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    // e.g. app.js?v=15 after a version bump — serve whichever copy we have.
    return caches.match(event.request, { ignoreSearch: true });
  };

  event.respondWith(
    networkFirst
      ? fromNetwork().catch(() => caches.match(event.request).then(c => c || offlineFallback()))
      : caches.match(event.request).then(cached => cached || fromNetwork().catch(offlineFallback))
  );
});

// Phone push for shared class updates. The sender (Apps Script) sends
// data-only messages; we always show a notification, because browsers revoke
// subscriptions that receive pushes without showing one.
self.addEventListener('push', event => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) {
    p = { data: { body: event.data ? event.data.text() : '' } };
  }
  const d = p.data || p.notification || p;
  event.waitUntil(self.registration.showNotification(d.title || 'Class update', {
    body: d.body || 'Open the app to see what changed.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || undefined,
    data: { ymd: d.ymd || '' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const ymd = (event.notification.data && event.notification.data.ymd) || '';
  const target = ymd ? './?date=' + encodeURIComponent(ymd) : './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) {
        c.postMessage({ type: 'open-date', ymd });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
