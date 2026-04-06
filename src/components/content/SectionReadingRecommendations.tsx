import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import VsiCard from './VsiCard';
import WikipediaCard from './WikipediaCard';
import IotCard from './IotCard';
import MacropaediaCard from './MacropaediaCard';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import type { ReadingType } from '../../utils/readingPreference';
import {
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  getHideCheckedReadings,
  getReadingPreference,
  setHideCheckedReadings,
  setReadingPreference,
  subscribeHideCheckedReadings,
  subscribeReadingPreference,
} from '../../utils/readingPreference';
import {
  iotChecklistKey,
  macropaediaChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  vsiChecklistKey,
  wikipediaChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  OUTLINE_SELECT_EVENT,
  filterMappingsForOutline,
  sortByDefaultRelevance,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';
import {
  filterArticlesForOutline,
} from '../../utils/wikipediaOutlineFilter';
import {
  filterEpisodesForOutline,
} from '../../utils/iotOutlineFilter';
import { classifyMappingPrecision, mappingPrecisionFlag } from '../../utils/mappingPrecision';
import { recommendationFlag } from '../../utils/recommendationCardMeta';
import type {
  SectionReadingRecommendationsPayload,
} from '../../utils/sectionReadingContext';

export interface SectionReadingRecommendationsProps extends SectionReadingRecommendationsPayload {
  baseUrl: string;
}

interface ActiveSectionRecommendationPanel {
  title: string;
  totalCount: number;
  matchedCount: number;
  visibleCount: number;
  toolbarLabel?: string;
  toolbarHref?: string;
  selectionNotice?: string | null;
  emptyMessage: string;
  body: h.JSX.Element;
}

function resolveAvailableReadingType(type: ReadingType, availableTypes: ReadingType[]): ReadingType {
  if (availableTypes.includes(type)) return type;
  return availableTypes[0] ?? 'vsi';
}

function resolvePreferredReadingType(
  availableTypes: ReadingType[],
  currentType?: ReadingType,
): ReadingType {
  const storedType = getReadingPreference();
  if (availableTypes.includes(storedType)) return storedType;
  if (currentType && availableTypes.includes(currentType)) return currentType;
  return availableTypes[0] ?? 'vsi';
}

function recommendationPanelClass() {
  return 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5';
}

function emptyStateClass() {
  return 'rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-amber-900/80';
}

function filteredEmptyMessage(
  typeLabel: string,
  matchedCount: number,
  hideChecked: boolean,
  selection: OutlineSelectionDetail | null,
  options?: { sectionLevelOnly?: boolean },
): string {
  if (hideChecked && matchedCount > 0) {
    if (options?.sectionLevelOnly) {
      return `All ${typeLabel} recommendations in this Section are hidden because they're marked done. Turn off Hide checked to review them again.`;
    }
    if (selection) {
      return `All ${typeLabel} recommendations for ${selection.outlinePath} are hidden because they're marked done. Turn off Hide checked to review them again.`;
    }
    return `All ${typeLabel} recommendations in this list are hidden because they're marked done. Turn off Hide checked to review them again.`;
  }

  if (options?.sectionLevelOnly && selection) {
    return 'Macropaedia is only mapped at section level here, so selecting a narrower outline topic does not narrow these recommendations.';
  }

  if (selection) {
    return `No ${typeLabel} recommendations match ${selection.outlinePath}.`;
  }

  return `No ${typeLabel} recommendations are available here right now.`;
}

function selectionSummaryLine(
  matchedCount: number,
  visibleCount: number,
  outlinePath: string,
): string {
  if (matchedCount === 0) {
    return `No matches for ${outlinePath}`;
  }
  if (visibleCount < matchedCount) {
    return `Showing ${visibleCount} of ${matchedCount} for ${outlinePath}`;
  }
  return `Showing ${matchedCount} for ${outlinePath}`;
}

function recommendationCountSubtitle(visibleCount: number, totalCount: number): string {
  const noun = totalCount === 1 ? 'recommendation' : 'recommendations';
  if (visibleCount === totalCount) {
    return `${totalCount} ${noun}`;
  }
  return `Showing ${visibleCount} of ${totalCount} ${noun}`;
}

function macropaediaCardRationale(selection: OutlineSelectionDetail | null): string {
  if (selection) {
    return 'This article is referenced directly from this Section. Macropaedia is mapped at section level here, so selecting a narrower outline topic does not narrow its scope.';
  }
  return 'This article is referenced directly from this Section, so it serves as a broader companion reading for the subject as a whole.';
}

export default function SectionReadingRecommendations({
  vsiMappings,
  wikiArticles,
  iotEpisodes,
  macropaediaReferences,
  sectionCode,
  sectionTitle,
  sectionOutlineText,
  baseUrl,
}: SectionReadingRecommendationsProps) {
  const wikiLevel = useWikipediaLevel();
  const typeCounts: Record<ReadingType, number> = {
    vsi: vsiMappings.length,
    wikipedia: wikiArticles.length,
    iot: iotEpisodes.length,
    macropaedia: macropaediaReferences.length,
  };
  const availableTypes = READING_TYPE_ORDER.filter((type) => typeCounts[type] > 0);
  const availableTypesKey = availableTypes.join('|');
  const [selectedType, setSelectedType] = useState<ReadingType>(() => resolvePreferredReadingType(availableTypes));
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [hideChecked, setHideChecked] = useState(() => getHideCheckedReadings());
  const panelRef = useRef<HTMLElement>(null);
  const activeType = resolveAvailableReadingType(selectedType, availableTypes);

  useEffect(() => {
    if (!availableTypes.length) return;
    setSelectedType((current) => resolvePreferredReadingType(availableTypes, current));
  }, [availableTypesKey]);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    return subscribeHideCheckedReadings((hide) => setHideChecked(hide));
  }, []);

  useEffect(() => {
    return subscribeReadingPreference((type) => {
      setSelectedType(resolveAvailableReadingType(type, availableTypes));
    });
  }, [availableTypesKey]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      setSelection(detail);
      if (panelRef.current) {
        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    };
    document.addEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
    return () => document.removeEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
  }, [sectionCode]);

  const typeOptions = READING_TYPE_ORDER.map((type) => ({
    value: type,
    eyebrow: READING_TYPE_UI_META[type].eyebrow,
    label: READING_TYPE_UI_META[type].label,
    disabled: typeCounts[type] === 0,
  }));

  const headerMeta = useMemo<ActiveSectionRecommendationPanel>(() => {
    if (activeType === 'vsi') {
      const scoredMappings = sortByDefaultRelevance(vsiMappings, sectionTitle, sectionOutlineText);
      const visibleMappings = selection ? filterMappingsForOutline(scoredMappings, selection) : scoredMappings;
      const displayMappings = hideChecked
        ? visibleMappings.filter((mapping) => !checklistState[vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor)])
        : visibleMappings;
      const maxScore = selection
        ? Math.max(...displayMappings.map((mapping) => mapping.filterScore ?? 0), 1)
        : Math.max(...scoredMappings.map((mapping) => mapping.relevanceScore ?? 0), 1);

      return {
        title: 'Recommendations',
        totalCount: scoredMappings.length,
        matchedCount: visibleMappings.length,
        visibleCount: displayMappings.length,
        emptyMessage: filteredEmptyMessage(
          READING_TYPE_UI_META.vsi.label,
          visibleMappings.length,
          hideChecked,
          selection,
        ),
        body: displayMappings.length > 0 ? (
          <HorizontalCardScroll resetKey={activeType} singleCardOnMobile>
            {displayMappings.map((mapping, index) => {
              const checklistKey = vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor);
              const relevanceScore = mapping.filterScore ?? mapping.relevanceScore ?? 0;
              const precision = mappingPrecisionFlag(
                classifyMappingPrecision(mapping.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <VsiCard
                  key={`${mapping.vsiTitle}-${mapping.vsiAuthor}-${index}`}
                  title={mapping.vsiTitle}
                  author={mapping.vsiAuthor}
                  rationale={mapping.rationaleAI}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  publicationYear={mapping.publicationYear}
                  edition={mapping.edition}
                  matchPercent={Math.round(Math.min(relevanceScore / maxScore, 1) * 100)}
                  flags={[precision]}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>{filteredEmptyMessage(
            READING_TYPE_UI_META.vsi.label,
            visibleMappings.length,
            hideChecked,
            selection,
          )}</div>
        ),
      };
    }

    if (activeType === 'wikipedia') {
      const levelFiltered = wikiArticles.filter((article) => (article.lowestLevel || 3) <= wikiLevel);
      const visibleArticles = selection
        ? filterArticlesForOutline(levelFiltered, selection)
        : [...levelFiltered].sort((left, right) => (right.matchPercent || 0) - (left.matchPercent || 0));
      const displayArticles = hideChecked
        ? visibleArticles.filter((article) => !checklistState[wikipediaChecklistKey(article.title)])
        : visibleArticles;
      const maxScore = selection
        ? Math.max(...displayArticles.map((article) => article.filterScore || 0), 1)
        : Math.max(...displayArticles.map((article) => article.matchPercent || 0), 1);

      return {
        title: 'Recommendations',
        totalCount: levelFiltered.length,
        matchedCount: visibleArticles.length,
        visibleCount: displayArticles.length,
        emptyMessage: filteredEmptyMessage(
          READING_TYPE_UI_META.wikipedia.label,
          visibleArticles.length,
          hideChecked,
          selection,
        ),
        body: displayArticles.length > 0 ? (
          <HorizontalCardScroll resetKey={activeType} singleCardOnMobile>
            {displayArticles.map((article) => {
              const checklistKey = wikipediaChecklistKey(article.title);
              const precision = mappingPrecisionFlag(
                classifyMappingPrecision(article.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <WikipediaCard
                  key={article.title}
                  title={article.title}
                  displayTitle={article.displayTitle}
                  wordCount={article.wordCount}
                  rationale={article.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={selection
                    ? Math.round(Math.min((article.filterScore || 0) / maxScore, 1) * 100)
                    : (article.matchPercent || 0)}
                  flags={[precision]}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>{filteredEmptyMessage(
            READING_TYPE_UI_META.wikipedia.label,
            visibleArticles.length,
            hideChecked,
            selection,
          )}</div>
        ),
      };
    }

    if (activeType === 'iot') {
      const visibleEpisodes = selection
        ? filterEpisodesForOutline(iotEpisodes, selection)
        : [...iotEpisodes].sort((left, right) => (right.matchPercent || 0) - (left.matchPercent || 0));
      const displayEpisodes = hideChecked
        ? visibleEpisodes.filter((episode) => !checklistState[iotChecklistKey(episode.pid)])
        : visibleEpisodes;
      const maxScore = selection
        ? Math.max(...displayEpisodes.map((episode) => episode.filterScore || 0), 1)
        : Math.max(...displayEpisodes.map((episode) => episode.matchPercent || 0), 1);

      return {
        title: 'Recommendations',
        totalCount: iotEpisodes.length,
        matchedCount: visibleEpisodes.length,
        visibleCount: displayEpisodes.length,
        emptyMessage: filteredEmptyMessage(
          READING_TYPE_UI_META.iot.label,
          visibleEpisodes.length,
          hideChecked,
          selection,
        ),
        body: displayEpisodes.length > 0 ? (
          <HorizontalCardScroll resetKey={activeType} singleCardOnMobile>
            {displayEpisodes.map((episode) => {
              const checklistKey = iotChecklistKey(episode.pid);
              const precision = mappingPrecisionFlag(
                classifyMappingPrecision(episode.relevantPathsAI, selection?.outlinePath ?? null),
              );

              return (
                <IotCard
                  key={episode.pid}
                  pid={episode.pid}
                  title={episode.title}
                  synopsis={episode.synopsis}
                  rationale={episode.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={selection
                    ? Math.round(Math.min((episode.filterScore || 0) / maxScore, 1) * 100)
                    : (episode.matchPercent || 0)}
                  flags={[precision]}
                  datePublished={episode.datePublished}
                  durationSeconds={episode.durationSeconds}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class={emptyStateClass()}>{filteredEmptyMessage(
            READING_TYPE_UI_META.iot.label,
            visibleEpisodes.length,
            hideChecked,
            selection,
          )}</div>
        ),
      };
    }

    const visibleReferences = hideChecked
      ? macropaediaReferences.filter((reference) => !checklistState[macropaediaChecklistKey(reference)])
      : macropaediaReferences;

    return {
      title: 'Recommendations',
      totalCount: macropaediaReferences.length,
      matchedCount: macropaediaReferences.length,
      visibleCount: visibleReferences.length,
      selectionNotice: selection
        ? 'Macropaedia is only mapped at section level here, so selecting a narrower outline topic does not narrow these recommendations.'
        : null,
      emptyMessage: filteredEmptyMessage(
        READING_TYPE_UI_META.macropaedia.label,
        macropaediaReferences.length,
        hideChecked,
        selection,
        { sectionLevelOnly: true },
      ),
      body: visibleReferences.length > 0 ? (
        <HorizontalCardScroll resetKey={activeType} singleCardOnMobile>
          {visibleReferences.map((reference) => {
            const checklistKey = macropaediaChecklistKey(reference);
            const isChecked = Boolean(checklistState[checklistKey]);

            return (
              <MacropaediaCard
                key={reference}
                title={reference}
                rationale={<p class="text-gray-600">{macropaediaCardRationale(selection)}</p>}
                baseUrl={baseUrl}
                flags={[
                  recommendationFlag('Section reference'),
                  recommendationFlag('Section-level mapping'),
                ]}
                checked={isChecked}
                onCheckedChange={(checked) => {
                  writeChecklistState(checklistKey, checked);
                }}
              />
            );
          })}
        </HorizontalCardScroll>
      ) : (
        <div class={emptyStateClass()}>{filteredEmptyMessage(
          READING_TYPE_UI_META.macropaedia.label,
          macropaediaReferences.length,
          hideChecked,
          selection,
          { sectionLevelOnly: true },
        )}</div>
      ),
    };
  }, [
    activeType,
    baseUrl,
    checklistState,
    hideChecked,
    iotEpisodes,
    macropaediaReferences,
    sectionCode,
    sectionOutlineText,
    sectionTitle,
    selection,
    vsiMappings,
    wikiArticles,
    wikiLevel,
  ]);

  if (!availableTypes.length) return null;

  return (
    <section ref={panelRef} class="space-y-3">
      <ReadingSelectionStrip
        readingTypeValue={activeType}
        readingTypeOptions={typeOptions}
        onReadingTypeChange={(type) => {
          if (typeCounts[type] === 0) return;
          setSelectedType(type);
          setReadingPreference(type);
        }}
        readingTypeAriaLabel="Section reading type"
        showWikipediaLevelSelector
        supplementaryControls={(
          <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[0.72rem] font-semibold tracking-[0.08em] text-slate-600 shadow-sm shadow-slate-200/60 cursor-pointer select-none transition hover:border-slate-300 hover:bg-white">
            <input
              type="checkbox"
              checked={hideChecked}
              onChange={(event) => setHideCheckedReadings((event.currentTarget as HTMLInputElement).checked)}
              class="h-3.5 w-3.5 rounded border-slate-300 text-slate-700 focus:ring-slate-400"
            />
            Hide checked
          </label>
        )}
      />

      <section class={recommendationPanelClass()}>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-amber-800">
              {headerMeta.title}
            </h2>
            <p class="mt-1 text-xs font-medium text-amber-900/70">
              {recommendationCountSubtitle(headerMeta.visibleCount, headerMeta.totalCount)}
            </p>
          </div>
          {headerMeta.toolbarLabel ? (
            <div class="flex flex-wrap items-center gap-3 text-xs">
              {headerMeta.toolbarHref ? (
                <a
                  href={headerMeta.toolbarHref}
                  class="font-medium text-amber-900/75 underline decoration-amber-300 underline-offset-2 transition hover:text-amber-950 hover:decoration-amber-500"
                >
                  {headerMeta.toolbarLabel}
                </a>
              ) : (
                <span class="font-medium text-amber-900/75">
                  {headerMeta.toolbarLabel}
                </span>
              )}
            </div>
          ) : null}
        </div>

        {selection ? (
          <div class="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white/85 px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-sm font-medium text-amber-950">
                {selectionSummaryLine(
                  headerMeta.matchedCount,
                  headerMeta.visibleCount,
                  selection.outlinePath,
                )}
              </p>
              <p class="mt-1 text-xs leading-5 text-amber-900/80">
                {headerMeta.selectionNotice ?? selection.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              class="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100/70"
            >
              Show all
            </button>
          </div>
        ) : null}

        <div class="mt-4">
          {headerMeta.body}
        </div>
      </section>
    </section>
  );
}
