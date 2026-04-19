const CACHE_NAME = 'acuclinic-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/style2.css',
  '/css/style3.css',
  '/js/app.js',
  '/js/db.js',
  '/js/ui.js',
  '/js/store.js',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Do not cache any API requests or Telegram requests
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname === 'api.telegram.org' ||
    url.hostname.includes('extension')
  ) {
    return event.respondWith(fetch(event.request));
  }

  // 2. Stale-While-Revalidate for everything else (HTML, JS, CSS, fonts, etc)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Only cache valid OK responses from our origin or CDNs (like fonts)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'error') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Ignore network errors (we will use cache)
      });

      // Return cached immediately if available, while network fetch updates cache in background
      return cachedResponse || fetchPromise;
    })
  );
});
