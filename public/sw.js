// HM Boutique service worker
//  - Static files (hashed JS/CSS, fonts, images, icons): cache-first, so repeat visits do not wait on the network.
//  - Pages: network-first (always fresh data), with the cached copy only as an offline fallback.
//  - Everything else (API calls, server actions) is left alone.
const CACHE_NAME = 'hm-boutique-pos-v2';
const ASSETS_TO_CACHE = ['/manifest.json', '/logo.png', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : undefined)))
    )
  );
  self.clients.claim();
});

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  /\.(?:png|jpe?g|webp|svg|ico|woff2?|ttf|wav|css|js)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    // cache-first: served instantly from disk; filled in on first use
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // pages: network-first, offline fallback only
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
