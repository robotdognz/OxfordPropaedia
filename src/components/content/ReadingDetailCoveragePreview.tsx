import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { PartMeta } from '../../utils/helpers';
import { readChecklistState, subscribeChecklistState } from '../../utils/readingChecklist';
import {
  buildCoverageRingsForCompleted,
  buildPartCoverageSegments,
  buildPartCoverageSegmentsWithPreview,
  buildCoverageRingsWithPreview,
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type CoverageRing,
} from '../../utils/readingLibrary';
import CoverageLayerTabs from './CoverageLayerTabs';
import PartCoverageRing from '../ui/PartCoverageRing';
import CoverageRings from '../ui/CoverageRings';

interface ReadingDetailCoveragePreviewProps {
  heading: string;
  description: string;
  footprintHeading?: string;
  footprintDescription?: string;
  dataUrl: string;
  checklistKey: string;
  fallbackRings?: CoverageRing[];
  size?: number;
  ringWidth?: number;
}

interface ReadingLibraryPayload {
  entries: ChecklistBackedReadingEntry[];
  partsMeta?: PartMeta[];
}

const PREVIEW_LAYER_ORDER: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];

const RING_LABEL_TO_LAYER: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};

function preferredDefaultLayer(availableLayers: CoverageLayer[]): CoverageLayer {
  if (availableLayers.includes('section')) return 'section';
  if (availableLayers.includes('division')) return 'division';
  if (availableLayers.includes('part')) return 'part';
  return availableLayers[0] ?? 'part';
}

function preferredPreviewLayer(
  coverageRings: CoverageRing[],
  availableLayers: CoverageLayer[],
): CoverageLayer {
  for (const layer of PREVIEW_LAYER_ORDER) {
    if (!availableLayers.includes(layer)) continue;
    const ring = coverageRings.find(
      (candidateRing) => candidateRing.label === COVERAGE_LAYER_META[layer].pluralLabel,
    );
    if ((ring?.addedCount ?? 0) > 0) {
      return layer;
    }
  }

  return preferredDefaultLayer(availableLayers);
}

