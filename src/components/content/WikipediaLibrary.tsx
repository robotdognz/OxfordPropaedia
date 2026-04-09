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
} from '../../utils/readingLibrary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import LibraryWorkspaceControls from './LibraryWorkspaceControls';
import { subsectionPrecisionSummary } from '../../utils/mappingPrecision';
import {
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';

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
    checkedOnly,
    sortField,
    sortDirection,
    setScope,
    setCheckedOnly,
    setSortField,
    setSortDirection,
  } = useReadingLibraryControlsState<SortField>('wikipedia', 'section');
  useHashAnchorCorrection('wikipedia-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, scope, checkedOnly, sortField, sortDirection, level]);

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
      if (checkedOnly && !isChecked) return false;
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
      <LibraryWorkspaceControls
        baseUrl={baseUrl}
        readingType="wikipedia"
        onReadingTypeChange={onReadingTypeChange}
        scope={scope}
        onScopeChange={setScope}
        totalCount={levelEntries.length}
        shelvedCount={shelvedCount}
        showWikipediaLevelSelector
      />

      <section id="wikipedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="font-serif text-2xl text-gray-900">{isShelfView ? 'Wikipedia Shelf' : 'Wikipedia Article List'}</h2>
            <p class="mt-1 text-sm text-gray-500">{scopedCompletedCount} checked off</p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching {isShelfView ? 'shelved articles' : 'articles'}
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
          <div class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Filters</span>
            <div class="flex flex-col gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 shadow-sm">
              <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={checkedOnly}
                  onChange={(event) => setCheckedOnly((event.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Checked only
              </label>
            </div>
          </div>
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
                        shelfAriaLabel={`Add ${entry.title} to shelf`}
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
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
            {isShelfView
              ? shelvedCount === 0
                ? 'Nothing is on your Wikipedia shelf at this level yet. Add articles to Shelf to keep them here.'
                : checkedOnly
                  ? 'No shelved articles matched those filters.'
                  : 'No shelved articles matched that search.'
              : checkedOnly
                ? 'No articles matched those filters.'
                : 'No articles match your filters.'}
          </div>
        )}
      </section>
    </div>
  );
}
