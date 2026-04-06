import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useWikipediaLevel } from '../../hooks/useWikipediaLevel';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import VsiCard from './VsiCard';
import IotCard from './IotCard';
import WikipediaCard from './WikipediaCard';
import MacropaediaCard from './MacropaediaCard';
import {
  recommendationBadge,
  type RecommendationCardBadge,
} from '../../utils/recommendationCardMeta';
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
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  getHideCheckedReadings,
  getReadingPreference,
  setHideCheckedReadings,
  setReadingPreference,
  subscribeHideCheckedReadings,
  subscribeReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';
import { filterWikipediaLevel } from '../../utils/wikipediaLevel';

export interface ReadingItem {
  title: string;
  displayTitle?: string;
  author?: string;
  pid?: string;
  lowestLevel?: number;
  wordCount?: number;
  publicationYear?: number;
  edition?: number;
  datePublished?: string;
  durationSeconds?: number;
  count: number;
  sections?: number;
  paths?: number;
  relevance?: number;
}

export interface TopReadingsProps {
  vsi?: ReadingItem[];
  wiki?: ReadingItem[];
  iot?: ReadingItem[];
  macro?: ReadingItem[];
  baseUrl: string;
  contextLabel: string;
  countLabel: string;
}

interface TopReadingSection {
  type: ReadingType;
  items: ReadingItem[];
  title: string;
  whyLabel: string;
  getCheckKey: (item: ReadingItem) => string;
}

function buildRationale(item: ReadingItem, countLabel: string, contextLabel: string): string {
  const lines: string[] = [];

  if (item.count <= 1) {
    lines.push(`One of the most relevant resources in ${contextLabel}, included here as a top recommendation from its section.`);
  } else if (item.count >= 3) {
    lines.push(`This appears across ${item.count} ${countLabel} in ${contextLabel}, making it one of the most broadly relevant resources here.`);
  } else {
    lines.push(`This appears across ${item.count} ${countLabel} in ${contextLabel}.`);
  }

  if (item.count > 1 && item.sections && item.sections > item.count) {
    lines.push(`It's referenced in ${item.sections} individual sections, suggesting it covers topics that recur across different areas.`);
  }

  if (item.paths && item.paths > (item.sections || item.count)) {
    lines.push(`The outline maps it to ${item.paths} specific topics, indicating deep rather than surface-level relevance.`);
  }

  if (item.count > 1) {
    if ((item.relevance ?? 100) >= 90) {
      lines.push('Ranked highly because its coverage is both broad and evenly spread.');
    } else if ((item.relevance ?? 100) >= 60) {
      lines.push('Ranked by how evenly its coverage spreads across the outline.');
    }
  }

  return lines.join(' ');
}

