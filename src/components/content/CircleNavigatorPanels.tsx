import { h, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  macropaediaChecklistKey,
  vsiChecklistKey,
  wikipediaChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import type { ReadingType } from '../../utils/readingPreference';
import { divisionUrl, sectionUrl, slugify } from '../../utils/helpers';
import {
  buildMacropaediaCoverageSnapshot,
  buildVsiCoverageSnapshot,
  buildWikipediaCoverageSnapshot,
  type ReadingSectionSummary,
} from '../../utils/readingData';
import { completedChecklistKeysFromState } from '../../utils/readingLibrary';
import Accordion from '../ui/Accordion';
import ReadingSectionLinks from './ReadingSectionLinks';
import type {
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function renderScopeBadge(label: string, description: string) {
  return (
    <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p class="mt-1 leading-5">{description}</p>
    </div>
  );
}

function countPartsSpanned(sections: ReadingSectionSummary[]): number {
  return new Set(sections.map((section) => section.partNumber)).size;
}

function essayHref(part: CircleNavigatorPart): string {
  return `${part.href}?view=essay#essay`;
}

function renderEssayButton(part: CircleNavigatorPart, label?: string) {
  return (
    <a
      href={essayHref(part)}
      class="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
    >
      {label ?? 'Read essay'}
    </a>
  );
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

function renderAnchoredRecommendationSection<TEntry extends AnchoredEntryBase>(
  section: AnchoredRecommendationSectionConfig<TEntry>,
  options: {
    topPart: CircleNavigatorPart;
    topPartNumber: number;
    readingPref: ReadingType;
    checklistState: Record<string, boolean>;
    baseUrl: string;
  }
) {
  const {
    topPart,
    topPartNumber,
    readingPref,
    checklistState,
    baseUrl,
  } = options;

  const renderItem = (
    item: AnchoredRecommendationItem<TEntry>,
    indexLabel: string
  ) => {
    const isChecked = Boolean(checklistState[item.entry.checklistKey]);
    const sectionsInPart = item.entry.sections.filter((entrySection) => entrySection.partNumber === topPartNumber);
    const linkedPartCount = countPartsSpanned(item.entry.sections);
    const sectionLinkSections = item.newSectionCount > 0 ? item.newSections : sectionsInPart;
    const sectionLinkLabel = item.newSectionCount > 0
      ? `Show the ${item.newSectionCount} new ${pluralize(item.newSectionCount, 'Section')}`
      : `Show the ${sectionsInPart.length} ${pluralize(sectionsInPart.length, 'linked Section')} in ${topPart.partName}`;

    return (
      <li
        key={item.entry.checklistKey}
        class={`rounded-xl border p-4 transition-colors ${item.isCompleted ? 'border-slate-200 bg-slate-100/80' : 'border-slate-200 bg-white'}`}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
              {indexLabel}
            </p>
            <h4 class="mt-1 font-serif text-lg leading-tight text-slate-900">
              <a href={section.getHref(item.entry)} class="transition-colors hover:text-indigo-700">
                {section.getLabel ? section.getLabel(item.entry) : item.entry.title}
              </a>
            </h4>
            {section.renderMeta ? (
              <div class="mt-1 text-sm text-slate-600">{section.renderMeta(item.entry)}</div>
            ) : null}
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Why this next:{' '}
              {item.isCompleted ? (
                <>you already used it to reach this anchored Part and its linked Sections.</>
              ) : (
                <>
                  it opens {item.newSectionCount} new {pluralize(item.newSectionCount, 'Section')},
                  {' '}covers {sectionsInPart.length} {pluralize(sectionsInPart.length, 'Section')} in {topPart.partName},
                  {' '}and spans {linkedPartCount} {pluralize(linkedPartCount, 'Part')} overall.
                </>
              )}
            </p>
          </div>
          <label class="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => writeChecklistState(item.entry.checklistKey, (event.currentTarget as HTMLInputElement).checked)}
              class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Done
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {item.isCompleted ? (
            <span class="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
              Already marked done
            </span>
          ) : (
            <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              +{item.newSectionCount} new {pluralize(item.newSectionCount, 'Section')}
            </span>
          )}
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {item.entry.sectionCount} total {pluralize(item.entry.sectionCount, 'Section')}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {sectionsInPart.length} in {topPart.partName}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            Spans {linkedPartCount} {pluralize(linkedPartCount, 'Part')}
          </span>
        </div>

        {sectionLinkSections.length > 0 && (
          <ReadingSectionLinks
            sections={sectionLinkSections}
            baseUrl={baseUrl}
            label={sectionLinkLabel}
            variant="chips"
          />
        )}
      </li>
    );
  };

  return (
    <Accordion
      key={section.type}
      title={`${section.title} (${section.unreadCount})`}
      forceOpenKey={readingPref === section.type ? 0 : undefined}
      forceCloseKey={readingPref !== section.type ? 0 : undefined}
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p class="max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
          {section.totalUnreadLinkedCount} unread {pluralize(section.totalUnreadLinkedCount, section.itemSingular)} linked to {topPart.title}.
          {' '}Showing the {section.unreadCount} that still add new Section coverage across the whole outline.
          {' '}{section.remainingSections > 0
            ? `${section.remainingSections} ${pluralize(section.remainingSections, 'Section')} remain uncovered from this anchored list.`
            : `Your checked ${pluralize(section.completedCount, section.itemSingular)} already cover every mapped Section this anchored list can reach.`}
        </p>
        <a
          href={section.browseHref}
          class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          {section.browseLabel}
        </a>
      </div>

      {section.unreadItems.length > 0 ? (
        <ol class="space-y-3">
          {section.unreadItems.map((item, index) =>
            renderItem(item, `Step ${index + 1}`)
          )}
        </ol>
      ) : (
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {section.totalUnreadLinkedCount === 0
            ? `Every linked ${section.itemSingular} here is already marked done.`
            : section.overlapOnlyUnreadCount > 0
              ? `No unread linked ${pluralize(section.overlapOnlyUnreadCount, section.itemSingular)} add any new Section coverage right now. Open a Division or Section to narrow the topic further.`
              : `No additional linked ${pluralize(0, section.itemSingular)} are available right now. Open a Division or Section to keep narrowing the topic.`}
        </div>
      )}

      {section.completedItems.length > 0 && (
        <div class="mt-5 border-t border-slate-200 pt-4">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Already marked done ({section.completedItems.length})
          </p>
          <ol class="mt-3 space-y-3">
            {section.completedItems.map((item) => renderItem(item, 'Done'))}
          </ol>
        </div>
      )}
    </Accordion>
  );
}

function renderSharedCoverageRecommendationSection<TEntry extends AnchoredEntryBase>(
  section: AnchoredRecommendationSectionConfig<TEntry>,
  options: {
    centerPart: CircleNavigatorPart;
    centerPartNumber: number;
    topPart: CircleNavigatorPart;
    topPartNumber: number;
    readingPref: ReadingType;
    checklistState: Record<string, boolean>;
    baseUrl: string;
  }
) {
  const {
    centerPart,
    centerPartNumber,
    topPart,
    topPartNumber,
    readingPref,
    checklistState,
    baseUrl,
  } = options;

  const renderItem = (
    item: AnchoredRecommendationItem<TEntry>,
    indexLabel: string
  ) => {
    const isChecked = Boolean(checklistState[item.entry.checklistKey]);
    const centerSections = item.entry.sections.filter((entrySection) => entrySection.partNumber === centerPartNumber);
    const topSections = item.entry.sections.filter((entrySection) => entrySection.partNumber === topPartNumber);
    const linkedPartCount = countPartsSpanned(item.entry.sections);
    const selectedPartSections = item.entry.sections.filter((entrySection) =>
      entrySection.partNumber === centerPartNumber || entrySection.partNumber === topPartNumber
    );
    const sectionLinkSections = item.newSectionCount > 0 ? item.newSections : selectedPartSections;
    const sectionLinkLabel = item.newSectionCount > 0
      ? `Show the ${item.newSectionCount} new ${pluralize(item.newSectionCount, 'Section')}`
      : `Show the ${selectedPartSections.length} ${pluralize(selectedPartSections.length, 'linked Section')} in ${centerPart.partName} and ${topPart.partName}`;

    return (
      <li
        key={item.entry.checklistKey}
        class={`rounded-xl border p-4 transition-colors ${item.isCompleted ? 'border-slate-200 bg-slate-100/80' : 'border-slate-200 bg-white'}`}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
              {indexLabel}
            </p>
            <h4 class="mt-1 font-serif text-lg leading-tight text-slate-900">
              <a href={section.getHref(item.entry)} class="transition-colors hover:text-indigo-700">
                {section.getLabel ? section.getLabel(item.entry) : item.entry.title}
              </a>
            </h4>
            {section.renderMeta ? (
              <div class="mt-1 text-sm text-slate-600">{section.renderMeta(item.entry)}</div>
            ) : null}
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Why this next:{' '}
              {item.isCompleted ? (
                <>you already used it to bridge these two Parts and the Sections they share.</>
              ) : (
                <>
                  it links both selected Parts, opens {item.newSectionCount} new {pluralize(item.newSectionCount, 'Section')},
                  {' '}covers {centerSections.length} in {centerPart.partName} and {topSections.length} in {topPart.partName},
                  {' '}and spans {linkedPartCount} {pluralize(linkedPartCount, 'Part')} overall.
                </>
              )}
            </p>
          </div>
          <label class="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => writeChecklistState(item.entry.checklistKey, (event.currentTarget as HTMLInputElement).checked)}
              class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Done
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {item.isCompleted ? (
            <span class="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
              Already marked done
            </span>
          ) : (
            <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              +{item.newSectionCount} new {pluralize(item.newSectionCount, 'Section')}
            </span>
          )}
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {item.entry.sectionCount} total {pluralize(item.entry.sectionCount, 'Section')}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {centerSections.length} in {centerPart.partName}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {topSections.length} in {topPart.partName}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            Spans {linkedPartCount} {pluralize(linkedPartCount, 'Part')}
          </span>
        </div>

        {sectionLinkSections.length > 0 && (
          <ReadingSectionLinks
            sections={sectionLinkSections}
            baseUrl={baseUrl}
            label={sectionLinkLabel}
            variant="chips"
          />
        )}
      </li>
    );
  };

  return (
    <Accordion
      key={section.type}
      title={`${section.title} (${section.unreadCount})`}
      forceOpenKey={readingPref === section.type ? 0 : undefined}
      forceCloseKey={readingPref !== section.type ? 0 : undefined}
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p class="max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
          {section.totalUnreadLinkedCount} unread {pluralize(section.totalUnreadLinkedCount, section.itemSingular)} linked to both {centerPart.title} and {topPart.title}.
          {' '}Showing the {section.unreadCount} that still add new Section coverage across the whole outline.
          {' '}{section.remainingSections > 0
            ? `${section.remainingSections} ${pluralize(section.remainingSections, 'Section')} remain uncovered from this shared pool.`
            : `Your checked ${pluralize(section.completedCount, section.itemSingular)} already cover every mapped Section this shared pool can reach.`}
        </p>
        <a
          href={section.browseHref}
          class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          {section.browseLabel}
        </a>
      </div>

      {section.unreadItems.length > 0 ? (
        <ol class="space-y-3">
          {section.unreadItems.map((item, index) =>
            renderItem(item, `Step ${index + 1}`)
          )}
        </ol>
      ) : (
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {section.totalUnreadLinkedCount === 0
            ? `Every shared ${section.itemSingular} here is already marked done.`
            : section.overlapOnlyUnreadCount > 0
              ? `No unread shared ${pluralize(section.overlapOnlyUnreadCount, section.itemSingular)} add any new Section coverage right now. Open one of the Connected Sections below to focus the topic further.`
              : `No additional shared ${section.itemSingular} are available right now. Open one of the Connected Sections below to keep narrowing the topic.`}
        </div>
      )}

      {section.completedItems.length > 0 && (
        <div class="mt-5 border-t border-slate-200 pt-4">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Already marked done ({section.completedItems.length})
          </p>
          <ol class="mt-3 space-y-3">
            {section.completedItems.map((item) => renderItem(item, 'Done'))}
          </ol>
        </div>
      )}
    </Accordion>
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

    const sharedMacroEntries = intersectSharedEntries(sharedPartRecommendations.center.macro, sharedPartRecommendations.top.macro);
    const macroSnapshot = buildMacropaediaCoverageSnapshot(sharedMacroEntries, completedChecklistKeys);
    const macroRecommendations = buildAnchoredRecommendationItems(sharedMacroEntries, checklistState, macroSnapshot);

    return [
      {
        type: 'vsi' as const,
        title: 'Oxford VSI Recommendations',
        browseHref: `${baseUrl}/vsi`,
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
        type: 'wikipedia' as const,
        title: 'Wikipedia Article Recommendations',
        browseHref: `${baseUrl}/wikipedia`,
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
        browseHref: `${baseUrl}/macropaedia`,
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

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        Centred on {centerPart.title}, with {topPart.title} at the top. Start here if you want readings that
        link both Parts while still taking you into the widest new territory across the outline.
      </p>
      {renderScopeBadge('Shared Scope', 'Maximise overall coverage using only readings linked to both selected Parts. The Recommended Readings broaden outward from their overlap, while the Connected Sections show where to narrow into more specific topics.')}

      <div class="mt-3">
        <div class="flex flex-wrap gap-2">
          {renderEssayButton(centerPart, `Read ${centerPart.partName} essay`)}
          {renderEssayButton(topPart, `Read ${topPart.partName} essay`)}
        </div>
      </div>

      {suggestedSections.length > 0 && connectionSummary && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Connected Sections
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            {connectionSummary.isDirect
              ? `Sections where ${centerPart.title} and ${topPart.title} cross-reference each other${connectionSummary.hasKeyword ? ', supplemented by related subject matter.' : '.'}`
              : connectionSummary.hasConnectionData
                ? `Sections that connect ${centerPart.title} and ${topPart.title} through shared references and related subject matter.`
                : `Sections with related subject matter across ${centerPart.title} and ${topPart.title}.`}
          </p>
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
        </div>
      )}

      <div class="mt-4 border-t border-slate-200 pt-3">
        <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
          Recommended Readings
        </p>
        <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
          Every item below is linked to both {centerPart.partName}: {centerPart.title} and {topPart.partName}: {topPart.title}.
          {' '}Unread items are ordered by how much new ground they still cover across the outline based on what
          you&apos;ve already checked off. Items that would only repeat covered ground are left out. For precise topic work,
          open one of the Connected Sections above.
        </p>

        {recommendationsError ? (
          <div class="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {recommendationsError}
          </div>
        ) : !sharedPartRecommendations ? (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Loading shared recommendations for {centerPart.partName} and {topPart.partName}...
          </div>
        ) : recommendationSections.length > 0 ? (
          <div class="mt-3 space-y-4">
            {recommendationSections.map((section) =>
              renderSharedCoverageRecommendationSection(section, {
                centerPart,
                centerPartNumber,
                topPart,
                topPartNumber: topPart.partNumber,
                readingPref,
                checklistState,
                baseUrl,
              })
            )}
          </div>
        ) : (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No shared mapped readings are currently available for this pair of Parts. Open a connected Section to work at a narrower topic level instead.
          </div>
        )}
      </div>
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

    const anchoredMacroEntries = partRecommendations.macro.filter((entry) => entry.sections.some(belongsToPart));
    const macroSnapshot = buildMacropaediaCoverageSnapshot(anchoredMacroEntries, completedChecklistKeys);
    const macroRecommendations = buildAnchoredRecommendationItems(anchoredMacroEntries, checklistState, macroSnapshot);

    return [
      {
        type: 'vsi' as const,
        title: 'Oxford VSI Recommendations',
        browseHref: `${baseUrl}/vsi`,
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
        type: 'wikipedia' as const,
        title: 'Wikipedia Article Recommendations',
        browseHref: `${baseUrl}/wikipedia`,
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
        browseHref: `${baseUrl}/macropaedia`,
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

  return (
    <>
      <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
        Circle of learning
      </p>
      <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
        {topPart.title} is at the top. Start here if you want readings linked to this Part that still carry
        you into the widest new territory across the outline.
      </p>
      {renderScopeBadge('Selected Part Scope', 'Maximise overall coverage using only readings linked to this Part. The Recommended Readings broaden outward from it, while the Divisions show where to narrow into more specific topics.')}

      <div class="mt-3">
        {renderEssayButton(topPart)}
      </div>

      {topPart.divisions.length > 0 && (
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
            Divisions in Selected Part
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
            These {topPart.divisions.length} {pluralize(topPart.divisions.length, 'Division')} break {topPart.title}
            {' '}into its main strands. Open one to move from this broad Part-level view into narrower areas of the outline.
          </p>
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
        </div>
      )}

      <div class="mt-4 border-t border-slate-200 pt-3">
        <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
          Recommended Readings
        </p>
        <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
          Every item below is linked to {topPart.partName}. Unread items are ordered by how much new ground
          they still cover across the outline based on what you&apos;ve already checked off. Items that would
          only repeat covered ground are left out. Open a Division above when you want to move from broad coverage into a more specific topic.
        </p>

        {recommendationsError ? (
          <div class="mt-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {recommendationsError}
          </div>
        ) : !partRecommendations ? (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Loading anchored recommendations for {topPart.partName}...
          </div>
        ) : recommendationSections.length > 0 ? (
          <div class="mt-3 space-y-4">
            {recommendationSections.map((section) =>
              renderAnchoredRecommendationSection(section, {
                topPart,
                topPartNumber,
                readingPref,
                checklistState,
                baseUrl,
              })
            )}
          </div>
        ) : (
          <div class="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No mapped readings are currently available for this Part. Open one of the Divisions above to keep moving through the outline.
          </div>
        )}
      </div>
    </>
  );
}
