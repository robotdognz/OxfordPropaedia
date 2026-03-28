const CACHE_NAME = 'propaedia-v4';
const BASE = '/NeoPropaedia/';

// Pre-cached on install: Part and Division pages for core offline navigation
const PRECACHE_URLS = [
  BASE,
  BASE + 'about/',
  // Part pages
  ...Array.from({ length: 10 }, (_, i) => BASE + 'part/' + (i + 1) + '/'),
  // Division pages are added dynamically by the build step below
];

// Division URLs injected at build time (placeholder replaced by post-build script)
const DIVISION_URLS = /*INJECT_DIVISION_URLS*/[];
PRECACHE_URLS.push(...DIVISION_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Failed to pre-cache:', url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.includes(BASE)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
