const STORAGE_KEY = 'propaedia-reading-checklist-v1';
const CHANGE_EVENT = 'propaedia:reading-checklist-change';

export function normalizeChecklistKeyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

export function vsiChecklistKey(title: string, author: string): string {
  return `vsi:${normalizeChecklistKeyPart(title)}:${normalizeChecklistKeyPart(author)}`;
}

export function macropaediaChecklistKey(reference: string): string {
  return `macropaedia:${normalizeChecklistKeyPart(reference)}`;
}

export function wikipediaChecklistKey(title: string): string {
  return `wikipedia:${normalizeChecklistKeyPart(title)}`;
}

export function iotChecklistKey(identifier: string): string {
  return `iot:${normalizeChecklistKeyPart(identifier)}`;
}

export function readChecklistState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeChecklistState(key: string, checked: boolean): void {
  if (typeof window === 'undefined') return;

  const nextState = { ...readChecklistState() };
  if (checked) {
    nextState[key] = true;
  } else {
    delete nextState[key];
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, checked } }));
  } catch {
    // Ignore storage failures and keep the UI responsive.
  }
}

export function subscribeChecklistState(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}
