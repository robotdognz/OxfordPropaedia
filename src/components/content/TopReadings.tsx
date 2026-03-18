import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import {
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

export interface ReadingItem {
  title: string;
  author?: string;
  count: number;
  sections?: number;
  paths?: number;
  relevance?: number;
}

export interface TopReadingsProps {
  vsi?: ReadingItem[];
  wiki?: ReadingItem[];
  macro?: ReadingItem[];
  baseUrl: string;
  contextLabel: string; // e.g., "this part" or "this division"
  countLabel: string; // e.g., "divisions" or "sections"
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function matchColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-500';
  if (percent >= 40) return 'bg-emerald-400';
  if (percent >= 20) return 'bg-amber-400';
  return 'bg-gray-300';
}

function buildRationale(item: ReadingItem, countLabel: string, contextLabel: string): string {
  const parts: string[] = [];
  parts.push(`Recommended across ${item.count} ${countLabel} in ${contextLabel}`);
  if (item.sections && item.sections > item.count) {
    parts.push(`appearing in ${item.sections} individual sections`);
  }
  if (item.paths && item.paths > (item.sections || item.count)) {
    parts.push(`with ${item.paths} outline topic references`);
  }
  return parts.join(', ') + '.';
}

export default function TopReadings({ vsi = [], wiki = [], macro = [], baseUrl, contextLabel, countLabel }: TopReadingsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [readingPref, setReadingPref] = useState<ReadingType>(() => getReadingPreference());

  useEffect(() => {
    setChecklistState(readChecklistState());
    const unsubChecklist = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const unsubPref = subscribeReadingPreference((type) => setReadingPref(type));
    return () => { unsubChecklist(); unsubPref(); };
  }, []);

  if (vsi.length === 0 && wiki.length === 0 && macro.length === 0) return null;

  // Use the pre-computed relevance score from the build script.
  // Falls back to 100 if not available (shouldn't happen with current data).

  return (
    <div class="space-y-4">
      <div>
        <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
          Recommended Readings
        </p>
        <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
          Books and articles recommended across multiple {countLabel} in {contextLabel}, ranked by spread and depth of coverage.
        </p>
      </div>

      {vsi.length > 0 && (
        <Accordion title={`Oxford VSI Recommendations (${vsi.length})`} forceOpenKey={readingPref === 'vsi' ? 0 : undefined} forceCloseKey={readingPref !== 'vsi' ? 0 : undefined}>
          <div class="mb-4 flex justify-end">
            <a
              href={`${baseUrl}/vsi`}
              class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              Browse all Oxford VSI books
            </a>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vsi.map((item) => {
              const checkKey = vsiChecklistKey(item.title, item.author || '');
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = item.relevance ?? 100;

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/vsi/${slugify(item.title)}`}
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
                  {item.author && <p class="mt-1 text-xs text-gray-400">{item.author}</p>}
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
                    <Accordion title="Why this book?" defaultOpen={false}>
                      <p class="text-gray-600">{buildRationale(item, countLabel, contextLabel)}</p>
                    </Accordion>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {wiki.length > 0 && (
        <Accordion title={`Wikipedia Article Recommendations (${wiki.length})`} forceOpenKey={readingPref === 'wikipedia' ? 0 : undefined} forceCloseKey={readingPref !== 'wikipedia' ? 0 : undefined}>
          <div class="mb-4 flex justify-end">
            <a
              href={`${baseUrl}/wikipedia`}
              class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              Browse all Wikipedia articles
            </a>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wiki.map((item) => {
              const checkKey = wikipediaChecklistKey(item.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = item.relevance ?? 100;

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/wikipedia/${slugify(item.title)}`}
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
                    <Accordion title="Why this article?" defaultOpen={false}>
                      <p class="text-gray-600">{buildRationale(item, countLabel, contextLabel)}</p>
                    </Accordion>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {macro.length > 0 && (
        <Accordion title={`Macropaedia Reading List (${macro.length})`} forceOpenKey={readingPref === 'macropaedia' ? 0 : undefined} forceCloseKey={readingPref !== 'macropaedia' ? 0 : undefined}>
          <div class="mb-4 flex justify-end">
            <a
              href={`${baseUrl}/macropaedia`}
              class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
            >
              Browse all Macropaedia articles
            </a>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {macro.map((item) => {
              const checkKey = macropaediaChecklistKey(item.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = item.relevance ?? 100;

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/macropaedia/${slugify(item.title)}`}
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
                    <Accordion title="Why this article?" defaultOpen={false}>
                      <p class="text-gray-600">{buildRationale(item, countLabel, contextLabel)}</p>
                    </Accordion>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}
    </div>
  );
}
