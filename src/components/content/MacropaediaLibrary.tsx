import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  buildMacropaediaCoverageSnapshot,
  type MacropaediaAggregateEntry,
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { sectionUrl } from '../../utils/helpers';
import CoverageRings from '../ui/CoverageRings';

export interface MacropaediaLibraryProps {
  entries: MacropaediaAggregateEntry[];
  baseUrl: string;
}

const INITIAL_VISIBLE_COUNT = 60;

type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'title-asc';

function matchesQuery(entry: MacropaediaAggregateEntry, query: string): boolean {
  if (!query) return true;
  return entry.title.toLowerCase().includes(query);
}

function sortEntries(entries: MacropaediaAggregateEntry[], sortMode: SortMode): MacropaediaAggregateEntry[] {
  const nextEntries = [...entries];

  if (sortMode === 'title-asc') {
    nextEntries.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    return nextEntries;
  }

  nextEntries.sort((a, b) => {
    if (a.sectionCount !== b.sectionCount) return b.sectionCount - a.sectionCount;
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  });
  return nextEntries;
}

function SectionLinks({
  sections,
  baseUrl,
  label,
}: {
  sections: ReadingSectionSummary[];
  baseUrl: string;
  label: string;
}) {
  return (
    <details class="group mt-4 rounded-lg border border-gray-200 bg-gray-50">
      <summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
        <div class="flex items-center justify-between gap-3">
          <span>{label}</span>
          <svg
            class="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </summary>
      <ul class="space-y-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
        {sections.map((section) => (
          <li key={section.sectionCode}>
            <a
              href={sectionUrl(section.sectionCode, baseUrl)}
              class="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              <span class="font-semibold text-gray-700">Section {section.sectionCodeDisplay}</span>
              <span>{section.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function MacropaediaLibrary({ entries, baseUrl }: MacropaediaLibraryProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, statusFilter, sortMode]);

  const completedChecklistKeys = new Set(
    Object.keys(checklistState).filter((key) => checklistState[key] === true)
  );
  const coverage = buildMacropaediaCoverageSnapshot(entries, completedChecklistKeys);
  const completedCount = entries.filter((entry) => Boolean(checklistState[entry.checklistKey])).length;

  // Compute part/division/section coverage from checked entries
  const allParts = new Set<number>();
  const allDivisions = new Set<string>();
  const allSections = new Set<string>();
  const coveredParts = new Set<number>();
  const coveredDivisions = new Set<string>();
  const coveredSections = new Set<string>();
  for (const entry of entries) {
    const isChecked = Boolean(checklistState[entry.checklistKey]);
    for (const s of entry.sections) {
      allParts.add(s.partNumber);
      allDivisions.add(s.divisionId);
      allSections.add(s.sectionCode);
      if (isChecked) {
        coveredParts.add(s.partNumber);
        coveredDivisions.add(s.divisionId);
        coveredSections.add(s.sectionCode);
      }
    }
  }
  const coverageRings = [
    { label: 'Parts', count: coveredParts.size, total: allParts.size, color: '#6366f1' },
    { label: 'Divisions', count: coveredDivisions.size, total: allDivisions.size, color: '#8b5cf6' },
    { label: 'Sections', count: coveredSections.size, total: allSections.size, color: '#a78bfa' },
  ];
  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      return matchesQuery(entry, query.trim().toLowerCase());
    }),
    sortMode
  );
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextArticle = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      <section class="flex flex-col gap-6 md:flex-row md:items-start">
        <div class="flex-shrink-0 rounded-xl border border-gray-200 bg-white p-4 self-center md:self-stretch flex flex-col items-center justify-center">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500 text-center mb-2">Your Coverage</p>
          <CoverageRings rings={coverageRings} size={120} ringWidth={10} />
        </div>
        <div class="flex-1 grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Articles</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{entries.length}</p>
            <p class="mt-2 text-sm text-gray-600">Unique Macropaedia titles referenced in the outline.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Checked Off</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{completedCount}</p>
            <p class="mt-2 text-sm text-gray-600">Uses the same checklist state as the section reading boxes.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Section Coverage</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">
              {coverage.currentlyCoveredSections} / {coverage.totalCoveredSections}
            </p>
            <p class="mt-2 text-sm text-gray-600">Sections with at least one article covered by your checked list.</p>
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-amber-800">Best Next Article</p>
            {bestNextArticle ? (
              <>
                <p class="mt-2 font-serif text-2xl leading-tight text-amber-950">{bestNextArticle.title}</p>
                <p class="mt-3 text-sm text-amber-900">
                  Adds {bestNextArticle.newSectionCount} new sections, {bestNextArticle.sectionCount} total.
                </p>
              </>
            ) : (
              <p class="mt-2 text-sm text-amber-900">No unread article adds any further section coverage right now.</p>
            )}
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Knowledge-Spread Path</h2>
            <p class="mt-2 text-sm text-gray-700">
              This path greedily picks unread Macropaedia articles that add the largest number of not-yet-covered
              sections, starting from what you have already checked off.
            </p>
          </div>
          <p class="text-sm text-amber-900">
            {coverage.remainingSections} sections still uncovered by checked Macropaedia articles
          </p>
        </div>

        {coverage.path.length > 0 ? (
          <ol class="mt-6 grid gap-4 lg:grid-cols-2">
            {coverage.path.map((step, index) => {
              const isChecked = Boolean(checklistState[step.checklistKey]);

              return (
                <li key={step.checklistKey} class="rounded-xl border border-amber-200 bg-white p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Step {index + 1}
                      </p>
                      <h3 class="mt-1 font-serif text-xl leading-tight text-gray-900">
                        <a href={`${baseUrl}/macropaedia/${step.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`} class="hover:text-indigo-700 transition-colors">{step.title}</a>
                      </h3>
                    </div>
                    <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => {
                          writeChecklistState(
                            step.checklistKey,
                            (event.currentTarget as HTMLInputElement).checked
                          );
                        }}
                        class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Mark ${step.title} as completed`}
                      />
                      Done
                    </label>
                  </div>

                  <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                    <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                      +{step.newSectionCount} new sections
                    </span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                      {step.sectionCount} total sections
                    </span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                      {step.cumulativeCoveredSectionCount} covered after this step
                    </span>
                  </div>

                  <SectionLinks
                    sections={step.newSections}
                    baseUrl={baseUrl}
                    label={`Show the ${step.newSectionCount} new sections`}
                  />
                </li>
              );
            })}
          </ol>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No further spread path is available from unchecked articles. Either you have already covered every mapped
            section, or the remaining unread articles only overlap with sections already covered.
          </div>
        )}
      </section>

      <section class="rounded-2xl border border-gray-200 bg-white p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">Macropaedia Article List</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full historical Macropaedia list and sort it by how widely it appears across the outline.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching articles
          </div>
        </div>

        <div class="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
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
            <span class="mb-2 block text-sm font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter((event.currentTarget as HTMLSelectElement).value as StatusFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All articles</option>
              <option value="unchecked">Unchecked only</option>
              <option value="checked">Checked only</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode((event.currentTarget as HTMLSelectElement).value as SortMode)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="sections-desc">Most sections</option>
              <option value="title-asc">Title A-Z</option>
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
                          <a href={`${baseUrl}/macropaedia/${entry.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
                        </h3>
                        <p class="mt-3 text-xs font-medium text-gray-700">
                          Appears in {entry.sectionCount} section{entry.sectionCount === 1 ? '' : 's'}
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

                    <SectionLinks
                      sections={entry.sections}
                      baseUrl={baseUrl}
                      label={`Show all ${entry.sectionCount} sections`}
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
