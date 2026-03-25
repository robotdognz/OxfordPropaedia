import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { writeChecklistState } from '../../utils/readingChecklist';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  getReadingPreference,
  READING_TYPE_LABELS,
  setReadingPreference,
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
  const label = coverageLayerLabel(layer, 2, { lowercase: true });
  if (isComplete) {
    return `You have already covered every mapped ${label} in this view.`;
  }

  return `No unread ${source.itemSingular} adds any further ${label} right now.`;
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
  const [selectedLayers, setSelectedLayers] = useState<Partial<Record<ReadingType, CoverageLayer>>>({});
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<ReadingType | null>(null);
  const [errorType, setErrorType] = useState<ReadingType | null>(null);

  async function ensureSourceLoaded(type: ReadingType) {
    if (sourceCache[type]) return;

    setLoadingType(type);
    setErrorType(null);
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
    } catch {
      setErrorType(type);
    } finally {
      setLoadingType((current) => (current === type ? null : current));
    }
  }

  useEffect(() => {
    const preferred = getReadingPreference();
    setSelectedType(preferred);
    void ensureSourceLoaded(preferred);

    return subscribeReadingPreference((type) => {
      setSelectedType(type);
      void ensureSourceLoaded(type);
    });
  }, []);

  const source = sourceCache[selectedType];
  const completedChecklistKeys = useMemo(
    () => completedChecklistKeysFromState(checklistState),
    [checklistState],
  );

  const supportedLayers = source ? availableLayers(source) : ['part', 'division', 'section'];
  const snapshots = useMemo(() => {
    if (!source) return [];
    return supportedLayers.map((layer) =>
      buildLayerCoverageSnapshot(source.entries, completedChecklistKeys, layer, {
        outlineItemCounts: source.outlineItemCounts,
      }),
    );
  }, [completedChecklistKeys, source, supportedLayers]);

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

  const explicitLayer = source ? selectedLayers[selectedType] : null;
  const activeLayer =
    source && explicitLayer && supportedLayers.includes(explicitLayer)
      ? explicitLayer
      : defaultLayer;
  const activeSnapshot = snapshots.find((snapshot) => snapshot.layer === activeLayer) ?? snapshots[0];
  const activePath = activeSnapshot
    ? activeSnapshot.path.map(({ entry, ...rest }) => ({
        ...entry,
        ...rest,
      }))
    : [];
  const bestNext = activePath[0] ?? null;
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const coverageRings = useMemo(() => {
    if (!source) return [];
    return buildCoverageRings(source.entries, checklistState, {
      outlineItemCounts: source.outlineItemCounts,
      totalOutlineItems: source.totalOutlineItems,
      includeSubsections: source.includeSubsections,
    });
  }, [checklistState, source]);
  const partSegments = useMemo(() => {
    if (!source || !partsMeta) return [];
    return buildPartCoverageSegments(source.entries, checklistState, activeLayer, partsMeta);
  }, [checklistState, source, activeLayer, partsMeta]);
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
              {tabSnapshots.map((snapshot) => {
                const isActive = snapshot.layer === activeLayer;
                const meta = COVERAGE_LAYER_META[snapshot.layer];

                return (
                  <button
                    key={snapshot.layer}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setSelectedLayers((current) => ({
                        ...current,
                        [selectedType]: snapshot.layer,
                      }));
                    }}
                    class={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <span class="font-medium">{meta.label}</span>
                    <span class={`ml-2 text-xs ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                      {snapshot.currentlyCoveredCount}/{snapshot.totalCoverageCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div class="space-y-4">
            <section class="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)]">
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="flex items-center gap-4">
                  <div class="shrink-0">
                    <CoverageRings
                      rings={coverageRings}
                      size={100}
                      ringWidth={8}
                      hideLegend
                      activeRingLabel={coverageLayerLabel(activeLayer, 2)}
                      onSelectRing={(label) => {
                        const layer = LAYER_BY_RING_LABEL[label];
                        if (layer && supportedLayers.includes(layer)) {
                          setSelectedLayers((current) => ({
                            ...current,
                            [selectedType]: layer,
                          }));
                        }
                      }}
                    />
                  </div>
                  {partSegments.length > 0 && (
                    <div class="shrink-0 hidden sm:block">
                      <PartCoverageRing segments={partSegments} size={100} />
                    </div>
                  )}
                  <div class="min-w-0 space-y-2">
                    <p class="text-sm font-medium uppercase tracking-wide text-slate-500">Your Coverage</p>
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
                    <p class="text-sm text-slate-600">
                      {completedCount} of {source.entries.length} {source.totalLabel.toLowerCase()} checked off.
                    </p>
                  </div>
                </div>
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
                    ? `You have already covered every mapped ${coverageLayerLabel(activeLayer, 2, { lowercase: true })} in this view.`
                    : `${activeSnapshot?.remainingCoverageCount ?? 0} ${coverageLayerLabel(activeLayer, activeSnapshot?.remainingCoverageCount ?? 0, { lowercase: true })} still to reach.`}
                </p>
              </div>

              <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <p class="text-sm font-medium uppercase tracking-wide text-amber-800">
                  Best Next for {coverageLayerLabel(activeLayer, 1)} Coverage
                </p>
                {bestNext ? (
                  <>
                    <a
                      href={bestNext.href}
                      class="mt-2 block font-serif text-2xl leading-tight text-amber-950 transition-colors hover:text-indigo-700"
                    >
                      {bestNext.title}
                    </a>
                    {bestNext.meta ? <p class="mt-1 text-sm text-amber-900">{bestNext.meta}</p> : null}
                    <p class="mt-3 text-sm leading-6 text-amber-900">
                      Adds {bestNext.newCoverageCount} new {coverageLayerLabel(activeLayer, bestNext.newCoverageCount, { lowercase: true })} and touches {bestNext.sectionCount} linked Sections.
                    </p>
                  </>
                ) : (
                  <p class="mt-2 text-sm text-amber-900">
                    {emptyRecommendationMessage(source, activeLayer, isLayerComplete)}
                  </p>
                )}
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
