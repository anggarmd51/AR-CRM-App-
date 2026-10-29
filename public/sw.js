// AR Personal CRM - static app shell and asset caching only.
const CACHE_NAME = 'arcrm-cache-v2.2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
];
const PUBLIC_STATIC_PATHS = new Set([
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
]);
const STATIC_ASSET_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i;

function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin && (
    PUBLIC_STATIC_PATHS.has(url.pathname)
    || (url.pathname.startsWith('/assets/') && STATIC_ASSET_EXTENSION.test(url.pathname))
  );
}

function isCacheableResponse(response) {
  return response && response.status === 200 && response.type === 'basic';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
        return undefined;
      })))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept writes, cross-origin requests, or API responses.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for navigation; only the static app shell is used as fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }

  // Only known static assets may enter Cache Storage. Dynamic same-origin pages,
  // exports, and user-specific responses are left to the browser's network path.
  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, networkResponse))
                .catch(() => {});
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (isCacheableResponse(networkResponse)) {
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, networkResponse.clone()))
            .catch(() => {});
        }
        return networkResponse;
      });
    }),
  );
});
