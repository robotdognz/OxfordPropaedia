import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { CoverageRing, PartCoverageSegment } from '../../utils/readingLibrary';
import CoverageRings from '../ui/CoverageRings';
import PartCoverageRing from '../ui/PartCoverageRing';

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
}: ReadingCoverageSummaryProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const hasPartRing = partSegments && partSegments.length > 0;

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
                <PartCoverageRing segments={partSegments} size={100} />
              </div>
              <div class="hidden sm:block">
                <PartCoverageRing segments={partSegments} size={112} />
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
          <div class={`mt-2 grid gap-3 ${hasPartRing ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div class="space-y-1 text-xs text-slate-500">
              {coverageRings.map((ring) => (
                <div
                  key={ring.label}
                  class={`flex items-center gap-1.5 ${
                    ring.label === activeRingLabel ? 'font-medium text-slate-700' : ''
                  }`}
                >
                  <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ring.color }} />
                  <span>{ring.label}: {ring.count}/{ring.total}</span>
                </div>
              ))}
            </div>
            {hasPartRing && (() => {
              const sorted = [...partSegments].sort((a, b) => b.fraction - a.fraction || b.depthScore - a.depthScore);
              const top = sorted.filter(s => s.fraction > 0).slice(0, 3);
              const incomplete = sorted.filter(s => s.fraction < 1).reverse().slice(0, 3);
              const allComplete = sorted.every(s => s.fraction >= 1);
              const lbl = activeLayerLabel ?? 'items';
              return (
                <div class="space-y-1 text-xs text-slate-500">
                  {top.length > 0 ? (
                    <>
                      <p class="font-medium text-slate-600">Most covered</p>
                      {top.map(s => (
                        <div key={s.partNumber} class="flex items-center gap-1.5">
                          <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                          <span>{s.title}: {s.covered}/{s.total} {lbl}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p class="text-slate-400">No {lbl} covered yet.</p>
                  )}
                  {allComplete ? (
                    <p class="pt-1 text-slate-400">All {lbl} covered.</p>
                  ) : incomplete.length > 0 && top.length > 0 && (
                    <>
                      <p class="pt-1 font-medium text-slate-600">Least covered</p>
                      {incomplete.map(s => (
                        <div key={s.partNumber} class="flex items-center gap-1.5">
                          <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                          <span>{s.title}: {s.covered}/{s.total} {lbl}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
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
