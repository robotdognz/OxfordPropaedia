import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

export interface SearchDialogProps {
  baseUrl: string;
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
  excerpt: string;
}

interface PagefindSubResult {
  title?: string;
  url: string;
  excerpt: string;
}

interface PagefindResultData {
  url: string;
  meta?: { title?: string };
  excerpt: string;
  raw_content?: string;
  sub_results?: PagefindSubResult[];
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

function getQueryTokens(query: string) {
  return normalizeText(query)
    .split(' ')
    .filter((token) => token.length > 1);
}

function matchesQuery(text: string, tokens: string[]) {
  if (tokens.length === 0) return true;
  const normalized = normalizeText(text);
  return tokens.every((token) => normalized.includes(token));
}

function buildHighlightedUrl(rawUrl: string, query: string) {
  const highlightTerms = normalizeText(query)
    .split(' ')
    .filter(Boolean);

  if (highlightTerms.length === 0) {
    return rawUrl;
  }

  try {
    const isAbsolute = /^(https?:)?\/\//.test(rawUrl);
    const url = new URL(isAbsolute ? rawUrl : `https://example.com${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`);
    highlightTerms.forEach((term) => url.searchParams.append(PAGEFIND_HIGHLIGHT_PARAM, term));
    return isAbsolute ? url.toString() : url.toString().replace(/^https:\/\/example\.com/, '');
  } catch {
    return rawUrl;
  }
}

function flattenResults(items: PagefindResultData[], query: string) {
  const tokens = getQueryTokens(query);
  const flattened = items.flatMap((item) => {
    const pageTitle = item.meta?.title || 'Untitled';
    const pageSearchableText = [pageTitle, stripHtml(item.excerpt), item.raw_content ?? ''].join(' ');
    const subResults = (item.sub_results ?? [])
      .filter((subResult) => {
        const subText = [pageTitle, subResult.title ?? '', stripHtml(subResult.excerpt)].join(' ');
        return matchesQuery(subText, tokens);
      })
      .map((subResult) => ({
        url: buildHighlightedUrl(subResult.url, query),
        title: subResult.title || pageTitle,
        pageTitle: subResult.title && subResult.title !== pageTitle ? pageTitle : undefined,
        excerpt: subResult.excerpt,
      }));

    if (subResults.length > 0) {
      return subResults;
    }

    if (!matchesQuery(pageSearchableText, tokens)) {
      return [];
    }

    return [{
      url: buildHighlightedUrl(item.url, query),
      title: pageTitle,
      excerpt: item.excerpt,
    }];
  });

  const seen = new Set<string>();
  return flattened.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export default function SearchDialog({ baseUrl }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagefind, setPagefind] = useState<any>(null);

  // Load Pagefind on first open
  useEffect(() => {
    if (!isOpen || pagefind) return;
    (async () => {
      try {
        const pf = await import(/* @vite-ignore */ `${baseUrl}/pagefind/pagefind.js`);
        await pf.options({
          highlightParam: PAGEFIND_HIGHLIGHT_PARAM,
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
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const search = await pagefind.search(query);
        const items = await Promise.all(
          search.results.slice(0, 20).map((r: any) => r.data())
        );
        if (!cancelled) {
          setResults(flattenResults(items, query));
          setSelectedIndex(0);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setSelectedIndex(0);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [query, pagefind]);

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
            placeholder="Search sections, outlines, references..."
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
            <ul class="py-2" role="listbox">
              {results.map((result, i) => (
                <li key={result.url} role="option" aria-selected={i === selectedIndex}>
                  <a
                    href={result.url}
                    class={`block px-4 py-3 transition-colors ${
                      i === selectedIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <p class="text-sm font-semibold text-gray-900 font-sans">{result.title}</p>
                    {result.pageTitle && (
                      <p class="mt-1 text-[11px] uppercase tracking-wide text-gray-400 font-sans">
                        {result.pageTitle}
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
          )}

          {!loading && !query && (
            <div class="px-4 py-8 text-center">
              <p class="text-sm text-gray-400 italic font-serif">
                Type to search across all sections and outlines
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="border-t border-gray-100 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
          <span class="font-sans">Press <kbd class="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">/</kbd> to search</span>
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