export default function ReadingDetailCoveragePreview({
  heading,
  description,
  footprintHeading,
  footprintDescription,
  dataUrl,
  checklistKey,
  fallbackRings = [],
  size = 100,
  ringWidth = 8,
}: ReadingDetailCoveragePreviewProps) {
  const { data, error } = useJsonPayload<ReadingLibraryPayload>(dataUrl);
  const [checklistState, setChecklistState] = useState<Record<string, boolean> | null>(null);
  const [activeLayer, setActiveLayer] = useState<CoverageLayer | null>(null);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => setChecklistState(readChecklistState()));
  }, []);

  if (error && fallbackRings.length > 0) {
    return (
      <div class="w-full space-y-3">
        <div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-start">
          <div class="min-w-0 flex-1">
            <h2 class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">{heading}</h2>
            <p class="mt-1 text-xs text-slate-400">{description}</p>
          </div>
          <div class="w-full sm:w-auto sm:shrink-0">
            <CoverageRings rings={fallbackRings} size={size} ringWidth={ringWidth} hideLegend />
          </div>
        </div>
      </div>
    );
  }

  if (!data || checklistState === null) {
    return (
      <div class="w-full space-y-3" aria-hidden="true">
        <div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-start">
          <div class="min-w-0 flex-1">
            <div class="h-4 w-40 rounded bg-slate-200/80" />
            <div class="mt-2 h-3 w-56 rounded bg-slate-200/70" />
          </div>
          <div class="h-32 rounded-2xl border border-slate-200 bg-white/70 sm:w-64" />
        </div>
        <div class="h-16 rounded-2xl border border-slate-200 bg-white/70" />
      </div>
    );
  }

  const isChecked = Boolean(checklistState[checklistKey]);
  const coverageRings = isChecked
    ? buildCoverageRingsForCompleted(data.entries, new Set([checklistKey]))
    : buildCoverageRingsWithPreview(data.entries, checklistState, [checklistKey]);
  const availableLayers = coverageRings
    .map((ring) => RING_LABEL_TO_LAYER[ring.label])
    .filter((layer): layer is CoverageLayer => Boolean(layer));
  const resolvedLayer = activeLayer && availableLayers.includes(activeLayer)
    ? activeLayer
    : isChecked
      ? preferredDefaultLayer(availableLayers)
      : preferredPreviewLayer(coverageRings, availableLayers);

  const activeRingLabel = COVERAGE_LAYER_META[resolvedLayer].pluralLabel;
  const activeRing = coverageRings.find((ring) => ring.label === activeRingLabel) ?? coverageRings[0];
  const readingOnlyChecklistState = { [checklistKey]: true } as Record<string, boolean>;
  const partSegments = data.partsMeta && data.partsMeta.length > 0
    ? (
      isChecked
        ? buildPartCoverageSegments(data.entries, readingOnlyChecklistState, resolvedLayer, data.partsMeta)
        : buildPartCoverageSegmentsWithPreview(data.entries, checklistState, [checklistKey], resolvedLayer, data.partsMeta)
    )
    : undefined;
  const activeCoveragePercent = activeRing && activeRing.total > 0
    ? Math.round((activeRing.count / activeRing.total) * 100)
    : 0;
  const layerControlLabel = isChecked ? 'Coverage Layer' : 'Preview Layer';
  const resolvedHeading = isChecked ? (footprintHeading ?? heading) : heading;
  const resolvedDescription = isChecked ? (footprintDescription ?? description) : description;
  const activeOverlayCount = activeRing?.addedCount ?? 0;

  return (
    <div class="w-full space-y-3">
      <div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-start">
        <div class="min-w-0 flex-1">
          <h2 class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">{resolvedHeading}</h2>
          <p class="mt-1 text-xs text-slate-400">{resolvedDescription}</p>
        </div>
        <div class="w-full space-y-3 sm:w-64 sm:shrink-0">
          <div class={`grid items-start gap-3 ${partSegments && partSegments.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <CoverageRings
              rings={coverageRings}
              size={size}
              ringWidth={ringWidth}
              hideLegend
              activeRingLabel={activeRingLabel}
              onSelectRing={(label) => {
                const nextLayer = RING_LABEL_TO_LAYER[label];
                if (nextLayer) setActiveLayer(nextLayer);
              }}
            />
            {partSegments && partSegments.length > 0 ? (
              <PartCoverageRing
                segments={partSegments}
                size={size}
                centerPercentage={activeCoveragePercent}
              />
            ) : null}
          </div>
          {!isChecked ? (
            <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span class="inline-flex items-center gap-1.5">
                <span class="inline-block h-2.5 w-2.5 rounded-full bg-slate-500/80" />
                <span>Current</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="inline-block h-2.5 w-2.5 rounded-full bg-slate-900" />
                <span>Added by this reading</span>
              </span>
            </div>
          ) : null}
          {activeRing ? (
            <p class="text-center text-[11px] text-slate-500">
              {isChecked ? (
                <span>{`${activeRing.label}: ${activeRing.count} out of ${activeRing.total}`}</span>
              ) : (
                <>
                  <span>{activeRing.label}: {activeRing.count}</span>
                  {activeOverlayCount > 0 ? (
                    <span>
                      <span class="text-slate-500">+</span>
                      <span class="font-semibold text-slate-900">{activeOverlayCount}</span>
                    </span>
                  ) : null}
                  <span>{` out of ${activeRing.total}`}</span>
                </>
              )}
            </p>
          ) : null}
        </div>
      </div>
      <CoverageLayerTabs
        activeLayer={resolvedLayer}
        onSelect={setActiveLayer}
        snapshots={availableLayers.map((layer) => {
          const ring = coverageRings.find(
            (candidateRing) => candidateRing.label === COVERAGE_LAYER_META[layer].pluralLabel,
          );
          return {
            layer,
            currentlyCoveredCount: ring?.count ?? 0,
            totalCoverageCount: ring?.total ?? 0,
          };
        })}
        metaTextByLayer={Object.fromEntries(
          availableLayers.map((layer) => {
            const ring = coverageRings.find(
              (candidateRing) => candidateRing.label === COVERAGE_LAYER_META[layer].pluralLabel,
            );
            return [layer, isChecked ? `${ring?.count ?? 0}/${ring?.total ?? 0}` : `+${ring?.addedCount ?? 0}`];
          }),
        )}
        label={layerControlLabel}
      />
    </div>
  );
}
