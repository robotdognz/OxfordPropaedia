import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { type WikipediaAggregateEntry } from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useHashAnchorCorrection } from '../../hooks/useHashAnchorCorrection';
import { useReadingLibraryControlsState } from '../../hooks/useReadingLibraryControlsState';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
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
import {
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';
import {
  summarizeTimedEntries,
  summarizeTimedEntryLines,
} from '../../utils/readingTimeSummary';
import { buildVisibleResultsSummary } from '../../utils/libraryListSummary';

export interface WikipediaLibraryProps {
  entries: WikipediaAggregateEntry[];
  baseUrl: string;
  onReadingTypeChange: (type: ReadingType) => void;
}

type SortField = 'section' | 'part' | 'division' | 'subsection' | 'title';
type SortDirection = 'asc' | 'desc';

const INITIAL_VISIBLE = 50;

function precisionBadgeText(entry: WikipediaAggregateEntry): string | null {
  return subsectionPrecisionSummary(entry);
}

function matchesCheckedFilter(isChecked: boolean, checkedFilter: 'both' | 'checked' | 'unchecked'): boolean {
  if (checkedFilter === 'checked') return isChecked;
  if (checkedFilter === 'unchecked') return !isChecked;
  return true;
}

export default function WikipediaLibrary({
  entries,
  baseUrl,
  onReadingTypeChange,
}: WikipediaLibraryProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const checklistState = useReadingChecklistState();
  const shelfState = useReadingShelfState();
  const level = useWikipediaLevel();
  const {
    scope,
    checkedFilter,
    sortField,
    sortDirection,
    setScope,
    setCheckedFilter,
    setSortField,
    setSortDirection,
  } = useReadingLibraryControlsState<SortField>('wikipedia', 'section');
  useHashAnchorCorrection('wikipedia-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, scope, checkedFilter, sortField, sortDirection, level]);

  const levelEntries = entries.filter((entry) => entry.lowestLevel <= level);
  const shelvedCount = levelEntries.filter((entry) => Boolean(shelfState[entry.checklistKey])).length;
  const isShelfView = scope === 'shelf';
  const normalizedQuery = query.trim().toLowerCase();
  const coverageCounts = useMemo(() => new Map(
    levelEntries.map((entry) => [
      entry.checklistKey,
      {
        part: countEntryCoverageForLayer(entry, 'part'),
        division: countEntryCoverageForLayer(entry, 'division'),
        section: countEntryCoverageForLayer(entry, 'section'),
        subsection: countEntryCoverageForLayer(entry, 'subsection'),
      },
    ])
  ), [levelEntries]);

  const scopedEntries = isShelfView
    ? levelEntries.filter((entry) => Boolean(shelfState[entry.checklistKey]))
    : levelEntries;
  const scopedCompletedCount = countCompletedEntries(scopedEntries, checklistState);

  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => (sortDirection === 'asc' ? a - b : b - a);
  const filteredEntries = scopedEntries
    .filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);
      if (!matchesCheckedFilter(isChecked, checkedFilter)) return false;
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
  const visibleResultsSummary = buildVisibleResultsSummary({
    visibleCount: visibleEntries.length,
    matchingCount: filteredEntries.length,
    scopeCount: scopedEntries.length,
    noun: 'articles',
    scopeLabel: isShelfView ? 'in My Shelf' : undefined,
  });
  const shelfTimeSummary = useMemo(
    () => summarizeTimedEntries(filteredEntries, checklistState, readingSpeedWpm),
    [filteredEntries, checklistState, readingSpeedWpm]
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
        readingType="wikipedia"
        onReadingTypeChange={onReadingTypeChange}
        scope={scope}
        onScopeChange={setScope}
        checkedFilter={checkedFilter}
        totalCount={levelEntries.length}
        shelvedCount={shelvedCount}
        showWikipediaLevelSelector
      />

      <LibraryListControlsPanel
        query={query}
        onQueryInput={setQuery}
        queryPlaceholder="Search articles..."
        checkedFilter={checkedFilter}
        onCheckedFilterChange={setCheckedFilter}
        sortField={sortField}
        onSortFieldChange={(value) => setSortField(value as SortField)}
        sortOptions={[
          { value: 'part', label: 'Most Parts covered' },
          { value: 'division', label: 'Most Divisions covered' },
          { value: 'section', label: 'Most Sections covered' },
          { value: 'subsection', label: 'Most Subsections covered' },
          { value: 'title', label: 'Title' },
        ]}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {isShelfView ? (
        <section
          id="wikipedia-library"
          class="scroll-mt-24 rounded-2xl border border-[#eadbc3] bg-gradient-to-b from-[#f9f3e7] via-[#f1e6d2] to-[#ebdcc1] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-6"
        >
          <div class="mb-5">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">My Wikipedia Shelf</h2>
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
                    href: `${baseUrl}/wikipedia/${slugify(entry.title)}`,
                    title: entry.displayTitle || entry.title,
                    meta: formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
                    readingType: 'wikipedia' as const,
                    dominantPartNumber: dominantPartNumberForEntry(entry),
                    checked: isChecked,
                    onCheckedChange: (checked: boolean) => writeChecklistState(entry.checklistKey, checked),
                    checkboxAriaLabel: `Mark ${entry.title} as read`,
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
                ? 'Nothing is on your Wikipedia shelf at this level yet. Add articles to My Shelf to keep them here.'
                : checkedFilter !== 'both'
                  ? 'No articles in My Shelf matched those filters.'
                  : 'No articles in My Shelf matched that search.'}
            </div>
          )}
        </section>
      ) : (
        <section id="wikipedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 class="font-serif text-2xl text-gray-900">Wikipedia Article List</h2>
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
	                  const metadata = [
	                    entry.category,
	                    entry.sectionCount > 0 ? `${entry.sectionCount} sections` : null,
	                    formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
	                  ].filter(Boolean);
	                  return (
	                    <article key={entry.checklistKey} class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
	                          <h3 class="font-serif text-2xl leading-tight text-gray-900">
	                            <a href={`${baseUrl}/wikipedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.displayTitle || entry.title}</a>
	                          </h3>
	                          {metadata.length > 0 ? (
	                            <p class="mt-1 text-sm text-gray-600">{metadata.join(' · ')}</p>
	                          ) : null}
	                        </div>
                        <ReadingActionControls
                          checked={isChecked}
                          onCheckedChange={(checked) => writeChecklistState(entry.checklistKey, checked)}
                          checkboxAriaLabel={`Mark ${entry.title} as read`}
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
                        {entry.category && (
                          <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{entry.category}</span>
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
                ? 'No articles matched those filters.'
                : 'No articles match your filters.'}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
