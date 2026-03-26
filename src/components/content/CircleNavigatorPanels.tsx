import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  writeChecklistState,
} from '../../utils/readingChecklist';
import type { ReadingType } from '../../utils/readingPreference';
import { divisionUrl, sectionUrl, slugify } from '../../utils/helpers';
import {
  buildIotCoverageSnapshot,
  buildMacropaediaCoverageSnapshot,
  buildVsiCoverageSnapshot,
  buildWikipediaCoverageSnapshot,
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';
import { completedChecklistKeysFromState } from '../../utils/readingLibrary';
import ReadingSpreadPath from './ReadingSpreadPath';
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
  checklistState: Record<string, boolean>;
  baseUrl: string;
}

interface TopPartCircleNavigatorPanelProps {
  topPart: CircleNavigatorPart;
  topPartNumber: number;
  readingPref: ReadingType;
  checklistState: Record<string, boolean>;
  baseUrl: string;
}

type AnchoredEntryBase = {
  title: string;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
};

type AnchoredRecommendationItem<TEntry extends AnchoredEntryBase> = {
  entry: TEntry;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
  isCompleted: boolean;
};

type AnchoredRecommendationResult<TEntry extends AnchoredEntryBase> = {
  unreadItems: AnchoredRecommendationItem<TEntry>[];
  completedItems: AnchoredRecommendationItem<TEntry>[];
  overlapOnlyUnreadCount: number;
  totalUnreadLinkedCount: number;
};

interface AnchoredRecommendationSectionConfig<TEntry extends AnchoredEntryBase> {
  type: ReadingType;
  title: string;
  browseHref: string;
  browseLabel: string;
  itemSingular: string;
  totalCount: number;
  unreadCount: number;
  completedCount: number;
  remainingSections: number;
  overlapOnlyUnreadCount: number;
  totalUnreadLinkedCount: number;
  unreadItems: AnchoredRecommendationItem<TEntry>[];
  completedItems: AnchoredRecommendationItem<TEntry>[];
  getHref: (item: TEntry) => string;
  getLabel?: (item: TEntry) => string;
  renderMeta?: (item: TEntry) => ComponentChildren;
}

