import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import {
  iotChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
  vsiChecklistKey,
  wikipediaChecklistKey,
  macropaediaChecklistKey,
} from '../../utils/readingChecklist';
import {
  getReadingPreference,
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
  contextLabel: string; // e.g., "this part" or "this division"
  countLabel: string; // e.g., "divisions" or "sections"
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

export default function TopReadings({ vsi = [], wiki = [], iot = [], macro = [], baseUrl, contextLabel, countLabel }: TopReadingsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [readingPref, setReadingPref] = useState<ReadingType>(() => getReadingPreference());

  useEffect(() => {
    setChecklistState(readChecklistState());
    const unsubChecklist = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const unsubPref = subscribeReadingPreference((type) => setReadingPref(type));
    return () => { unsubChecklist(); unsubPref(); };
  }, []);

  if (vsi.length === 0 && wiki.length === 0 && iot.length === 0 && macro.length === 0) return null;

  // Use the pre-computed relevance score from the build script.
  // Falls back to 100 if not available (shouldn't happen with current data).

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

      {[
        { type: 'vsi' as const, items: vsi, title: `Oxford VSI Recommendations (${vsi.length})`, browseHref: `${baseUrl}/vsi#vsi-library`, browseLabel: 'Browse all Oxford VSI books', whyLabel: 'Why this book?', getCheckKey: (item: ReadingItem) => vsiChecklistKey(item.title, item.author || ''), getHref: (item: ReadingItem) => `${baseUrl}/vsi/${slugify(item.title)}`, showAuthor: true },
        { type: 'wikipedia' as const, items: wiki, title: `Wikipedia Article Recommendations (${wiki.length})`, browseHref: `${baseUrl}/wikipedia#wikipedia-library`, browseLabel: 'Browse all Wikipedia articles', whyLabel: 'Why this article?', getCheckKey: (item: ReadingItem) => wikipediaChecklistKey(item.title), getHref: (item: ReadingItem) => `${baseUrl}/wikipedia/${slugify(item.title)}`, showAuthor: false },
        { type: 'iot' as const, items: iot, title: `BBC In Our Time Episodes (${iot.length})`, browseHref: `${baseUrl}/iot#iot-library`, browseLabel: 'Browse all BBC In Our Time episodes', whyLabel: 'Why this episode?', getCheckKey: (item: ReadingItem) => iotChecklistKey(item.pid || item.title), getHref: (item: ReadingItem) => item.pid ? `${baseUrl}/iot/${item.pid}` : `${baseUrl}/iot`, showAuthor: false },
        { type: 'macropaedia' as const, items: macro, title: `Macropaedia Reading List (${macro.length})`, browseHref: `${baseUrl}/macropaedia#macropaedia-library`, browseLabel: 'Browse all Macropaedia articles', whyLabel: 'Why this article?', getCheckKey: (item: ReadingItem) => macropaediaChecklistKey(item.title), getHref: (item: ReadingItem) => `${baseUrl}/macropaedia/${slugify(item.title)}`, showAuthor: false },
      ]
        .filter(s => s.items.length > 0)
        .sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0))
        .map((section) => (
        <Accordion key={section.type} title={section.title} forceOpenKey={readingPref === section.type ? 0 : undefined} forceCloseKey={readingPref !== section.type ? 0 : undefined}>
          <div class="mb-4 flex justify-end">
            <a
              href={section.browseHref}
              class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              {section.browseLabel}
            </a>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const checkKey = section.getCheckKey(item);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = item.relevance ?? 100;

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-slate-300 bg-slate-200/70 opacity-50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={section.getHref(item)}
                      class="font-serif font-bold text-gray-900 text-base leading-tight hover:text-indigo-700 transition-colors"
                    >
                      {item.title}
                    </a>
                    <label class="flex shrink-0 items-center gap-1 text-xs font-sans text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => writeChecklistState(checkKey, (e.currentTarget as HTMLInputElement).checked)}
                        class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Done
                    </label>
                  </div>
                  {section.showAuthor && item.author && <p class="mt-1 text-xs text-gray-400">{item.author}</p>}
                  <div class="mt-3 flex items-center gap-2">
                    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        class={`h-full rounded-full ${matchColor(matchPercent)}`}
                        style={{ width: `${matchPercent}%` }}
                      />
                    </div>
                    <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">{matchPercent}% relevance</span>
                  </div>
                  <div class="mt-2">
                    <Accordion title={section.whyLabel} defaultOpen={false}>
                      <p class="text-gray-600">{buildRationale(item, countLabel, contextLabel)}</p>
                    </Accordion>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      ))}
    </div>
  );
}
