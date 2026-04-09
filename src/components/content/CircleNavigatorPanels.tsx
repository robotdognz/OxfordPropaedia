import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useReadingShelfState } from '../../hooks/useReadingShelfState';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import {
  writeChecklistState,
} from '../../utils/readingChecklist';
import { writeShelfState } from '../../utils/readingShelf';
import {
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  setCoverageLayerPreference,
  setReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';
import { divisionUrl, sectionUrl, slugify } from '../../utils/helpers';
import {
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import {
  estimateReadingMinutes,
  formatEstimatedReadingTime,
} from '../../utils/readingSpeed';
import { filterWikipediaLevel } from '../../utils/wikipediaLevel';
import {
  COVERAGE_LAYER_META,
  COVERAGE_LAYER_ORDER,
  buildLayerCoverageSnapshot,
  buildLayerCoverageSnapshotWithReferenceEntries,
  completedChecklistKeysFromState,
  coverageLayerLabel,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';
import ReadingSpreadPath from './ReadingSpreadPath';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import type {
  CircleNavigatorIotEntry,
  CircleNavigatorMacropaediaEntry,
  CircleNavigatorPart,
  CircleNavigatorPartRecommendations,
  CircleNavigatorVsiEntry,
  CircleNavigatorWikipediaEntry,
  ConnectionSummary,
} from './circleNavigatorShared';

interface CenteredCircleNavigatorPanelProps {
  parts: CircleNavigatorPart[];
  centerPart: CircleNavigatorPart;
  centerPartNumber: number;
  topPart: CircleNavigatorPart;
  connectionSummary: ConnectionSummary | null;
  suggestedSections: ConnectionSummary['sections'];
  readingPref: ReadingType;
  activeLayer: CoverageLayer;
  checklistState: Record<string, boolean>;
  baseUrl: string;
  coverageSources: Partial<Record<ReadingType, HomepageCoverageSource>>;
}

interface TopPartCircleNavigatorPanelProps {
  topPart: CircleNavigatorPart;
  topPartNumber: number;
  readingPref: ReadingType;
  activeLayer: CoverageLayer;
  checklistState: Record<string, boolean>;
  baseUrl: string;
  coverageSources: Partial<Record<ReadingType, HomepageCoverageSource>>;
}

type AnchoredEntryBase = {
  title: string;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
  progressSubsectionKeys?: string[];
};

interface AnchoredRecommendationSectionConfig<TEntry extends AnchoredEntryBase> {
  type: ReadingType;
  itemSingular: string;
  totalCount: number;
  supportedLayers: CoverageLayer[];
  layerSnapshots: Partial<Record<CoverageLayer, LayerCoverageSnapshot<TEntry>>>;
  getHref: (item: TEntry) => string;
  getLabel?: (item: TEntry) => string;
  renderMeta?: (item: TEntry) => ComponentChildren;
}

function formatCircleNavigatorVsiMeta(item: CircleNavigatorVsiEntry, readingSpeedWpm: number): string | undefined {
  return [item.author, formatEstimatedReadingTime(item.wordCount, readingSpeedWpm)].filter(Boolean).join(' · ') || undefined;
}

const partRecommendationCache = new Map<number, CircleNavigatorPartRecommendations>();
const PART_RECOMMENDATION_TIMEOUT_MS = 10000;

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function loadPartRecommendations(
  partNumber: number,
  baseUrl: string,
  signal?: AbortSignal
): Promise<CircleNavigatorPartRecommendations> {
  const cached = partRecommendationCache.get(partNumber);
  if (cached) {
    return Promise.resolve(cached);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PART_RECOMMENDATION_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  return fetch(joinBaseUrl(baseUrl, `circle-anchored/${partNumber}.json`), {
    signal: controller.signal,
    cache: 'no-store',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load recommendations for Part ${partNumber}.`);
      }
      return response.json();
    })
    .then((data: CircleNavigatorPartRecommendations) => {
      partRecommendationCache.set(partNumber, data);
      return data;
    })
    .catch((error) => {
      if (timedOut && !signal?.aborted) {
        throw new Error(`Loading recommendations for Part ${partNumber} timed out.`);
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', abortFromCaller);
      }
    });
}

function essayHref(part: CircleNavigatorPart): string {
  return `${part.href}?view=essay#essay`;
}

function intersectSharedEntries<TEntry extends AnchoredEntryBase>(
  first: TEntry[],
  second: TEntry[]
): TEntry[] {
  const secondLookup = new Map(second.map((entry) => [entry.checklistKey, entry]));
  return first.flatMap((entry) => {
    const match = secondLookup.get(entry.checklistKey);
    if (!match) return [];
    return [entry.sectionCount >= match.sectionCount ? entry : match];
  });
}

function supportedLayersForReadingType(type: ReadingType): CoverageLayer[] {
  return type === 'macropaedia'
    ? ['part', 'division', 'section']
    : ['part', 'division', 'section', 'subsection'];
}

function estimateAnchoredEntryMinutes(
  type: ReadingType,
  entry: AnchoredEntryBase,
  readingSpeedWpm: number,
): number | undefined {
  if (type === 'iot' && 'durationSeconds' in entry) {
    return entry.durationSeconds && entry.durationSeconds > 0
      ? entry.durationSeconds / 60
      : undefined;
  }

  if ((type === 'vsi' || type === 'wikipedia') && 'wordCount' in entry) {
    return estimateReadingMinutes(entry.wordCount, readingSpeedWpm);
  }

  return undefined;
}

function buildSpreadPathFromRecommendations<TEntry extends AnchoredEntryBase>(
  activeSection: AnchoredRecommendationSectionConfig<TEntry> | undefined,
  activeLayer: CoverageLayer,
  readingSpeedWpm: number,
) {
  if (!activeSection) {
    return {
      steps: [] as Array<{ title: string; checklistKey: string; sectionCount: number; sections: ReadingSectionSummary[]; newCoverageCount: number; cumulativeCoveredCount: number; newSections: ReadingSectionSummary[]; href: string; meta: ComponentChildren; estimatedMinutes?: number }>,
      remaining: 0,
      resolvedLayer: activeLayer,
    };
  }

  const resolvedLayer = activeSection.supportedLayers.includes(activeLayer)
    ? activeLayer
    : activeSection.supportedLayers[0] ?? activeLayer;
  const snapshot = activeSection.layerSnapshots[resolvedLayer];
  if (!snapshot) {
    return {
      steps: [] as Array<{ title: string; checklistKey: string; sectionCount: number; sections: ReadingSectionSummary[]; newCoverageCount: number; cumulativeCoveredCount: number; newSections: ReadingSectionSummary[]; href: string; meta: ComponentChildren; estimatedMinutes?: number }>,
      remaining: 0,
      resolvedLayer,
    };
  }

  const steps = snapshot.path.map((step) => ({
    title: activeSection.getLabel ? activeSection.getLabel(step.entry) : step.entry.title,
    checklistKey: step.entry.checklistKey,
    sectionCount: step.entry.sectionCount,
    sections: step.entry.sections,
    newCoverageCount: step.newCoverageCount,
    cumulativeCoveredCount: step.cumulativeCoveredCount,
    newSections: step.newSections,
    href: activeSection.getHref(step.entry),
    meta: activeSection.renderMeta ? activeSection.renderMeta(step.entry) : undefined,
    estimatedMinutes: estimateAnchoredEntryMinutes(activeSection.type, step.entry, readingSpeedWpm),
  }));

  return { steps, remaining: snapshot.remainingCoverageCount, resolvedLayer };
}

function buildRecommendationSectionConfig<TEntry extends AnchoredEntryBase>(config: {
  type: ReadingType;
  itemSingular: string;
  entries: TEntry[];
  completedChecklistKeys: Set<string>;
  coverageEntries?: HomepageCoverageSource['entries'];
  getHref: (item: TEntry) => string;
  getLabel?: (item: TEntry) => string;
  renderMeta?: (item: TEntry) => ComponentChildren;
  allowEmpty?: boolean;
}): AnchoredRecommendationSectionConfig<TEntry> | null {
  if (config.entries.length === 0 && !config.allowEmpty) return null;

  const supportedLayers = supportedLayersForReadingType(config.type);
  const layerSnapshots: Partial<Record<CoverageLayer, LayerCoverageSnapshot<TEntry>>> = {};
  supportedLayers.forEach((layer) => {
    layerSnapshots[layer] = config.coverageEntries
      ? buildLayerCoverageSnapshotWithReferenceEntries(
          config.entries,
          config.coverageEntries,
          config.completedChecklistKeys,
          layer,
        )
      : buildLayerCoverageSnapshot(
          config.entries,
          config.completedChecklistKeys,
          layer,
        );
  });

  return {
    type: config.type,
    itemSingular: config.itemSingular,
    totalCount: config.entries.length,
    supportedLayers,
    layerSnapshots,
    getHref: config.getHref,
    getLabel: config.getLabel,
    renderMeta: config.renderMeta,
  };
}

function selectionConstraintMessage(
  layer: CoverageLayer,
  totalCoverageCount: number,
  reachableCoverageCount: number,
): string | null {
  const constrainedCount = Math.max(0, totalCoverageCount - reachableCoverageCount);
  if (constrainedCount <= 0) return null;

  const constrainedLabel = coverageLayerLabel(layer, constrainedCount);
  const constrainedVerb = constrainedCount === 1 ? 'lies' : 'lie';

  return `This path can take you to ${reachableCoverageCount}/${totalCoverageCount} ${coverageLayerLabel(layer, totalCoverageCount)}. The remaining ${constrainedCount} ${constrainedLabel} ${constrainedVerb} outside the current selection.`;
}

function emptyRecommendationMessage(
  layer: CoverageLayer,
  isComplete: boolean,
  remainingCoverageCount: number,
): string {
  if (isComplete) {
    return `You have already covered every mapped ${coverageLayerLabel(layer, 1)} in this view.`;
  }

  if (remainingCoverageCount > 0) {
    return `No readings in this selection add new ${coverageLayerLabel(layer, 1)} coverage. ${remainingCoverageCount} ${coverageLayerLabel(layer, remainingCoverageCount)} ${remainingCoverageCount === 1 ? 'remains' : 'remain'} outside the current selection.`;
  }

  return `No readings in this selection add further ${coverageLayerLabel(layer, 1)} coverage right now.`;
}

function resolveRecommendationSelection<TEntry extends AnchoredEntryBase>(
  recommendationSections: AnchoredRecommendationSectionConfig<TEntry>[],
  readingPref: ReadingType,
  activeLayer: CoverageLayer,
) {
  const availableTypes = new Set(recommendationSections.map((section) => section.type));
  const activeRecommendation = recommendationSections.find((section) => section.type === readingPref)
    ?? recommendationSections[0];
  const effectiveReadingType = activeRecommendation?.type ?? readingPref;
  const supportedLayers = activeRecommendation?.supportedLayers ?? supportedLayersForReadingType(effectiveReadingType);
  const effectiveLayer = supportedLayers.includes(activeLayer)
    ? activeLayer
    : activeLayer === 'subsection' && supportedLayers.includes('section')
      ? 'section'
      : supportedLayers[0] ?? activeLayer;
  const coverageLayerMeta = new Map<CoverageLayer, string>();

  if (activeRecommendation) {
    supportedLayers.forEach((layer) => {
      const snapshot = activeRecommendation.layerSnapshots[layer];
      if (!snapshot) return;
      coverageLayerMeta.set(layer, `${snapshot.currentlyCoveredCount}/${snapshot.totalCoverageCount}`);
    });
  }

  return {
    activeRecommendation,
    availableTypes,
    effectiveReadingType,
    effectiveLayer,
    coverageLayerMeta,
  };
}

function renderSelectionControls<TEntry extends AnchoredEntryBase>(
  recommendationSections: AnchoredRecommendationSectionConfig<TEntry>[],
  readingPref: ReadingType,
  activeLayer: CoverageLayer,
  isLoading = false,
): ComponentChildren {
  const {
    activeRecommendation,
    availableTypes,
    effectiveReadingType,
    effectiveLayer,
    coverageLayerMeta,
  } = resolveRecommendationSelection(recommendationSections, readingPref, activeLayer);

  return (
    <ReadingSelectionStrip
      readingTypeValue={effectiveReadingType}
      readingTypeOptions={READING_TYPE_ORDER.map((type) => ({
        value: type,
        eyebrow: READING_TYPE_UI_META[type].eyebrow,
        label: READING_TYPE_UI_META[type].label,
        disabled: isLoading || (recommendationSections.length > 0 ? !availableTypes.has(type) : false),
      }))}
      onReadingTypeChange={(type) => {
        if (isLoading) return;
        if (recommendationSections.length > 0 && !availableTypes.has(type)) return;
        setReadingPreference(type);
      }}
      readingTypeAriaLabel="Selected fields reading type"
      coverageLayerValue={effectiveLayer}
      coverageLayerOptions={COVERAGE_LAYER_ORDER.map((layer) => ({
        value: layer,
        label: COVERAGE_LAYER_META[layer].pluralLabel,
        meta: coverageLayerMeta.get(layer),
        disabled: isLoading || (!activeRecommendation
          ? !supportedLayersForReadingType(effectiveReadingType).includes(layer)
          : !activeRecommendation.supportedLayers.includes(layer)),
      }))}
      onCoverageLayerChange={(layer) => {
        if (isLoading) return;
        const supportedLayers = activeRecommendation?.supportedLayers ?? supportedLayersForReadingType(effectiveReadingType);
        if (!supportedLayers.includes(layer)) return;
        setCoverageLayerPreference(layer);
      }}
      coverageLayerAriaLabel="Selected fields coverage layer"
      showWikipediaLevelSelector
    />
  );
}

function SpreadPathPlaceholder({
  detail,
  message,
  tone = 'neutral',
}: {
  detail: string;
  message: string;
  tone?: 'neutral' | 'loading' | 'error';
}) {
  const shellClass = tone === 'error'
    ? 'border-rose-200 bg-rose-50/80'
    : 'border-amber-200 bg-amber-50/70';
  const titleClass = tone === 'error' ? 'text-rose-800' : 'text-amber-800';
  const detailClass = tone === 'error' ? 'text-rose-900' : 'text-amber-900';
  const messageClass = tone === 'error' ? 'text-rose-700' : 'text-amber-950/85';

  return (
    <section class={`overflow-hidden rounded-2xl border p-4 sm:p-5 ${shellClass}`}>
      <div>
        <h2 class={`text-sm font-medium uppercase tracking-wide ${titleClass}`}>
          Knowledge-Spread Path
        </h2>
        <p class={`mt-1 text-xs font-medium ${detailClass}`}>
          {detail}
        </p>
        <p class={`mt-1.5 text-sm leading-6 ${messageClass}`}>
          {message}
        </p>
      </div>
    </section>
  );
}

export function CenteredCircleNavigatorPanel({
  parts,
  centerPart,
  centerPartNumber,
  topPart,
  connectionSummary,
  suggestedSections,
  readingPref,
  activeLayer,
  checklistState,
  baseUrl,
  coverageSources,
}: CenteredCircleNavigatorPanelProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const shelfState = useReadingShelfState();
  const wikiLevel = useWikipediaLevel();
  const [sharedPartRecommendations, setSharedPartRecommendations] = useState<{
    center: CircleNavigatorPartRecommendations;
    top: CircleNavigatorPartRecommendations;
  } | null>(() => {
    const cachedCenter = partRecommendationCache.get(centerPartNumber);
    const cachedTop = partRecommendationCache.get(topPart.partNumber);
    return cachedCenter && cachedTop ? { center: cachedCenter, top: cachedTop } : null;
  });
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    const cachedCenter = partRecommendationCache.get(centerPartNumber);
    const cachedTop = partRecommendationCache.get(topPart.partNumber);
    if (cachedCenter && cachedTop) {
      setSharedPartRecommendations({ center: cachedCenter, top: cachedTop });
      setRecommendationsError(null);
      return;
    }

    const controller = new AbortController();
    setSharedPartRecommendations(null);
    setRecommendationsError(null);

    Promise.all([
      loadPartRecommendations(centerPartNumber, baseUrl, controller.signal),
      loadPartRecommendations(topPart.partNumber, baseUrl, controller.signal),
    ])
      .then(([centerRecommendations, topRecommendations]) => {
        if (controller.signal.aborted) return;
        setSharedPartRecommendations({
          center: centerRecommendations,
          top: topRecommendations,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRecommendationsError(error instanceof Error ? error.message : 'Unable to load shared recommendations.');
      });

    return () => controller.abort();
  }, [centerPartNumber, topPart.partNumber, baseUrl]);

  const recommendationSections = useMemo(() => {
    if (!sharedPartRecommendations) return [];

    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);

    const sharedVsiEntries = intersectSharedEntries(sharedPartRecommendations.center.vsi, sharedPartRecommendations.top.vsi);
    const rawSharedWikiEntries = intersectSharedEntries(sharedPartRecommendations.center.wiki, sharedPartRecommendations.top.wiki);
    const sharedWikiEntries = filterWikipediaLevel(rawSharedWikiEntries, wikiLevel);
    const sharedIotEntries = intersectSharedEntries(sharedPartRecommendations.center.iot, sharedPartRecommendations.top.iot);
    const sharedMacroEntries = intersectSharedEntries(sharedPartRecommendations.center.macro, sharedPartRecommendations.top.macro);
    const wikiCoverageEntries = coverageSources.wikipedia?.entries
      ? filterWikipediaLevel(coverageSources.wikipedia.entries, wikiLevel)
      : undefined;
    return [
      buildRecommendationSectionConfig({
        type: 'vsi',
        itemSingular: 'book',
        entries: sharedVsiEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.vsi?.entries,
        getHref: (item: CircleNavigatorVsiEntry) => `${baseUrl}/vsi/${slugify(item.title)}`,
        renderMeta: (item: CircleNavigatorVsiEntry) => formatCircleNavigatorVsiMeta(item, readingSpeedWpm),
      }),
      buildRecommendationSectionConfig({
        type: 'iot',
        itemSingular: 'episode',
        entries: sharedIotEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.iot?.entries,
        getHref: (item: CircleNavigatorIotEntry) => `${baseUrl}/iot/${item.pid}`,
        renderMeta: (item: CircleNavigatorIotEntry) => formatIotEpisodeMeta(item),
      }),
      buildRecommendationSectionConfig({
        type: 'wikipedia',
        itemSingular: 'article',
        entries: sharedWikiEntries,
        completedChecklistKeys,
        coverageEntries: wikiCoverageEntries,
        getHref: (item: CircleNavigatorWikipediaEntry) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
        getLabel: (item: CircleNavigatorWikipediaEntry) => item.displayTitle || item.title,
        renderMeta: (item: CircleNavigatorWikipediaEntry) => formatEstimatedReadingTime(item.wordCount, readingSpeedWpm),
        allowEmpty: rawSharedWikiEntries.length > 0,
      }),
      buildRecommendationSectionConfig({
        type: 'macropaedia',
        itemSingular: 'article',
        entries: sharedMacroEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.macropaedia?.entries,
        getHref: (item: CircleNavigatorMacropaediaEntry) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      }),
    ]
      .filter((section): section is AnchoredRecommendationSectionConfig<AnchoredEntryBase> => section !== null)
      .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));
  }, [sharedPartRecommendations, checklistState, readingPref, baseUrl, coverageSources, wikiLevel, readingSpeedWpm]);

  const {
    activeRecommendation,
    effectiveReadingType,
    effectiveLayer,
  } = resolveRecommendationSelection(recommendationSections, readingPref, activeLayer);
  const { steps: spreadSteps, remaining: spreadRemaining, resolvedLayer } = buildSpreadPathFromRecommendations(
    activeRecommendation as AnchoredRecommendationSectionConfig<AnchoredEntryBase> | undefined,
    effectiveLayer,
    readingSpeedWpm,
  );
  const resolvedLayerLabel = coverageLayerLabel(resolvedLayer, 2, { lowercase: true });
  const isLoadingRecommendations = !sharedPartRecommendations && !recommendationsError;
  const selectionControls = renderSelectionControls(
    recommendationSections,
    readingPref,
    activeLayer,
    isLoadingRecommendations,
  );
  const activeSnapshot = activeRecommendation?.layerSnapshots[resolvedLayer];
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const reachableCoverageCount = spreadSteps[spreadSteps.length - 1]?.cumulativeCoveredCount
    ?? activeSnapshot?.currentlyCoveredCount
    ?? 0;
  const statusMessage = activeSnapshot && spreadSteps.length > 0 && !isLayerComplete
    ? selectionConstraintMessage(resolvedLayer, activeSnapshot.totalCoverageCount, reachableCoverageCount)
    : null;

  return (
    <>
      <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-lg sm:px-5 sm:py-3">
        <p class="text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
          Readings linking <a href={essayHref(centerPart)} class="text-indigo-600 hover:text-indigo-800">{centerPart.title}</a> and <a href={essayHref(topPart)} class="text-indigo-600 hover:text-indigo-800">{topPart.title}</a>, ordered by how many new {resolvedLayerLabel} they open across the outline.
        </p>

        {suggestedSections.length > 0 && (
          <details class="mt-3 group/conn">
            <summary class="cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-500 transition-colors flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
              <span>Connected Sections ({suggestedSections.length})</span>
              <svg class="h-3 w-3 transition-transform group-open/conn:rotate-180" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <ul class="mt-2 space-y-1">
              {suggestedSections.map((item) => {
                const part = parts.find((candidate) => candidate.partNumber === item.section.partNumber);
                return (
                  <li key={item.section.sectionCode}>
                    <a
                      href={sectionUrl(item.section.sectionCode, baseUrl)}
                      class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                    >
                      <span
                        class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: part?.colorHex || '#94a3b8' }}
                      />
                      <span class="text-slate-700 group-hover:text-indigo-700">{item.section.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

      </div>

      <div class="mt-3">
        {selectionControls}
      </div>

      <div class="mt-3">
        {isLoadingRecommendations ? (
          <SpreadPathPlaceholder
            tone="loading"
            detail="Preparing recommendations..."
            message={`Loading shared recommendations for ${centerPart.partName} and ${topPart.partName}.`}
          />
        ) : recommendationsError ? (
          <SpreadPathPlaceholder
            tone="error"
            detail="Unable to load recommendations"
            message={recommendationsError}
          />
        ) : activeRecommendation ? (
          <ReadingSpreadPath
            isOpen={spreadPathOpen}
            onToggleOpen={() => setSpreadPathOpen(o => !o)}
            steps={spreadSteps}
            scrollResetKey={`${effectiveReadingType}:${effectiveLayer}`}
            remainingCoverageCount={spreadRemaining}
            checklistState={checklistState}
            shelfState={shelfState}
            onCheckedChange={writeChecklistState}
            onShelvedChange={writeShelfState}
            getHref={(step) => step.href}
            renderMeta={(step) => step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null}
            checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
            shelfAriaLabel={(step) => `Add ${step.title} to My Shelf`}
            itemSingular={activeRecommendation.itemSingular}
            itemPlural={activeRecommendation.itemSingular + 's'}
            coverageLayer={resolvedLayer}
            coverageUnitSingular={coverageLayerLabel(resolvedLayer, 1)}
            coverageUnitPlural={coverageLayerLabel(resolvedLayer, 2)}
            getEstimatedMinutes={(step) => step.estimatedMinutes}
            estimatedTimeApproximate={effectiveReadingType !== 'iot'}
            statusMessage={statusMessage ?? undefined}
            emptyMessage={emptyRecommendationMessage(resolvedLayer, isLayerComplete, spreadRemaining)}
            baseUrl={baseUrl}
            sectionLinksVariant="chips"
          />
        ) : (
          <SpreadPathPlaceholder
            detail="No path available"
            message="No mapped recommendations are available for this reading type in the current selection."
          />
        )}
      </div>
    </>
  );
}

export function TopPartCircleNavigatorPanel({
  topPart,
  topPartNumber,
  readingPref,
  activeLayer,
  checklistState,
  baseUrl,
  coverageSources,
}: TopPartCircleNavigatorPanelProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const shelfState = useReadingShelfState();
  const wikiLevel = useWikipediaLevel();
  const [partRecommendations, setPartRecommendations] = useState<CircleNavigatorPartRecommendations | null>(
    () => partRecommendationCache.get(topPartNumber) ?? null
  );
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [spreadPathOpen, setSpreadPathOpen] = useState(false);

  useEffect(() => {
    const cached = partRecommendationCache.get(topPartNumber);
    if (cached) {
      setPartRecommendations(cached);
      setRecommendationsError(null);
      return;
    }

    const controller = new AbortController();
    setPartRecommendations(null);
    setRecommendationsError(null);

    loadPartRecommendations(topPartNumber, baseUrl, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPartRecommendations(data);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRecommendationsError(error instanceof Error ? error.message : 'Unable to load recommendations.');
      });

    return () => controller.abort();
  }, [topPartNumber, baseUrl]);

  const recommendationSections = useMemo(() => {
    if (!partRecommendations) return [];

    const belongsToPart = (section: ReadingSectionSummary) => section.partNumber === topPartNumber;
    const completedChecklistKeys = completedChecklistKeysFromState(checklistState);

    const anchoredVsiEntries = partRecommendations.vsi.filter((entry) => entry.sections.some(belongsToPart));
    const rawAnchoredWikiEntries = partRecommendations.wiki.filter((entry) => entry.sections.some(belongsToPart));
    const anchoredWikiEntries = filterWikipediaLevel(rawAnchoredWikiEntries, wikiLevel);
    const anchoredIotEntries = partRecommendations.iot.filter((entry) => entry.sections.some(belongsToPart));
    const anchoredMacroEntries = partRecommendations.macro.filter((entry) => entry.sections.some(belongsToPart));
    const wikiCoverageEntries = coverageSources.wikipedia?.entries
      ? filterWikipediaLevel(coverageSources.wikipedia.entries, wikiLevel)
      : undefined;
    return [
      buildRecommendationSectionConfig({
        type: 'vsi',
        itemSingular: 'book',
        entries: anchoredVsiEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.vsi?.entries,
        getHref: (item: CircleNavigatorVsiEntry) => `${baseUrl}/vsi/${slugify(item.title)}`,
        renderMeta: (item: CircleNavigatorVsiEntry) => formatCircleNavigatorVsiMeta(item, readingSpeedWpm),
      }),
      buildRecommendationSectionConfig({
        type: 'iot',
        itemSingular: 'episode',
        entries: anchoredIotEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.iot?.entries,
        getHref: (item: CircleNavigatorIotEntry) => `${baseUrl}/iot/${item.pid}`,
        renderMeta: (item: CircleNavigatorIotEntry) => formatIotEpisodeMeta(item),
      }),
      buildRecommendationSectionConfig({
        type: 'wikipedia',
        itemSingular: 'article',
        entries: anchoredWikiEntries,
        completedChecklistKeys,
        coverageEntries: wikiCoverageEntries,
        getHref: (item: CircleNavigatorWikipediaEntry) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
        getLabel: (item: CircleNavigatorWikipediaEntry) => item.displayTitle || item.title,
        renderMeta: (item: CircleNavigatorWikipediaEntry) => formatEstimatedReadingTime(item.wordCount, readingSpeedWpm),
        allowEmpty: rawAnchoredWikiEntries.length > 0,
      }),
      buildRecommendationSectionConfig({
        type: 'macropaedia',
        itemSingular: 'article',
        entries: anchoredMacroEntries,
        completedChecklistKeys,
        coverageEntries: coverageSources.macropaedia?.entries,
        getHref: (item: CircleNavigatorMacropaediaEntry) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      }),
    ]
      .filter((section): section is AnchoredRecommendationSectionConfig<AnchoredEntryBase> => section !== null)
      .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));
  }, [topPartNumber, readingPref, checklistState, partRecommendations, baseUrl, coverageSources, wikiLevel, readingSpeedWpm]);

  const {
    activeRecommendation,
    effectiveReadingType,
    effectiveLayer,
  } = resolveRecommendationSelection(recommendationSections, readingPref, activeLayer);
  const { steps: spreadSteps, remaining: spreadRemaining, resolvedLayer } = buildSpreadPathFromRecommendations(
    activeRecommendation as AnchoredRecommendationSectionConfig<AnchoredEntryBase> | undefined,
    effectiveLayer,
    readingSpeedWpm,
  );
  const resolvedLayerLabel = coverageLayerLabel(resolvedLayer, 2, { lowercase: true });
  const isLoadingRecommendations = !partRecommendations && !recommendationsError;
  const selectionControls = renderSelectionControls(
    recommendationSections,
    readingPref,
    activeLayer,
    isLoadingRecommendations,
  );
  const activeSnapshot = activeRecommendation?.layerSnapshots[resolvedLayer];
  const isLayerComplete = activeSnapshot
    ? activeSnapshot.currentlyCoveredCount >= activeSnapshot.totalCoverageCount
    : false;
  const reachableCoverageCount = spreadSteps[spreadSteps.length - 1]?.cumulativeCoveredCount
    ?? activeSnapshot?.currentlyCoveredCount
    ?? 0;
  const statusMessage = activeSnapshot && spreadSteps.length > 0 && !isLayerComplete
    ? selectionConstraintMessage(resolvedLayer, activeSnapshot.totalCoverageCount, reachableCoverageCount)
    : null;

  return (
    <>
      <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-lg sm:px-5 sm:py-3">
        <p class="text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
          Readings for <a href={essayHref(topPart)} class="text-indigo-600 hover:text-indigo-800">{topPart.title}</a>, ordered by how many new {resolvedLayerLabel} they open across the outline.
        </p>

        {topPart.divisions.length > 0 && (
          <details class="mt-3 group/divs">
            <summary class="cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-500 transition-colors flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
              <span>Divisions ({topPart.divisions.length})</span>
              <svg class="h-3 w-3 transition-transform group-open/divs:rotate-180" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <ul class="mt-2 space-y-1">
              {topPart.divisions.map((division) => (
                <li key={division.divisionId}>
                  <a
                    href={divisionUrl(division.divisionId, baseUrl)}
                    class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                  >
                    <span
                      class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: topPart.colorHex }}
                    />
                    <span class="text-slate-700 group-hover:text-indigo-700">
                      <span class="text-slate-400">{division.romanNumeral}.</span>{' '}{division.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div class="mt-3">
        {selectionControls}
      </div>

      <div class="mt-3">
        {isLoadingRecommendations ? (
          <SpreadPathPlaceholder
            tone="loading"
            detail="Preparing recommendations..."
            message={`Loading anchored recommendations for ${topPart.partName}.`}
          />
        ) : recommendationsError ? (
          <SpreadPathPlaceholder
            tone="error"
            detail="Unable to load recommendations"
            message={recommendationsError}
          />
        ) : activeRecommendation ? (
          <ReadingSpreadPath
            isOpen={spreadPathOpen}
            onToggleOpen={() => setSpreadPathOpen(o => !o)}
            steps={spreadSteps}
            scrollResetKey={`${effectiveReadingType}:${effectiveLayer}`}
            remainingCoverageCount={spreadRemaining}
            checklistState={checklistState}
            shelfState={shelfState}
            onCheckedChange={writeChecklistState}
            onShelvedChange={writeShelfState}
            getHref={(step) => step.href}
            renderMeta={(step) => step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null}
            checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
            shelfAriaLabel={(step) => `Add ${step.title} to My Shelf`}
            itemSingular={activeRecommendation.itemSingular}
            itemPlural={activeRecommendation.itemSingular + 's'}
            coverageLayer={resolvedLayer}
            coverageUnitSingular={coverageLayerLabel(resolvedLayer, 1)}
            coverageUnitPlural={coverageLayerLabel(resolvedLayer, 2)}
            getEstimatedMinutes={(step) => step.estimatedMinutes}
            estimatedTimeApproximate={effectiveReadingType !== 'iot'}
            statusMessage={statusMessage ?? undefined}
            emptyMessage={emptyRecommendationMessage(resolvedLayer, isLayerComplete, spreadRemaining)}
            baseUrl={baseUrl}
            sectionLinksVariant="chips"
          />
        ) : (
          <SpreadPathPlaceholder
            detail="No path available"
            message="No mapped recommendations are available for this reading type in the current selection."
          />
        )}
      </div>
    </>
  );
}
