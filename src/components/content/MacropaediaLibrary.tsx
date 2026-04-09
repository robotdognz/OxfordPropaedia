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
} from '../../utils/readingLibrary';
import ReadingSectionLinks from './ReadingSectionLinks';
import ReadingActionControls from './ReadingActionControls';
import LibraryWorkspaceControls from './LibraryWorkspaceControls';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
  onReadingTypeChange: (type: ReadingType) => void;
}

const INITIAL_VISIBLE_COUNT = 60;

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

export default function MacropaediaLibrary({
  entries,
  baseUrl,
  onReadingTypeChange,
}: MacropaediaLibraryProps) {
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
  } = useReadingLibraryControlsState<SortField>('macropaedia', 'section');
  useHashAnchorCorrection('macropaedia-library');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, scope, checkedOnly, sortField, sortDirection]);

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

      if (checkedOnly && !isChecked) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortField,
    sortDirection,
    coverageCounts
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;

  return (
    <div class="space-y-4">
      <LibraryWorkspaceControls
        baseUrl={baseUrl}
        readingType="macropaedia"
        onReadingTypeChange={onReadingTypeChange}
        scope={scope}
        onScopeChange={setScope}
        totalCount={entries.length}
        shelvedCount={shelvedCount}
      />

      <section id="macropaedia-library" class="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
        <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="font-serif text-2xl text-gray-900">{isShelfView ? 'Britannica Shelf' : 'Macropaedia Article List'}</h2>
            <p class="mt-1 text-sm text-gray-500">{scopedCompletedCount} checked off</p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching {isShelfView ? 'shelved articles' : 'articles'}
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px]">
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
                        shelfAriaLabel={`Add ${entry.title} to shelf`}
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
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600">
            {isShelfView
              ? shelvedCount === 0
                ? 'Nothing is on your Britannica shelf yet. Add articles to Shelf to keep them here.'
                : checkedOnly
                  ? 'No shelved Britannica articles matched those filters.'
                  : 'No shelved Britannica articles matched that search.'
              : checkedOnly
                ? 'No Britannica articles matched those filters.'
                : 'No Macropaedia articles matched that search.'}
          </div>
        )}
      </section>
    </div>
  );
}
