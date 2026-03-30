import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import {
  formatEditionLabel,
  type VsiAggregateEntry,
} from '../../utils/readingData';
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
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingSpreadPath from './ReadingSpreadPath';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';
import {
  getCoverageLayerPreference,
  setCoverageLayerPreference,
  subscribeCoverageLayerPreference,
} from '../../utils/readingPreference';

export interface VsiLibraryProps {
  entries: VsiAggregateEntry[];
  baseUrl: string;
  partsMeta?: PartMeta[];
}

const INITIAL_VISIBLE_COUNT = 50;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};

type ReadFilter = 'all' | 'unread' | 'read';
type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title' | 'number';
type SortDirection = 'asc' | 'desc';

function matchesQuery(entry: VsiAggregateEntry, query: string): boolean {
  if (!query) return true;

  const haystack = [
    entry.title,
    entry.author,
    entry.subject ?? '',
    entry.number ? String(entry.number) : '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function formatMetadata(entry: VsiAggregateEntry): string {
  const editionLabel = formatEditionLabel(entry.edition);
  return [
    entry.author,
    entry.number ? `No. ${entry.number}` : null,
    entry.subject ?? null,
    editionLabel,
    entry.publicationYear ? String(entry.publicationYear) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function sortEntries(
  entries: VsiAggregateEntry[],
  sortField: SortField,
  sortDirection: SortDirection,
  coverageCounts: Map<string, Record<'part' | 'division' | 'section' | 'subsection', number>>
): VsiAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);
  const compareText = (a: string, b: string) => (sortDirection === 'asc' ? collate(a, b) : collate(b, a));

  nextEntries.sort((a, b) => {
    switch (sortField) {
      case 'title':
        return compareText(a.title, b.title);
      case 'number': {
        const aNumber = sortDirection === 'asc' ? (a.number ?? Number.MAX_SAFE_INTEGER) : (a.number ?? 0);
        const bNumber = sortDirection === 'asc' ? (b.number ?? Number.MAX_SAFE_INTEGER) : (b.number ?? 0);
        const primary = sortDirection === 'asc' ? aNumber - bNumber : bNumber - aNumber;
        return primary !== 0 ? primary : collate(a.title, b.title);
      }
      default: {
        const aCount = coverageCounts.get(a.checklistKey)?.[sortField] ?? 0;
        const bCount = coverageCounts.get(b.checklistKey)?.[sortField] ?? 0;
        const primary = compareNumber(aCount, bCount);
        return primary !== 0 ? primary : collate(a.title, b.title);
      }
    }
  });

  return nextEntries;
}

function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one VSI covered by your checked titles.';
    case 'division':
      return 'Divisions with at least one VSI covered by your checked titles.';
    case 'section':
      return 'Sections with at least one VSI covered by your checked titles.';
    case 'subsection':
      return 'Top-level Subsection coverage from explicit outline-path matches inside each Section.';
    default:
      return '';
  }
}

