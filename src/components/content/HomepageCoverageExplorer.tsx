import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import { writeChecklistState } from '../../utils/readingChecklist';
import { fetchHomepageCoverageSource } from '../../utils/homepageCoverageSource';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  getCoverageLayerPreference,
  getReadingPreference,
  READING_TYPE_LABELS,
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
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
  type CoverageRing,
  completedChecklistKeysFromState,
  coverageLayerLabel,
  type PartCoverageSegment,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import { filterWikipediaLevel } from '../../utils/wikipediaLevel';
import ReadingSpreadPath from './ReadingSpreadPath';
import CoverageRings from '../ui/CoverageRings';
import PartCoverageRing from '../ui/PartCoverageRing';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';

interface PartMeta {
  partNumber: number;
  colorHex: string;
  title: string;
}

interface HomepageCoverageExplorerProps {
  baseUrl: string;
  partsMeta?: PartMeta[];
  showHeader?: boolean;
  framed?: boolean;
}

const ALL_LAYERS: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];
const DEFAULT_SUPPORTED_LAYERS: CoverageLayer[] = ['part', 'division', 'section'];
const SPREAD_PATH_STORAGE_KEY = 'propaedia-homepage-coverage-spread-open';
const LAYER_BY_RING_LABEL: Record<string, CoverageLayer> = {
  Parts: 'part',
  Divisions: 'division',
  Sections: 'section',
  Subsections: 'subsection',
};
const LAYER_ACCENT_COLORS: Record<CoverageLayer, string> = {
  part: '#6366f1',
  division: '#8b5cf6',
  section: '#a78bfa',
  subsection: '#c4b5fd',
};

interface StagedCoverageDisplay {
  sourceKey: ReadingType | null;
  rings: CoverageRing[];
  partSegments: PartCoverageSegment[];
  activeRingLabel: string;
}

function availableLayers(source: HomepageCoverageSource): CoverageLayer[] {
  return source.includeSubsections ? ALL_LAYERS : ALL_LAYERS.filter((layer) => layer !== 'subsection');
}

function emptyRecommendationMessage(source: HomepageCoverageSource, layer: CoverageLayer, isComplete: boolean): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this view.`;
  }

  return `No unread ${source.itemSingular} adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function useStagedCoverageDisplay(
  sourceKey: ReadingType | null,
  rings: CoverageRing[],
  partSegments: PartCoverageSegment[],
  activeRingLabel: string,
): Omit<StagedCoverageDisplay, 'sourceKey'> {
  const latestRef = useRef<StagedCoverageDisplay>({
    sourceKey,
    rings,
    partSegments,
    activeRingLabel,
  });
  const [display, setDisplay] = useState<StagedCoverageDisplay>(latestRef.current);
  const previousSourceKeyRef = useRef(sourceKey);
  const deferSourceSwitchRef = useRef(false);

  latestRef.current = {
    sourceKey,
    rings,
    partSegments,
    activeRingLabel,
  };

  if (previousSourceKeyRef.current !== sourceKey) {
    previousSourceKeyRef.current = sourceKey;
    deferSourceSwitchRef.current = true;
  }

  useEffect(() => {
    if (deferSourceSwitchRef.current) {
      let innerFrame = 0;
      const outerFrame = requestAnimationFrame(() => {
        innerFrame = requestAnimationFrame(() => {
          deferSourceSwitchRef.current = false;
          setDisplay(latestRef.current);
        });
      });

      return () => {
        cancelAnimationFrame(outerFrame);
        if (innerFrame) cancelAnimationFrame(innerFrame);
      };
    }

    setDisplay(latestRef.current);
  }, [activeRingLabel, partSegments, rings, sourceKey]);

  return deferSourceSwitchRef.current
    ? {
        rings: display.rings,
        partSegments: display.partSegments,
        activeRingLabel: display.activeRingLabel,
      }
    : {
        rings,
        partSegments,
        activeRingLabel,
      };
}

