const CACHE_NAME = 'propaedia-v13';
const BASE = '/NeoPropaedia/';
const OFFLINE_DOWNLOAD_HEADER = 'x-propaedia-offline-download';
const FULL_SITE_CACHE_PREFIX = 'propaedia-full-site-';
const OFFLINE_META_CACHE_NAME = 'propaedia-offline-meta-v1';
const ACTIVE_VERSION_URL = BASE + '__offline-active-version';
const DATA_CACHE_TIMEOUT_MS = 400;
const ASSET_CACHE_TIMEOUT_MS = 100;
const LARGE_DATA_NETWORK_TIMEOUT_MS = 2500;
const CACHE_DEBUG_MESSAGE_TYPE = 'propaedia-cache-debug-state';
const CACHE_DEBUG_REQUEST_TYPE = 'propaedia-cache-debug-get';
const debugStateByClientId = new Map();

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

function normalizeDebugPath(pathname) {
  const prefix = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length) || '/';
  }

  return pathname;
}

function debugBucketForRequest(request) {
  const pathname = new URL(request.url).pathname;

  if (request.mode === 'navigate') {
    return 'page';
  }

  if (pathname.endsWith('.json')) {
    return 'data';
  }

  if (
    pathname.includes('/_astro/')
    || pathname.includes('/pagefind/')
    || ['script', 'style', 'font', 'image'].includes(request.destination)
  ) {
    return 'asset';
  }

  return null;
}

async function postDebugState(clientId) {
  if (!clientId) return;

  const client = await self.clients.get(clientId);
  if (!client) return;

  client.postMessage({
    type: CACHE_DEBUG_MESSAGE_TYPE,
    state: debugStateByClientId.get(clientId) || null,
  });
}

async function updateDebugState(clientId, request, source, startedAt) {
  const bucket = debugBucketForRequest(request);
  if (!clientId || !bucket) return;

  const url = new URL(request.url);
  const previousState = debugStateByClientId.get(clientId) || {};
  debugStateByClientId.set(clientId, {
    ...previousState,
    [bucket]: {
      path: normalizeDebugPath(url.pathname),
      source,
      ms: Math.max(0, Date.now() - startedAt),
    },
    updatedAt: Date.now(),
  });

  await postDebugState(clientId);
}

async function matchOfflineRequest(cache, request, ignoreSearch) {
  if (!ignoreSearch) {
    return cache.match(request);
  }

  const requestUrl = new URL(request.url);
  requestUrl.search = '';
  requestUrl.hash = '';

  const candidates = [requestUrl.toString()];
  if (!requestUrl.pathname.endsWith('/')) {
    requestUrl.pathname += '/';
    candidates.push(requestUrl.toString());
  }

  for (const candidate of candidates) {
    const match = await cache.match(candidate);
    if (match) {
      return match;
    }
  }

  return null;
}

async function matchActiveOfflineCache(request, ignoreSearch) {
  const activeOfflineCache = await getActiveOfflineCache();
  if (!activeOfflineCache) {
    return null;
  }

  return matchOfflineRequest(activeOfflineCache, request, ignoreSearch);
}

async function matchCoreCache(request, ignoreSearch) {
  const coreCache = await caches.open(CACHE_NAME);
  const coreMatch = await matchOfflineRequest(coreCache, request, ignoreSearch);
  return {
    coreCache,
    coreMatch,
  };
}

function cacheFallbackDelay(request) {
  const pathname = new URL(request.url).pathname;

  if (pathname.endsWith('.json')) {
    if (
      pathname.includes('/library-data/')
      || pathname.includes('/section-data/')
      || pathname.includes('/circle-anchored/')
    ) {
      return null;
    }
    return DATA_CACHE_TIMEOUT_MS;
  }

  if (
    pathname.includes('/_astro/')
    || pathname.includes('/pagefind/')
    || ['script', 'style', 'font', 'image'].includes(request.destination)
  ) {
    return ASSET_CACHE_TIMEOUT_MS;
  }

  return null;
}

