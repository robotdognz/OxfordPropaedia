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

export interface ReadingItem {
  title: string;
  author?: string;
  count: number;
}

export interface TopReadingsProps {
  vsi?: ReadingItem[];
  wiki?: ReadingItem[];
  macro?: ReadingItem[];
  baseUrl: string;
  contextLabel: string; // e.g., "this part" or "this division"
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function TopReadings({ vsi = [], wiki = [], macro = [], baseUrl, contextLabel }: TopReadingsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => setChecklistState(readChecklistState()));
  }, []);

  if (vsi.length === 0 && wiki.length === 0 && macro.length === 0) return null;

  const maxVsi = vsi.length > 0 ? vsi[0].count : 1;
  const maxWiki = wiki.length > 0 ? wiki[0].count : 1;
  const maxMacro = macro.length > 0 ? macro[0].count : 1;

  return (
    <div class="space-y-4">
      <div>
        <h2 class="text-2xl font-sans font-bold text-gray-800">Recommended Readings</h2>
        <p class="mt-1 text-sm text-slate-500">
          The most frequently recommended books and articles across sections in {contextLabel}, ranked by how many sections include them.
        </p>
      </div>

      {vsi.length > 0 && (
        <Accordion title={`Oxford VSI Recommendations (${vsi.length})`}>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vsi.map((item) => {
              const checkKey = vsiChecklistKey(item.title, item.author || '');
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = Math.round((item.count / maxVsi) * 100);

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border bg-white p-4 transition ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/vsi/${slugify(item.title)}`}
                      class="text-sm font-serif font-semibold text-gray-900 hover:text-indigo-700 transition-colors"
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
                        class="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${matchPercent}%` }}
                      />
                    </div>
                    <span class="text-[10px] font-sans text-gray-400 tabular-nums shrink-0">{item.count} sections</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {wiki.length > 0 && (
        <Accordion title={`Wikipedia Article Recommendations (${wiki.length})`}>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wiki.map((item) => {
              const checkKey = wikipediaChecklistKey(item.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = Math.round((item.count / maxWiki) * 100);

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border bg-white p-4 transition ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/wikipedia/${slugify(item.title)}`}
                      class="text-sm font-serif font-semibold text-gray-900 hover:text-indigo-700 transition-colors"
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
                        class="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${matchPercent}%` }}
                      />
                    </div>
                    <span class="text-[10px] font-sans text-gray-400 tabular-nums shrink-0">{item.count} sections</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}

      {macro.length > 0 && (
        <Accordion title={`Macropaedia Reading List (${macro.length})`}>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {macro.map((item) => {
              const checkKey = macropaediaChecklistKey(item.title);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = Math.round((item.count / maxMacro) * 100);

              return (
                <div
                  key={item.title}
                  class={`rounded-lg border bg-white p-4 transition ${isChecked ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}
                >
                  <div class="flex items-start justify-between gap-2">
                    <a
                      href={`${baseUrl}/macropaedia/${slugify(item.title)}`}
                      class="text-sm font-serif font-semibold text-gray-900 hover:text-indigo-700 transition-colors"
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
                        class="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${matchPercent}%` }}
                      />
                    </div>
                    <span class="text-[10px] font-sans text-gray-400 tabular-nums shrink-0">{item.count} sections</span>
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
