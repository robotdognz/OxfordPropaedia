import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { type MacropaediaAggregateEntry } from '../../utils/readingData';
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
import {
  summarizeTimedEntries,
  summarizeTimedEntryLines,
} from '../../utils/readingTimeSummary';
import { buildVisibleResultsSummary } from '../../utils/libraryListSummary';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
  onReadingTypeChange: (type: ReadingType) => void;
}

const INITIAL_VISIBLE_COUNT = 60;

type SortField = 'section' | 'part' | 'division' | 'title';
type SortDirection = 'asc' | 'desc';

function matchesCheckedFilter(isChecked: boolean, checkedFilter: 'both' | 'checked' | 'unchecked'): boolean {
  if (checkedFilter === 'checked') return isChecked;
  if (checkedFilter === 'unchecked') return !isChecked;
  return true;
}

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

export default function MacropaediaLibrary({
  entries,
  baseUrl,
  onReadingTypeChange,
}: MacropaediaLibraryProps) {
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
  } = useReadingLibraryControlsState<SortField>('macropaedia', 'section');
  useHashAnchorCorrection('macropaedia-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, scope, checkedFilter, sortField, sortDirection]);

  const shelvedCount = entries.filter((entry) => Boolean(shelfState[entry.checklistKey])).length;
  const isShelfView = scope === 'shelf';
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

  const scopedEntries = isShelfView
    ? entries.filter((entry) => Boolean(shelfState[entry.checklistKey]))
    : entries;
  const scopedCompletedCount = countCompletedEntries(scopedEntries, checklistState);

  const filteredEntries = sortEntries(
    scopedEntries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      if (!matchesCheckedFilter(isChecked, checkedFilter)) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const visibleResultsSummary = buildVisibleResultsSummary({
    visibleCount: visibleEntries.length,
    matchingCount: filteredEntries.length,
    scopeCount: scopedEntries.length,
    noun: 'articles',
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
        readingType="macropaedia"
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
        queryPlaceholder="Article title"
        checkedFilter={checkedFilter}
        onCheckedFilterChange={setCheckedFilter}
        sortField={sortField}
        onSortFieldChange={(value) => setSortField(value as SortField)}
        sortOptions={[
          { value: 'part', label: 'Most Parts covered' },
          { value: 'division', label: 'Most Divisions covered' },
          { value: 'section', label: 'Most Sections covered' },
          { value: 'title', label: 'Title' },
        ]}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {isShelfView ? (
        <section
          id="macropaedia-library"
          class="scroll-mt-24 rounded-2xl border border-[#eadbc3] bg-gradient-to-b from-[#f9f3e7] via-[#f1e6d2] to-[#ebdcc1] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-6"
        >
          <div class="mb-5">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">My Britannica Shelf</h2>
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
                    href: `${baseUrl}/macropaedia/${slugify(entry.title)}`,
                    title: entry.title,
                    readingType: 'macropaedia' as const,
                    dominantPartNumber: dominantPartNumberForEntry(entry),
                    checked: isChecked,
                    onCheckedChange: (checked: boolean) => writeChecklistState(entry.checklistKey, checked),
                    checkboxAriaLabel: `Mark ${entry.title} as completed`,
                    shelved: isShelved,
                    onShelvedChange: (shelved: boolean) => writeShelfState(entry.checklistKey, shelved),
                    shelfAriaLabel: `Add ${entry.title} to My Shelf`,
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
                    Show 60 more
                  </button>
                </div>
              )}
            </>
          ) : (
            <div class="mt-4 rounded-xl border border-dashed border-[#d9c8ac] bg-white/70 px-4 py-10 text-center text-sm text-gray-600">
              {shelvedCount === 0
                ? 'Nothing is on your Britannica shelf yet. Add articles to My Shelf to keep them here.'
                : checkedFilter !== 'both'
                  ? 'No Britannica articles in My Shelf matched those filters.'
                  : 'No Britannica articles in My Shelf matched that search.'}
            </div>
          )}
        </section>
      ) : (
        <section id="macropaedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">Macropaedia Article List</h2>
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
                        <ReadingActionControls
                          checked={isChecked}
                          onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                          checkboxAriaLabel={`Mark ${entry.title} as completed`}
                          shelved={isShelved}
                          onShelvedChange={(shelved) => writeShelfState(entry.checklistKey, shelved)}
                          shelfAriaLabel={`Add ${entry.title} to My Shelf`}
                          ribbonOffsetClass="-mt-5"
                        />
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
            <div class="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
              {checkedFilter !== 'both'
                ? 'No Britannica articles matched those filters.'
                : 'No Macropaedia articles matched that search.'}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