export default function HomepageCoverageExplorer({
  baseUrl,
  partsMeta,
  showHeader = true,
  framed = true,
}: HomepageCoverageExplorerProps) {
  const checklistState = useReadingChecklistState();
  const wikiLevel = useWikipediaLevel();
  const [selectedType, setSelectedType] = useState<ReadingType>('vsi');
  const [sourceCache, setSourceCache] = useState<Partial<Record<ReadingType, HomepageCoverageSource>>>({});
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<ReadingType | null>('vsi');
  const [errorType, setErrorType] = useState<ReadingType | null>(null);

  const loadingRef = useRef<Set<ReadingType>>(new Set());
  const sourceCacheRef = useRef(sourceCache);

  sourceCacheRef.current = sourceCache;

  async function ensureSourceLoaded(type: ReadingType) {
    if (sourceCacheRef.current[type]) return;
    if (loadingRef.current.has(type)) return; // Already in flight

    loadingRef.current.add(type);
    setLoadingType(type);
    setErrorType((current) => current === type ? null : current);
    try {
      const source = await fetchHomepageCoverageSource(type, baseUrl);
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
    try {
      setSpreadPathOpen(window.localStorage.getItem(SPREAD_PATH_STORAGE_KEY) === '1');
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }

    // Preload other reading types in the background so switching is instant
    const preload = () => {
      READING_TYPE_ORDER.forEach((type) => {
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(SPREAD_PATH_STORAGE_KEY, spreadPathOpen ? '1' : '0');
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }
  }, [spreadPathOpen]);

  const source = sourceCache[selectedType] ?? null;
  const filteredSource = useMemo(() => {
    if (!source) return null;
    if (source.type !== 'wikipedia') return source;
    return {
      ...source,
      entries: filterWikipediaLevel(source.entries, wikiLevel),
    };
  }, [source, wikiLevel]);

  const completedChecklistKeys = useMemo(
    () => completedChecklistKeysFromState(checklistState),
    [checklistState],
  );

  const supportedLayers = useMemo(
    () => (filteredSource ? availableLayers(filteredSource) : DEFAULT_SUPPORTED_LAYERS),
    [filteredSource?.includeSubsections],
  );

  // All computations run eagerly against the active source (including expensive spread paths)
  const snapshots = useMemo(() => {
    if (!filteredSource) return [];
    return supportedLayers.map((layer) =>
      buildLayerCoverageSnapshot(filteredSource.entries, completedChecklistKeys, layer),
    );
  }, [completedChecklistKeys, filteredSource, supportedLayers]);

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
  const activeRingLabel = coverageLayerLabel(activeLayer, 2);
  const coverageRingsLatest = useMemo(() => {
    if (!filteredSource) return [];
    return buildCoverageRings(filteredSource.entries, checklistState, {
      includeSubsections: filteredSource.includeSubsections,
    });
  }, [checklistState, filteredSource]);
  const partSegmentsLatest = useMemo(() => {
    if (!filteredSource || !partsMeta) return [];
    return buildPartCoverageSegments(filteredSource.entries, checklistState, activeLayer, partsMeta);
  }, [checklistState, filteredSource, activeLayer, partsMeta]);
  const {
    rings: coverageRings,
    partSegments,
    activeRingLabel: displayActiveRingLabel,
  } = useStagedCoverageDisplay(
    filteredSource?.type ?? null,
    coverageRingsLatest,
    partSegmentsLatest,
    activeRingLabel,
  );
  const activeCoveragePercent = activeSnapshot && activeSnapshot.totalCoverageCount > 0
    ? Math.round((activeSnapshot.currentlyCoveredCount / activeSnapshot.totalCoverageCount) * 100)
    : 0;

  const wrapperClass = framed
    ? 'rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7'
    : undefined;
  const topSpacingClass = showHeader ? 'mt-4' : '';
  const typeOptions = READING_TYPE_ORDER.map((type) => ({
    value: type,
    eyebrow: READING_TYPE_UI_META[type].eyebrow,
    label: READING_TYPE_UI_META[type].label,
    accentColor: READING_TYPE_UI_META[type].accentColor,
  }));
  const layerOptions = ALL_LAYERS.map((layer) => {
    const snapshot = tabSnapshots.find((candidate) => candidate.layer === layer);

    return {
      value: layer,
      label: COVERAGE_LAYER_META[layer].pluralLabel,
      meta: snapshot ? `${snapshot.currentlyCoveredCount}/${snapshot.totalCoverageCount}` : undefined,
      accentColor: LAYER_ACCENT_COLORS[layer],
      disabled: !supportedLayers.includes(layer),
    };
  });
  const selectType = (type: ReadingType) => {
    setSelectedType(type);
    setReadingPreference(type);
    if (errorType === type) {
      setErrorType(null);
      loadingRef.current.delete(type);
    }
    void ensureSourceLoaded(type);
  };
  const selectLayer = (layer: CoverageLayer) => {
    if (!supportedLayers.includes(layer)) return;
    setSelectedLayer(layer);
    setCoverageLayerPreference(layer);
  };
  const selectionStrip = (
    <ReadingSelectionStrip
      readingTypeValue={selectedType}
      readingTypeOptions={typeOptions}
      onReadingTypeChange={selectType}
      readingTypeAriaLabel="Whole outline reading type"
      coverageLayerValue={activeLayer}
      coverageLayerOptions={layerOptions}
      onCoverageLayerChange={selectLayer}
      coverageLayerAriaLabel="Whole outline coverage layer"
      showWikipediaLevelSelector
    />
  );

  return (
    <section class={wrapperClass}>
      {showHeader ? (
        <div class="space-y-3 border-b border-slate-200 pb-4">
          <div class="max-w-3xl space-y-2">
            <p class="text-sm font-sans font-semibold uppercase tracking-[0.2em] text-slate-500">
              Full Coverage
            </p>
            <h2 class="text-3xl font-serif font-bold text-slate-900">
              Coverage-First Reading Paths
            </h2>
          </div>
        </div>
      ) : null}

      <div class={`${topSpacingClass} space-y-4`}>
        {filteredSource ? (
          <div class="space-y-3">
            <section class="rounded-xl border border-slate-200 bg-white p-4">
              <p class="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Your Coverage</p>
              <div class="flex items-center justify-evenly">
                <CoverageRings
                  rings={coverageRings}
                  size={100}
                  ringWidth={8}
                  hideLegend
                  activeRingLabel={displayActiveRingLabel}
                  onSelectRing={(label) => {
                    const layer = LAYER_BY_RING_LABEL[label];
                    if (layer && supportedLayers.includes(layer)) {
                      setSelectedLayer(layer);
                      setCoverageLayerPreference(layer);
                    }
                  }}
                />
                {partSegments.length > 0 && (
                  <PartCoverageRing segments={partSegments} size={100} centerPercentage={activeCoveragePercent} />
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
                          ring.label === displayActiveRingLabel
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
                    const layerLabel = displayActiveRingLabel;
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
            </section>

            {selectionStrip}

            <ReadingSpreadPath
              isOpen={spreadPathOpen}
              onToggleOpen={() => setSpreadPathOpen((current) => !current)}
              steps={activePath}
              scrollResetKey={`${selectedType}:${activeLayer}`}
              remainingCoverageCount={activeSnapshot?.remainingCoverageCount ?? 0}
              checklistState={checklistState}
              onCheckedChange={writeChecklistState}
              getHref={(step) => step.href}
              renderMeta={(step) =>
                step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null
              }
              checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
              itemSingular={filteredSource.itemSingular}
              itemPlural={filteredSource.itemPlural}
              coverageLayer={activeLayer}
              coverageUnitSingular={coverageLayerLabel(activeLayer, 1)}
              coverageUnitPlural={coverageLayerLabel(activeLayer, 2)}
              emptyMessage={emptyRecommendationMessage(filteredSource, activeLayer, isLayerComplete)}
              baseUrl={baseUrl}
              sectionLinksVariant="chips"
            />
          </div>
        ) : (
          <>
            {selectionStrip}

            {errorType === selectedType ? (
          <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
            Could not load the {READING_TYPE_LABELS[selectedType]} coverage data right now.
          </div>
            ) : null}

            {!source && loadingType === selectedType ? (
              <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Loading the {READING_TYPE_LABELS[selectedType]} coverage path...
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
