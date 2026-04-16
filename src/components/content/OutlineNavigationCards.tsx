import { h } from 'preact';
import { useOutlineProgressState } from '../../hooks/useOutlineProgressState';
import type { OutlineProgressTargets } from '../../utils/outlineProgressTargets';
import OutlineProgressWheel from './OutlineProgressWheel';

export interface OutlineNavigationCardItem {
  href: string;
  eyebrow: string;
  title: string;
  progressTargets: OutlineProgressTargets;
  metaText?: string;
}

interface OutlineNavigationCardsProps {
  baseUrl: string;
  items: OutlineNavigationCardItem[];
  accentTextClass: string;
}

export default function OutlineNavigationCards({
  baseUrl,
  items,
  accentTextClass,
}: OutlineNavigationCardsProps) {
  const { coverageState, loading } = useOutlineProgressState(baseUrl);

  return (
    <div class="space-y-3">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          class="group block rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-100 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3">
            <div class="min-w-0">
              <p class={`text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] ${accentTextClass}`}>
                {item.eyebrow}
              </p>
              <h3 class="mt-2 text-lg font-serif font-bold text-slate-900 transition-colors group-hover:text-slate-950 sm:text-xl">
                {item.title}
              </h3>
              {item.metaText ? (
                <div class="mt-3">
                  <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {item.metaText}
                  </span>
                </div>
              ) : null}
            </div>
            <div class="flex shrink-0 flex-col items-center gap-2 self-start pt-0.5">
              <OutlineProgressWheel
                targets={item.progressTargets}
                coverageState={coverageState}
                loading={loading}
                size={88}
                ringWidth={8}
                containerClassName="h-12 w-12 sm:h-14 sm:w-14"
                className="pointer-events-none shrink-0"
              />
              <span class="flex h-6 w-6 items-center justify-center text-slate-300 transition group-hover:text-slate-500">
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
          </div>
        </a>
      ))}
    </div>
  );
}
