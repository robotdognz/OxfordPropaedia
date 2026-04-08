import { h, type ComponentChildren } from 'preact';
import type { CoverageRing, PartCoverageSegment } from '../../utils/readingLibrary';

interface CoverageStatisticsDetailsProps {
  coverageRings: CoverageRing[];
  activeRingLabel?: string;
  partSegments?: PartCoverageSegment[];
  activeLayerLabel?: string;
  preface?: ComponentChildren;
}

export default function CoverageStatisticsDetails({
  coverageRings,
  activeRingLabel,
  partSegments,
  activeLayerLabel,
  preface,
}: CoverageStatisticsDetailsProps) {
  const hasPartRing = partSegments && partSegments.length > 0;

  return (
    <div class="mt-2 space-y-3">
      {preface}
      <div class={`grid gap-3 ${hasPartRing ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
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
          const top = sorted.filter((segment) => segment.fraction > 0).slice(0, 3);
          const incomplete = sorted.filter((segment) => segment.fraction < 1).reverse().slice(0, 3);
          const allComplete = sorted.every((segment) => segment.fraction >= 1);
          const label = activeLayerLabel ?? 'items';

          return (
            <div class="space-y-1 text-xs text-slate-500">
              {top.length > 0 ? (
                <>
                  <p class="font-medium text-slate-600">Most covered</p>
                  {top.map((segment) => (
                    <div key={segment.partNumber} class="flex items-center gap-1.5">
                      <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.colorHex }} />
                      <span>{segment.title}: {segment.covered}/{segment.total} {label}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p class="text-slate-400">No {label} covered yet.</p>
              )}
              {allComplete ? (
                <p class="pt-1 text-slate-400">All {label} covered.</p>
              ) : incomplete.length > 0 && top.length > 0 && (
                <>
                  <p class="pt-1 font-medium text-slate-600">Least covered</p>
                  {incomplete.map((segment) => (
                    <div key={segment.partNumber} class="flex items-center gap-1.5">
                      <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.colorHex }} />
                      <span>{segment.title}: {segment.covered}/{segment.total} {label}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
