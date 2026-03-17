import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  buildWikipediaCoverageSnapshot,
  type WikipediaAggregateEntry,
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { slugify, sectionUrl } from '../../utils/helpers';
import CoverageRings from '../ui/CoverageRings';

export interface WikipediaLibraryProps {
  entries: WikipediaAggregateEntry[];
  baseUrl: string;
}

type KnowledgeLevel = 1 | 2 | 3;
type StatusFilter = 'all' | 'unchecked' | 'checked';
type SortMode = 'sections-desc' | 'sections-asc' | 'title-asc' | 'title-desc';

const LEVEL_KEY = 'propaedia-wiki-level';
const INITIAL_VISIBLE = 50;

function getStoredLevel(): KnowledgeLevel {
  if (typeof window === 'undefined') return 3;
  const stored = localStorage.getItem(LEVEL_KEY);
  if (stored === '1') return 1;
  if (stored === '3') return 3;
  return 3;
}

function storeLevel(level: KnowledgeLevel) {
  if (typeof window !== 'undefined') localStorage.setItem(LEVEL_KEY, String(level));
}

function SectionLinks({ sections, baseUrl, label }: { sections: ReadingSectionSummary[]; baseUrl: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (sections.length === 0) return null;
  return (
    <div class="mt-3">
      <button type="button" onClick={() => setOpen(!open)} class="text-xs font-medium text-amber-800 hover:text-amber-950 underline">
        {open ? 'Hide sections' : label}
      </button>
      {open && (
        <ul class="mt-2 flex flex-wrap gap-1.5">
          {sections.map((s) => (
            <li key={s.sectionCode}>
              <a href={sectionUrl(s.sectionCode, baseUrl)} class="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100">
                {s.sectionCode}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WikipediaLibrary({ entries, baseUrl }: WikipediaLibraryProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [level, setLevel] = useState<KnowledgeLevel>(2);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('sections-desc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    setChecklistState(readChecklistState());
    setLevel(getStoredLevel());
    return subscribeChecklistState(() => setChecklistState(readChecklistState()));
  }, []);

  useEffect(() => { setVisibleCount(INITIAL_VISIBLE); }, [query, statusFilter, sortMode, level]);

  const changeLevel = (newLevel: KnowledgeLevel) => {
    setLevel(newLevel);
    storeLevel(newLevel);
  };

  const levelEntries = entries.filter((e) => e.lowestLevel <= level);
  const completedChecklistKeys = new Set(Object.keys(checklistState).filter((k) => checklistState[k]));
  const coverage = buildWikipediaCoverageSnapshot(levelEntries, completedChecklistKeys);
  const completedCount = levelEntries.filter((e) => Boolean(checklistState[e.checklistKey])).length;

  // Coverage rings
  const allParts = new Set<number>();
  const allDivisions = new Set<string>();
  const allSections = new Set<string>();
  const coveredParts = new Set<number>();
  const coveredDivisions = new Set<string>();
  const coveredSections = new Set<string>();
  for (const entry of levelEntries) {
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

  const normalizedQuery = query.trim().toLowerCase();
  const collate = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  const filteredEntries = levelEntries
    .filter((e) => {
      const isChecked = Boolean(checklistState[e.checklistKey]);
      if (statusFilter === 'checked' && !isChecked) return false;
      if (statusFilter === 'unchecked' && isChecked) return false;
      if (!normalizedQuery) return true;
      return e.title.toLowerCase().includes(normalizedQuery) || (e.category || '').toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => {
      switch (sortMode) {
        case 'title-asc': return collate(a.title, b.title);
        case 'title-desc': return collate(b.title, a.title);
        case 'sections-asc': return a.sectionCount !== b.sectionCount ? a.sectionCount - b.sectionCount : collate(a.title, b.title);
        default: return a.sectionCount !== b.sectionCount ? b.sectionCount - a.sectionCount : collate(a.title, b.title);
      }
    });

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canShowMore = visibleEntries.length < filteredEntries.length;
  const bestNextRead = coverage.path[0] ?? null;

  return (
    <div class="space-y-8">
      {/* Level toggle */}
      <div class="flex justify-center">
        <div class="flex rounded-lg border border-gray-200 bg-white p-1">
          {([1, 2, 3] as KnowledgeLevel[]).map((lvl) => {
            const labels: Record<number, string> = { 1: 'Level 1 - 10', 2: 'Level 2 - 100', 3: 'Level 3 - ~1,000' };
            return (
              <button
                key={lvl} type="button" onClick={() => changeLevel(lvl)}
                class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${level === lvl ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {labels[lvl]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <section class="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <div class="rounded-xl border border-gray-200 bg-white p-5 flex flex-row items-center gap-4 md:flex-col md:self-stretch md:items-center md:gap-3">
          <div class="flex-shrink-0 md:hidden">
            <CoverageRings rings={coverageRings} size={100} ringWidth={8} hideLegend />
          </div>
          <p class="hidden md:block text-sm font-medium uppercase tracking-wide text-gray-500">Your Coverage</p>
          <div class="hidden md:flex md:flex-1 md:items-center">
            <CoverageRings rings={coverageRings} size={120} ringWidth={10} />
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
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Articles</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{levelEntries.length}</p>
            <p class="mt-2 text-sm text-gray-600">Wikipedia Vital Articles at the selected level.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Checked Off</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{completedCount}</p>
            <p class="mt-2 text-sm text-gray-600">Shared with the Done boxes on section pages.</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Section Coverage</p>
            <p class="mt-2 font-serif text-3xl text-gray-900">{coverage.currentlyCoveredSections} / {coverage.totalCoveredSections}</p>
            <p class="mt-2 text-sm text-gray-600">Sections covered by your checked articles.</p>
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p class="text-sm font-medium uppercase tracking-wide text-amber-800">Best Next Read</p>
            {bestNextRead ? (
              <>
                <a href={`${baseUrl}/wikipedia/${slugify(bestNextRead.title)}`} class="mt-2 block font-serif text-2xl leading-tight text-amber-950 hover:text-indigo-700 transition-colors">{bestNextRead.title}</a>
                <p class="mt-3 text-sm text-amber-900">Adds {bestNextRead.newSectionCount} new sections, {bestNextRead.sectionCount} total.</p>
              </>
            ) : (
              <p class="mt-2 text-sm text-amber-900">No unread article adds further section coverage.</p>
            )}
          </div>
        </div>
      </section>

      {/* Knowledge-Spread Path */}
      <section class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6 overflow-hidden">
        <button type="button" onClick={() => setSpreadPathOpen(!spreadPathOpen)} class="w-full flex flex-col gap-3 md:flex-row md:items-end md:justify-between text-left">
          <div class="max-w-3xl">
            <h2 class="font-serif text-2xl text-gray-900 flex items-center gap-2">
              Knowledge-Spread Path
              <svg class={`h-5 w-5 text-gray-400 transition-transform ${spreadPathOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </h2>
            <p class="mt-2 text-sm text-gray-700">
              A suggested reading order that builds your knowledge as broadly as possible. Each step picks the
              unread article that opens up the most new sections, favouring articles that reach across different
              parts of the outline. The path adapts as you check off what you have read.
            </p>
          </div>
          <p class="text-sm text-amber-900 flex-shrink-0">{coverage.path.length} steps · {coverage.remainingSections} sections uncovered</p>
        </button>

        {spreadPathOpen && coverage.path.length > 0 ? (
          <ol class="mt-6 grid gap-3 sm:gap-4 lg:grid-cols-2 min-w-0">
            {coverage.path.map((step, index) => {
              const isChecked = Boolean(checklistState[step.checklistKey]);
              return (
                <li key={step.checklistKey} class="rounded-xl border border-amber-200 bg-white p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Step {index + 1}</p>
                      <h3 class="mt-1 font-serif text-xl leading-tight text-gray-900">
                        <a href={`${baseUrl}/wikipedia/${slugify(step.title)}`} class="hover:text-indigo-700 transition-colors">{step.title}</a>
                      </h3>
                    </div>
                    <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                      <input type="checkbox" checked={isChecked} onChange={(e) => writeChecklistState(step.checklistKey, (e.currentTarget as HTMLInputElement).checked)}
                        class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" aria-label={`Mark ${step.title} as read`} />
                      Done
                    </label>
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                    <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">+{step.newSectionCount} new sections</span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{step.sectionCount} total sections</span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{step.cumulativeCoveredSectionCount} covered after this step</span>
                  </div>
                  <SectionLinks sections={step.newSections} baseUrl={baseUrl} label={`Show the ${step.newSectionCount} new sections`} />
                </li>
              );
            })}
          </ol>
        ) : spreadPathOpen ? (
          <div class="mt-6 rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No further spread path is available from unchecked articles.
          </div>
        ) : null}
      </section>

      {/* Filters and list */}
      <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Search</span>
            <input type="search" placeholder="Search articles..." value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter((e.currentTarget as HTMLSelectElement).value as StatusFilter)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="all">All</option>
              <option value="unchecked">Unchecked only</option>
              <option value="checked">Checked only</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-gray-700">Sort</span>
            <select value={sortMode} onChange={(e) => setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200">
              <option value="sections-desc">Most sections first</option>
              <option value="sections-asc">Fewest sections first</option>
              <option value="title-asc">Title A → Z</option>
              <option value="title-desc">Title Z → A</option>
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
                          <a href={`${baseUrl}/wikipedia/${slugify(entry.title)}`} class="hover:text-indigo-700 transition-colors">{entry.displayTitle || entry.title}</a>
                        </h3>
                        <p class="mt-1 text-sm text-gray-600">
                          {entry.category && <span>{entry.category}</span>}
                          {entry.category && entry.sectionCount > 0 && <span> · </span>}
                          {entry.sectionCount > 0 && <span>{entry.sectionCount} sections</span>}
                        </p>
                      </div>
                      <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                        <input type="checkbox" checked={isChecked}
                          onChange={(e) => writeChecklistState(entry.checklistKey, (e.currentTarget as HTMLInputElement).checked)}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Mark ${entry.title} as read`} />
                        Done
                      </label>
                    </div>
                    <div class="mt-3 flex items-center gap-3">
                      <a href={entry.url} target="_blank" rel="noopener noreferrer"
                        class="text-xs text-indigo-600 hover:text-indigo-800">Read on Wikipedia ↗</a>
                    </div>
                  </article>
                );
              })}
            </div>
            {canShowMore && (
              <button type="button" onClick={() => setVisibleCount((c) => c + 50)}
                class="mt-6 w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Show more ({filteredEntries.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div class="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-600">
            No articles match your filters.
          </div>
        )}
      </section>
    </div>
  );
}