function networkTimeoutForRequest(request) {
  const pathname = new URL(request.url).pathname;

  if (
    pathname.endsWith('.json')
    && (
      pathname.includes('/library-data/')
      || pathname.includes('/section-data/')
      || pathname.includes('/circle-anchored/')
    )
  ) {
    return LARGE_DATA_NETWORK_TIMEOUT_MS;
  }

  return null;
}

async function fetchAndUpdateCoreCache(request) {
  const timeoutMs = networkTimeoutForRequest(request);
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = timeoutMs
    ? setTimeout(() => controller?.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetch(request, controller ? { signal: controller.signal } : undefined);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

  if (response.ok && request.headers.get(OFFLINE_DOWNLOAD_HEADER) !== '1') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== CACHE_DEBUG_REQUEST_TYPE || !event.source?.id) return;
  event.waitUntil(postDebugState(event.source.id));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.includes(BASE)) return;

  event.respondWith(
    (async () => {
      const startedAt = Date.now();
      const debugClientId = event.resultingClientId || event.clientId || null;
      const ignoreSearch = event.request.mode === 'navigate';
      const isNavigationRequest = event.request.mode === 'navigate';
      const isOfflineDownloadRequest = event.request.headers.get(OFFLINE_DOWNLOAD_HEADER) === '1';
      const coreMatches = await matchCoreCache(event.request, ignoreSearch);
      const cacheDelay = !isOfflineDownloadRequest && !isNavigationRequest && coreMatches.coreMatch
        ? cacheFallbackDelay(event.request)
        : null;

      if (!isOfflineDownloadRequest && self.navigator.onLine === false) {
        const activeOfflineMatch = await matchActiveOfflineCache(event.request, ignoreSearch);
        if (activeOfflineMatch) {
          event.waitUntil(updateDebugState(debugClientId, event.request, 'full-site cache', startedAt));
          return activeOfflineMatch;
        }

        if (coreMatches.coreMatch) {
          event.waitUntil(updateDebugState(debugClientId, event.request, 'core cache', startedAt));
          return coreMatches.coreMatch;
        }

        if (event.request.mode === 'navigate') {
          const fallback = (await coreMatches.coreCache.match(BASE)) || Response.error();
          event.waitUntil(updateDebugState(debugClientId, event.request, 'home fallback', startedAt));
          return fallback;
        }

        event.waitUntil(updateDebugState(debugClientId, event.request, 'error', startedAt));
        return Response.error();
      }

      try {
        if (coreMatches.coreMatch && cacheDelay !== null) {
          const networkResponse = fetchAndUpdateCoreCache(event.request).catch(() => null);
          const preferredResponse = await Promise.race([
            networkResponse,
            new Promise((resolve) => {
              setTimeout(() => resolve(coreMatches.coreMatch), cacheDelay);
            }),
          ]);

          if (preferredResponse) {
            const source = preferredResponse === coreMatches.coreMatch ? 'core cache (timeout)' : 'network';
            event.waitUntil(updateDebugState(debugClientId, event.request, source, startedAt));
            return preferredResponse;
          }

          event.waitUntil(updateDebugState(debugClientId, event.request, 'core cache', startedAt));
          return coreMatches.coreMatch;
        }

        const response = await fetchAndUpdateCoreCache(event.request);
        event.waitUntil(updateDebugState(debugClientId, event.request, 'network', startedAt));
        return response;
      } catch {
        if (!isOfflineDownloadRequest) {
          const activeOfflineMatch = await matchActiveOfflineCache(event.request, ignoreSearch);
          if (activeOfflineMatch) {
            event.waitUntil(updateDebugState(debugClientId, event.request, 'full-site cache (fallback)', startedAt));
            return activeOfflineMatch;
          }
        }

        if (coreMatches.coreMatch) {
          event.waitUntil(updateDebugState(debugClientId, event.request, 'core cache (fallback)', startedAt));
          return coreMatches.coreMatch;
        }

        if (event.request.mode === 'navigate') {
          const fallback = (await coreMatches.coreCache.match(BASE)) || Response.error();
          event.waitUntil(updateDebugState(debugClientId, event.request, 'home fallback', startedAt));
          return fallback;
        }

        event.waitUntil(updateDebugState(debugClientId, event.request, 'error', startedAt));
        return Response.error();
      }
    })()
  );
});
