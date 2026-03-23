import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { SearchOutlineEntry } from '../../utils/outlineSearch';

export interface SearchDialogProps {
  baseUrl: string;
  outlineEntriesUrl?: string;
}

const OPEN_SEARCH_EVENT = 'propaedia:open-search';
const PAGEFIND_HIGHLIGHT_PARAM = 'pagefind-highlight';

export function openSearchDialog() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  }
}

interface SearchResult {
  url: string;
  title: string;
  pageTitle?: string;
  pageType?: string;
  pageContext?: string;
  excerpt: string;
  score?: number;
  pagefindScore?: number;
}

interface SearchResultGroup {
  id: string;
  label: string;
  results: Array<SearchResult & { index: number }>;
}

interface PagefindSubResult {
  title?: string;
  url: string;
  excerpt: string;
}

interface PagefindResultData {
  url: string;
  meta?: { title?: string; page_type?: string; page_context?: string };
  excerpt: string;
  raw_content?: string;
  sub_results?: PagefindSubResult[];
}

interface PagefindSearchItem extends PagefindResultData {
  pagefindScore?: number;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ');
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with',
]);

const PAGE_TYPE_RANK: Record<string, number> = {
  Section: 0,
  Division: 1,
  Part: 2,
};

function pageTypeRank(pageType?: string) {
  return PAGE_TYPE_RANK[pageType ?? ''] ?? 99;
}

function shouldSurfaceResult(pageType?: string) {
  return pageType !== 'Oxford VSI' && pageType !== 'Wikipedia' && pageType !== 'Macropaedia';
}

function resultGroupId(pageType?: string): string {
  if (pageType === 'Section' || pageType === 'Division' || pageType === 'Part') {
    return 'outline';
  }
  return 'other';
}

function resultGroupLabel(groupId: string): string {
  switch (groupId) {
    case 'outline':
      return 'Outline Matches';
    case 'other':
    default:
      return 'Other Pages';
  }
}

function getQueryTokens(query: string) {
  return normalizeText(query)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function matchesQuery(text: string, tokens: string[]) {
  if (tokens.length === 0) return true;
  const normalized = normalizeText(text);
  // For single tokens, simple includes check
  if (tokens.length === 1) return normalized.includes(tokens[0]);
  // For multi-word queries, check if tokens appear near each other (within ~5 words)
  const fullPhrase = tokens.join(' ');
  if (normalized.includes(fullPhrase)) return true;
  // Proximity check: build a regex that allows a few words between each token
  const proximityPattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s+\\S+){0,5}\\s+');
  return new RegExp(proximityPattern, 'i').test(normalized);
}

