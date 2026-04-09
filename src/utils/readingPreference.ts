/**
 * Site-wide default reading type shared across recommendation views.
 */

export type ReadingType = 'vsi' | 'wikipedia' | 'iot' | 'macropaedia';
export type ReadingPoolScope = 'all' | 'shelved';
export type ReadingLibraryScope = 'library' | 'shelf';
export interface ReadingLibraryControlsPreference<TSortField extends string = string> {
  scope: ReadingLibraryScope;
  checkedOnly: boolean;
  sortField: TSortField;
  sortDirection: 'asc' | 'desc';
}

const STORAGE_KEY = 'propaedia-reading-preference';
const CHANGE_EVENT = 'propaedia:reading-preference-change';

export const READING_TYPE_ORDER: ReadingType[] = ['vsi', 'iot', 'wikipedia', 'macropaedia'];

export const READING_TYPE_LABELS: Record<ReadingType, string> = {
  vsi: 'Oxford VSI',
  wikipedia: 'Wikipedia',
  iot: 'BBC In Our Time',
  macropaedia: 'Britannica',
};

export const READING_TYPE_UI_META: Record<ReadingType, {
  eyebrow: string;
  label: string;
  accentColor: string;
}> = {
  vsi: {
    eyebrow: 'Books',
    label: 'Oxford VSI',
    accentColor: '#4f46e5',
  },
  iot: {
    eyebrow: 'Audio',
    label: 'In Our Time',
    accentColor: '#ea580c',
  },
  wikipedia: {
    eyebrow: 'Reference',
    label: 'Wikipedia',
    accentColor: '#0f172a',
  },
  macropaedia: {
    eyebrow: 'Britannica',
    label: 'Britannica',
    accentColor: '#0f766e',
  },
};

export function getReadingPreference(): ReadingType {
  if (typeof window === 'undefined') return 'vsi';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'vsi' || stored === 'wikipedia' || stored === 'iot' || stored === 'macropaedia') {
      return stored;
    }
  } catch {
    // Ignore
  }
  return 'vsi';
}

export function setReadingPreference(type: ReadingType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: type }));
}

// --- Hide checked readings on outline pages ---

const HIDE_CHECKED_KEY = 'propaedia-hide-checked-readings';
const HIDE_CHECKED_EVENT = 'propaedia:hide-checked-change';

export function getHideCheckedReadings(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(HIDE_CHECKED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHideCheckedReadings(hide: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HIDE_CHECKED_KEY, String(hide));
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(HIDE_CHECKED_EVENT, { detail: hide }));
}

export function subscribeHideCheckedReadings(callback: (hide: boolean) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<boolean>).detail);
  };
  document.addEventListener(HIDE_CHECKED_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === HIDE_CHECKED_KEY) {
      callback(event.newValue === 'true');
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(HIDE_CHECKED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Coverage layer preference ---

import type { CoverageLayer } from './readingLibrary';

const LAYER_KEY = 'propaedia-coverage-layer';
const LAYER_EVENT = 'propaedia:coverage-layer-change';
const VALID_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];

export function getCoverageLayerPreference(): CoverageLayer {
  if (typeof window === 'undefined') return 'part';
  try {
    const stored = localStorage.getItem(LAYER_KEY);
    if (stored && VALID_LAYERS.includes(stored as CoverageLayer)) {
      return stored as CoverageLayer;
    }
  } catch {
    // Ignore
  }
  return 'part';
}

export function setCoverageLayerPreference(layer: CoverageLayer): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAYER_KEY, layer);
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(LAYER_EVENT, { detail: layer }));
}

export function subscribeCoverageLayerPreference(callback: (layer: CoverageLayer) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<CoverageLayer>).detail);
  };
  document.addEventListener(LAYER_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === LAYER_KEY && event.newValue && VALID_LAYERS.includes(event.newValue as CoverageLayer)) {
      callback(event.newValue as CoverageLayer);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(LAYER_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function subscribeReadingPreference(callback: (type: ReadingType) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<ReadingType>).detail);
  };
  document.addEventListener(CHANGE_EVENT, handler);

  // Also listen for cross-tab changes
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      callback(event.newValue as ReadingType);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Reading pool scope preference ---

const READING_POOL_SCOPE_KEY = 'propaedia-reading-pool-scope';
const READING_POOL_SCOPE_EVENT = 'propaedia:reading-pool-scope-change';

export function getReadingPoolScopePreference(): ReadingPoolScope {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = localStorage.getItem(READING_POOL_SCOPE_KEY);
    if (stored === 'all' || stored === 'shelved') {
      return stored;
    }
  } catch {
    // Ignore
  }
  return 'all';
}

export function setReadingPoolScopePreference(scope: ReadingPoolScope): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(READING_POOL_SCOPE_KEY, scope);
  } catch {
    // Ignore
  }
  document.dispatchEvent(new CustomEvent(READING_POOL_SCOPE_EVENT, { detail: scope }));
}

export function subscribeReadingPoolScopePreference(callback: (scope: ReadingPoolScope) => void): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<ReadingPoolScope>).detail);
  };
  document.addEventListener(READING_POOL_SCOPE_EVENT, handler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === READING_POOL_SCOPE_KEY && (event.newValue === 'all' || event.newValue === 'shelved')) {
      callback(event.newValue);
    }
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    document.removeEventListener(READING_POOL_SCOPE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

// --- Reading library controls preference ---

const READING_LIBRARY_CONTROLS_KEY_PREFIX = 'propaedia-reading-library-controls';

function readingLibraryControlsKey(readingType: ReadingType): string {
  return `${READING_LIBRARY_CONTROLS_KEY_PREFIX}:${readingType}`;
}

export function getReadingLibraryControlsPreference<TSortField extends string>(
  readingType: ReadingType,
  defaultSortField: TSortField,
  defaultSortDirection: 'asc' | 'desc' = 'desc'
): ReadingLibraryControlsPreference<TSortField> {
  const fallback: ReadingLibraryControlsPreference<TSortField> = {
    scope: 'library',
    checkedOnly: false,
    sortField: defaultSortField,
    sortDirection: defaultSortDirection,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(readingLibraryControlsKey(readingType));
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<ReadingLibraryControlsPreference<string>> & {
      shelvedOnly?: boolean;
    };

    const scope = parsed.scope === 'shelf' || parsed.shelvedOnly === true ? 'shelf' : 'library';

    return {
      scope,
      checkedOnly: parsed.checkedOnly === true,
      sortField: (typeof parsed.sortField === 'string' ? parsed.sortField : defaultSortField) as TSortField,
      sortDirection: parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc'
        ? parsed.sortDirection
        : defaultSortDirection,
    };
  } catch {
    return fallback;
  }
}

export function setReadingLibraryControlsPreference(
  readingType: ReadingType,
  preference: ReadingLibraryControlsPreference
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(readingLibraryControlsKey(readingType), JSON.stringify(preference));
  } catch {
    // Ignore
  }
}

export function setReadingLibraryScopePreference(
  readingType: ReadingType,
  scope: ReadingLibraryScope,
): void {
  if (typeof window === 'undefined') return;

  try {
    const key = readingLibraryControlsKey(readingType);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};

    localStorage.setItem(
      key,
      JSON.stringify({
        ...parsed,
        scope,
        shelvedOnly: undefined,
      }),
    );
  } catch {
    // Ignore
  }
}