function emptyRecommendationMessage(layer: CoverageLayer, isComplete: boolean): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this tab.`;
  }

  return `No unread VSI adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function precisionBadgeText(entry: VsiAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

export default function VsiLibrary({ entries, baseUrl, partsMeta }: VsiLibraryProps) {
  const checklistState = useReadingChecklistState();
  useHashAnchorCorrection('vsi-library');
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [sortField, setSortField] = useState<SortField>('section');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  const changeLayer = (layer: CoverageLayer) => {
    setSelectedLayer(layer);
    setCoverageLayerPreference(layer);
  };

  useEffect(() => {
    setSelectedLayer(getCoverageLayerPreference());
    const unsubLayer = subscribeCoverageLayerPreference((layer) => setSelectedLayer(layer));
    return () => {
      unsubLayer();
    };
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, readFilter, sortField, sortDirection]);

  const normalizedQuery = query.trim().toLowerCase();
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
      coverageRings: buildCoverageRings(entries, checklistState),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [entries, checklistState]);

  const activeLayer = selectedLayer ?? defaultLayer;
  const partSegments = useMemo(() => {
    if (!partsMeta) return undefined;
    return buildPartCoverageSegments(entries, checklistState, activeLayer, partsMeta);
  }, [entries, checklistState, activeLayer, partsMeta]);
  const activeSnapshot = layerSnapshots.find((snapshot) => snapshot.layer === activeLayer) ?? layerSnapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
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
        subsection: countEntryCoverageForLayer(entry, 'subsection'),
      },
    ])
  ), [entries]);

  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (readFilter === 'read' && !isChecked) return false;
      if (readFilter === 'unread' && isChecked) return false;
      return matchesQuery(entry, normalizedQuery);
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <CoverageLayerTabs
        activeLayer={activeLayer}
        onSelect={(layer) => changeLayer(layer)}
        snapshots={layerTabSnapshots}
      />

      <div class="space-y-4">
        <ReadingCoverageSummary
          coverageRings={coverageRings}
          totalLabel="Titles"
          totalCount={entries.length}
          totalDescription="Unique Oxford Very Short Introductions in the mapped reading list."
          completedCount={completedCount}
          completedDescription="Shared with the Done boxes on section pages."
          activeCoverageLabel={`${layerMeta.label} Coverage`}
          activeRingLabel={layerMeta.pluralLabel}
          onSelectCoverageRing={(label) => {
            const layer = LAYER_BY_RING_LABEL[label];
            if (layer) changeLayer(layer);
          }}
          activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
          activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
          activeCoverageDescription={activeCoverageDescription(activeLayer)}
          partSegments={partSegments}
          activeLayerLabel={coverageLayerLabel(activeLayer, 2)}
          mobileRingWidth={7}
          desktopRingWidth={9}
        />

        <ReadingSpreadPath
          isOpen={spreadPathOpen}
          onToggleOpen={() => setSpreadPathOpen(!spreadPathOpen)}
          steps={activePath}
          remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
          checklistState={checklistState}
          onCheckedChange={writeChecklistState}
          getHref={(step) => `${baseUrl}/vsi/${slugify(step.title)}`}
          renderMeta={(step) => (
            <>
              <p class="mt-1 text-sm text-gray-600">{formatMetadata(step)}</p>
              {activeLayer === 'subsection' && precisionBadgeText(step) ? (
                <p class="mt-1 text-xs text-gray-500">{precisionBadgeText(step)}</p>
              ) : null}
            </>
          )}
          checkboxAriaLabel={(step) => `Mark ${step.title} by ${step.author} as completed`}
          itemSingular="book"
          itemPlural="books"
          coverageLayer={activeLayer}
          coverageUnitSingular={layerMeta.label}
          coverageUnitPlural={layerMeta.pluralLabel}
          emptyMessage={emptyRecommendationMessage(activeLayer, isLayerComplete)}
          baseUrl={baseUrl}
        />
      </div>

      <CoverageGapPanel
        entries={entries}
        checklistState={checklistState}
        activeLayer={activeLayer}
        baseUrl={baseUrl}
        itemLabelPlural="books"
        isComplete={isLayerComplete}
      />

      <section id="vsi-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">VSI Library</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full mapped VSI list and sort it by coverage across Parts, Divisions, Sections, or Subsections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full library list below. The Outline Layer tabs above drive the adaptive path and gap panels.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching titles
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_180px]">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              placeholder="Title, author, subject, or series number"
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
              <option value="all">All titles</option>
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
              <option value="number">Series number</option>
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
                const metadata = formatMetadata(entry);

                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/vsi/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">{metadata}</p>
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
                          aria-label={`Mark ${entry.title} by ${entry.author} as completed`}
                        />
                        Done
                      </label>
                    </div>

                    <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                      <span class={`rounded-full px-2.5 py-1 ${entry.sectionCount > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                        {entry.sectionCount > 0 ? `Appears in ${entry.sectionCount} Sections` : 'No matching sections'}
                      </span>
                      {precisionBadgeText(entry) && (
                        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{precisionBadgeText(entry)}</span>
                      )}
                      {entry.subject && (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{entry.subject}</span>
                      )}
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
                  Show 50 more
                </button>
              </div>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
            No VSI titles matched that search.
          </div>
        )}
      </section>
    </div>
  );
}
