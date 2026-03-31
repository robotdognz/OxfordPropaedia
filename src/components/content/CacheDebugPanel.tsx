import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const CACHE_DEBUG_STORAGE_KEY = 'propaedia-cache-debug';

function readCacheDebugPreference(): boolean | null {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(CACHE_DEBUG_STORAGE_KEY) === '1';
  } catch (_error) {
    return null;
  }
}

function writeCacheDebugPreference(enabled: boolean): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (enabled) {
      window.localStorage.setItem(CACHE_DEBUG_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(CACHE_DEBUG_STORAGE_KEY);
    }
    return true;
  } catch (_error) {
    return false;
  }
}

function statusClasses(enabled: boolean): string {
  return enabled
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function CacheDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const nextEnabled = readCacheDebugPreference();
    if (nextEnabled === null) {
      setStorageAvailable(false);
      return;
    }

    setEnabled(nextEnabled);
  }, []);

  function handleToggle() {
    const nextEnabled = !enabled;
    const didPersist = writeCacheDebugPreference(nextEnabled);
    if (!didPersist) {
      setStorageAvailable(false);
      return;
    }

    setEnabled(nextEnabled);
    window.location.reload();
  }

  return (
    <section class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="max-w-2xl space-y-2">
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Cache Debug
          </p>
          <h2 class="font-serif text-2xl text-slate-900">Inspect request sources</h2>
          <p class="text-sm leading-6 text-slate-600">
            Shows where the current page, data, and assets are coming from.
          </p>
          {!storageAvailable ? (
            <p class="text-sm leading-6 text-red-700">
              This browser is blocking local storage, so the cache debug setting cannot be saved here.
            </p>
          ) : null}
        </div>

        <div class={`rounded-full border px-4 py-2 text-sm font-medium ${statusClasses(enabled)}`}>
          {enabled ? 'Badge On' : 'Badge Off'}
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          class={`rounded-full px-4 py-2 text-sm font-medium transition ${
            enabled
              ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {enabled ? 'Hide cache debug badge' : 'Show cache debug badge'}
        </button>
        <p class="text-sm leading-6 text-slate-500">
          Changing this setting reloads the current page once.
        </p>
      </div>
    </section>
  );
}
