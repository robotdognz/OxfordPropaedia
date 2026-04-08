import vsiCatalog from '../content/vsi/catalog.json';
import { normalizeLookupText, vsiLookupKey } from './readingIdentity';

export const VSI_SERIES_AVG_PAGE_COUNT = 160;
export const VSI_SERIES_AVG_WORD_COUNT = 35000;
export const VSI_WORDS_PER_PAGE = VSI_SERIES_AVG_WORD_COUNT / VSI_SERIES_AVG_PAGE_COUNT;

const wordCountFormatter = new Intl.NumberFormat('en-US');

type VsiCatalogEntry = (typeof vsiCatalog.titles)[number];

function normalizeStableKeyPart(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function normalizeLooseLookupText(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLooseAuthorText(value: string): string {
  return normalizeLooseLookupText(
    String(value || '')
      .replace(/\((?:author|editor|ed\.)\)/gi, '')
      .replace(/^(?:author|prof(?:essor)?|dr|sir)\s+/i, '')
      .trim(),
  );
}

function pushLookupEntry<K, V>(lookup: Map<K, V[]>, key: K, value: V) {
  const existing = lookup.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  lookup.set(key, [value]);
}

const visibleEntries = vsiCatalog.titles.filter((entry) => !entry.hidden);
const allEntries = vsiCatalog.titles;

const vsiCatalogLookup = new Map(
  visibleEntries.map((entry) => [vsiLookupKey(entry.title, entry.author), entry]),
);
const vsiCatalogIdLookup = new Map(allEntries.map((entry) => [entry.id, entry]));
const vsiCatalogPrintIsbnLookup = new Map(
  allEntries
    .filter((entry) => entry.printIsbn)
    .map((entry) => [entry.printIsbn as string, entry]),
);

const exactTitleLookup = new Map<string, VsiCatalogEntry[]>();
const looseTitleLookup = new Map<string, VsiCatalogEntry[]>();
const allTitleSlugLookup = new Map<string, VsiCatalogEntry[]>();

for (const entry of visibleEntries) {
  pushLookupEntry(exactTitleLookup, normalizeLookupText(entry.title), entry);
  pushLookupEntry(looseTitleLookup, normalizeLooseLookupText(entry.title), entry);
}

for (const entry of allEntries) {
  pushLookupEntry(allTitleSlugLookup, normalizeStableKeyPart(entry.title), entry);
}

const LEGACY_VSI_IDENTITY_OVERRIDES = new Map<string, { title: string; author: string } | null>([
  [vsiLookupKey('Pain', 'Rob Boddice'), null],
  [vsiLookupKey('Telescopes', 'Geoffrey Cottrell'), { title: 'Observational Astronomy', author: 'Geoff Cottrell' }],
  [vsiLookupKey('Diplomacy', 'Joseph M. Siracusa'), { title: 'Diplomatic History', author: 'Joseph M. Siracusa' }],
  [vsiLookupKey('Dostoevsky', 'Deborah Martinsen'), { title: 'Fyodor Dostoevsky', author: 'Deborah Martinsen' }],
  [vsiLookupKey('The Great Depression and The New Deal', 'Eric Rauchway'), { title: 'The Great Depression and New Deal', author: 'Eric Rauchway' }],
  [vsiLookupKey('HIV/AIDS', 'Alan Whiteside'), { title: 'HIV & AIDS', author: 'Alan Whiteside' }],
]);

export const LEGACY_VSI_TITLE_AUTHOR_OVERRIDES = [
  { title: 'Pain', author: 'Rob Boddice', replacement: null },
  { title: 'Telescopes', author: 'Geoffrey Cottrell', replacement: { title: 'Observational Astronomy', author: 'Geoff Cottrell' } },
  { title: 'Diplomacy', author: 'Joseph M. Siracusa', replacement: { title: 'Diplomatic History', author: 'Joseph M. Siracusa' } },
  { title: 'Dostoevsky', author: 'Deborah Martinsen', replacement: { title: 'Fyodor Dostoevsky', author: 'Deborah Martinsen' } },
  { title: 'The Great Depression and The New Deal', author: 'Eric Rauchway', replacement: { title: 'The Great Depression and New Deal', author: 'Eric Rauchway' } },
  { title: 'HIV/AIDS', author: 'Alan Whiteside', replacement: { title: 'HIV & AIDS', author: 'Alan Whiteside' } },
] as const;

const LEGACY_VSI_TITLE_SLUG_OVERRIDES = new Map<string, { title: string; author: string } | null>(
  LEGACY_VSI_TITLE_AUTHOR_OVERRIDES.map(({ title, author, replacement }) => [
    normalizeStableKeyPart(title),
    replacement,
  ]),
);

function resolveEntryFromCandidates(entries: VsiCatalogEntry[] | undefined, author?: string): VsiCatalogEntry | undefined {
  if (!entries || entries.length === 0) return undefined;
  if (!author) {
    return entries.length === 1 ? entries[0] : undefined;
  }

  const normalizedAuthor = normalizeLooseAuthorText(author);
  const matched = entries.find((entry) => normalizeLooseAuthorText(entry.author) === normalizedAuthor);
  if (matched) return matched;

  return entries.length === 1 ? entries[0] : undefined;
}

export function isVsiCatalogEntryHidden(entry?: { hidden?: boolean } | null): boolean {
  return Boolean(entry?.hidden);
}

export function visibleVsiCatalogEntries() {
  return visibleEntries;
}

export function resolveVsiCatalogEntryById(id?: string): VsiCatalogEntry | undefined {
  if (!id) return undefined;
  return vsiCatalogIdLookup.get(id);
}

export function resolveVsiCatalogEntryByPrintIsbn(printIsbn?: string): VsiCatalogEntry | undefined {
  if (!printIsbn) return undefined;
  return vsiCatalogPrintIsbnLookup.get(printIsbn);
}

export function resolveVsiCatalogEntryByTitleSlug(titleSlug?: string): VsiCatalogEntry | undefined {
  if (!titleSlug) return undefined;

  const legacyOverride = LEGACY_VSI_TITLE_SLUG_OVERRIDES.get(titleSlug);
  if (legacyOverride === null) return undefined;
  if (legacyOverride) {
    return vsiCatalogLookup.get(vsiLookupKey(legacyOverride.title, legacyOverride.author));
  }

  const matches = allTitleSlugLookup.get(titleSlug);
  if (!matches || matches.length !== 1) return undefined;
  return matches[0];
}

export function resolveVsiCatalogId(
  title: string,
  author?: string,
  printIsbn?: string,
  id?: string,
): string | undefined {
  const byId = resolveVsiCatalogEntryById(id);
  if (byId) return byId.id;

  const byPrintIsbn = resolveVsiCatalogEntryByPrintIsbn(printIsbn);
  if (byPrintIsbn) return byPrintIsbn.id;

  const resolved = resolveVsiCatalogEntry(title, author);
  return resolved?.id;
}

export function resolveVsiCatalogEntry(title: string, author?: string): VsiCatalogEntry | undefined {
  if (!title) return undefined;

  if (author) {
    const direct = vsiCatalogLookup.get(vsiLookupKey(title, author));
    if (direct) return direct;

    const legacyOverride = LEGACY_VSI_IDENTITY_OVERRIDES.get(vsiLookupKey(title, author));
    if (legacyOverride === null) {
      return undefined;
    }
    if (legacyOverride) {
      return vsiCatalogLookup.get(vsiLookupKey(legacyOverride.title, legacyOverride.author));
    }
  }

  const exactTitleMatch = resolveEntryFromCandidates(
    exactTitleLookup.get(normalizeLookupText(title)),
    author,
  );
  if (exactTitleMatch) return exactTitleMatch;

  return resolveEntryFromCandidates(
    looseTitleLookup.get(normalizeLooseLookupText(title)),
    author,
  );
}

export function vsiCatalogEntryForTitleAuthor(title: string, author?: string) {
  return resolveVsiCatalogEntry(title, author);
}

export function estimateVsiWordCountFromPageCount(pageCount?: number): number | undefined {
  if (!pageCount || pageCount <= 0) return undefined;
  return Math.round(pageCount * VSI_WORDS_PER_PAGE);
}

export function formatVsiWordCount(wordCount?: number): string | undefined {
  if (!wordCount || wordCount <= 0) return undefined;
  return `Approx. ${wordCountFormatter.format(wordCount)} words`;
}

export function formatVsiPageCount(pageCount?: number): string | undefined {
  if (!pageCount || pageCount <= 0) return undefined;
  return `${wordCountFormatter.format(pageCount)} pages`;
}
