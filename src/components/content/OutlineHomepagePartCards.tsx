import { h } from 'preact';
import { useOutlineProgressState } from '../../hooks/useOutlineProgressState';
import type { OutlineProgressTargets } from '../../utils/outlineProgressTargets';
import OutlineProgressWheel from './OutlineProgressWheel';

interface OutlineHomepagePartCardItem {
  href: string;
  partName: string;
  title: string;
  colorHex: string;
  divisionCount: number;
  sectionCount: number;
  subsectionCount: number;
  progressTargets: OutlineProgressTargets;
}

interface OutlineHomepagePartCardsProps {
  baseUrl: string;
  items: OutlineHomepagePartCardItem[];
}

export default function OutlineHomepagePartCards({
  baseUrl,
  items,
}: OutlineHomepagePartCardsProps) {
  const { coverageState, loading } = useOutlineProgressState(baseUrl);

  return (
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((part) => (
        <a
          key={part.href}
          href={part.href}
          class="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
        >
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3">
            <div class="min-w-0 space-y-2">
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
                {part.partName}
              </p>
              <h3
                class="font-serif text-xl transition-colors group-hover:text-indigo-700"
                style={`color: ${part.colorHex};`}
              >
                {part.title}
              </h3>
            </div>
            <div class="grid shrink-0 self-stretch pt-0.5" style="grid-template-rows: auto minmax(0, 1fr);">
              <OutlineProgressWheel
                targets={part.progressTargets}
                coverageState={coverageState}
                loading={loading}
                size={88}
                ringWidth={8}
                containerClassName="h-12 w-12"
                className="pointer-events-none shrink-0 justify-self-center"
              />
              <span class="flex h-6 w-6 items-center justify-center self-center justify-self-center text-slate-300 transition group-hover:text-slate-500">
                <svg
                  class="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
            <div class="col-span-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
              <span class="rounded-full bg-white px-2.5 py-1">
                {part.divisionCount} {part.divisionCount === 1 ? 'Division' : 'Divisions'}
              </span>
              <span class="rounded-full bg-white px-2.5 py-1">
                {part.sectionCount} {part.sectionCount === 1 ? 'Section' : 'Sections'}
              </span>
              <span class="rounded-full bg-white px-2.5 py-1">
                {part.subsectionCount} {part.subsectionCount === 1 ? 'Subsection' : 'Subsections'}
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
