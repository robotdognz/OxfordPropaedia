import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { type IotAggregateEntry } from '../../utils/readingData';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import {
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  buildPartCoverageSegments,
  completedChecklistKeysFromState,
  countCompletedEntries,
  countEntryCoverageForLayer,
  coverageLayerLabel,
  COVERAGE_LAYER_META,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import type { PartMeta } from '../../utils/helpers';
import CoverageLayerTabs from './CoverageLayerTabs';
import CoverageGapPanel from './CoverageGapPanel';
import ReadingCoverageSummary from './ReadingCoverageSummary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingSpreadPath from './ReadingSpreadPath';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';

export interface IotLibraryProps {
  entries: IotAggregateEntry[];
  baseUrl: string;
  outlineItemCounts?: Record<string, number>;
  totalOutlineItems?: number;
  partsMeta?: PartMeta[];
}

type ReadFilter = 'all' | 'unread' | 'read';
type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title' | 'date' | 'duration';
type SortDirection = 'asc' | 'desc';

const INITIAL_VISIBLE = 50;
const RECOMMENDATION_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};

function activeCoverageDescription(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'Parts with at least one checked episode.';
    case 'division':
      return 'Divisions with at least one checked episode.';
    case 'section':
      return 'Sections with at least one checked episode.';
    case 'subsection':
      return 'Mapped Subsection coverage from episode path matches inside each Section.';
    default:
      return '';
  }
}

function emptyRecommendationMessage(layer: CoverageLayer, isComplete: boolean): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this tab.`;
  }

  return `No unheard episode adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function precisionBadgeText(entry: IotAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

function matchesQuery(entry: IotAggregateEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const haystack = [
    entry.title,
    entry.synopsis ?? '',
    entry.datePublished ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function compareDate(a?: string, b?: string): number {
  const left = a ? new Date(a).getTime() : Number.NaN;
  const right = b ? new Date(b).getTime() : Number.NaN;

  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return left - right;
}

export default function IotLibrary({
  entries,
  baseUrl,
  outlineItemCounts,
  totalOutlineItems,
  partsMeta,
}: IotLibraryProps) {
  const checklistState = useReadingChecklistState();
  useHashAnchorCorrection('iot-library');
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [sortField, setSortField] = useState<SortField>('section');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
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
    const snapshots = RECOMMENDATION_LAYERS.map((layer) => buildLayerCoverageSnapshot(entries, completedChecklistKeys, layer, {
      outlineItemCounts,
    }));
    const tabSnapshots = snapshots.map((snapshot) => ({
      layer: snapshot.layer,
      currentlyCoveredCount: snapshot.currentlyCoveredCount,
      totalCoverageCount: snapshot.totalCoverageCount,
    }));

    return {
      coverageRings: buildCoverageRings(entries, checklistState, {
        outlineItemCounts,
        totalOutlineItems,
      }),
      defaultLayer: selectDefaultCoverageLayer(tabSnapshots),
      layerSnapshots: snapshots,
      layerTabSnapshots: tabSnapshots,
    };
  }, [entries, checklistState, outlineItemCounts, totalOutlineItems]);

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
  const bestNextEpisode = activePath[0] ?? null;
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
        subsection: countEntryCoverageForLayer(entry, 'subsection', { outlineItemCounts }),
      },
    ])
  ), [entries, outlineItemCounts]);

  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);

  const filteredEntries = [...entries]
    .filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      if (readFilter === 'read' && !isChecked) return false;
      if (readFilter === 'unread' && isChecked) return false;
      return matchesQuery(entry, normalizedQuery);
    })
    .sort((a, b) => {
      switch (sortField) {
        case 'title':
          return sortDirection === 'asc' ? collate(a.title, b.title) : collate(b.title, a.title);
        case 'date': {
          const primary = sortDirection === 'asc'
            ? compareDate(a.datePublished, b.datePublished)
            : compareDate(b.datePublished, a.datePublished);
          return primary !== 0 ? primary : collate(a.title, b.title);
        }
        case 'duration': {
          const aDuration = a.durationSeconds ?? (sortDirection === 'asc' ? Number.MAX_SAFE_INTEGER : 0);
          const bDuration = b.durationSeconds ?? (sortDirection === 'asc' ? Number.MAX_SAFE_INTEGER : 0);
          const primary = sortDirection === 'asc' ? aDuration - bDuration : bDuration - aDuration;
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

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <CoverageLayerTabs
        activeLayer={activeLayer}
        onSelect={(layer) => setSelectedLayer(layer)}
        snapshots={layerTabSnapshots}
      />

      <div class="space-y-4">
        <ReadingCoverageSummary
          coverageRings={coverageRings}
          totalLabel="Episodes"
          totalCount={entries.length}
          totalDescription="Mapped BBC In Our Time episodes in the listening list."
          completedCount={completedCount}
          completedDescription="Shared with the Done boxes on Section pages."
          activeCoverageLabel={`${layerMeta.label} Coverage`}
          activeRingLabel={layerMeta.pluralLabel}
          onSelectCoverageRing={(label) => {
            const layer = LAYER_BY_RING_LABEL[label];
            if (layer) setSelectedLayer(layer);
          }}
          activeCoverageCount={activeSnapshot?.currentlyCoveredCount ?? 0}
          activeCoverageTotal={activeSnapshot?.totalCoverageCount ?? 0}
          activeCoverageDescription={activeCoverageDescription(activeLayer)}
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
          getHref={(step) => `${baseUrl}/iot/${step.pid}`}
          renderMeta={(step) => (
            <>
              {formatIotEpisodeMeta(step) ? (
                <p class="mt-1 text-sm text-gray-600">{formatIotEpisodeMeta(step)}</p>
              ) : null}
              {activeLayer === 'subsection' && precisionBadgeText(step) ? (
                <p class="mt-1 text-xs text-gray-500">{precisionBadgeText(step)}</p>
              ) : null}
            </>
          )}
          checkboxAriaLabel={(step) => `Mark ${step.title} as listened`}
          itemSingular="episode"
          itemPlural="episodes"
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
        itemLabelPlural="episodes"
        outlineItemCounts={outlineItemCounts}
        isComplete={isLayerComplete}
      />

      <section id="iot-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">BBC In Our Time Episode List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the mapped episode list and sort it by coverage across Parts, Divisions, Sections, or Subsections.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              These controls only change the full episode list below. The Outline Layer tabs above drive the adaptive path and gap panels.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching episodes
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label class="block xl:col-span-2">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input
              type="search"
              placeholder="Title, synopsis, or summary"
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
              <option value="all">All episodes</option>
              <option value="unread">Unheard only</option>
              <option value="read">Heard only</option>
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
              <option value="date">Broadcast date</option>
              <option value="duration">Duration</option>
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
                const metadata = formatIotEpisodeMeta(entry);

                return (
                  <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 class="font-serif text-2xl leading-tight text-gray-900">
                          <a href={`${baseUrl}/iot/${entry.pid}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">
                          {metadata && <span>{metadata}</span>}
                          {metadata && entry.sectionCount > 0 && <span> · </span>}
                          {entry.sectionCount > 0 && <span>{entry.sectionCount} Sections</span>}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => writeChecklistState(entry.checklistKey, (event.currentTarget as HTMLInputElement).checked)}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as listened`}
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
            No episodes match your filters.
          </div>
        )}
      </section>
    </div>
  );
}
