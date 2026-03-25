import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { CoverageRing } from '../../utils/readingLibrary';
import type { PartCoverageSegment } from '../../utils/readingLibrary';
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
  bestNextLabel: string;
  bestNextHref?: string;
  bestNextTitle?: string;
  bestNextSubtitle?: string;
  bestNextDescription?: string;
  emptyBestNextText: string;
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
  bestNextLabel,
  bestNextHref,
  bestNextTitle,
  bestNextSubtitle,
  bestNextDescription,
  emptyBestNextText,
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
              const covered = sorted.filter(s => s.fraction > 0);
              const uncovered = sorted.filter(s => s.fraction === 0);
              return (
                <div class="space-y-1 text-xs text-slate-500">
                  {covered.length > 0 && (
                    <>
                      <p class="font-medium text-slate-600">Most covered</p>
                      {covered.slice(0, 3).map(s => (
                        <div key={s.partNumber} class="flex items-center gap-1.5">
                          <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                          <span>{s.title}: {s.covered}/{s.total} {activeLayerLabel ?? 'items'}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {uncovered.length > 0 && uncovered.length < 10 && (
                    <>
                      <p class="pt-1 font-medium text-slate-600">Least covered</p>
                      {uncovered.slice(0, 3).map(s => (
                        <div key={s.partNumber} class="flex items-center gap-1.5">
                          <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                          <span>{s.title}: {s.covered}/{s.total} {activeLayerLabel ?? 'items'}</span>
                        </div>
                      ))}
                      {uncovered.length > 3 && (
                        <p class="text-slate-400">+{uncovered.length - 3} more</p>
                      )}
                    </>
                  )}
                  {covered.length === 0 && (
                    <p class="text-slate-400">No {activeLayerLabel ?? 'items'} covered yet.</p>
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
