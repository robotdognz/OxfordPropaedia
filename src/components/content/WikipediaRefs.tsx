import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import WikipediaCard from './WikipediaCard';
import {
  wikipediaChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  OUTLINE_SELECT_EVENT,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';
import {
  filterArticlesForOutline,
  type SearchableWikiArticle,
} from '../../utils/wikipediaOutlineFilter';

export interface WikipediaArticleRef extends SearchableWikiArticle {
  rationale?: string;
  matchPercent?: number;
  extract?: string;
}

export interface WikipediaRefsProps {
  articles: WikipediaArticleRef[];
  sectionCode: string;
  baseUrl: string;
}

const STORAGE_KEY = 'propaedia-wiki-level';

function getStoredLevel(): number {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return 1;
  if (stored === '3') return 3;
  return 3;
}

export default function WikipediaRefs({ articles, sectionCode, baseUrl }: WikipediaRefsProps) {
  const [level, setLevel] = useState(3);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(undefined);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLevel(getStoredLevel());
    setChecklistState(readChecklistState());
    const unsub = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const onStorage = () => setLevel(getStoredLevel());
    window.addEventListener('storage', onStorage);
    return () => { unsub(); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      setSelection(detail);
      setForceOpenKey(Date.now());
      window.requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    document.addEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
    return () => document.removeEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
  }, [sectionCode]);

  if (!articles || articles.length === 0) return null;

  const levelFiltered = articles.filter((a) => (a.lowestLevel || 3) <= level);

  let visibleArticles: (WikipediaArticleRef & { filterScore?: number })[];
  if (selection) {
    visibleArticles = filterArticlesForOutline(levelFiltered, selection);
  } else {
    visibleArticles = [...levelFiltered].sort((a, b) => (b.matchPercent || 0) - (a.matchPercent || 0));
  }

  const isFiltered = selection !== null;
  const totalCount = levelFiltered.length;
  const visibleCount = visibleArticles.length;

  const maxScore = selection
    ? Math.max(...visibleArticles.map((a) => a.filterScore || 0), 1)
    : Math.max(...visibleArticles.map((a) => a.matchPercent || 0), 1);

  return (
    <section ref={sectionRef} class="mt-6 scroll-mt-24">
      <Accordion title={`Wikipedia Article Recommendations (${totalCount})`} forceOpenKey={forceOpenKey}>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <span class="text-xs text-gray-500">
            Showing Level {level === 1 ? '1 (Top 10)' : level === 2 ? '2 (Top 100)' : '3 (~1,000)'}
          </span>
          <a
            href={`${baseUrl}/wikipedia`}
            class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Browse all Wikipedia articles
          </a>
        </div>

        {isFiltered && (
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-amber-900">
                Showing {visibleCount} of {totalCount} articles for {selection.outlinePath}
              </p>
              <p class="mt-1 text-xs text-amber-800">{selection.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              class="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              Show all
            </button>
          </div>
        )}

        {visibleCount > 0 ? (
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleArticles.map((article) => {
              const checkKey = wikipediaChecklistKey(article.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const mp = selection
                ? Math.round(Math.min((article.filterScore || 0) / maxScore, 1) * 100)
                : (article.matchPercent || 0);

              return (
                <WikipediaCard
                  key={article.title}
                  title={article.title}
                  displayTitle={article.displayTitle}
                  rationale={article.rationale}
                  baseUrl={baseUrl}
                  matchPercent={mp}
                  checked={isChecked}
                  onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                />
              );
            })}
          </div>
        ) : (
          <div class="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No Wikipedia articles matched this outline item.
          </div>
        )}
      </Accordion>
    </section>
  );
}
