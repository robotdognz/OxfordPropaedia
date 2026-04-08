import vsiChecklistLookup from '../data/vsi-checklist-lookup.json';

const STORAGE_KEY = 'propaedia-reading-checklist-v1';
const BACKUP_STORAGE_KEY = 'propaedia-reading-checklist-v1-backup';
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

function legacyVsiChecklistKey(title: string, author: string): string {
  return `vsi:${normalizeChecklistKeyPart(title)}:${normalizeChecklistKeyPart(author)}`;
}

function canonicalVsiChecklistKeyFromTitle(title: string): string {
  return `vsi:title:${normalizeChecklistKeyPart(title)}`;
}

function canonicalVsiChecklistKeyFromId(id: string): string {
  return `vsi:id:${id}`;
}

function pushLookupEntry<K, V>(lookup: Map<K, V[]>, key: K, value: V) {
  const existing = lookup.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  lookup.set(key, [value]);
}

const VSI_TITLE_RENAME_ALIASES = new Map<string, string>([
  [legacyVsiChecklistKey('Telescopes', 'Geoffrey Cottrell'), canonicalVsiChecklistKeyFromTitle('Observational Astronomy')],
  [legacyVsiChecklistKey('Diplomacy', 'Joseph M. Siracusa'), canonicalVsiChecklistKeyFromTitle('Diplomatic History')],
  [legacyVsiChecklistKey('Dostoevsky', 'Deborah Martinsen'), canonicalVsiChecklistKeyFromTitle('Fyodor Dostoevsky')],
  [legacyVsiChecklistKey('The Great Depression and The New Deal', 'Eric Rauchway'), canonicalVsiChecklistKeyFromTitle('The Great Depression and New Deal')],
  [legacyVsiChecklistKey('HIV/AIDS', 'Alan Whiteside'), canonicalVsiChecklistKeyFromTitle('HIV & AIDS')],
]);

const VSI_TITLE_SLUG_RENAME_ALIASES = new Map<string, string | null>(
  Array.from(VSI_TITLE_RENAME_ALIASES.entries(), ([legacyKey, canonicalKey]) => {
    const legacyTitleSlug = legacyKey.split(':', 3)[1];
    const canonicalTitleSlug = canonicalKey.startsWith('vsi:title:')
      ? canonicalKey.slice('vsi:title:'.length)
      : null;
    return [legacyTitleSlug, canonicalTitleSlug];
  }),
);

const vsiIdByLegacyKey = new Map<string, string>();
const vsiIdByPrintIsbn = new Map<string, string>();
const vsiIdsByTitleSlug = new Map<string, string[]>();

for (const entry of vsiChecklistLookup.entries) {
  vsiIdByLegacyKey.set(`vsi:${entry.titleSlug}:${entry.authorSlug}`, entry.id);
  pushLookupEntry(vsiIdsByTitleSlug, entry.titleSlug, entry.id);
  if (entry.printIsbn) {
    vsiIdByPrintIsbn.set(entry.printIsbn, entry.id);
  }
}

const vsiIdByUniqueTitleSlug = new Map<string, string>(
  Array.from(vsiIdsByTitleSlug.entries())
    .filter(([, ids]) => ids.length === 1)
    .map(([titleSlug, ids]) => [titleSlug, ids[0]]),
);

function resolveVsiIdByTitleSlug(titleSlug?: string): string | undefined {
  if (!titleSlug) return undefined;
  const aliasedTitleSlug = VSI_TITLE_SLUG_RENAME_ALIASES.get(titleSlug);
  if (aliasedTitleSlug === null) return undefined;
  if (aliasedTitleSlug) {
    return vsiIdByUniqueTitleSlug.get(aliasedTitleSlug);
  }
  return vsiIdByUniqueTitleSlug.get(titleSlug);
}

