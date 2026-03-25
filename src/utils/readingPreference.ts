/**
 * Site-wide reading type preference.
 * Determines which recommendation type to auto-open/scroll to.
 */

export type ReadingType = 'vsi' | 'wikipedia' | 'iot' | 'macropaedia';

const STORAGE_KEY = 'propaedia-reading-preference';
const CHANGE_EVENT = 'propaedia:reading-preference-change';

export const READING_TYPE_LABELS: Record<ReadingType, string> = {
  vsi: 'Oxford VSI',
  wikipedia: 'Wikipedia',
  iot: 'BBC In Our Time',
  macropaedia: 'Macropaedia',
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
