import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import {
  formatEditionLabel,
  type VsiAggregateEntry,
} from '../../utils/readingData';
import {
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';
import {
  formatSummaryMinutes,
  summarizeTimedEntries,
} from '../../utils/readingTimeSummary';
import { formatVsiPageCount } from '../../utils/vsiCatalog';
import { slugify } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import { useReadingLibraryControlsState } from '../../hooks/useReadingLibraryControlsState';
import type { ReadingType } from '../../utils/readingPreference';
import {
  countEntryCoverageForLayer,
  countCompletedEntries,
  dominantPartNumberForEntry,
} from '../../utils/readingLibrary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import LibraryWorkspaceControls from './LibraryWorkspaceControls';
import LibraryListControlsPanel from './LibraryListControlsPanel';
import BookshelfGrid from './BookshelfGrid';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';

export interface VsiLibraryProps {
  entries: VsiAggregateEntry[];
  baseUrl: string;
  onReadingTypeChange: (type: ReadingType) => void;
}

const INITIAL_VISIBLE_COUNT = 50;

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

function formatMetadata(entry: VsiAggregateEntry, readingSpeedWpm: number): string {
  const editionLabel = formatEditionLabel(entry.edition);
  return [
    entry.author,
    entry.number ? `No. ${entry.number}` : null,
    formatVsiPageCount(entry.pageCount),
    formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
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

function precisionBadgeText(entry: VsiAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

export default function VsiLibrary({ entries, baseUrl, onReadingTypeChange }: VsiLibraryProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const checklistState = useReadingChecklistState();
  const shelfState = useReadingShelfState();
  const {
    scope,
    checkedOnly,
    sortField,
    sortDirection,
    setScope,
    setCheckedOnly,
    setSortField,
    setSortDirection,
  } = useReadingLibraryControlsState<SortField>('vsi', 'section');
  useHashAnchorCorrection('vsi-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, scope, checkedOnly, sortField, sortDirection]);

  const normalizedQuery = query.trim().toLowerCase();
  const shelvedCount = entries.filter((entry) => Boolean(shelfState[entry.checklistKey])).length;
  const isShelfView = scope === 'shelf';
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

  const scopedEntries = isShelfView
    ? entries.filter((entry) => Boolean(shelfState[entry.checklistKey]))
    : entries;
  const scopedCompletedCount = countCompletedEntries(scopedEntries, checklistState);

  const filteredEntries = sortEntries(
    scopedEntries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (checkedOnly && !isChecked) return false;
      return matchesQuery(entry, normalizedQuery);
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const shelfTimeSummary = useMemo(
    () => summarizeTimedEntries(filteredEntries, checklistState, readingSpeedWpm),
    [filteredEntries, checklistState, readingSpeedWpm]
  );
  const shelfSpentLabel = shelfTimeSummary.timedEntryCount > 0
    ? formatSummaryMinutes(shelfTimeSummary.completedMinutes, shelfTimeSummary.usesApproximateTime)
    : null;
  const shelfRemainingLabel = shelfTimeSummary.timedEntryCount > 0
    ? formatSummaryMinutes(shelfTimeSummary.remainingMinutes, shelfTimeSummary.usesApproximateTime)
    : null;

  return (
    <div class="space-y-4">
      <LibraryWorkspaceControls
        baseUrl={baseUrl}
        readingType="vsi"
        onReadingTypeChange={onReadingTypeChange}
        scope={scope}
        onScopeChange={setScope}
        totalCount={entries.length}
        shelvedCount={shelvedCount}
      />

      <LibraryListControlsPanel
        query={query}
        onQueryInput={setQuery}
        queryPlaceholder="Title, author, subject, or series number"
        checkedOnly={checkedOnly}
        onCheckedOnlyChange={setCheckedOnly}
        sortField={sortField}
        onSortFieldChange={(value) => setSortField(value as SortField)}
        sortOptions={[
          { value: 'part', label: 'Most Parts covered' },
          { value: 'division', label: 'Most Divisions covered' },
          { value: 'section', label: 'Most Sections covered' },
          { value: 'subsection', label: 'Most Subsections covered' },
          { value: 'title', label: 'Title' },
          { value: 'number', label: 'Series number' },
        ]}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {isShelfView ? (
        <section
          id="vsi-library"
          class="scroll-mt-24 rounded-[1.75rem] border border-[#eadbc3] bg-gradient-to-b from-[#f9f3e7] via-[#f1e6d2] to-[#ebdcc1] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-6"
        >
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">My Oxford VSI Shelf</h2>
              <p class="mt-1 text-sm text-gray-500">{shelfTimeSummary.completedCount} checked off</p>
              {(shelfSpentLabel || shelfRemainingLabel) && (
                <p class="mt-1 text-sm text-gray-500">
                  {shelfSpentLabel ? `${shelfSpentLabel} spent` : ''}
                  {shelfSpentLabel && shelfRemainingLabel ? ' · ' : ''}
                  {shelfRemainingLabel ? `${shelfRemainingLabel} remaining` : ''}
                </p>
              )}
            </div>
            <div class="text-sm text-gray-500">
              Showing {visibleEntries.length} of {filteredEntries.length} matching shelved titles
            </div>
          </div>

          {filteredEntries.length > 0 ? (
            <>
              <BookshelfGrid
                framed={false}
                items={visibleEntries.map((entry) => {
                  const isChecked = Boolean(checklistState[entry.checklistKey]);
                  const isShelved = Boolean(shelfState[entry.checklistKey]);

                  return {
                    key: entry.checklistKey,
                    href: `${baseUrl}/vsi/${slugify(entry.title)}`,
                    title: entry.title,
                    meta: formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
                    readingType: 'vsi' as const,
                    dominantPartNumber: dominantPartNumberForEntry(entry),
                    checked: isChecked,
                    onCheckedChange: (checked: boolean) => writeChecklistState(entry.checklistKey, checked),
                    checkboxAriaLabel: `Mark ${entry.title} by ${entry.author} as completed`,
                    shelved: isShelved,
                    onShelvedChange: (shelved: boolean) => writeShelfState(entry.checklistKey, shelved),
                    shelfAriaLabel: `Add ${entry.title} by ${entry.author} to My Shelf`,
                  };
                })}
              />

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
            <div class="mt-4 rounded-xl border border-dashed border-[#d9c8ac] bg-white/70 px-4 py-10 text-center text-sm text-gray-600">
              {shelvedCount === 0
                ? 'Nothing is on your VSI shelf yet. Add titles to My Shelf to keep them here.'
                : checkedOnly
                  ? 'No shelved VSI titles matched those filters.'
                  : 'No shelved VSI titles matched that search.'}
            </div>
          )}
        </section>
      ) : (
        <section id="vsi-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">VSI Library</h2>
              <p class="mt-1 text-sm text-gray-500">{scopedCompletedCount} checked off</p>
            </div>
            <div class="text-sm text-gray-500">
              Showing {visibleEntries.length} of {filteredEntries.length} matching titles
            </div>
          </div>

          {filteredEntries.length > 0 ? (
            <>
              <div class="space-y-4">
                {visibleEntries.map((entry) => {
                  const isChecked = Boolean(checklistState[entry.checklistKey]);
                  const isShelved = Boolean(shelfState[entry.checklistKey]);
                  const metadata = formatMetadata(entry, readingSpeedWpm);

                  return (
                    <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <h3 class="font-serif text-2xl leading-tight text-gray-900">
                            <a href={`${baseUrl}/vsi/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                          </h3>
                          <p class="mt-1 text-sm text-gray-600">{metadata}</p>
                        </div>
                        <ReadingActionControls
                          checked={isChecked}
                          onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                          checkboxAriaLabel={`Mark ${entry.title} by ${entry.author} as completed`}
                          shelved={isShelved}
                          onShelvedChange={(shelved) => writeShelfState(entry.checklistKey, shelved)}
                          shelfAriaLabel={`Add ${entry.title} by ${entry.author} to My Shelf`}
                          ribbonOffsetClass="-mt-5"
                        />
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
            <div class="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
              {checkedOnly
                ? 'No VSI titles matched those filters.'
                : 'No VSI titles matched that search.'}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
