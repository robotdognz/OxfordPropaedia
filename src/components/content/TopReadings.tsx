import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
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
import { slugify } from '../../utils/helpers';

export interface ReadingItem {
  title: string;
  author?: string;
  pid?: string;
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
  getHref: (item: ReadingItem) => string;
  showAuthor: boolean;
}

function matchColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-500';
  if (percent >= 40) return 'bg-emerald-400';
  if (percent >= 20) return 'bg-amber-400';
  return 'bg-gray-300';
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

export default function TopReadings({
  vsi = [],
  wiki = [],
  iot = [],
  macro = [],
  baseUrl,
  contextLabel,
  countLabel,
}: TopReadingsProps) {
  const sections: TopReadingSection[] = [
    {
      type: 'vsi',
      items: vsi,
      title: 'Recommendations',
      whyLabel: 'Why this book?',
      getCheckKey: (item) => vsiChecklistKey(item.title, item.author || ''),
      getHref: (item) => `${baseUrl}/vsi/${slugify(item.title)}`,
      showAuthor: true,
    },
    {
      type: 'iot',
      items: iot,
      title: 'Recommendations',
      whyLabel: 'Why this episode?',
      getCheckKey: (item) => iotChecklistKey(item.pid || item.title),
      getHref: (item) => item.pid ? `${baseUrl}/iot/${item.pid}` : `${baseUrl}/iot`,
      showAuthor: false,
    },
    {
      type: 'wikipedia',
      items: wiki,
      title: 'Recommendations',
      whyLabel: 'Why this article?',
      getCheckKey: (item) => wikipediaChecklistKey(item.title),
      getHref: (item) => `${baseUrl}/wikipedia/${slugify(item.title)}`,
      showAuthor: false,
    },
    {
      type: 'macropaedia',
      items: macro,
      title: 'Recommendations',
      whyLabel: 'Why this article?',
      getCheckKey: (item) => macropaediaChecklistKey(item.title),
      getHref: (item) => `${baseUrl}/macropaedia/${slugify(item.title)}`,
      showAuthor: false,
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
  const visibleItems = hideChecked
    ? activeSection.items.filter((item) => !checklistState[activeSection.getCheckKey(item)])
    : activeSection.items;

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
        supplementaryControls={(
          <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 font-medium text-slate-600 cursor-pointer select-none transition hover:border-slate-300 hover:bg-white">
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
          <h2 class="flex items-baseline gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-amber-800">
            <span>{activeSection.title}</span>
            <span class="text-[0.68rem] font-medium tracking-[0.12em] text-amber-900/70">
              ({visibleItems.length})
            </span>
          </h2>
        </div>

        <div class="mt-4">
          {visibleItems.length > 0 ? (
            <HorizontalCardScroll key={activeSection.type} singleCardOnMobile>
              {visibleItems.map((item) => {
                const checkKey = activeSection.getCheckKey(item);
                const isChecked = Boolean(checklistState[checkKey]);
                const matchPercent = item.relevance ?? 100;

                return (
                  <div
                    key={`${activeSection.type}-${item.pid ?? item.title}`}
                    class={`rounded-xl border border-amber-200 bg-white p-4 transition-shadow duration-200 hover:shadow-md ${isChecked ? 'bg-slate-200/70 opacity-50' : ''}`}
                  >
                    <div class="flex items-start justify-between gap-2">
                      <a
                        href={activeSection.getHref(item)}
                        class="font-serif font-bold text-gray-900 text-base leading-tight transition-colors hover:text-indigo-700"
                      >
                        {item.title}
                      </a>
                      <label class="flex shrink-0 items-center gap-1 text-xs font-sans text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => writeChecklistState(checkKey, (event.currentTarget as HTMLInputElement).checked)}
                          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Done
                      </label>
                    </div>
                    {activeSection.showAuthor && item.author ? (
                      <p class="mt-1 text-xs text-gray-400">{item.author}</p>
                    ) : null}
                    <div class="mt-3 flex items-center gap-2">
                      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          class={`h-full rounded-full ${matchColor(matchPercent)}`}
                          style={{ width: `${matchPercent}%` }}
                        />
                      </div>
                      <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">{matchPercent}% relevance</span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                      <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                        {item.count} {item.count === 1 ? countLabel.slice(0, -1) : countLabel}
                      </span>
                      {item.sections && item.sections > item.count ? (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                          {item.sections} Sections
                        </span>
                      ) : null}
                      {item.paths ? (
                        <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                          {item.paths} mapped topics
                        </span>
                      ) : null}
                    </div>
                    <div class="mt-3">
                      <Accordion title={activeSection.whyLabel} defaultOpen={false}>
                        <p class="text-gray-600">{buildRationale(item, countLabel, contextLabel)}</p>
                      </Accordion>
                    </div>
                  </div>
                );
              })}
            </HorizontalCardScroll>
          ) : (
            <div class="rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-amber-900/80">
              {emptyStateMessage(activeType, hideChecked, activeSection.items.length)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
