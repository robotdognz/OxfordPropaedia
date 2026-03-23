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
