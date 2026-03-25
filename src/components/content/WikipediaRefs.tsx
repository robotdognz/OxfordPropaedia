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
import { getReadingPreference, getHideCheckedReadings, setHideCheckedReadings, subscribeHideCheckedReadings } from '../../utils/readingPreference';
import { ACCORDION_ANIMATION_MS } from '../ui/Accordion';
import { classifyMappingPrecision, mappingPrecisionBadge } from '../../utils/mappingPrecision';

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
type KnowledgeLevel = 1 | 2 | 3;

function getStoredLevel(): KnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1' || stored === '2' || stored === '3') {
    return Number(stored) as KnowledgeLevel;
  }
  return 3;
}

export default function WikipediaRefs({ articles, sectionCode, baseUrl }: WikipediaRefsProps) {
  const [level, setLevel] = useState<KnowledgeLevel>(3);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(() => getReadingPreference() === 'wikipedia' ? 0 : undefined);
  const [forceCloseKey, setForceCloseKey] = useState<number | undefined>(() => getReadingPreference() !== 'wikipedia' ? 0 : undefined);
  const sectionRef = useRef<HTMLElement>(null);

  const [hideChecked, setHideChecked] = useState(() => getHideCheckedReadings());

  useEffect(() => {
    setLevel(getStoredLevel());
    setChecklistState(readChecklistState());
    const unsub = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      setLevel(getStoredLevel());
    };
    window.addEventListener('storage', onStorage);
    return () => { unsub(); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    return subscribeHideCheckedReadings((hide) => setHideChecked(hide));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      setSelection(detail);
      if (getReadingPreference() === 'wikipedia') {
        setForceOpenKey(Date.now());
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, ACCORDION_ANIMATION_MS + 50);
      } else {
        setForceCloseKey(Date.now());
      }
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

  const displayArticles = hideChecked
    ? visibleArticles.filter(a => !checklistState[wikipediaChecklistKey(a.title)])
    : visibleArticles;

  const isFiltered = selection !== null;
  const totalCount = levelFiltered.length;
  const visibleCount = displayArticles.length;

  const maxScore = selection
    ? Math.max(...displayArticles.map((a) => a.filterScore || 0), 1)
    : Math.max(...displayArticles.map((a) => a.matchPercent || 0), 1);

  return (
    <section ref={sectionRef} class="scroll-mt-24">
      <Accordion title={`Wikipedia Article Recommendations (${totalCount})`} forceOpenKey={forceOpenKey} forceCloseKey={forceCloseKey}>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-4">
            <span class="text-xs text-gray-500">
              Showing Level {level === 1 ? '1 (Top 10)' : level === 2 ? '2 (Top 100)' : '3 (~1,000)'}
            </span>
            <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideChecked}
                onChange={(e) => setHideCheckedReadings((e.currentTarget as HTMLInputElement).checked)}
                class="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Hide checked
            </label>
          </div>
          <a
            href={`${baseUrl}/wikipedia#wikipedia-library`}
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
            {displayArticles.map((article) => {
              const checkKey = wikipediaChecklistKey(article.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const mp = selection
                ? Math.round(Math.min((article.filterScore || 0) / maxScore, 1) * 100)
                : (article.matchPercent || 0);
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(article.relevantPathsAI, selection?.outlinePath ?? null)
              );

              return (
                <WikipediaCard
                  key={article.title}
                  title={article.title}
                  displayTitle={article.displayTitle}
                  rationale={article.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={mp}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
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
