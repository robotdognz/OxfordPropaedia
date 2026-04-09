import { h } from 'preact';
import {
  CONTROL_SURFACE_CLASS,
} from '../ui/controlTheme';
import SelectorCardRail from '../ui/SelectorCardRail';
import type { ReadingLibraryCheckedFilter } from '../../utils/readingPreference';

interface LibraryListControlsPanelProps {
  query: string;
  onQueryInput: (value: string) => void;
  queryPlaceholder: string;
  checkedFilter: ReadingLibraryCheckedFilter;
  onCheckedFilterChange: (value: ReadingLibraryCheckedFilter) => void;
  sortField: string;
  onSortFieldChange: (value: string) => void;
  sortOptions: Array<{ value: string; label: string }>;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
}

const LABEL_CLASS = 'text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500';
const FIELD_WRAP_CLASS = 'flex min-h-9 items-center rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-slate-600 shadow-sm shadow-slate-200/60 transition hover:border-slate-300 focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-sm focus-within:shadow-slate-200/70';
const SEARCH_INPUT_CLASS = 'w-full bg-transparent p-0 font-serif text-xs font-medium leading-5 text-slate-900 placeholder:text-slate-400 focus:outline-none';
const SELECT_CLASS = 'w-full appearance-none bg-transparent p-0 pr-5 font-serif text-xs font-medium leading-5 text-slate-900 focus:outline-none';

function SelectChevron() {
  return (
    <svg
      class="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  );
}

export default function LibraryListControlsPanel({
  query,
  onQueryInput,
  queryPlaceholder,
  checkedFilter,
  onCheckedFilterChange,
  sortField,
  onSortFieldChange,
  sortOptions,
  sortDirection,
  onSortDirectionChange,
}: LibraryListControlsPanelProps) {
  return (
    <section class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:p-3`}>
      <div class="grid gap-2.5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)] lg:items-start">
        <section class="min-w-0 space-y-1.5">
          <div class={LABEL_CLASS}>Search</div>
          <div class="flex min-h-9 items-center rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-slate-600 shadow-sm shadow-slate-200/60 transition hover:border-slate-300 focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-sm focus-within:shadow-slate-200/70">
            <input
              type="search"
              value={query}
              onInput={(event) => onQueryInput((event.currentTarget as HTMLInputElement).value)}
              placeholder={queryPlaceholder}
              class={SEARCH_INPUT_CLASS}
            />
          </div>
        </section>

        <section class="min-w-0 space-y-1.5">
          <div class={LABEL_CLASS}>Sort</div>
          <div class="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.76fr)_minmax(13rem,1.08fr)] xl:items-start">
            <label class="min-w-0">
              <span class={`${FIELD_WRAP_CLASS} relative`}>
                <select
                  value={sortField}
                  onChange={(event) => onSortFieldChange((event.currentTarget as HTMLSelectElement).value)}
                  class={SELECT_CLASS}
                >
                  {sortOptions.map((option) => (
                    <option value={option.value}>{option.label}</option>
                  ))}
                </select>
                <SelectChevron />
              </span>
            </label>

            <label class="min-w-0">
              <span class={`${FIELD_WRAP_CLASS} relative`}>
                <select
                  value={sortDirection}
                  onChange={(event) => onSortDirectionChange((event.currentTarget as HTMLSelectElement).value as 'asc' | 'desc')}
                  class={SELECT_CLASS}
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
                <SelectChevron />
              </span>
            </label>

            <div class="min-w-0">
              <SelectorCardRail
                ariaLabel="Checked filter"
                value={checkedFilter}
                onChange={onCheckedFilterChange}
                options={[
                  { value: 'both', label: 'All' },
                  { value: 'checked', label: 'Checked' },
                  { value: 'unchecked', label: 'Unchecked' },
                ]}
                columns={3}
                size="compact"
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