function resolveVsiChecklistId(title: string, author?: string, printIsbn?: string, id?: string): string | undefined {
  if (id) return id;

  if (printIsbn) {
    const byPrintIsbn = vsiIdByPrintIsbn.get(printIsbn);
    if (byPrintIsbn) return byPrintIsbn;
  }

  if (title && author) {
    const direct = vsiIdByLegacyKey.get(legacyVsiChecklistKey(title, author));
    if (direct) return direct;
  }

  return resolveVsiIdByTitleSlug(normalizeChecklistKeyPart(title));
}

function canonicalizeChecklistKey(key: string): string {
  if (!key.startsWith('vsi:')) return key;
  if (key.startsWith('vsi:id:')) return key;

  if (key.startsWith('vsi:isbn:')) {
    const printIsbn = key.slice('vsi:isbn:'.length);
    const resolvedId = vsiIdByPrintIsbn.get(printIsbn);
    return resolvedId ? canonicalVsiChecklistKeyFromId(resolvedId) : key;
  }

  if (key.startsWith('vsi:title:')) {
    const titleSlug = key.slice('vsi:title:'.length);
    const resolvedId = resolveVsiIdByTitleSlug(titleSlug);
    return resolvedId ? canonicalVsiChecklistKeyFromId(resolvedId) : key;
  }

  const aliasedKey = VSI_TITLE_RENAME_ALIASES.get(key);
  if (aliasedKey) {
    return canonicalizeChecklistKey(aliasedKey);
  }

  const [, titlePart, authorPart] = key.split(':', 3);
  if (!titlePart) return key;

  const resolvedId = resolveVsiChecklistId(
    titlePart.replace(/-/g, ' '),
    authorPart?.replace(/-/g, ' '),
  );
  if (resolvedId) {
    return canonicalVsiChecklistKeyFromId(resolvedId);
  }

  const titleSlugResolvedId = resolveVsiIdByTitleSlug(titlePart);
  if (titleSlugResolvedId) {
    return canonicalVsiChecklistKeyFromId(titleSlugResolvedId);
  }

  return key;
}

function normalizeChecklistState(state: Record<string, boolean>): {
  state: Record<string, boolean>;
  changed: boolean;
} {
  let changed = false;
  const nextState: Record<string, boolean> = {};

  for (const [key, checked] of Object.entries(state)) {
    if (!checked) {
      changed = true;
      continue;
    }

    const canonicalKey = canonicalizeChecklistKey(key);
    if (!canonicalKey) {
      changed = true;
      continue;
    }

    if (canonicalKey !== key) {
      changed = true;
    }

    nextState[key] = true;
    nextState[canonicalKey] = true;
  }

  return { state: nextState, changed };
}

export function vsiChecklistKey(title: string, author: string, printIsbn?: string, id?: string): string {
  const resolvedId = resolveVsiChecklistId(title, author, printIsbn, id);
  if (resolvedId) {
    return canonicalVsiChecklistKeyFromId(resolvedId);
  }

  const aliasedKey = VSI_TITLE_RENAME_ALIASES.get(legacyVsiChecklistKey(title, author));
  if (aliasedKey) {
    return canonicalizeChecklistKey(aliasedKey);
  }

  return canonicalVsiChecklistKeyFromTitle(title);
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
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized = normalizeChecklistState(parsed);
    if (normalized.changed) {
      try {
        if (!window.localStorage.getItem(BACKUP_STORAGE_KEY)) {
          window.localStorage.setItem(BACKUP_STORAGE_KEY, raw);
        }
      } catch {
        // Ignore backup failures and continue with normalized state.
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.state));
    }

    return normalized.state;
  } catch {
    return {};
  }
}

export function writeChecklistState(key: string, checked: boolean): void {
  if (typeof window === 'undefined') return;

  const nextState = { ...readChecklistState() };
  const canonicalKey = canonicalizeChecklistKey(key);

  if (checked) {
    nextState[canonicalKey] = true;
  } else {
    for (const existingKey of Object.keys(nextState)) {
      if (existingKey === key || canonicalizeChecklistKey(existingKey) === canonicalKey) {
        delete nextState[existingKey];
      }
    }
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key: canonicalKey, checked } }));
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