function singularizeCountLabel(label: string): string {
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

function buildRecommendationBadges(item: ReadingItem, countLabel: string): RecommendationCardBadge[] {
  const badges: RecommendationCardBadge[] = [
    recommendationBadge(
      `${item.count} ${item.count === 1 ? singularizeCountLabel(countLabel) : countLabel}`,
      'accent',
    ),
  ];

  if (item.sections && item.sections > item.count) {
    badges.push(recommendationBadge(`${item.sections} Sections`));
  }

  if (item.paths) {
    badges.push(recommendationBadge(`${item.paths} mapped topics`));
  }

  return badges;
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

function emptyStateMessage(type: ReadingType, hideChecked: boolean, matchedCount: number): string {
  if (hideChecked && matchedCount > 0) {
    return `All ${READING_TYPE_UI_META[type].label} recommendations in this list are hidden because they're marked done. Turn off Hide checked to review them again.`;
  }
  return `No ${READING_TYPE_UI_META[type].label} recommendations are available here right now.`;
}

function recommendationCountSubtitle(visibleCount: number, totalCount: number): string {
  const noun = totalCount === 1 ? 'recommendation' : 'recommendations';
  if (visibleCount === totalCount) {
    return `${totalCount} ${noun}`;
  }
  return `Showing ${visibleCount} of ${totalCount} ${noun}`;
}

export default function TopReadings({
  vsi = [],
  wiki = [],
  iot = [],
  macro = [],
  baseUrl,
  contextLabel,
  countLabel,
}: TopReadingsProps) {
  const wikiLevel = useWikipediaLevel();
  const sections: TopReadingSection[] = [
    {
      type: 'vsi',
      items: vsi,
      title: 'Recommendations',
      whyLabel: 'Why this book?',
      getCheckKey: (item) => vsiChecklistKey(item.title, item.author || ''),
    },
    {
      type: 'iot',
      items: iot,
      title: 'Recommendations',
      whyLabel: 'Why this episode?',
      getCheckKey: (item) => iotChecklistKey(item.pid || item.title),
    },
    {
      type: 'wikipedia',
      items: wiki,
      title: 'Recommendations',
      whyLabel: 'Why this article?',
      getCheckKey: (item) => wikipediaChecklistKey(item.title),
    },
    {
      type: 'macropaedia',
      items: macro,
      title: 'Recommendations',
      whyLabel: 'Why this article?',
      getCheckKey: (item) => macropaediaChecklistKey(item.title),
    },
  ].filter((section) => section.items.length > 0);

  const availableTypes = sections.map((section) => section.type);
  const availableTypesKey = availableTypes.join('|');
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [readingPref, setReadingPrefState] = useState<ReadingType>(() => resolvePreferredReadingType(availableTypes));
  const [hideChecked, setHideChecked] = useState(() => getHideCheckedReadings());

  useEffect(() => {
    if (!availableTypes.length) return;
    setReadingPrefState((current) => resolvePreferredReadingType(availableTypes, current));
  }, [availableTypesKey]);

  useEffect(() => {
    setChecklistState(readChecklistState());
    const unsubChecklist = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const unsubPref = subscribeReadingPreference((type) => setReadingPrefState(resolveAvailableReadingType(type, availableTypes)));
    const unsubHide = subscribeHideCheckedReadings((hide) => setHideChecked(hide));
    return () => {
      unsubChecklist();
      unsubPref();
      unsubHide();
    };
  }, [availableTypesKey]);

  if (sections.length === 0) return null;

  const activeType = resolveAvailableReadingType(readingPref, availableTypes);
  const activeSection = sections.find((section) => section.type === activeType) ?? sections[0];
  const levelFilteredItems = activeSection.type === 'wikipedia'
    ? filterWikipediaLevel(activeSection.items, wikiLevel)
    : activeSection.items;
  const visibleItems = hideChecked
    ? levelFilteredItems.filter((item) => !checklistState[activeSection.getCheckKey(item)])
    : levelFilteredItems;

  return (
    <div class="space-y-4">
      <div>
        <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
          Recommended Readings
        </p>
        <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
          The most relevant books, articles, and episodes for {contextLabel}, ranked by how broadly and deeply they cover the subject matter.
        </p>
      </div>

      <ReadingSelectionStrip
        readingTypeValue={activeType}
        readingTypeOptions={READING_TYPE_ORDER.map((type) => ({
          value: type,
          eyebrow: READING_TYPE_UI_META[type].eyebrow,
          label: READING_TYPE_UI_META[type].label,
          disabled: !availableTypes.includes(type),
        }))}
        onReadingTypeChange={(type) => {
          if (!availableTypes.includes(type)) return;
          setReadingPrefState(type);
          setReadingPreference(type);
        }}
        readingTypeAriaLabel={`Recommended reading type for ${contextLabel}`}
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

      <section class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
        <div class="min-w-0">
          <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-amber-800">
            {activeSection.title}
          </h2>
          <p class="mt-1 text-xs font-medium text-amber-900/70">
            {recommendationCountSubtitle(visibleItems.length, levelFilteredItems.length)}
          </p>
        </div>

        <div class="mt-4">
          {visibleItems.length > 0 ? (
            <HorizontalCardScroll resetKey={activeSection.type} singleCardOnMobile>
              {visibleItems.map((item) => {
                const checkKey = activeSection.getCheckKey(item);
                const isChecked = Boolean(checklistState[checkKey]);
                const matchPercent = item.relevance ?? 100;
                const badges = buildRecommendationBadges(item, countLabel);
                const rationale = buildRationale(item, countLabel, contextLabel);

                if (activeSection.type === 'vsi') {
                  return (
                    <VsiCard
                      key={`${activeSection.type}-${item.title}-${item.author ?? ''}`}
                      title={item.title}
                      author={item.author}
                      rationale={rationale}
                      whyTitle={activeSection.whyLabel}
                      baseUrl={baseUrl}
                      publicationYear={item.publicationYear}
                      edition={item.edition}
                      matchPercent={matchPercent}
                      badges={badges}
                      checked={isChecked}
                      onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                    />
                  );
                }

                if (activeSection.type === 'iot') {
                  return (
                    <IotCard
                      key={`${activeSection.type}-${item.pid ?? item.title}`}
                      pid={item.pid}
                      title={item.title}
                      rationale={rationale}
                      whyTitle={activeSection.whyLabel}
                      baseUrl={baseUrl}
                      datePublished={item.datePublished}
                      durationSeconds={item.durationSeconds}
                      matchPercent={matchPercent}
                      badges={badges}
                      checked={isChecked}
                      onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                    />
                  );
                }

                if (activeSection.type === 'wikipedia') {
                  return (
                    <WikipediaCard
                      key={`${activeSection.type}-${item.title}`}
                      title={item.title}
                      displayTitle={item.displayTitle}
                      wordCount={item.wordCount}
                      rationale={rationale}
                      whyTitle={activeSection.whyLabel}
                      baseUrl={baseUrl}
                      matchPercent={matchPercent}
                      badges={badges}
                      checked={isChecked}
                      onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                    />
                  );
                }

                return (
                  <MacropaediaCard
                    key={`${activeSection.type}-${item.title}`}
                    title={item.title}
                    rationale={<p class="text-gray-600">{rationale}</p>}
                    whyTitle={activeSection.whyLabel}
                    baseUrl={baseUrl}
                    matchPercent={matchPercent}
                    badges={badges}
                    checked={isChecked}
                    onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                  />
                );
              })}
            </HorizontalCardScroll>
          ) : (
            <div class="rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-amber-900/80">
              {emptyStateMessage(activeType, hideChecked, levelFilteredItems.length)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
