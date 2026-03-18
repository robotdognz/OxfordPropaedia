import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import { slugify } from '../../utils/helpers';
import {
  macropaediaChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  OUTLINE_SELECT_EVENT,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';
import { getReadingPreference } from '../../utils/readingPreference';
import { ACCORDION_ANIMATION_MS } from '../ui/Accordion';

export interface MacropaediaRefsProps {
  references: string[];
  sectionCode?: string;
  baseUrl: string;
}

export default function MacropaediaRefs({ references, sectionCode, baseUrl }: MacropaediaRefsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(() => getReadingPreference() === 'macropaedia' ? 0 : undefined);
  const [forceCloseKey, setForceCloseKey] = useState<number | undefined>(() => getReadingPreference() !== 'macropaedia' ? 0 : undefined);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    if (!sectionCode) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      if (getReadingPreference() === 'macropaedia') {
        setForceOpenKey(Date.now());
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, ACCORDION_ANIMATION_MS + 50);
      } else {
        setForceCloseKey(Date.now());
      }
    };
    document.addEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
    return () => document.removeEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
  }, [sectionCode]);

  if (!references || references.length === 0) return null;

  return (
    <section ref={sectionRef} class="scroll-mt-24">
    <Accordion title={`Macropaedia Reading List (${references.length})`} forceOpenKey={forceOpenKey} forceCloseKey={forceCloseKey}>
      <div class="mb-4 flex justify-end">
        <a
          href={`${baseUrl}/macropaedia`}
          class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
        >
          Browse all Macropaedia articles
        </a>
      </div>

      <ul class="space-y-2">
        {references.map((ref, i) => {
          const checklistKey = macropaediaChecklistKey(ref);
          const isChecked = Boolean(checklistState[checklistKey]);

          return (
            <li key={i} class="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-gray-500 hover:bg-gray-50">
              {/* Book icon */}
              <svg
                class="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width={1.5}
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
              <a
                href={`${baseUrl}/macropaedia/${slugify(ref)}`}
                class={`min-w-0 flex-1 text-sm italic leading-snug hover:text-indigo-700 transition-colors ${isChecked ? 'text-gray-400 line-through' : 'text-gray-500'}`}
              >
                {ref}
              </a>
              <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-sans font-medium text-gray-500">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => {
                    writeChecklistState(checklistKey, (event.currentTarget as HTMLInputElement).checked);
                  }}
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  aria-label={`Mark ${ref} as completed`}
                />
                Done
              </label>
            </li>
          );
        })}
      </ul>
    </Accordion>
    </section>
  );
}
