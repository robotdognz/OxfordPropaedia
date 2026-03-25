import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { type WikipediaAggregateEntry } from '../../utils/readingData';
import { slugify, type PartMeta } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import {
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  buildPartCoverageSegments,
  completedChecklistKeysFromState,
  countEntryCoverageForLayer,
  countCompletedEntries,
  coverageLayerLabel,
  COVERAGE_LAYER_META,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import CoverageLayerTabs from './CoverageLayerTabs';
import CoverageGapPanel from './CoverageGapPanel';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSpreadPath from './ReadingSpreadPath';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';

export interface WikipediaLibraryProps {
  entries: WikipediaAggregateEntry[];
  baseUrl: string;
  outlineItemCounts?: Record<string, number>;
  totalOutlineItems?: number;
  partsMeta?: PartMeta[];
}

type KnowledgeLevel = 1 | 2 | 3;
type ReadFilter = 'all' | 'unread' | 'read';
type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title';
type SortDirection = 'asc' | 'desc';

const LEVEL_KEY = 'propaedia-wiki-level';
const INITIAL_VISIBLE = 50;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};

function getStoredLevel(): KnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(LEVEL_KEY);
  if (stored === '1' || stored === '2' || stored === '3') {
    return Number(stored) as KnowledgeLevel;
  }
  return 3;
}

function storeLevel(level: KnowledgeLevel) {
  if (typeof window !== 'undefined') localStorage.setItem(LEVEL_KEY, String(level));
}

function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one checked vital article.';
    case 'division':
      return 'Divisions with at least one checked vital article.';
    case 'section':
      return 'Sections with at least one checked vital article.';
    case 'subsection':
      return 'Mapped Subsection coverage from outline-path matches in the Section mappings.';
    default:
      return '';
  }
}

