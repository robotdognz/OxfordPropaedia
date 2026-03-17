import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  buildVsiCoverageSnapshot,
  formatEditionLabel,
  type ReadingSectionSummary,
  type VsiAggregateEntry,
} from '../../utils/readingData';
import { sectionUrl } from '../../utils/helpers';
import CoverageRings from '../ui/CoverageRings';

export interface VsiLibraryProps {
  entries: VsiAggregateEntry[];
  baseUrl: string;
  outlineItemCounts?: Record<string, number>;
  totalOutlineItems?: number;
}

const INITIAL_VISIBLE_COUNT = 50;

type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'sections-asc' | 'title-asc' | 'title-desc' | 'number-asc' | 'number-desc';

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

function sortEntries(entries: VsiAggregateEntry[], sortMode: SortMode): VsiAggregateEntry[] {
  const nextEntries = [...entries];
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  switch (sortMode) {
    case 'title-asc':
      nextEntries.sort((a, b) => collate(a.title, b.title));
      break;
    case 'title-desc':
      nextEntries.sort((a, b) => collate(b.title, a.title));
      break;
    case 'number-asc':
      nextEntries.sort((a, b) => {
        const an = a.number ?? Number.MAX_SAFE_INTEGER;
        const bn = b.number ?? Number.MAX_SAFE_INTEGER;
        return an !== bn ? an - bn : collate(a.title, b.title);
      });
      break;
    case 'number-desc':
      nextEntries.sort((a, b) => {
        const an = a.number ?? 0;
        const bn = b.number ?? 0;
        return an !== bn ? bn - an : collate(a.title, b.title);
      });
      break;
    case 'sections-asc':
      nextEntries.sort((a, b) => a.sectionCount !== b.sectionCount ? a.sectionCount - b.sectionCount : collate(a.title, b.title));
      break;
    default: // sections-desc
      nextEntries.sort((a, b) => a.sectionCount !== b.sectionCount ? b.sectionCount - a.sectionCount : collate(a.title, b.title));
      break;
  }
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

export default function VsiLibrary({ entries, baseUrl, outlineItemCounts, totalOutlineItems }: VsiLibraryProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query, statusFilter, sortMode]);

  const normalizedQuery = query.trim().toLowerCase();
  const completedChecklistKeys = new Set(
    Object.keys(checklistState).filter((key) => checklistState[key] === true)
  );
  const coverage = buildVsiCoverageSnapshot(entries, completedChecklistKeys);
  const completedCount = entries.filter((entry) => Boolean(checklistState[entry.checklistKey])).length;

  // Compute part/division/section/sub-section coverage from checked entries
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
  let coveredOutlineItems = 0;
  if (outlineItemCounts) {
    for (const code of coveredSections) {
      coveredOutlineItems += outlineItemCounts[code] || 0;
    }
  }
  const coverageRings = [
    { label: 'Parts', count: coveredParts.size, total: allParts.size, color: '#6366f1' },
    { label: 'Divisions', count: coveredDivisions.size, total: allDivisions.size, color: '#8b5cf6' },
    { label: 'Sections', count: coveredSections.size, total: allSections.size, color: '#a78bfa' },
    ...(totalOutlineItems ? [{ label: 'Sub-sections', count: coveredOutlineItems, total: totalOutlineItems, color: '#c4b5fd' }] : []),
  ];

  const filteredEntries = sortEntries(
    entries.filter((entry) => {
      const isChecked = Boolean(checklistState[entry.checklistKey]);

      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      return matchesQuery(entry, normalizedQuery);
    }),
    sortMode
  );

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextRead = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <div class="rounded-xl border border-gray-200 bg-white p-5 flex flex-row items-center gap-4 md:flex-col md:self-stretch md:items-center md:gap-3">
          <div class="flex-shrink-0 md:hidden">
            <CoverageRings rings={coverageRings} size={100} ringWidth={7} hideLegend />
          </div>
          <p class="hidden md:block text-sm font-medium uppercase tracking-wide text-gray-500">Your Coverage</p>
          <div class="hidden md:flex md:flex-1 md:items-center">
            <CoverageRings rings={coverageRings} size={120} ringWidth={9} />
          </div>
          <div class="md:hidden min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Your Coverage</p>
            <div class="space-y-0.5">
              {coverageRings.map((ring) => (
                <div key={ring.label} class="flex items-center gap-1.5 text-xs text-gray-500">
                  <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ring.color }} />
                  <span>{ring.label}: {ring.count}/{ring.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div class="flex-1 grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Titles</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{entries.length}</p>
            <p class="mt-2 text-sm text-gray-600">Unique Oxford Very Short Introductions in the mapped reading list.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Checked Off</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{completedCount}</p>
            <p class="mt-2 text-sm text-gray-600">Shared with the Done boxes on section pages.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Section Coverage</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">
              {coverage.currentlyCoveredSections} / {coverage.totalCoveredSections}
            </p>
            <p class="mt-2 text-sm text-gray-600">Sections with at least one VSI covered by your checked titles.</p>
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-amber-800">Best Next Read</p>
            {bestNextRead ? (
              <>
                <a href={`${baseUrl}/vsi/${bestNextRead.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`} class="mt-2 block font-serif text-2xl leading-tight text-amber-950 hover:text-indigo-700 transition-colors">{bestNextRead.title}</a>
                <p class="mt-1 text-sm text-amber-900">{bestNextRead.author}</p>
                <p class="mt-3 text-sm text-amber-900">
                  Adds {bestNextRead.newSectionCount} new sections, {bestNextRead.sectionCount} total.
                </p>
              </>
            ) : (
              <p class="mt-2 text-sm text-amber-900">No unread VSI adds any further section coverage right now.</p>
            )}
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setSpreadPathOpen(!spreadPathOpen)}
          class="w-full flex flex-col gap-3 md:flex-row md:items-end md:justify-between text-left"
        >
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900 flex items-center gap-2">
              Knowledge-Spread Path
              <svg class={`h-5 w-5 text-gray-400 transition-transform ${spreadPathOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </h2>
            <p class="mt-2 text-sm text-gray-700">
              A suggested reading order that builds your knowledge as broadly as possible. Each step picks the
              unread book that opens up the most new sections, favouring books that reach across different parts
              of the outline rather than clustering in one area. The path adapts as you check off what you have read.
            </p>
          </div>
          <p class="text-sm text-amber-900 flex-shrink-0">
            {coverage.path.length} steps · {coverage.remainingSections} sections uncovered
          </p>
        </button>

        {spreadPathOpen && coverage.path.length > 0 ? (
          <ol class="mt-6 grid gap-3 sm:gap-4 lg:grid-cols-2 min-w-0">
            {coverage.path.map((step, index) => {
              const metadata = formatMetadata(step);
              const isChecked = Boolean(checklistState[step.checklistKey]);

              return (
                <li key={step.checklistKey} class="rounded-xl border border-amber-200 bg-white p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Step {index + 1}
                      </p>
                      <h3 class="mt-1 font-serif text-xl leading-tight text-gray-900">
                        <a href={`${baseUrl}/vsi/${step.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`} class="hover:text-indigo-700 transition-colors">{step.title}</a>
                      </h3>
                      <p class="mt-1 text-sm text-gray-600">{metadata}</p>
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
                        aria-label={`Mark ${step.title} by ${step.author} as completed`}
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
        ) : spreadPathOpen ? (
          <div class="mt-6 rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No further spread path is available from unchecked titles. Either you have already covered every mapped
            section, or the remaining unread books only overlap with sections already covered.
          </div>
        ) : null}
      </section>

      <section class="rounded-2xl border border-gray-200 bg-white p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900">VSI Library</h2>
            <p class="mt-2 text-sm text-gray-600">
              Search the full mapped VSI list and sort it by section spread, title, or series number.
            </p>
          </div>
          <div class="text-sm text-gray-500">
            Showing {visibleEntries.length} of {filteredEntries.length} matching titles
          </div>
        </div>

        <div class="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
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
            <span class="mb-2 block text-sm font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter((event.currentTarget as HTMLSelectElement).value as StatusFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All titles</option>
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
              <option value="sections-desc">Most sections first</option>
              <option value="sections-asc">Fewest sections first</option>
              <option value="title-asc">Title A → Z</option>
              <option value="title-desc">Title Z → A</option>
              <option value="number-asc">Series number (oldest)</option>
              <option value="number-desc">Series number (newest)</option>
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
                          <a href={`${baseUrl}/vsi/${entry.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`} class="hover:text-indigo-700 transition-colors">{entry.title}</a>
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
                      <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                        Appears in {entry.sectionCount} sections
                      </span>
                      {entry.subject && (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{entry.subject}</span>
                      )}
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
