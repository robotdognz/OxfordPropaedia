import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

interface OfflineManifestEntry {
  url: string;
  bytes: number;
}

interface OfflineManifest {
  version: string;
  generatedAt: string;
  totalFiles: number;
  totalBytes: number;
  urls: OfflineManifestEntry[];
}

interface OfflineSiteCachePanelProps {
  baseUrl: string;
}

type PanelStatus = 'loading' | 'ready' | 'downloading' | 'complete' | 'error' | 'unsupported' | 'clearing';

const FULL_SITE_CACHE_PREFIX = 'propaedia-full-site-';
const OFFLINE_META_CACHE_NAME = 'propaedia-offline-meta-v1';
const OFFLINE_ACTIVE_VERSION_KEY = '__offline-active-version';
const OFFLINE_DOWNLOAD_HEADER = 'X-Propaedia-Offline-Download';
const DOWNLOAD_CONCURRENCY = 6;

interface DownloadFailure {
  url: string;
  isQuota: boolean;
}

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function currentCacheName(version: string): string {
  return `${FULL_SITE_CACHE_PREFIX}${version}`;
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return error.name === 'QuotaExceededError'
    || message.includes('quota')
    || message.includes('storage')
    || message.includes('space');
}

function activeVersionRequestUrl(baseUrl: string): string {
  return joinBaseUrl(baseUrl, OFFLINE_ACTIVE_VERSION_KEY);
}

async function cleanupOfflineCaches(keepNames: string[] = []): Promise<void> {
  const keep = new Set(keepNames.filter(Boolean));
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(FULL_SITE_CACHE_PREFIX) && !keep.has(name))
      .map((name) => caches.delete(name)),
  );
}

async function readActiveOfflineVersion(baseUrl: string): Promise<string | null> {
  const metaCache = await caches.open(OFFLINE_META_CACHE_NAME);
  const response = await metaCache.match(activeVersionRequestUrl(baseUrl));
  if (!response) return null;

  const version = (await response.text()).trim();
  return version || null;
}

async function writeActiveOfflineVersion(baseUrl: string, version: string | null): Promise<void> {
  const metaCache = await caches.open(OFFLINE_META_CACHE_NAME);
  const requestUrl = activeVersionRequestUrl(baseUrl);

  if (!version) {
    await metaCache.delete(requestUrl);
    return;
  }

  await metaCache.put(
    requestUrl,
    new Response(version, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    }),
  );
}

async function resolveActiveOfflineVersion(baseUrl: string, preferredVersion?: string): Promise<string | null> {
  const names = await caches.keys();
  const fullSiteCacheNames = names.filter((name) => name.startsWith(FULL_SITE_CACHE_PREFIX));
  const version = await readActiveOfflineVersion(baseUrl);

  if (version && fullSiteCacheNames.includes(currentCacheName(version))) {
    return version;
  }

  const fallbackVersion = preferredVersion && fullSiteCacheNames.includes(currentCacheName(preferredVersion))
    ? preferredVersion
    : fullSiteCacheNames.length === 1
      ? fullSiteCacheNames[0].slice(FULL_SITE_CACHE_PREFIX.length)
      : null;

  if (fallbackVersion) {
    await writeActiveOfflineVersion(baseUrl, fallbackVersion);
    return fallbackVersion;
  }

  await writeActiveOfflineVersion(baseUrl, null);
  return null;
}

async function readCacheProgress(manifest: OfflineManifest): Promise<{ count: number; bytes: number }> {
  const cache = await caches.open(currentCacheName(manifest.version));
  const keys = await cache.keys();
  const cachedUrls = new Set(keys.map((request) => request.url));

  let count = 0;
  let bytes = 0;

  manifest.urls.forEach((entry) => {
    const absoluteUrl = new URL(entry.url, window.location.origin).href;
    if (!cachedUrls.has(absoluteUrl)) return;
    count += 1;
    bytes += entry.bytes;
  });

  return { count, bytes };
}

