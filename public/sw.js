const CACHE_NAME = 'propaedia-v7';
const BASE = '/NeoPropaedia/';
const OFFLINE_DOWNLOAD_HEADER = 'x-propaedia-offline-download';
const FULL_SITE_CACHE_PREFIX = 'propaedia-full-site-';
const OFFLINE_META_CACHE_NAME = 'propaedia-offline-meta-v1';
const ACTIVE_VERSION_URL = BASE + '__offline-active-version';

// Pre-cached on install: homepage, about, offline, plus Part and Division pages for core offline navigation
const PRECACHE_URLS = [
  BASE,
  BASE + 'about/',
  BASE + 'offline/',
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
        names
          .filter(
            (name) =>
              name !== CACHE_NAME
              && name !== OFFLINE_META_CACHE_NAME
              && !name.startsWith(FULL_SITE_CACHE_PREFIX),
          )
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

async function getActiveOfflineCache() {
  const metaCache = await caches.open(OFFLINE_META_CACHE_NAME);
  const response = await metaCache.match(ACTIVE_VERSION_URL);
  if (!response) return null;

  const version = (await response.text()).trim();
  if (!version) return null;

  return caches.open(`${FULL_SITE_CACHE_PREFIX}${version}`);
}

async function matchOfflineRequest(cache, request, ignoreSearch) {
  const directMatch = await cache.match(request, { ignoreSearch });
  if (directMatch || !ignoreSearch) {
    return directMatch;
  }

  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.endsWith('/')) {
    requestUrl.pathname += '/';
    const slashMatch = await cache.match(requestUrl.toString(), { ignoreSearch: true });
    if (slashMatch) return slashMatch;
  }

  return null;
}

async function matchAnyOfflineCache(request, ignoreSearch) {
  const activeOfflineCache = await getActiveOfflineCache();
  const activeOfflineMatch = activeOfflineCache
    ? await matchOfflineRequest(activeOfflineCache, request, ignoreSearch)
    : null;
  const coreCache = await caches.open(CACHE_NAME);
  const coreMatch = await matchOfflineRequest(coreCache, request, ignoreSearch);
  return {
    activeOfflineMatch,
    coreCache,
    coreMatch,
  };
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.includes(BASE)) return;

  event.respondWith(
    (async () => {
      const ignoreSearch = event.request.mode === 'navigate';
      const offlineMatches = await matchAnyOfflineCache(event.request, ignoreSearch);
      const cached = offlineMatches.activeOfflineMatch || offlineMatches.coreMatch;

      if (self.navigator.onLine === false && cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response.ok && event.request.headers.get(OFFLINE_DOWNLOAD_HEADER) !== '1') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      } catch {
        if (cached) return cached;

        if (event.request.mode === 'navigate') {
          return (await offlineMatches.coreCache.match(BASE)) || Response.error();
        }

        return Response.error();
      }
    })()
  );
});
