import { h } from 'preact';
import type { CoverageRing } from '../../utils/readingLibrary';
import CoverageRings from '../ui/CoverageRings';

interface ReadingCoverageSummaryProps {
  coverageRings: CoverageRing[];
  totalLabel: string;
  totalCount: number;
  totalDescription: string;
  completedCount: number;
  completedDescription: string;
  activeCoverageLabel: string;
  activeCoverageCount: number;
  activeCoverageTotal: number;
  activeCoverageDescription: string;
  bestNextLabel: string;
  bestNextHref?: string;
  bestNextTitle?: string;
  bestNextSubtitle?: string;
  bestNextDescription?: string;
  emptyBestNextText: string;
  mobileRingWidth?: number;
  desktopRingWidth?: number;
}

export default function ReadingCoverageSummary({
  coverageRings,
  totalLabel,
  totalCount,
  totalDescription,
  completedCount,
  completedDescription,
  activeCoverageLabel,
  activeCoverageCount,
  activeCoverageTotal,
  activeCoverageDescription,
  bestNextLabel,
  bestNextHref,
  bestNextTitle,
  bestNextSubtitle,
  bestNextDescription,
  emptyBestNextText,
  mobileRingWidth = 8,
  desktopRingWidth = 10,
}: ReadingCoverageSummaryProps) {
  return (
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-xl border border-gray-200 bg-white p-5 sm:col-span-2 xl:col-span-1">
        <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Your Coverage</p>
        <div class="mt-4 flex items-center gap-4">
          <div class="shrink-0 sm:hidden">
            <CoverageRings rings={coverageRings} size={100} ringWidth={mobileRingWidth} hideLegend />
          </div>
          <div class="hidden shrink-0 sm:block">
            <CoverageRings rings={coverageRings} size={112} ringWidth={desktopRingWidth} hideLegend />
          </div>
          <div class="min-w-0 space-y-1">
            {coverageRings.map((ring) => (
              <div key={ring.label} class="flex items-center gap-1.5 text-xs text-gray-500">
                <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ring.color }} />
                <span>{ring.label}: {ring.count}/{ring.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-5">
          <p class="text-sm font-medium uppercase tracking-wide text-gray-500">{totalLabel}</p>
          <p class="mt-2 font-serif text-3xl text-gray-900">{totalCount}</p>
          <p class="mt-2 text-sm text-gray-600">{totalDescription}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-5">
        <p class="text-sm font-medium uppercase tracking-wide text-gray-500">Checked Off</p>
        <p class="mt-2 font-serif text-3xl text-gray-900">{completedCount}</p>
        <p class="mt-2 text-sm text-gray-600">{completedDescription}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-5">
          <p class="text-sm font-medium uppercase tracking-wide text-gray-500">{activeCoverageLabel}</p>
          <p class="mt-2 font-serif text-3xl text-gray-900">
            {activeCoverageCount} / {activeCoverageTotal}
          </p>
          <p class="mt-2 text-sm text-gray-600">{activeCoverageDescription}</p>
      </div>
      <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-5 sm:col-span-2 xl:col-span-1">
        <p class="text-sm font-medium uppercase tracking-wide text-amber-800">{bestNextLabel}</p>
        {bestNextTitle && bestNextHref ? (
          <>
            <a
              href={bestNextHref}
              class="mt-2 block font-serif text-2xl leading-tight text-amber-950 hover:text-indigo-700 transition-colors"
            >
              {bestNextTitle}
            </a>
            {bestNextSubtitle ? <p class="mt-1 text-sm text-amber-900">{bestNextSubtitle}</p> : null}
            {bestNextDescription ? <p class="mt-3 text-sm text-amber-900">{bestNextDescription}</p> : null}
          </>
        ) : (
          <p class="mt-2 text-sm text-amber-900">{emptyBestNextText}</p>
        )}
      </div>
    </section>
  );
}