const partRecommendationCache = new Map<number, CircleNavigatorPartRecommendations>();

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

  return fetch(joinBaseUrl(baseUrl, `circle-anchored/${partNumber}.json`), { signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load recommendations for Part ${partNumber}.`);
      }
      return response.json();
    })
    .then((data: CircleNavigatorPartRecommendations) => {
      partRecommendationCache.set(partNumber, data);
      return data;
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

function buildAnchoredRecommendationItems<TEntry extends AnchoredEntryBase>(
  entries: TEntry[],
  checklistState: Record<string, boolean>,
  snapshot: {
    currentlyCoveredSections: number;
    totalCoveredSections: number;
    path: Array<{
      checklistKey: string;
      newSectionCount: number;
      cumulativeCoveredSectionCount: number;
      newSections: ReadingSectionSummary[];
    }>;
  }
): AnchoredRecommendationResult<TEntry> {
  const completedChecklistKeys = completedChecklistKeysFromState(checklistState);
  const entryLookup = new Map(entries.map((entry) => [entry.checklistKey, entry]));

  const unreadItems = snapshot.path.flatMap((step) => {
    const entry = entryLookup.get(step.checklistKey);
    if (!entry || completedChecklistKeys.has(step.checklistKey)) return [];
    return [{
      entry,
      newSectionCount: step.newSectionCount,
      cumulativeCoveredSectionCount: step.cumulativeCoveredSectionCount,
      newSections: step.newSections,
      isCompleted: false,
    }];
  });

  const totalUnreadLinkedCount = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey)).length;
  const overlapOnlyUnreadCount = totalUnreadLinkedCount - unreadItems.length;

  const completedItems = entries
    .filter((entry) => completedChecklistKeys.has(entry.checklistKey))
    .map((entry) => ({
      entry,
      newSectionCount: 0,
      cumulativeCoveredSectionCount: snapshot.currentlyCoveredSections,
      newSections: [],
      isCompleted: true,
    }));

  return { unreadItems, completedItems, overlapOnlyUnreadCount, totalUnreadLinkedCount };
}

function buildSpreadPathFromRecommendations<TEntry extends AnchoredEntryBase>(
  activeSection: AnchoredRecommendationSectionConfig<TEntry> | undefined,
) {
  if (!activeSection) return { steps: [] as Array<{ title: string; checklistKey: string; sectionCount: number; sections: ReadingSectionSummary[]; newCoverageCount: number; cumulativeCoveredCount: number; newSections: ReadingSectionSummary[]; href: string; meta: ComponentChildren }>, remaining: 0 };

  const steps = activeSection.unreadItems.map((item) => ({
    title: activeSection.getLabel ? activeSection.getLabel(item.entry) : item.entry.title,
    checklistKey: item.entry.checklistKey,
    sectionCount: item.entry.sectionCount,
    sections: item.entry.sections,
    newCoverageCount: item.newSectionCount,
    cumulativeCoveredCount: item.cumulativeCoveredSectionCount,
    newSections: item.newSections,
    href: activeSection.getHref(item.entry),
    meta: activeSection.renderMeta ? activeSection.renderMeta(item.entry) : undefined,
  }));

  return { steps, remaining: activeSection.remainingSections };
}

export function CenteredCircleNavigatorPanel({
  parts,
  centerPart,
  centerPartNumber,
  topPart,
  connectionSummary,
  suggestedSections,
  readingPref,
  checklistState,
  baseUrl,
}: CenteredCircleNavigatorPanelProps) {
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
    const vsiSnapshot = buildVsiCoverageSnapshot(sharedVsiEntries, completedChecklistKeys);
    const vsiRecommendations = buildAnchoredRecommendationItems(sharedVsiEntries, checklistState, vsiSnapshot);

    const sharedWikiEntries = intersectSharedEntries(sharedPartRecommendations.center.wiki, sharedPartRecommendations.top.wiki);
    const wikiSnapshot = buildWikipediaCoverageSnapshot(sharedWikiEntries, completedChecklistKeys);
    const wikiRecommendations = buildAnchoredRecommendationItems(sharedWikiEntries, checklistState, wikiSnapshot);

    const sharedIotEntries = intersectSharedEntries(sharedPartRecommendations.center.iot, sharedPartRecommendations.top.iot);
    const iotSnapshot = buildIotCoverageSnapshot(sharedIotEntries, completedChecklistKeys);
    const iotRecommendations = buildAnchoredRecommendationItems(sharedIotEntries, checklistState, iotSnapshot);

    const sharedMacroEntries = intersectSharedEntries(sharedPartRecommendations.center.macro, sharedPartRecommendations.top.macro);
    const macroSnapshot = buildMacropaediaCoverageSnapshot(sharedMacroEntries, completedChecklistKeys);
    const macroRecommendations = buildAnchoredRecommendationItems(sharedMacroEntries, checklistState, macroSnapshot);

    return [
      {
        type: 'vsi' as const,
        title: 'Oxford VSI Recommendations',
        browseHref: `${baseUrl}/vsi#vsi-library`,
        browseLabel: 'Browse all Oxford VSI books',
        itemSingular: 'book',
        totalCount: sharedVsiEntries.length,
        unreadCount: vsiRecommendations.unreadItems.length,
        completedCount: vsiRecommendations.completedItems.length,
        remainingSections: vsiSnapshot.remainingSections,
        overlapOnlyUnreadCount: vsiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: vsiRecommendations.totalUnreadLinkedCount,
        unreadItems: vsiRecommendations.unreadItems,
        completedItems: vsiRecommendations.completedItems,
        getHref: (item: CircleNavigatorVsiEntry) => `${baseUrl}/vsi/${slugify(item.title)}`,
        renderMeta: (item: CircleNavigatorVsiEntry) => item.author,
      },
      {
        type: 'iot' as const,
        title: 'BBC In Our Time Episodes',
        browseHref: `${baseUrl}/iot#iot-library`,
        browseLabel: 'Browse all BBC In Our Time episodes',
        itemSingular: 'episode',
        totalCount: sharedIotEntries.length,
        unreadCount: iotRecommendations.unreadItems.length,
        completedCount: iotRecommendations.completedItems.length,
        remainingSections: iotSnapshot.remainingSections,
        overlapOnlyUnreadCount: iotRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: iotRecommendations.totalUnreadLinkedCount,
        unreadItems: iotRecommendations.unreadItems,
        completedItems: iotRecommendations.completedItems,
        getHref: (item: CircleNavigatorIotEntry) => `${baseUrl}/iot/${item.pid}`,
        renderMeta: (item: CircleNavigatorIotEntry) => formatIotEpisodeMeta(item),
      },
      {
        type: 'wikipedia' as const,
        title: 'Wikipedia Article Recommendations',
        browseHref: `${baseUrl}/wikipedia#wikipedia-library`,
        browseLabel: 'Browse all Wikipedia articles',
        itemSingular: 'article',
        totalCount: sharedWikiEntries.length,
        unreadCount: wikiRecommendations.unreadItems.length,
        completedCount: wikiRecommendations.completedItems.length,
        remainingSections: wikiSnapshot.remainingSections,
        overlapOnlyUnreadCount: wikiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: wikiRecommendations.totalUnreadLinkedCount,
        unreadItems: wikiRecommendations.unreadItems,
        completedItems: wikiRecommendations.completedItems,
        getHref: (item: CircleNavigatorWikipediaEntry) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
        getLabel: (item: CircleNavigatorWikipediaEntry) => item.displayTitle || item.title,
        renderMeta: (item: CircleNavigatorWikipediaEntry) => `Vital Articles Level ${item.lowestLevel}`,
      },
      {
        type: 'macropaedia' as const,
        title: 'Macropaedia Reading List',
        browseHref: `${baseUrl}/macropaedia#macropaedia-library`,
        browseLabel: 'Browse all Macropaedia articles',
        itemSingular: 'article',
        totalCount: sharedMacroEntries.length,
        unreadCount: macroRecommendations.unreadItems.length,
        completedCount: macroRecommendations.completedItems.length,
        remainingSections: macroSnapshot.remainingSections,
        overlapOnlyUnreadCount: macroRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: macroRecommendations.totalUnreadLinkedCount,
        unreadItems: macroRecommendations.unreadItems,
        completedItems: macroRecommendations.completedItems,
        getHref: (item: CircleNavigatorMacropaediaEntry) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      },
    ]
      .filter((section) => section.totalCount > 0)
      .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));
  }, [sharedPartRecommendations, checklistState, readingPref, baseUrl]);

  const activeRecommendation = recommendationSections.find(s => s.type === readingPref) ?? recommendationSections[0];
  const { steps: spreadSteps, remaining: spreadRemaining } = buildSpreadPathFromRecommendations(activeRecommendation as AnchoredRecommendationSectionConfig<AnchoredEntryBase> | undefined);

  return (
    <>
      <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-lg sm:px-5 sm:py-3">
        <p class="text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
          Readings linking <a href={essayHref(centerPart)} class="text-indigo-600 hover:text-indigo-800">{centerPart.title}</a> and <a href={essayHref(topPart)} class="text-indigo-600 hover:text-indigo-800">{topPart.title}</a>, ordered by how much new ground they cover across the outline.
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

        {recommendationsError && (
          <div class="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {recommendationsError}
          </div>
        )}
        {!sharedPartRecommendations && !recommendationsError && (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Loading shared recommendations for {centerPart.partName} and {topPart.partName}...
          </div>
        )}
      </div>

      {spreadSteps.length > 0 && (
        <div class="mt-3">
        <ReadingSpreadPath
          isOpen={spreadPathOpen}
          onToggleOpen={() => setSpreadPathOpen(o => !o)}
          steps={spreadSteps}
          remainingCoverageCount={spreadRemaining}
          checklistState={checklistState}
          onCheckedChange={writeChecklistState}
          getHref={(step) => step.href}
          renderMeta={(step) => step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null}
          checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
          itemSingular={activeRecommendation?.itemSingular ?? 'item'}
          itemPlural={activeRecommendation?.itemSingular ? activeRecommendation.itemSingular + 's' : 'items'}
          coverageUnitSingular="Section"
          coverageUnitPlural="Sections"
          emptyMessage="No recommendations available."
          baseUrl={baseUrl}
          sectionLinksVariant="chips"
        />
        </div>
      )}
    </>
  );
}