export default function OfflineSiteCachePanel({ baseUrl }: OfflineSiteCachePanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
  const [cachedBytes, setCachedBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quotaFailure, setQuotaFailure] = useState(false);
  const downloadRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch(joinBaseUrl(baseUrl, 'offline-manifest.json'));
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(
              'The offline manifest is not available on the dev server. Test full-site download from a built site, or run npm run build to generate offline-manifest.json.',
            );
          }

          throw new Error('Could not load the offline manifest.');
        }

        const nextManifest = await response.json() as OfflineManifest;
        const nextActiveVersion = await resolveActiveOfflineVersion(baseUrl, nextManifest.version);
        await cleanupOfflineCaches(
          [
            currentCacheName(nextManifest.version),
            nextActiveVersion ? currentCacheName(nextActiveVersion) : null,
          ].filter((name): name is string => Boolean(name)),
        );
        const progress = await readCacheProgress(nextManifest);
        if (cancelled) return;

        setManifest(nextManifest);
        setActiveVersion(nextActiveVersion);
        setCachedCount(progress.count);
        setCachedBytes(progress.bytes);
        setStatus(
          progress.count >= nextManifest.totalFiles && nextActiveVersion === nextManifest.version
            ? 'complete'
            : 'ready',
        );
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'Could not load the offline manifest.');
        setStatus('error');
      }
    }

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const progressPercent = useMemo(() => {
    if (!manifest || manifest.totalFiles === 0) return 0;
    return Math.min(100, Math.round((cachedCount / manifest.totalFiles) * 100));
  }, [cachedCount, manifest]);

  async function refreshProgress(nextManifest: OfflineManifest, nextActiveVersion: string | null) {
    const progress = await readCacheProgress(nextManifest);
    setActiveVersion(nextActiveVersion);
    setCachedCount(progress.count);
    setCachedBytes(progress.bytes);
    setStatus(
      progress.count >= nextManifest.totalFiles && nextActiveVersion === nextManifest.version
        ? 'complete'
        : 'ready',
    );
  }

  async function startDownload({ replaceExisting }: { replaceExisting: boolean }) {
    if (!manifest || downloadRef.current) return;

    downloadRef.current = true;
    setStatus('downloading');
    setErrorMessage(null);
    setQuotaFailure(false);

    try {
      let previousActiveVersion = await resolveActiveOfflineVersion(baseUrl, manifest.version);

      if (replaceExisting) {
        await cleanupOfflineCaches();
        await writeActiveOfflineVersion(baseUrl, null);
        previousActiveVersion = null;
        setActiveVersion(null);
        setCachedCount(0);
        setCachedBytes(0);
      } else {
        setActiveVersion(previousActiveVersion);
      }

      const cache = await caches.open(currentCacheName(manifest.version));
      const existingProgress = replaceExisting
        ? { count: 0, bytes: 0 }
        : await readCacheProgress(manifest);

      let nextCount = existingProgress.count;
      let nextBytes = existingProgress.bytes;
      setCachedCount(nextCount);
      setCachedBytes(nextBytes);

      const existingKeys = await cache.keys();
      const existingUrls = new Set(existingKeys.map((request) => request.url));
      const queue = manifest.urls.filter((entry) => !existingUrls.has(new URL(entry.url, window.location.origin).href));

      let nextIndex = 0;
      const failures: DownloadFailure[] = [];
      let quotaExceeded = false;

      async function processEntry(entry: OfflineManifestEntry) {
        const cacheKey = entry.url;
        const cachedResponse = await caches.match(cacheKey, { ignoreSearch: false });

        if (cachedResponse) {
          await cache.put(cacheKey, cachedResponse.clone());
        } else {
          const response = await fetch(cacheKey, {
            headers: {
              [OFFLINE_DOWNLOAD_HEADER]: '1',
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to cache ${entry.url}`);
          }

          await cache.put(cacheKey, response.clone());
        }

        nextCount += 1;
        nextBytes += entry.bytes;
        setCachedCount(nextCount);
        setCachedBytes(nextBytes);
      }

      async function worker() {
        while (nextIndex < queue.length && !quotaExceeded) {
          const entry = queue[nextIndex];
          nextIndex += 1;

          try {
            await processEntry(entry);
          } catch (error) {
            const isQuota = isQuotaExceededError(error);
            failures.push({ url: entry.url, isQuota });
            if (isQuota) {
              quotaExceeded = true;
            }
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length || 1) }, () => worker()),
      );

      if (quotaExceeded) {
        setQuotaFailure(true);
        setErrorMessage(
          replaceExisting
            ? `Storage ran out after caching ${nextCount}/${manifest.totalFiles} files. Free some space on this device, then try again.`
            : `Storage ran out after caching ${nextCount}/${manifest.totalFiles} files. Use Replace existing offline copy to clear the old full-site snapshot before downloading the new one.`,
        );
        setStatus('error');
      } else if (failures.length > 0) {
        setErrorMessage(`Cached ${nextCount}/${manifest.totalFiles} files. ${failures.length} files failed; press Download again to resume.`);
        setStatus('error');
      } else {
        await writeActiveOfflineVersion(baseUrl, manifest.version);
        await cleanupOfflineCaches([currentCacheName(manifest.version)]);
        setActiveVersion(manifest.version);
        setStatus('complete');
      }
    } catch (error) {
      if (isQuotaExceededError(error)) {
        setQuotaFailure(true);
        setErrorMessage(
          replaceExisting
            ? 'Storage ran out while replacing the offline copy. Free some space on this device, then try again.'
            : 'Storage ran out while updating the offline copy. Use Replace existing offline copy to retry without keeping the older full-site snapshot.',
        );
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Could not finish the offline download.');
      }
      setStatus('error');
    } finally {
      downloadRef.current = false;
    }
  }

  async function handleDownload() {
    await startDownload({ replaceExisting: false });
  }

  async function handleReplaceDownload() {
    await startDownload({ replaceExisting: true });
  }

  async function handleClear() {
    if (!manifest) return;

    setStatus('clearing');
    setErrorMessage(null);
    await cleanupOfflineCaches();
    await writeActiveOfflineVersion(baseUrl, null);
    await refreshProgress(manifest, null);
  }

  const hasOfflineDownload = Boolean(activeVersion) || cachedCount > 0;
  const hasPendingUpdate = Boolean(activeVersion && manifest && activeVersion !== manifest.version);
  const showReplaceButton = hasPendingUpdate || (quotaFailure && Boolean(activeVersion));
  const statusTitle = status === 'complete'
    ? 'Full offline snapshot is ready.'
    : hasPendingUpdate
      ? 'A newer snapshot is available'
      : 'Snapshot status';
  const downloadButtonLabel = status === 'downloading'
    ? 'Downloading...'
    : hasPendingUpdate
      ? cachedCount > 0
        ? 'Resume update'
        : 'Update offline download'
      : status === 'complete'
        ? 'Re-download full site'
        : cachedCount > 0
          ? 'Resume download'
          : 'Download full site';
  const statusPillClass = status === 'complete'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : status === 'downloading' || status === 'clearing'
      ? 'border-sky-200 bg-sky-50 text-sky-900'
      : status === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : hasPendingUpdate
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-700';
  const statusPillLabel = status === 'complete'
    ? 'Ready'
    : status === 'downloading'
      ? 'Downloading'
      : status === 'clearing'
        ? 'Clearing'
        : status === 'error'
          ? 'Attention'
          : hasPendingUpdate
            ? 'Update Available'
            : 'Not Downloaded';
  const snapshotSummary = activeVersion === manifest.version
    ? 'Current build saved'
    : activeVersion
      ? 'Older snapshot still active'
      : 'Core offline only';
  const snapshotSummaryCopy = activeVersion === manifest.version
    ? 'This build is already available offline.'
    : activeVersion
      ? 'Your previous download stays live until a new one finishes.'
      : 'Only the built-in homepage, About, Part, and Division pages are offline by default.';
  const helperCopy = hasPendingUpdate
    ? 'Your current offline copy stays active until the update finishes.'
    : showReplaceButton
      ? 'If this device is low on storage, replace the older offline copy instead of keeping both.'
      : 'Part and Division pages are already available offline by default.';

  if (status === 'unsupported') {
    return (
      <div class="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900">
        This browser does not expose the storage APIs needed for a full offline download.
      </div>
    );
  }

  if (status === 'loading' || !manifest) {
    if (status === 'error') {
      return (
        <div class="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
          {errorMessage || 'Could not load the offline manifest.'}
        </div>
      );
    }

    if (!manifest) {
      return (
        <div class="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
          Could not load the offline manifest.
        </div>
      );
    }

    return (
      <div class="rounded-[1.75rem] border border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-600">
        Loading offline download details...
      </div>
    );
  }

  return (
    <section class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-2xl space-y-2">
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Full Offline Snapshot
          </p>
          <h2 class="font-serif text-2xl text-slate-900">Download the full site</h2>
          <p class="text-sm leading-6 text-slate-600">
            Saves the current build to this device so the rest of the site stays available without a connection.
          </p>
          <p class="text-sm leading-6 text-slate-500">
            {manifest.totalFiles.toLocaleString()} files
            {' · '}
            {formatBytes(manifest.totalBytes)}
            {' · '}
            built {formatGeneratedAt(manifest.generatedAt)}
          </p>
        </div>
        <span class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusPillClass}`}>
          {statusPillLabel}
        </span>
      </div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-900">{statusTitle}</p>
            <p class="mt-1 text-sm leading-6 text-slate-600">
              {cachedCount.toLocaleString()} / {manifest.totalFiles.toLocaleString()} files cached
              {' · '}
              {formatBytes(cachedBytes)} / {formatBytes(manifest.totalBytes)}
            </p>
            <p class="mt-2 text-sm leading-6 text-slate-500">{helperCopy}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={status === 'downloading' || status === 'clearing'}
              class="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {downloadButtonLabel}
            </button>
            {showReplaceButton ? (
              <button
                type="button"
                onClick={handleReplaceDownload}
                disabled={status === 'downloading' || status === 'clearing'}
                class="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-amber-200 disabled:text-amber-500"
              >
                Replace existing offline copy
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClear}
              disabled={status === 'downloading' || status === 'clearing' || !hasOfflineDownload}
              class="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              {status === 'clearing' ? 'Clearing...' : 'Clear offline download'}
            </button>
          </div>
        </div>

        <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full bg-slate-900 transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p class="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{progressPercent}% cached</p>

        <div class="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p class="font-medium text-slate-900">{snapshotSummary}</p>
          <p class="mt-1">{snapshotSummaryCopy}</p>
        </div>

        {errorMessage ? (
          <div class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
