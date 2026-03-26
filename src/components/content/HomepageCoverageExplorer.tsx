import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { writeChecklistState } from '../../utils/readingChecklist';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  getCoverageLayerPreference,
  getReadingPreference,
  READING_TYPE_LABELS,
  setCoverageLayerPreference,
  setReadingPreference,
  subscribeCoverageLayerPreference,
  subscribeReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';
import {
  COVERAGE_LAYER_META,
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  buildPartCoverageSegments,
  completedChecklistKeysFromState,
  countCompletedEntries,
  coverageLayerLabel,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import ReadingSpreadPath from './ReadingSpreadPath';
import CoverageRings from '../ui/CoverageRings';
import PartCoverageRing from '../ui/PartCoverageRing';

interface PartMeta {
  partNumber: number;
  colorHex: string;
  title: string;
}

interface HomepageCoverageExplorerProps {
  baseUrl: string;
  initialSource: HomepageCoverageSource;
  partsMeta?: PartMeta[];
  showHeader?: boolean;
  framed?: boolean;
}

const SOURCE_ORDER: ReadingType[] = ['vsi', 'iot', 'wikipedia', 'macropaedia'];
const ALL_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};

function availableLayers(source: HomepageCoverageSource): CoverageLayer[] {
  return source.includeSubsections ? ALL_LAYERS : ALL_LAYERS.filter((layer) => layer !== 'subsection');
}

function emptyRecommendationMessage(source: HomepageCoverageSource, layer: CoverageLayer, isComplete: boolean): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this view.`;
  }

  return `No unread ${source.itemSingular} adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