function emptyRecommendationMessage(layer: CoverageLayer, isComplete: boolean): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this tab.`;
  }

  return `No unread article adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function precisionBadgeText(entry: WikipediaAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

export default function WikipediaLibrary({
  entries,
  baseUrl,
  outlineItemCounts,
  totalOutlineItems,
  partsMeta,
}: WikipediaLibraryProps) {
  const checklistState = useReadingChecklistState();
  useHashAnchorCorrection('wikipedia-library');
  const [level, setLevel] = useState<KnowledgeLevel>(3);
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [sortField, setSortField] = useState<SortField>('section');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setLevel(getStoredLevel());
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, readFilter, sortField, sortDirection, level]);

  const changeLevel = (newLevel: KnowledgeLevel) => {
    setLevel(newLevel);
    setSelectedLayer(null);
    storeLevel(newLevel);
  };

  const levelEntries = entries.filter((entry) => entry.lowestLevel <= level);
  const completedCount = countCompletedEntries(levelEntries, checklistState);
  const normalizedQuery = query.trim().toLowerCase();

  const {
    coverageRings,
    defaultLayer,
    layerSnapshots,
    layerTabSnapshots,
  } = useMemo(() => {
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
    const snapshots = RECOMMENDATION_LAYERS.map((layer) => buildLayerCoverageSnapshot(levelEntries, completedChecklistKeys, layer, {
      outlineItemCounts,
    }));
    const tabSnapshots = snapshots.map((snapshot) => ({
      layer: snapshot.layer,
      currentlyCoveredCount: snapshot.currentlyCoveredCount,
      totalCoverageCount: snapshot.totalCoverageCount,
    }));

    return {
      coverageRings: buildCoverageRings(levelEntries, checklistState, {
        outlineItemCounts,
        totalOutlineItems,
      }),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [checklistState, levelEntries, outlineItemCounts, totalOutlineItems]);

  const activeLayer = selectedLayer ?? defaultLayer;
  const partSegments = useMemo(() => {
    if (!partsMeta) return undefined;
    return buildPartCoverageSegments(levelEntries, checklistState, activeLayer, partsMeta);
  }, [levelEntries, checklistState, activeLayer, partsMeta]);
  const activeSnapshot = layerSnapshots.find((snapshot) => snapshot.layer === activeLayer) ?? layerSnapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
  const bestNextRead = activePath[0] ?? null;
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const layerMeta = activeSnapshot ? COVERAGE_LAYER_META[activeSnapshot.layer] : COVERAGE_LAYER_META.section;
  const coverageCounts = useMemo(() => new Map(
    levelEntries.map((entry) => [
      entry.checklistKey,
      {
        part: countEntryCoverageForLayer(entry, 'part'),
        division: countEntryCoverageForLayer(entry, 'division'),
        section: countEntryCoverageForLayer(entry, 'section'),
        subsection: countEntryCoverageForLayer(entry, 'subsection', { outlineItemCounts }),
      },
    ])
  ), [levelEntries, outlineItemCounts]);

  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);
  const filteredEntries = levelEntries
    .filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      if (readFilter === 'read' && !isChecked) return false;
      if (readFilter === 'unread' && isChecked) return false;
      if (!normalizedQuery) return true;
      return entry.title.toLowerCase().includes(normalizedQuery) || (entry.category || '').toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => {
      switch (sortField) {
        case 'title':
          return sortDirection === 'asc' ? collate(a.title, b.title) : collate(b.title, a.title);
        default: {
          const aCount = coverageCounts.get(a.checklistKey)?.[sortField] ?? 0;
          const bCount = coverageCounts.get(b.checklistKey)?.[sortField] ?? 0;
          const primary = compareNumber(aCount, bCount);
          return primary !== 0 ? primary : collate(a.title, b.title);
        }
      }
    });

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <div class="flex justify-center">
        <div class="flex rounded-lg border border-gray-200 bg-white p-1">
          {([1, 2, 3] as KnowledgeLevel[]).map((lvl) => {
            const labels: Record<number, string> = { 1: 'Level 1 - 10', 2: 'Level 2 - 100', 3: 'Level 3 - ~1,000' };
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => changeLevel(lvl)}
                class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${level === lvl ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {labels[lvl]}
              </button>
            );
          })}
        </div>
      </div>

      <CoverageLayerTabs
        activeLayer={activeLayer}
        onSelect={(layer) => setSelectedLayer(layer)}
        snapshots={layerTabSnapshots}
      />

      <div class="space-y-4">
        <ReadingCoverageSummary
          coverageRings={coverageRings}
          totalLabel="Articles"
          totalCount={levelEntries.length}
          totalDescription="Wikipedia Vital Articles at the selected level."
          completedCount={completedCount}
          completedDescription="Shared with the Done boxes on section pages."
          activeCoverageLabel={`${layerMeta.label} Coverage`}
          activeRingLabel={layerMeta.pluralLabel}
          onSelectCoverageRing={(label) => {
            const layer = LAYER_BY_RING_LABEL[label];
            if (layer) setSelectedLayer(layer);
          }}
          activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
          activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
          activeCoverageDescription={activeCoverageDescription(activeLayer)}
          bestNextLabel={`Best Next for ${layerMeta.label} Coverage`}
          bestNextHref={bestNextRead ? `${baseUrl}/wikipedia/${slugify(bestNextRead.title)}` : undefined}
          bestNextTitle={bestNextRead?.title}
          bestNextDescription={bestNextRead
            ? `Adds ${bestNextRead.newCoverageCount} new ${coverageLayerLabel(activeLayer, bestNextRead.newCoverageCount)}, ${bestNextRead.sectionCount} total Sections.${activeLayer === 'subsection' && precisionBadgeText(bestNextRead) ? ` ${precisionBadgeText(bestNextRead)}.` : ''}`
            : undefined}
          emptyBestNextText={emptyRecommendationMessage(activeLayer, isLayerComplete)}
          partSegments={partSegments}
          activeLayerLabel={coverageLayerLabel(activeLayer, 2)}
        />

        <ReadingSpreadPath
          isOpen={spreadPathOpen}
          onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
          steps={activePath}
          remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
          checklistState={checklistState}
          onCheckedChange={writeChecklistState}
          getHref={(step) => `${baseUrl}/wikipedia/${slugify(step.title)}`}
          renderMeta={(step) => (
            <>
              {activeLayer === 'subsection' && precisionBadgeText(step) ? (
                <p class="mt-1 text-xs text-gray-500">{precisionBadgeText(step)}</p>
              ) : null}
            </>
          )}
          checkboxAriaLabel={(step) => `Mark ${step.title} as read`}
          itemSingular="article"
          itemPlural="articles"
          coverageUnitSingular={layerMeta.label}
          coverageUnitPlural={layerMeta.pluralLabel}
          emptyMessage={emptyRecommendationMessage(activeLayer, isLayerComplete)}
          baseUrl={baseUrl}
          sectionLinksVariant="chips"
        />
      </div>

      <CoverageGapPanel
        entries={entries}
        checklistState={checklistState}
        activeLayer={activeLayer}
        baseUrl={baseUrl}
        itemLabelPlural="articles"
        outlineItemCounts={outlineItemCounts}
        isComplete={isLayerComplete}
      />

      <section id="wikipedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Wikipedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full Vital Articles list and sort it by coverage across Parts, Divisions, Sections, or Subsections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full article list below. The Outline Layer tabs above drive the adaptive path and gap panels.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              placeholder="Search articles..."
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Read Status</span>
            <select
              value={readFilter}
              onChange={(event) => setReadFilter((event.currentTarget as HTMLSelectElement).value as ReadFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All</option>
              <option value="unread">Unread only</option>
              <option value="read">Read only</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort By</span>
            <select
              value={sortField}
              onChange={(event) => setSortField((event.currentTarget as HTMLSelectElement).value as SortField)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="part">Most Parts covered</option>
              <option value="division">Most Divisions covered</option>
              <option value="section">Most Sections covered</option>
              <option value="subsection">Most Subsections covered</option>
              <option value="title">Title</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Order</span>
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection((event.currentTarget as HTMLSelectElement).value as SortDirection)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>

        {filteredEntries.length > 0 ? (
          <>
            <div class="mt-6 space-y-4">
              {visibleEntries.map((entry) => {
                const isChecked = Boolean(checklistState[entry.checklistKey]);
                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/wikipedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.displayTitle || entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">
                          {entry.category && <span>{entry.category}</span>}
                          {entry.category && entry.sectionCount > 0 && <span> · </span>}
                          {entry.sectionCount > 0 && <span>{entry.sectionCount} sections</span>}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => writeChecklistState(entry.checklistKey, (event.currentTarget as HTMLInputElement).checked)}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as read`}
                        />
                        Done
                      </label>
                    </div>
                    <div class="mt-3 flex items-center gap-3">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Read on Wikipedia ↗
                      </a>
                      {precisionBadgeText(entry) && (
                        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {precisionBadgeText(entry)}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {canShowMore && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 50)}
                class="mt-6 w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Show more ({filteredEntries.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
            No articles match your filters.
          </div>
        )}
      </section>
    </div>
  );
}