export function TopPartCircleNavigatorPanel({
  topPart,
  topPartNumber,
  readingPref,
  checklistState,
  baseUrl,
}: TopPartCircleNavigatorPanelProps) {
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
    const vsiSnapshot = buildVsiCoverageSnapshot(anchoredVsiEntries, completedChecklistKeys);
    const vsiRecommendations = buildAnchoredRecommendationItems(anchoredVsiEntries, checklistState, vsiSnapshot);

    const anchoredWikiEntries = partRecommendations.wiki.filter((entry) => entry.sections.some(belongsToPart));
    const wikiSnapshot = buildWikipediaCoverageSnapshot(anchoredWikiEntries, completedChecklistKeys);
    const wikiRecommendations = buildAnchoredRecommendationItems(anchoredWikiEntries, checklistState, wikiSnapshot);

    const anchoredIotEntries = partRecommendations.iot.filter((entry) => entry.sections.some(belongsToPart));
    const iotSnapshot = buildIotCoverageSnapshot(anchoredIotEntries, completedChecklistKeys);
    const iotRecommendations = buildAnchoredRecommendationItems(anchoredIotEntries, checklistState, iotSnapshot);

    const anchoredMacroEntries = partRecommendations.macro.filter((entry) => entry.sections.some(belongsToPart));
    const macroSnapshot = buildMacropaediaCoverageSnapshot(anchoredMacroEntries, completedChecklistKeys);
    const macroRecommendations = buildAnchoredRecommendationItems(anchoredMacroEntries, checklistState, macroSnapshot);

    return [
      {
        type: 'vsi' as const,
        title: 'Oxford VSI Recommendations',
        browseHref: `${baseUrl}/vsi#vsi-library`,
        browseLabel: 'Browse all Oxford VSI books',
        itemSingular: 'book',
        totalCount: anchoredVsiEntries.length,
        unreadCount: vsiRecommendations.unreadItems.length,
        completedCount: vsiRecommendations.completedItems.length,
        remainingSections: vsiSnapshot.remainingSections,
        overlapOnlyUnreadCount: vsiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: vsiRecommendations.totalUnreadLinkedCount,
        unreadItems: vsiRecommendations.unreadItems,
        completedItems: vsiRecommendations.completedItems,
        getHref: (item: CircleNavigatorVsiEntry) => `${baseUrl}/vsi/${slugify(item.title)}`,
        renderMeta: (item: CircleNavigatorVsiEntry) => item.author,
      },
      {
        type: 'iot' as const,
        title: 'BBC In Our Time Episodes',
        browseHref: `${baseUrl}/iot#iot-library`,
        browseLabel: 'Browse all BBC In Our Time episodes',
        itemSingular: 'episode',
        totalCount: anchoredIotEntries.length,
        unreadCount: iotRecommendations.unreadItems.length,
        completedCount: iotRecommendations.completedItems.length,
        remainingSections: iotSnapshot.remainingSections,
        overlapOnlyUnreadCount: iotRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: iotRecommendations.totalUnreadLinkedCount,
        unreadItems: iotRecommendations.unreadItems,
        completedItems: iotRecommendations.completedItems,
        getHref: (item: CircleNavigatorIotEntry) => `${baseUrl}/iot/${item.pid}`,
        renderMeta: (item: CircleNavigatorIotEntry) => formatIotEpisodeMeta(item),
      },
      {
        type: 'wikipedia' as const,
        title: 'Wikipedia Article Recommendations',
        browseHref: `${baseUrl}/wikipedia#wikipedia-library`,
        browseLabel: 'Browse all Wikipedia articles',
        itemSingular: 'article',
        totalCount: anchoredWikiEntries.length,
        unreadCount: wikiRecommendations.unreadItems.length,
        completedCount: wikiRecommendations.completedItems.length,
        remainingSections: wikiSnapshot.remainingSections,
        overlapOnlyUnreadCount: wikiRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: wikiRecommendations.totalUnreadLinkedCount,
        unreadItems: wikiRecommendations.unreadItems,
        completedItems: wikiRecommendations.completedItems,
        getHref: (item: CircleNavigatorWikipediaEntry) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
        getLabel: (item: CircleNavigatorWikipediaEntry) => item.displayTitle || item.title,
        renderMeta: (item: CircleNavigatorWikipediaEntry) => `Vital Articles Level ${item.lowestLevel}`,
      },
      {
        type: 'macropaedia' as const,
        title: 'Macropaedia Reading List',
        browseHref: `${baseUrl}/macropaedia#macropaedia-library`,
        browseLabel: 'Browse all Macropaedia articles',
        itemSingular: 'article',
        totalCount: anchoredMacroEntries.length,
        unreadCount: macroRecommendations.unreadItems.length,
        completedCount: macroRecommendations.completedItems.length,
        remainingSections: macroSnapshot.remainingSections,
        overlapOnlyUnreadCount: macroRecommendations.overlapOnlyUnreadCount,
        totalUnreadLinkedCount: macroRecommendations.totalUnreadLinkedCount,
        unreadItems: macroRecommendations.unreadItems,
        completedItems: macroRecommendations.completedItems,
        getHref: (item: CircleNavigatorMacropaediaEntry) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      },
    ]
      .filter((section) => section.totalCount > 0)
      .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0));
  }, [topPartNumber, readingPref, checklistState, partRecommendations, baseUrl]);

  const activeRecommendation = recommendationSections.find(s => s.type === readingPref) ?? recommendationSections[0];
  const { steps: spreadSteps, remaining: spreadRemaining } = buildSpreadPathFromRecommendations(activeRecommendation as AnchoredRecommendationSectionConfig<AnchoredEntryBase> | undefined);

  return (
    <>
      <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-lg sm:px-5 sm:py-3">
        <p class="text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
          Readings for <a href={essayHref(topPart)} class="text-indigo-600 hover:text-indigo-800">{topPart.title}</a>, ordered by how much new ground they cover across the outline.
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

        {recommendationsError && (
          <div class="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {recommendationsError}
          </div>
        )}
        {!partRecommendations && !recommendationsError && (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Loading anchored recommendations for {topPart.partName}...
          </div>
        )}
      </div>

      {spreadSteps.length > 0 && (
        <div class="mt-3">
        <ReadingSpreadPath
          isOpen={spreadPathOpen}
          onToggleOpen={() => setSpreadPathOpen(o => !o)}
          steps={spreadSteps}
          remainingCoverageCount={spreadRemaining}
          checklistState={checklistState}
          onCheckedChange={writeChecklistState}
          getHref={(step) => step.href}
          renderMeta={(step) => step.meta ? <p class="mt-1 text-sm text-gray-600">{step.meta}</p> : null}
          checkboxAriaLabel={(step) => `Mark ${step.title} as done`}
          itemSingular={activeRecommendation?.itemSingular ?? 'item'}
          itemPlural={activeRecommendation?.itemSingular ? activeRecommendation.itemSingular + 's' : 'items'}
          coverageUnitSingular="Section"
          coverageUnitPlural="Sections"
          emptyMessage="No recommendations available."
          baseUrl={baseUrl}
          sectionLinksVariant="chips"
        />
        </div>
      )}
    </>
  );
}
