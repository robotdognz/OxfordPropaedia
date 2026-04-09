import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import { writeChecklistState } from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import { fetchHomepageCoverageSource } from '../../utils/homepageCoverageSource';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  getCoverageLayerPreference,
  getReadingPoolScopePreference,
  getReadingPreference,
  READING_TYPE_LABELS,
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  setCoverageLayerPreference,
  setReadingPoolScopePreference,
  setReadingPreference,
  subscribeCoverageLayerPreference,
  subscribeReadingPoolScopePreference,
  subscribeReadingPreference,
  type ReadingPoolScope,
  type ReadingType,
} from '../../utils/readingPreference';
import {
  COVERAGE_LAYER_META,
  buildCoverageRings,
  buildLayerCoverageSnapshot,
  buildLayerCoverageSnapshotWithReferenceEntries,
  buildPartCoverageSegments,
  type CoverageRing,
  completedChecklistKeysFromState,
  coverageLayerLabel,
  type PartCoverageSegment,
  selectDefaultCoverageLayer,
  type CoverageLayer,
} from '../../utils/readingLibrary';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';
import {
  estimateReadingMinutes,
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';
import { filterWikipediaLevel } from '../../utils/wikipediaLevel';
import { formatEditionLabel } from '../../utils/readingData';
import ReadingSpreadPath from './ReadingSpreadPath';
import CoverageRings from '../ui/CoverageRings';
import PartCoverageRing from '../ui/PartCoverageRing';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import CoverageStatisticsDetails from './CoverageStatisticsDetails';
import {
  BRITANNICA_TIME_UNAVAILABLE_MESSAGE,
  default as CompletedTimeStatistics,
} from './CompletedTimeStatistics';

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

function emptyRecommendationMessage(
  source: HomepageCoverageSource,
  layer: CoverageLayer,
  isComplete: boolean,
  scope: ReadingPoolScope,
  shelvedCount: number,
): string {
  if (scope === 'shelved' && shelvedCount === 0) {
    return `Nothing in My Shelf is available in this ${READING_TYPE_LABELS[source.type]} view yet. Add readings to My Shelf to rank them here.`;
  }

  if (isComplete) {
    return scope === 'shelved'
      ? `You have already covered every mapped ${coverageLayerLabel(layer, 1)} reachable from the readings in My Shelf.`
      : `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this view.`;
  }

  if (scope === 'shelved') {
    return `No unread ${source.itemSingular} in My Shelf adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
  }

  return `No unread ${source.itemSingular} adds any further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function formatHomepageEntryMeta(
  type: ReadingType,
  entry: HomepageCoverageSource['entries'][number],
  readingSpeedWpm: number,
): string | undefined {
  switch (type) {
    case 'vsi':
      return [
        entry.author,
        formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
        formatEditionLabel(entry.edition),
        entry.publicationYear ? String(entry.publicationYear) : null,
      ].filter(Boolean).join(' · ') || undefined;
    case 'wikipedia':
      return [
        entry.category,
        formatEstimatedReadingTime(entry.wordCount, readingSpeedWpm),
      ].filter(Boolean).join(' · ') || undefined;
    case 'iot':
      return formatIotEpisodeMeta(entry) || undefined;
    case 'macropaedia':
    default:
      return undefined;
  }
}

function estimateHomepageEntryMinutes(
  type: ReadingType,
  entry: HomepageCoverageSource['entries'][number],
  readingSpeedWpm: number,
): number | undefined {
  if (type === 'iot') {
    return entry.durationSeconds && entry.durationSeconds > 0
      ? entry.durationSeconds / 60
      : undefined;
  }

  return estimateReadingMinutes(entry.wordCount, readingSpeedWpm);
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
  const readingSpeedWpm = useReadingSpeedState();
  const checklistState = useReadingChecklistState();
  const shelfState = useReadingShelfState();
  const wikiLevel = useWikipediaLevel();
  const [selectedType, setSelectedType] = useState<ReadingType>('vsi');
  const [sourceCache, setSourceCache] = useState<Partial<Record<ReadingType, HomepageCoverageSource>>>({});
  const [selectedLayer, setSelectedLayer] = useState<CoverageLayer | null>(null);
  const [selectedScope, setSelectedScope] = useState<ReadingPoolScope>('all');
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
    setSelectedScope(getReadingPoolScopePreference());
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

    const unsubScope = subscribeReadingPoolScopePreference((scope) => {
      setSelectedScope(scope);
    });

    return () => {
      unsubType();
      unsubLayer();
      unsubScope();
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

  const shelvedEntries = useMemo(
    () => filteredSource?.entries.filter((entry) => Boolean(shelfState[entry.checklistKey])) ?? [],
    [filteredSource, shelfState],
  );

  const supportedLayers = useMemo(
    () => (filteredSource ? availableLayers(filteredSource) : DEFAULT_SUPPORTED_LAYERS),
    [filteredSource?.includeSubsections],
  );

  const snapshots = useMemo(() => {
    if (!filteredSource) return [];
    if (selectedScope === 'shelved') {
      return supportedLayers.map((layer) =>
        buildLayerCoverageSnapshotWithReferenceEntries(
          shelvedEntries,
          filteredSource.entries,
          completedChecklistKeys,
          layer,
        ),
      );
    }
    return supportedLayers.map((layer) =>
      buildLayerCoverageSnapshot(filteredSource.entries, completedChecklistKeys, layer),
    );
  }, [completedChecklistKeys, filteredSource, selectedScope, shelvedEntries, supportedLayers]);

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
  const scopeOptions = [
    {
      value: 'all' as const,
      label: 'All',
      meta: filteredSource ? String(filteredSource.entries.length) : undefined,
    },
    {
      value: 'shelved' as const,
      label: 'My Shelf',
      meta: filteredSource ? String(shelvedEntries.length) : undefined,
    },
  ];

  const completedViewStatistics = useMemo(() => {
    if (!filteredSource) return null;

    if (filteredSource.type === 'macropaedia') {
      return <CompletedTimeStatistics
        entries={filteredSource.entries}
        checklistState={checklistState}
        sourceLabel={READING_TYPE_LABELS[filteredSource.type]}
        unsupportedMessage={BRITANNICA_TIME_UNAVAILABLE_MESSAGE}
      />;
    }

    return (
      <CompletedTimeStatistics
        entries={filteredSource.entries}
        checklistState={checklistState}
        sourceLabel={READING_TYPE_LABELS[filteredSource.type]}
        readingSpeedWpm={readingSpeedWpm}
      />
    );
  }, [checklistState, filteredSource, readingSpeedWpm]);

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
      scopeValue={selectedScope}
      scopeOptions={scopeOptions}
      onScopeChange={(scope) => {
        setSelectedScope(scope);
        setReadingPoolScopePreference(scope);
      }}
      scopeAriaLabel="Whole outline recommendation scope"
      showWikipediaLevelSelector
    />
  );

  return (
    <section class={wrapperClass}>
      {showHeader ? (
        <div class="space-y-3 border-b border-slate-200 pb-4">
          <div class="max-w-3xl space-y-2">
            <p class="text-sm font-sans font-semibold uppercase tracking-[0.2em] text-slate-500">
              Global
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
                <CoverageStatisticsDetails
                  coverageRings={coverageRings}
                  activeRingLabel={displayActiveRingLabel}
                  partSegments={partSegments}
                  activeLayerLabel={displayActiveRingLabel}
                  preface={completedViewStatistics}
                />
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
              shelfState={shelfState}
              onCheckedChange={writeChecklistState}
              onShelvedChange={writeShelfState}
              getHref={(step) => step.href}
              renderMeta={(step) => {
                const meta = formatHomepageEntryMeta(filteredSource.type, step, readingSpeedWpm);
                return meta ? <p class="mt-1 text-sm text-gray-600">{meta}</p> : null;
              }}
              checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
              shelfAriaLabel={(step) => `Add ${step.title} to My Shelf`}
              itemSingular={filteredSource.itemSingular}
              itemPlural={filteredSource.itemPlural}
              coverageLayer={activeLayer}
              coverageUnitSingular={coverageLayerLabel(activeLayer, 1)}
              coverageUnitPlural={coverageLayerLabel(activeLayer, 2)}
              getEstimatedMinutes={(step) => estimateHomepageEntryMinutes(filteredSource.type, step, readingSpeedWpm)}
              estimatedTimeApproximate={filteredSource.type !== 'iot'}
              emptyMessage={emptyRecommendationMessage(
                filteredSource,
                activeLayer,
                isLayerComplete,
                selectedScope,
                shelvedEntries.length,
              )}
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
