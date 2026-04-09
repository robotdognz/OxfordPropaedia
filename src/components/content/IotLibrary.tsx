import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { type IotAggregateEntry } from '../../utils/readingData';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import { useReadingLibraryControlsState } from '../../hooks/useReadingLibraryControlsState';
import type { ReadingType } from '../../utils/readingPreference';
import {
  countCompletedEntries,
  countEntryCoverageForLayer,
  dominantPartNumberForEntry,
} from '../../utils/readingLibrary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import LibraryWorkspaceControls from './LibraryWorkspaceControls';
import LibraryListControlsPanel from './LibraryListControlsPanel';
import BookshelfGrid from './BookshelfGrid';
import { formatIotDuration, formatIotEpisodeMeta } from '../../utils/iotMetadata';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';
import {
  summarizeTimedEntries,
  summarizeTimedEntryLines,
} from '../../utils/readingTimeSummary';
import { buildVisibleResultsSummary } from '../../utils/libraryListSummary';

export interface IotLibraryProps {
  entries: IotAggregateEntry[];
  baseUrl: string;
  onReadingTypeChange: (type: ReadingType) => void;
}

type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title' | 'date' | 'duration';
type SortDirection = 'asc' | 'desc';

const INITIAL_VISIBLE = 50;

function precisionBadgeText(entry: IotAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

function matchesCheckedFilter(isChecked: boolean, checkedFilter: 'both' | 'checked' | 'unchecked'): boolean {
  if (checkedFilter === 'checked') return isChecked;
  if (checkedFilter === 'unchecked') return !isChecked;
  return true;
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
  onReadingTypeChange,
}: IotLibraryProps) {
  const checklistState = useReadingChecklistState();
  const shelfState = useReadingShelfState();
  const {
    scope,
    checkedFilter,
    sortField,
    sortDirection,
    setScope,
    setCheckedFilter,
    setSortField,
    setSortDirection,
  } = useReadingLibraryControlsState<SortField>('iot', 'section');
  useHashAnchorCorrection('iot-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, scope, checkedFilter, sortField, sortDirection]);

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

  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);

  const filteredEntries = [...scopedEntries]
    .filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      if (!matchesCheckedFilter(isChecked, checkedFilter)) return false;
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
  const visibleResultsSummary = buildVisibleResultsSummary({
    visibleCount: visibleEntries.length,
    matchingCount: filteredEntries.length,
    scopeCount: scopedEntries.length,
    noun: 'episodes',
    scopeLabel: isShelfView ? 'in My Shelf' : undefined,
  });
  const shelfTimeSummary = useMemo(
    () => summarizeTimedEntries(filteredEntries, checklistState),
    [filteredEntries, checklistState]
  );
  const shelfSummaryLines = summarizeTimedEntryLines(shelfTimeSummary, {
    showCompletedCount: checkedFilter !== 'checked',
  });
  const shelfHeaderLines = visibleResultsSummary
    ? [...shelfSummaryLines, visibleResultsSummary]
    : shelfSummaryLines;

  return (
    <div class="space-y-4">
      <LibraryWorkspaceControls
        baseUrl={baseUrl}
        readingType="iot"
        onReadingTypeChange={onReadingTypeChange}
        scope={scope}
        onScopeChange={setScope}
        checkedFilter={checkedFilter}
        totalCount={entries.length}
        shelvedCount={shelvedCount}
      />

      <LibraryListControlsPanel
        query={query}
        onQueryInput={setQuery}
        queryPlaceholder="Title, synopsis, or summary"
        checkedFilter={checkedFilter}
        onCheckedFilterChange={setCheckedFilter}
        sortField={sortField}
        onSortFieldChange={(value) => setSortField(value as SortField)}
        sortOptions={[
          { value: 'part', label: 'Most Parts covered' },
          { value: 'division', label: 'Most Divisions covered' },
          { value: 'section', label: 'Most Sections covered' },
          { value: 'subsection', label: 'Most Subsections covered' },
          { value: 'date', label: 'Broadcast date' },
          { value: 'duration', label: 'Duration' },
          { value: 'title', label: 'Title' },
        ]}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {isShelfView ? (
        <section
          id="iot-library"
          class="scroll-mt-24 rounded-2xl border border-[#eadbc3] bg-gradient-to-b from-[#f9f3e7] via-[#f1e6d2] to-[#ebdcc1] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-6"
        >
          <div class="mb-5">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">My BBC In Our Time Shelf</h2>
              {shelfHeaderLines.map((line) => (
                <p class="mt-1 text-sm text-gray-500">{line}</p>
              ))}
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
                    href: `${baseUrl}/iot/${entry.pid}`,
                    title: entry.title,
                    meta: formatIotDuration(entry.durationSeconds),
                    readingType: 'iot' as const,
                    dominantPartNumber: dominantPartNumberForEntry(entry),
                    checked: isChecked,
                    onCheckedChange: (checked: boolean) => writeChecklistState(entry.checklistKey, checked),
                    checkboxAriaLabel: `Mark ${entry.title} as listened`,
                    shelved: isShelved,
                    onShelvedChange: (shelved: boolean) => writeShelfState(entry.checklistKey, shelved),
                    shelfAriaLabel: `Add ${entry.title} to My Shelf`,
                  };
                })}
              />

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
            <div class="mt-4 rounded-xl border border-dashed border-[#d9c8ac] bg-white/70 px-4 py-6 text-sm text-gray-600">
              {shelvedCount === 0
                ? 'Nothing is on your BBC In Our Time shelf yet. Add episodes to My Shelf to keep them here.'
                : checkedFilter !== 'both'
                  ? 'No episodes in My Shelf matched those filters.'
                  : 'No episodes in My Shelf matched that search.'}
            </div>
          )}
        </section>
      ) : (
        <section id="iot-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">BBC In Our Time Episode List</h2>
              <p class="mt-1 text-sm text-gray-500">{scopedCompletedCount} checked off</p>
            </div>
            {visibleResultsSummary ? (
              <div class="text-sm text-gray-500">{visibleResultsSummary}</div>
            ) : null}
          </div>

          {filteredEntries.length > 0 ? (
            <>
              <div class="space-y-4">
                {visibleEntries.map((entry) => {
                  const isChecked = Boolean(checklistState[entry.checklistKey]);
                  const isShelved = Boolean(shelfState[entry.checklistKey]);
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
                        <ReadingActionControls
                          checked={isChecked}
                          onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                          checkboxAriaLabel={`Mark ${entry.title} as listened`}
                          shelved={isShelved}
                          onShelvedChange={(shelved) => writeShelfState(entry.checklistKey, shelved)}
                          shelfAriaLabel={`Add ${entry.title} to My Shelf`}
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
            <div class="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
              {checkedFilter !== 'both'
                ? 'No episodes matched those filters.'
                : 'No episodes match your filters.'}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
