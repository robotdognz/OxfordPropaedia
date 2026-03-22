import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { type MacropaediaAggregateEntry } from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import {
  buildCoverageRings,
  buildLayerCoverageSnapshot,
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
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingSpreadPath from './ReadingSpreadPath';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
}

const INITIAL_VISIBLE_COUNT = 60;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section'];

type ReadFilter = 'all' | 'unread' | 'read';
type SortField = 'section' | 'part' | 'division' | 'title';
type SortDirection = 'asc' | 'desc';

function matchesQuery(entry: MacropaediaAggregateEntry, query: string): boolean {
  if (!query) return true;
  return entry.title.toLowerCase().includes(query);
}

function sortEntries(
  entries: MacropaediaAggregateEntry[],
  sortField: SortField,
  sortDirection: SortDirection,
  coverageCounts: Map<string, Record<'part' | 'division' | 'section', number>>
): MacropaediaAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);

  nextEntries.sort((a, b) => {
    if (sortField === 'title') {
      return sortDirection === 'asc' ? collate(a.title, b.title) : collate(b.title, a.title);
    }

    const aCount = coverageCounts.get(a.checklistKey)?.[sortField] ?? 0;
    const bCount = coverageCounts.get(b.checklistKey)?.[sortField] ?? 0;
    const primary = compareNumber(aCount, bCount);
    return primary !== 0 ? primary : collate(a.title, b.title);
  });

  return nextEntries;
}

function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one Macropaedia article covered by your checked list.';
    case 'division':
      return 'Divisions with at least one Macropaedia article covered by your checked list.';
    case 'section':
      return 'Sections with at least one Macropaedia article covered by your checked list.';
    case 'subsection':
      return 'Approximate subsection coverage, based on mapped outline items reached by your checked articles.';
    default:
      return '';
  }
}

function emptyRecommendationMessage(layer: CoverageLayer, isComplete: boolean): string {
  const label = coverageLayerLabel(layer, 2);
  if (isComplete) {
    return `You have already covered every mapped ${label} in this tab.`;
  }

  return `No unread article adds any further ${label} coverage right now.`;
}

export default function MacropaediaLibrary({
  entries,
  baseUrl,
}: MacropaediaLibraryProps) {
  const checklistState = useReadingChecklistState();
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [sortField, setSortField] = useState<SortField>('section');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, readFilter, sortField, sortDirection]);

  const completedCount = countCompletedEntries(entries, checklistState);

  const {
    coverageRings,
    defaultLayer,
    layerSnapshots,
    layerTabSnapshots,
  } = useMemo(() => {
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
    const snapshots = RECOMMENDATION_LAYERS.map((layer) => buildLayerCoverageSnapshot(entries, completedChecklistKeys, layer));
    const tabSnapshots = snapshots.map((snapshot) => ({
      layer: snapshot.layer,
      currentlyCoveredCount: snapshot.currentlyCoveredCount,
      totalCoverageCount: snapshot.totalCoverageCount,
    }));

    return {
      coverageRings: buildCoverageRings(entries, checklistState, {
        includeSubsections: false,
      }),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [checklistState, entries]);

  const activeLayer = selectedLayer ?? defaultLayer;
  const activeSnapshot = layerSnapshots.find((snapshot) => snapshot.layer === activeLayer) ?? layerSnapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
  const bestNextArticle = activePath[0] ?? null;
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const layerMeta = activeSnapshot ? COVERAGE_LAYER_META[activeSnapshot.layer] : COVERAGE_LAYER_META.section;
  const coverageCounts = useMemo(() => new Map(
    entries.map((entry) => [
      entry.checklistKey,
      {
        part: countEntryCoverageForLayer(entry, 'part'),
        division: countEntryCoverageForLayer(entry, 'division'),
        section: countEntryCoverageForLayer(entry, 'section'),
      },
    ])
  ), [entries]);

  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (readFilter === 'read' && !isChecked) return false;
      if (readFilter === 'unread' && isChecked) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-8">
      <CoverageLayerTabs
        activeLayer={activeLayer}
        onSelect={(layer) => setSelectedLayer(layer)}
        snapshots={layerTabSnapshots}
      />

      <ReadingCoverageSummary
        coverageRings={coverageRings}
        totalLabel="Articles"
        totalCount={entries.length}
        totalDescription="Unique Macropaedia titles referenced in the outline."
        completedCount={completedCount}
        completedDescription="Uses the same checklist state as the section reading boxes."
        activeCoverageLabel={`${layerMeta.label} Coverage`}
        activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
        activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
        activeCoverageDescription={activeCoverageDescription(activeLayer)}
        bestNextLabel={`Best Next for ${layerMeta.label} Coverage`}
        bestNextHref={bestNextArticle ? `${baseUrl}/macropaedia/${slugify(bestNextArticle.title)}` : undefined}
        bestNextTitle={bestNextArticle?.title}
        bestNextDescription={bestNextArticle ? `Adds ${bestNextArticle.newCoverageCount} new ${coverageLayerLabel(activeLayer, bestNextArticle.newCoverageCount)}, ${bestNextArticle.sectionCount} total Sections.` : undefined}
        emptyBestNextText={emptyRecommendationMessage(activeLayer, isLayerComplete)}
      />

      <CoverageGapPanel
        entries={entries}
        checklistState={checklistState}
        activeLayer={activeLayer}
        baseUrl={baseUrl}
        itemLabelPlural="articles"
        isComplete={isLayerComplete}
      />

      <ReadingSpreadPath
        isOpen={spreadPathOpen}
        onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
        steps={activePath}
        remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
        checklistState={checklistState}
        onCheckedChange={writeChecklistState}
        getHref={(step) => `${baseUrl}/macropaedia/${slugify(step.title)}`}
        checkboxAriaLabel={(step) => `Mark ${step.title} as completed`}
        itemSingular="article"
        itemPlural="articles"
        coverageUnitSingular={layerMeta.label}
        coverageUnitPlural={layerMeta.pluralLabel}
        emptyMessage={emptyRecommendationMessage(activeLayer, isLayerComplete)}
        baseUrl={baseUrl}
      />

      <section class="rounded-2xl border border-gray-200 bg-white p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Macropaedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full historical Macropaedia list and sort it by coverage across Parts, Divisions, or Sections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full article list below. The Recommendation Focus tabs above drive the adaptive path and gap panels.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>

        <div class="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_180px]">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              placeholder="Article title"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Read Status</span>
            <select
              value={readFilter}
              onChange={(event) => setReadFilter((event.currentTarget as HTMLSelectElement).value as ReadFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All articles</option>
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
                          <a href={`${baseUrl}/macropaedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-3 text-xs font-medium text-gray-700">
                          Appears in {entry.sectionCount} Section{entry.sectionCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            writeChecklistState(
                              entry.checklistKey,
                              (event.currentTarget as HTMLInputElement).checked
                            );
                          }}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as completed`}
                        />
                        Done
                      </label>
                    </div>

                    <ReadingSectionLinks
                      sections={entry.sections}
                      baseUrl={baseUrl}
                      label={`Show all ${entry.sectionCount} Sections`}
                    />
                  </article>
                );
              })}
            </div>

            {canShowMore && (
              <div class="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE_COUNT)}
                  class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  Show 60 more
                </button>
              </div>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
            No Macropaedia articles matched that search.
          </div>
        )}
      </section>
    </div>
  );
}