function normalizeSearchUrl(rawUrl: string, baseUrl: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  if (/^(https?:)?\/\//.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith(normalizedBase)) return rawUrl;
  if (rawUrl.startsWith('/')) return `${normalizedBase}${rawUrl}`;
  return `${normalizedBase}/${rawUrl}`;
}

function buildHighlightedUrl(rawUrl: string, query: string, baseUrl: string) {
  const trimmed = query.trim();
  const normalizedUrl = normalizeSearchUrl(rawUrl, baseUrl);
  if (!trimmed) return normalizedUrl;

  try {
    const isAbsolute = /^(https?:)?\/\//.test(normalizedUrl);
    const url = new URL(isAbsolute ? normalizedUrl : `https://example.com${normalizedUrl.startsWith('/') ? normalizedUrl : `/${normalizedUrl}`}`);
    url.searchParams.append(PAGEFIND_HIGHLIGHT_PARAM, trimmed);
    return isAbsolute ? url.toString() : url.toString().replace(/^https:\/\/example\.com/, '');
  } catch {
    return normalizedUrl;
  }
}

function scoreResult(result: SearchResult, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const titleText = normalizeText(result.title);
  const pageTitleText = normalizeText(result.pageTitle ?? '');
  const excerptText = normalizeText(stripHtml(result.excerpt));
  const combinedTitle = [titleText, pageTitleText].filter(Boolean).join(' ');
  const tokens = getQueryTokens(query);

  let score = 0;

  if (titleText === normalizedQuery || combinedTitle === normalizedQuery) {
    score += 1000;
  } else if (titleText.startsWith(normalizedQuery) || combinedTitle.startsWith(normalizedQuery)) {
    score += 450;
  } else if (titleText.includes(normalizedQuery) || combinedTitle.includes(normalizedQuery)) {
    score += 250;
  }

  tokens.forEach((token) => {
    if (titleText.includes(token)) {
      score += 80;
    } else if (combinedTitle.includes(token)) {
      score += 50;
    } else if (excerptText.includes(token)) {
      score += 10;
    }
  });

  if (resultGroupId(result.pageType) === 'outline') {
    score += 100;
  }

  score += Math.max(0, 20 - pageTypeRank(result.pageType));

  return score;
}

function scoreOutlineEntry(entry: SearchOutlineEntry, query: string) {
  const normalizedQuery = normalizeText(query);
  const compactQuery = query.toLowerCase().replace(/\s+/g, '').replace(/\//g, '-').trim();
  if (!normalizedQuery && !compactQuery) return 0;

  const searchableFields = [
    entry.title,
    entry.pageContext ?? '',
    ...entry.keywords,
  ].filter(Boolean);

  const hasDirectFieldMatch = searchableFields.some((field) => {
    const normalizedField = normalizeText(field);
    const compactField = field.toLowerCase().replace(/\s+/g, '').replace(/\//g, '-').trim();

    return (
      (compactQuery && compactField === compactQuery) ||
      (normalizedQuery && (
        normalizedField === normalizedQuery ||
        normalizedField.startsWith(normalizedQuery) ||
        normalizedField.includes(normalizedQuery)
      ))
    );
  });

  if (!hasDirectFieldMatch) {
    return 0;
  }

  let score = scoreResult(entry, query) + 150;

  entry.keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const compactKeyword = keyword.toLowerCase().replace(/\s+/g, '').replace(/\//g, '-').trim();

    if (compactQuery && compactKeyword === compactQuery) {
      score = Math.max(score, 2500);
      return;
    }

    if (normalizedKeyword === normalizedQuery) {
      score = Math.max(score, 2200);
      return;
    }

    if (normalizedQuery && normalizedKeyword.startsWith(normalizedQuery)) {
      score = Math.max(score, 1200);
      return;
    }

    if (normalizedQuery && normalizedKeyword.includes(normalizedQuery)) {
      score = Math.max(score, 700);
    }
  });

  return score;
}

function compareSearchResults(left: SearchResult, right: SearchResult) {
  const scoreDifference = (right.score ?? 0) - (left.score ?? 0);
  if (scoreDifference !== 0) return scoreDifference;

  const pagefindScoreDifference = (right.pagefindScore ?? 0) - (left.pagefindScore ?? 0);
  if (pagefindScoreDifference !== 0) return pagefindScoreDifference;

  const leftGroup = resultGroupId(left.pageType);
  const rightGroup = resultGroupId(right.pageType);
  if (leftGroup !== rightGroup) {
    return leftGroup === 'outline' ? -1 : 1;
  }

  const rankDifference = pageTypeRank(left.pageType) - pageTypeRank(right.pageType);
  if (rankDifference !== 0) return rankDifference;

  return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' });
}

function canonicalResultKey(url: string, baseUrl: string) {
  try {
    const parsed = new URL(url, 'https://example.com');
    parsed.searchParams.delete(PAGEFIND_HIGHLIGHT_PARAM);
    let pathname = parsed.pathname.replace(/\/index\.html$/i, '');
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (pathname.startsWith(normalizedBase)) {
      pathname = pathname.slice(normalizedBase.length) || '/';
    }
    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/, '');
    }
    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function findDirectOutlineMatches(query: string, outlineEntries: SearchOutlineEntry[], baseUrl: string) {
  if (!query.trim()) return [];

  return outlineEntries
    .map((entry) => ({
      ...entry,
      url: buildHighlightedUrl(entry.url, query, baseUrl),
      score: scoreOutlineEntry(entry, query),
    }))
    .filter((entry) => (entry.score ?? 0) >= 250)
    .sort((left, right) => {
      return compareSearchResults(left, right);
    })
    .slice(0, 12);
}

function mergeResults(primary: SearchResult[], secondary: SearchResult[], baseUrl: string) {
  const merged = new Map<string, SearchResult>();

  [...primary, ...secondary].forEach((result) => {
    const key = canonicalResultKey(result.url, baseUrl);
    const existing = merged.get(key);
    if (!existing || compareSearchResults(result, existing) < 0) {
      merged.set(key, result);
    }
  });

  return [...merged.values()].sort(compareSearchResults);
}

function flattenResults(items: PagefindSearchItem[], query: string, baseUrl: string) {
  const tokens = getQueryTokens(query);
  const flattened = items.flatMap((item) => {
    const pageTitle = item.meta?.title || 'Untitled';
    const pageType = item.meta?.page_type;
    const pageSearchableText = [pageTitle, stripHtml(item.excerpt), item.raw_content ?? ''].join(' ');
    const subResults = (item.sub_results ?? [])
      .filter((subResult) => {
        const subText = [pageTitle, subResult.title ?? '', stripHtml(subResult.excerpt)].join(' ');
        return matchesQuery(subText, tokens);
      })
      .map((subResult) => ({
        url: buildHighlightedUrl(subResult.url, query, baseUrl),
        title: subResult.title || pageTitle,
        pageTitle: subResult.title && subResult.title !== pageTitle ? pageTitle : undefined,
        pageType,
        pageContext: item.meta?.page_context,
        excerpt: subResult.excerpt,
        pagefindScore: item.pagefindScore,
      }));

    if (subResults.length > 0) {
      return subResults;
    }

    if (!matchesQuery(pageSearchableText, tokens)) {
      return [];
    }

    return [{
      url: buildHighlightedUrl(item.url, query, baseUrl),
      title: pageTitle,
      pageType,
      pageContext: item.meta?.page_context,
      excerpt: item.excerpt,
      pagefindScore: item.pagefindScore,
    }];
  });

  const seen = new Set<string>();
  return flattened.filter((item) => {
    const key = canonicalResultKey(item.url, baseUrl);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).filter((item) => shouldSurfaceResult(item.pageType))
    .map((item) => ({ ...item, score: scoreResult(item, query) }))
    .sort(compareSearchResults);
}

function groupResults(results: SearchResult[]): SearchResultGroup[] {
  const grouped = new Map<string, SearchResultGroup>();

  results.forEach((result, index) => {
    const groupId = resultGroupId(result.pageType);
    if (!grouped.has(groupId)) {
      grouped.set(groupId, {
        id: groupId,
        label: resultGroupLabel(groupId),
        results: [],
      });
    }

    grouped.get(groupId)!.results.push({ ...result, index });
  });

  return ['outline', 'other']
    .map((id) => grouped.get(id))
    .filter((group): group is SearchResultGroup => Boolean(group) && group.results.length > 0);
}

export default function SearchDialog({ baseUrl, outlineEntriesUrl }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagefind, setPagefind] = useState<any>(null);
  const [outlineEntries, setOutlineEntries] = useState<SearchOutlineEntry[]>([]);
  const groupedResults = groupResults(results);

  useEffect(() => {
    if (!isOpen || outlineEntries.length > 0 || !outlineEntriesUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(outlineEntriesUrl, { credentials: 'same-origin' });
        if (!response.ok) return;
        const entries = await response.json();
        if (!cancelled && Array.isArray(entries)) {
          setOutlineEntries(entries);
        }
      } catch {
        // Ignore and fall back to Pagefind-only search.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, outlineEntries.length, outlineEntriesUrl]);

  // Load Pagefind on first open
  useEffect(() => {
    if (!isOpen || pagefind) return;
    (async () => {
      try {
        const pf = await import(/* @vite-ignore */ `${baseUrl}/pagefind/pagefind.js`);
        await pf.options({
          ranking: { termSimilarity: 0 },
        });
        await pf.init();
        setPagefind(pf);
      } catch {
        // Pagefind not available (dev mode)
      }
    })();
  }, [isOpen, pagefind, baseUrl]);

  // Perform search
  useEffect(() => {
    if (!pagefind || !query.trim()) {
      setResults(findDirectOutlineMatches(query, outlineEntries, baseUrl));
      setSelectedIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const search = await pagefind.search(query);
        const items = await Promise.all(
          search.results.slice(0, 80).map(async (r: any) => ({
            ...(await r.data()),
            pagefindScore: typeof r.score === 'number' ? r.score : undefined,
          }))
        );
        if (!cancelled) {
          const directResults = findDirectOutlineMatches(query, outlineEntries, baseUrl);
          const pagefindResults = flattenResults(items, query, baseUrl);
          setResults(mergeResults(directResults, pagefindResults, baseUrl));
          setSelectedIndex(0);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setResults(findDirectOutlineMatches(query, outlineEntries, baseUrl));
          setSelectedIndex(0);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [query, pagefind, outlineEntries, baseUrl]);

  // Listen for global open event and "/" shortcut
  useEffect(() => {
    const handler = () => setIsOpen(true);
    document.addEventListener(OPEN_SEARCH_EVENT, handler);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isOpen && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener(OPEN_SEARCH_EVENT, handler);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Focus input when dialog opens; prevent body scroll
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setQuery('');
      setResults([]);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        window.location.href = results[selectedIndex].url;
      }
    },
    [results, selectedIndex]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the Propaedia"
        class="w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 overflow-hidden"
      >
        {/* Search input */}
        <div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <svg class="h-5 w-5 text-gray-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2} aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search for a topic, Part, Division, or Section"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            class="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none font-sans"
            aria-label="Search query"
          />
          <button
            type="button"
            onClick={close}
            class="flex-shrink-0 px-2 py-1 text-xs font-mono text-gray-500 bg-gray-100 rounded border border-gray-200 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label="Close search"
          >
            Esc
          </button>
        </div>

        {/* Results area */}
        <div class="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div class="px-4 py-8 text-center">
              <p class="text-sm text-gray-400">Searching...</p>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div class="px-4 py-8 text-center">
              <p class="text-sm text-gray-400">No results for "{query}"</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div class="py-2">
              {groupedResults.map((group) => (
                <section key={group.id} class="pb-2">
                  <div class="px-4 py-2">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {group.label}
                    </p>
                  </div>
                  <ul role="listbox">
                    {group.results.map((result) => (
                      <li key={result.url} role="option" aria-selected={result.index === selectedIndex}>
                        <a
                          href={result.url}
                          class={`block px-4 py-3 transition-colors ${
                            result.index === selectedIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div class="flex items-center gap-2">
                            {result.pageType && (
                              <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-slate-500">
                                {result.pageType}
                              </span>
                            )}
                            <p class="text-sm font-semibold text-gray-900 font-sans">{result.title}</p>
                          </div>
                          {result.pageTitle && (
                            <p class="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400 font-sans">
                              {result.pageTitle}
                            </p>
                          )}
                          {result.pageContext && (
                            <p class="mt-0.5 text-[11px] text-gray-400 font-sans">
                              {result.pageContext}
                            </p>
                          )}
                          <p
                            class="text-xs text-gray-500 mt-1 line-clamp-2"
                            dangerouslySetInnerHTML={{ __html: result.excerpt }}
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {!loading && !query && (
            <div class="px-4 py-8 text-center">
              <p class="text-sm text-gray-500 italic font-serif">
                Start with a topic, then jump into a Part, Division, or Section.
              </p>
              <p class="mt-2 text-xs text-gray-400">
                Try queries like <span class="font-medium">evolution</span>, <span class="font-medium">justice</span>, <span class="font-medium">optics</span>, or <span class="font-medium">ancient Greece</span>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="border-t border-gray-100 px-4 py-2 flex items-center justify-end text-xs text-gray-400">
          <div class="flex gap-2">
            <kbd class="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">&uarr;&darr;</kbd>
            <span>to browse</span>
            <kbd class="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">&crarr;</kbd>
            <span>to select</span>
          </div>
        </div>
      </div>
    </div>
  );
}
