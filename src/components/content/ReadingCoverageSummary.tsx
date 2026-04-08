import { h, type ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { CoverageRing, PartCoverageSegment } from '../../utils/readingLibrary';
import CoverageRings from '../ui/CoverageRings';
import PartCoverageRing from '../ui/PartCoverageRing';
import CoverageStatisticsDetails from './CoverageStatisticsDetails';

interface ReadingCoverageSummaryProps {
  coverageRings: CoverageRing[];
  totalLabel: string;
  totalCount: number;
  totalDescription: string;
  completedCount: number;
  completedDescription: string;
  activeCoverageLabel: string;
  activeRingLabel?: string;
  onSelectCoverageRing?: (label: string) => void;
  activeCoverageCount: number;
  activeCoverageTotal: number;
  activeCoverageDescription: string;
  mobileRingWidth?: number;
  desktopRingWidth?: number;
  partSegments?: PartCoverageSegment[];
  activeLayerLabel?: string;
  coverageStatisticsPreface?: ComponentChildren;
}

export default function ReadingCoverageSummary({
  coverageRings,
  totalLabel,
  totalCount,
  totalDescription,
  completedCount,
  completedDescription,
  activeCoverageLabel,
  activeRingLabel,
  onSelectCoverageRing,
  activeCoverageCount,
  activeCoverageTotal,
  activeCoverageDescription,
  mobileRingWidth = 8,
  desktopRingWidth = 10,
  partSegments,
  activeLayerLabel,
  coverageStatisticsPreface,
}: ReadingCoverageSummaryProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const hasPartRing = partSegments && partSegments.length > 0;
  const activeCoveragePercent = activeCoverageTotal > 0
    ? Math.round((activeCoverageCount / activeCoverageTotal) * 100)
    : 0;

  return (
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-xl border border-gray-200 bg-white p-5 sm:col-span-2 xl:col-span-1">
        <p class="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Your Coverage</p>
        <div class="flex items-center justify-evenly">
          <div class="sm:hidden">
            <CoverageRings
              rings={coverageRings}
              size={100}
              ringWidth={mobileRingWidth}
              hideLegend
              activeRingLabel={activeRingLabel}
              onSelectRing={onSelectCoverageRing}
            />
          </div>
          <div class="hidden sm:block">
            <CoverageRings
              rings={coverageRings}
              size={112}
              ringWidth={desktopRingWidth}
              hideLegend
              activeRingLabel={activeRingLabel}
              onSelectRing={onSelectCoverageRing}
            />
          </div>
          {hasPartRing && (
            <>
              <div class="sm:hidden">
                <PartCoverageRing segments={partSegments} size={100} centerPercentage={activeCoveragePercent} />
              </div>
              <div class="hidden sm:block">
                <PartCoverageRing segments={partSegments} size={112} centerPercentage={activeCoveragePercent} />
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setStatsOpen(o => !o)}
          class="mt-3 flex items-center gap-1 cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-500 transition-colors"
        >
          <span>Coverage Statistics</span>
          <svg
            class={`h-3 w-3 transform transition-transform duration-200 ${statsOpen ? 'rotate-180' : 'rotate-0'}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width={2}
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {statsOpen && (
          <CoverageStatisticsDetails
            coverageRings={coverageRings}
            activeRingLabel={activeRingLabel}
            partSegments={partSegments}
            activeLayerLabel={activeLayerLabel}
            preface={coverageStatisticsPreface}
          />
        )}
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
    </section>
  );
}