export default function HomepageCoverageExplorer({
  baseUrl,
  initialSource,
  partsMeta,
  showHeader = true,
  framed = true,
}: HomepageCoverageExplorerProps) {
  const checklistState = useReadingChecklistState();
  const [selectedType, setSelectedType] = useState<ReadingType>(initialSource.type);
  const [sourceCache, setSourceCache] = useState<Partial<Record<ReadingType, HomepageCoverageSource>>>({
    [initialSource.type]: initialSource,
  });
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<ReadingType | null>(null);
  const [errorType, setErrorType] = useState<ReadingType | null>(null);

  const loadingRef = useRef<Set<ReadingType>>(new Set());

  async function ensureSourceLoaded(type: ReadingType) {
    if (sourceCache[type]) return;
    if (loadingRef.current.has(type)) return; // Already in flight

    loadingRef.current.add(type);
    setLoadingType(type);
    setErrorType((current) => current === type ? null : current);
    try {
      const response = await fetch(`${baseUrl}/home-coverage/${type}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${type}`);
      }
      const source = await response.json() as HomepageCoverageSource;
      setSourceCache((current) => ({
        ...current,
        [type]: source,
      }));
      setErrorType((current) => current === type ? null : current);
    } catch {
      setErrorType(type);
    } finally {
      loadingRef.current.delete(type);
      setLoadingType((current) => (current === type ? null : current));
    }
  }

  useEffect(() => {
    const preferred = getReadingPreference();
    setSelectedType(preferred);
    void ensureSourceLoaded(preferred);
    setSelectedLayer(getCoverageLayerPreference());

    // Preload other reading types in the background so switching is instant
    const preload = () => {
      SOURCE_ORDER.forEach((type) => {
        if (type !== preferred) void ensureSourceLoaded(type);
      });
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(preload);
    } else {
      setTimeout(preload, 1000);
    }

    const unsubType = subscribeReadingPreference((type) => {
      setSelectedType(type);
      void ensureSourceLoaded(type);
    });

    const unsubLayer = subscribeCoverageLayerPreference((layer) => {
      setSelectedLayer(layer);
    });

    return () => {
      unsubType();
      unsubLayer();
    };
  }, []);

  const source = sourceCache[selectedType] ?? null;

  // Defer heavy computation by one frame so the tab switch paints instantly
  const [deferredSource, setDeferredSource] = useState(source);
  useEffect(() => {
    if (source === deferredSource) return;
    const id = requestAnimationFrame(() => setDeferredSource(source));
    return () => cancelAnimationFrame(id);
  }, [source]);

  const completedChecklistKeys = useMemo(
    () => completedChecklistKeysFromState(checklistState),
    [checklistState],
  );

  const supportedLayers = deferredSource ? availableLayers(deferredSource) : ['part', 'division', 'section'];
  const snapshots = useMemo(() => {
    if (!deferredSource) return [];
    return supportedLayers.map((layer) =>
      buildLayerCoverageSnapshot(deferredSource.entries, completedChecklistKeys, layer, {
        outlineItemCounts: deferredSource.outlineItemCounts,
      }),
    );
  }, [completedChecklistKeys, deferredSource, supportedLayers]);

  const tabSnapshots = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        layer: snapshot.layer,
        currentlyCoveredCount: snapshot.currentlyCoveredCount,
        totalCoverageCount: snapshot.totalCoverageCount,
      })),
    [snapshots],
  );

  const defaultLayer = useMemo(
    () => selectDefaultCoverageLayer(tabSnapshots),
    [tabSnapshots],
  );

  const activeLayer =
    selectedLayer && supportedLayers.includes(selectedLayer)
      ? selectedLayer
      : selectedLayer === 'subsection' && supportedLayers.includes('section')
        ? 'section'
        : defaultLayer;
  const activeSnapshot = snapshots.find((snapshot) => snapshot.layer === activeLayer) ?? snapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const coverageRingsLatest = useMemo(() => {
    if (!deferredSource) return null;
    return buildCoverageRings(deferredSource.entries, checklistState, {
      outlineItemCounts: deferredSource.outlineItemCounts,
      totalOutlineItems: deferredSource.totalOutlineItems,
      includeSubsections: deferredSource.includeSubsections,
    });
  }, [checklistState, deferredSource]);
  const partSegmentsLatest = useMemo(() => {
    if (!deferredSource || !partsMeta) return null;
    return buildPartCoverageSegments(deferredSource.entries, checklistState, activeLayer, partsMeta);
  }, [checklistState, deferredSource, activeLayer, partsMeta]);

  // Keep showing previous data while a new source loads to avoid ring flash
  const prevRingsRef = useRef(coverageRingsLatest ?? []);
  const prevSegmentsRef = useRef(partSegmentsLatest ?? []);
  if (coverageRingsLatest) prevRingsRef.current = coverageRingsLatest;
  if (partSegmentsLatest) prevSegmentsRef.current = partSegmentsLatest;
  const coverageRings = coverageRingsLatest ?? prevRingsRef.current;
  const partSegments = partSegmentsLatest ?? prevSegmentsRef.current;

  const completedCount = source ? countCompletedEntries(source.entries, checklistState) : 0;
  const wrapperClass = framed
    ? 'rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7'
    : undefined;
  const topSpacingClass = showHeader ? 'mt-4' : '';

  return (
    <section class={wrapperClass}>
      {showHeader ? (
        <div class="space-y-3 border-b border-slate-200 pb-4">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-3xl space-y-2">
              <p class="text-sm font-sans font-semibold uppercase tracking-[0.2em] text-slate-500">
                Whole Outline
              </p>
              <h2 class="text-3xl font-serif font-bold text-slate-900">
                Coverage-First Reading Paths
              </h2>
            </div>

            <div class="space-y-1.5 lg:max-w-xl">
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500 lg:text-right">
                Reading Type
              </p>
              <div class="flex flex-wrap gap-2 lg:justify-end">
                {SOURCE_ORDER.map((type) => {
                  const isActive = type === selectedType;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setSelectedType(type);
                        setReadingPreference(type);
                        if (errorType === type) {
                          setErrorType(null);
                          loadingRef.current.delete(type);
                        }
                        void ensureSourceLoaded(type);
                      }}
                      class={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {READING_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorType === selectedType ? (
        <div class={`${topSpacingClass} rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700`}>
          Could not load the {READING_TYPE_LABELS[selectedType]} coverage data right now.
        </div>
      ) : null}

      {!source && loadingType === selectedType ? (
        <div class={`${topSpacingClass} rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600`}>
          Loading the {READING_TYPE_LABELS[selectedType]} coverage path...
        </div>
      ) : source ? (
        <div class={`${topSpacingClass} space-y-4`}>
          {!showHeader ? (
            <section class="space-y-2">
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
                Reading Type
              </p>
              <div class="flex flex-wrap gap-2">
                {SOURCE_ORDER.map((type) => {
                  const isActive = type === selectedType;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setSelectedType(type);
                        setReadingPreference(type);
                        if (errorType === type) {
                          setErrorType(null);
                          loadingRef.current.delete(type);
                        }
                        void ensureSourceLoaded(type);
                      }}
                      class={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {READING_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section class="space-y-2">
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
              Outline Layer
            </p>
            <div class="flex flex-wrap gap-2" role="tablist" aria-label="Coverage layer">
              {ALL_LAYERS.map((layer) => {
                const isActive = layer === activeLayer;
                const isSupported = supportedLayers.includes(layer);
                const meta = COVERAGE_LAYER_META[layer];
                const snapshot = tabSnapshots.find(s => s.layer === layer);

                return (
                  <button
                    key={layer}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    disabled={!isSupported}
                    onClick={() => {
                      if (!isSupported) return;
                      setSelectedLayer(layer);
                      setCoverageLayerPreference(layer);
                    }}
                    class={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      !isSupported
                        ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-default'
                        : isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <span class="font-medium">{meta.label}</span>
                    {snapshot && (
                      <span class={`ml-2 text-xs ${!isSupported ? 'text-slate-300' : isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                        {snapshot.currentlyCoveredCount}/{snapshot.totalCoverageCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <div class="space-y-3">
            <section class="grid gap-3 lg:grid-cols-2">
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Your Coverage</p>
                <div class="flex items-center justify-evenly">
                  <CoverageRings
                    rings={coverageRings}
                    size={100}
                    ringWidth={8}
                    hideLegend
                    activeRingLabel={coverageLayerLabel(activeLayer, 2)}
                    onSelectRing={(label) => {
                      const layer = LAYER_BY_RING_LABEL[label];
                      if (layer && supportedLayers.includes(layer)) {
                        setSelectedLayer(layer);
                        setCoverageLayerPreference(layer);
                      }
                    }}
                  />
                  {partSegments.length > 0 && (
                    <PartCoverageRing segments={partSegments} size={100} />
                  )}
                </div>
                <details class="mt-3 group/stats">
                  <summary class="cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-500 transition-colors flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
                    <span>Coverage Statistics</span>
                    <svg
                      class="h-3 w-3 transition-transform group-open/stats:rotate-180"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width={2}
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div class={`mt-2 grid gap-3 ${partSegments.length > 0 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <div class="space-y-1 text-xs text-slate-500">
                      {coverageRings.map((ring) => (
                        <div
                          key={ring.label}
                          class={`flex items-center gap-1.5 ${
                            ring.label === coverageLayerLabel(activeLayer, 2)
                              ? 'font-medium text-slate-700'
                              : ''
                          }`}
                        >
                          <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ring.color }} />
                          <span>{ring.label}: {ring.count}/{ring.total}</span>
                        </div>
                      ))}
                    </div>
                    {partSegments.length > 0 && (() => {
                      const sorted = [...partSegments].sort((a, b) => b.fraction - a.fraction || b.depthScore - a.depthScore);
                      const top = sorted.filter(s => s.fraction > 0).slice(0, 3);
                      const incomplete = sorted.filter(s => s.fraction < 1).reverse().slice(0, 3);
                      const allComplete = sorted.every(s => s.fraction >= 1);
                      const layerLabel = coverageLayerLabel(activeLayer, 2);
                      return (
                        <div class="space-y-1 text-xs text-slate-500">
                          {top.length > 0 ? (
                            <>
                              <p class="font-medium text-slate-600">Most covered</p>
                              {top.map(s => (
                                <div key={s.partNumber} class="flex items-center gap-1.5">
                                  <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                                  <span>{s.title}: {s.covered}/{s.total} {layerLabel}</span>
                                </div>
                              ))}
                            </>
                          ) : (
                            <p class="text-slate-400">No {layerLabel} covered yet.</p>
                          )}
                          {allComplete ? (
                            <p class="pt-1 text-slate-400">All {layerLabel} covered.</p>
                          ) : incomplete.length > 0 && top.length > 0 && (
                            <>
                              <p class="pt-1 font-medium text-slate-600">Least covered</p>
                              {incomplete.map(s => (
                                <div key={s.partNumber} class="flex items-center gap-1.5">
                                  <span class="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colorHex }} />
                                  <span>{s.title}: {s.covered}/{s.total} {layerLabel}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </details>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="text-sm font-medium uppercase tracking-wide text-slate-500">
                  {coverageLayerLabel(activeLayer, 1)} Coverage
                </p>
                <p class="mt-2 font-serif text-3xl text-slate-900">
                  {activeSnapshot?.currentlyCoveredCount ?? 0} / {activeSnapshot?.totalCoverageCount ?? 0}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-600">
                  {isLayerComplete
                    ? `You have already covered every mapped ${coverageLayerLabel(activeLayer, 1)} in this view.`
                    : `${activeSnapshot?.remainingCoverageCount ?? 0} ${coverageLayerLabel(activeLayer, activeSnapshot?.remainingCoverageCount ?? 0)} still to reach.`}
                </p>
              </div>

            </section>

            <ReadingSpreadPath
              isOpen={spreadPathOpen}
              onToggleOpen={() => setSpreadPathOpen((current) => !current)}
              steps={activePath}
              remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
              checklistState={checklistState}
              onCheckedChange={writeChecklistState}
              getHref={(step) => step.href}
              renderMeta={(step) =>
                step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null
              }
              checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
              itemSingular={source.itemSingular}
              itemPlural={source.itemPlural}
              coverageUnitSingular={coverageLayerLabel(activeLayer, 1)}
              coverageUnitPlural={coverageLayerLabel(activeLayer, 2)}
              emptyMessage={emptyRecommendationMessage(source, activeLayer, isLayerComplete)}
              baseUrl={baseUrl}
              sectionLinksVariant="chips"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
