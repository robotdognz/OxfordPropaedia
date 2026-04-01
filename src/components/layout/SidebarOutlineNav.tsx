import { h } from 'preact';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { SidebarNavigationPayload } from '../../utils/sidebarNavigation';

interface SidebarOutlineNavProps {
  navUrl: string;
  currentPartNumber?: number;
  currentDivisionId?: string;
  currentSectionCode?: string;
}

const partTextColors: Record<number, string> = {
  1: 'text-part-1',
  2: 'text-part-2',
  3: 'text-part-3',
  4: 'text-part-4',
  5: 'text-part-5',
  6: 'text-part-6',
  7: 'text-part-7',
  8: 'text-part-8',
  9: 'text-part-9',
  10: 'text-part-10',
};

const partBgLightColors: Record<number, string> = {
  1: 'bg-part-1-light',
  2: 'bg-part-2-light',
  3: 'bg-part-3-light',
  4: 'bg-part-4-light',
  5: 'bg-part-5-light',
  6: 'bg-part-6-light',
  7: 'bg-part-7-light',
  8: 'bg-part-8-light',
  9: 'bg-part-9-light',
  10: 'bg-part-10-light',
};

const partBorderColors: Record<number, string> = {
  1: 'border-part-1',
  2: 'border-part-2',
  3: 'border-part-3',
  4: 'border-part-4',
  5: 'border-part-5',
  6: 'border-part-6',
  7: 'border-part-7',
  8: 'border-part-8',
  9: 'border-part-9',
  10: 'border-part-10',
};

export default function SidebarOutlineNav({
  navUrl,
  currentPartNumber,
  currentDivisionId,
  currentSectionCode,
}: SidebarOutlineNavProps) {
  const { data, error } = useJsonPayload<SidebarNavigationPayload>(navUrl);

  if (error) {
    return (
      <div class="px-3 py-4 text-sm text-slate-500">
        The outline navigation could not be loaded right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="px-3 py-4 text-sm text-slate-400">
        Loading outline navigation...
      </div>
    );
  }

  const allSectionUrls = data.parts.flatMap((part) =>
    part.divisions.flatMap((division) =>
      division.sections.map((section) => section.href),
    ),
  );

  return (
    <>
      <nav aria-label="Knowledge outline" class="py-4 px-3 font-sans text-sm">
        {data.parts.map((part) => {
          const isCurrentPart = part.partNumber === currentPartNumber;
          const textColor = partTextColors[part.partNumber] ?? 'text-gray-700';
          const bgLight = partBgLightColors[part.partNumber] ?? 'bg-gray-100';
          const borderColor = partBorderColors[part.partNumber] ?? 'border-gray-300';
          const partSummaryClass = [
            'flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer select-none',
            'hover:bg-gray-100 transition-colors',
            'list-none [&::-webkit-details-marker]:hidden',
            isCurrentPart ? bgLight : '',
          ].filter(Boolean).join(' ');

          return (
            <details key={part.partNumber} class="group mb-1" open={isCurrentPart}>
              <summary class={partSummaryClass}>
                <svg
                  class="h-4 w-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-90"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                </svg>

                <a href={part.href} class={`font-semibold truncate ${textColor}`}>
                  {part.title}
                </a>
              </summary>

              <div class={`ml-4 pl-2 border-l-2 mt-1 mb-2 ${borderColor}`}>
                {part.divisions.map((division) => {
                  const isCurrentDivision = division.divisionId === currentDivisionId;
                  const hasCurrent = isCurrentDivision || division.sections.some((section) => section.sectionCode === currentSectionCode);
                  const divisionSummaryClass = [
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer select-none',
                    'hover:bg-gray-100 transition-colors',
                    'list-none [&::-webkit-details-marker]:hidden',
                    isCurrentDivision ? 'bg-gray-100' : '',
                  ].filter(Boolean).join(' ');
                  const divisionLinkClass = [
                    'truncate transition-colors',
                    isCurrentDivision ? 'font-semibold text-gray-900' : 'text-gray-600',
                  ].join(' ');

                  return (
                    <details key={division.divisionId} class="group/div mb-1" open={hasCurrent}>
                      <summary class={divisionSummaryClass}>
                        <svg
                          class="h-3 w-3 text-gray-300 flex-shrink-0 transition-transform group-open/div:rotate-90"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <a href={division.href} class={divisionLinkClass}>
                          <span class="text-gray-400 mr-1">{division.romanNumeral}.</span>
                          {division.title}
                        </a>
                      </summary>

                      <div class="ml-4 mt-0.5 mb-1 space-y-0.5">
                        {division.sections.map((section) => {
                          const isCurrentSection = section.sectionCode === currentSectionCode;
                          const sectionLinkClass = [
                            'block px-2 py-1 rounded text-xs transition-colors truncate',
                            'hover:bg-gray-100',
                            isCurrentSection ? 'font-semibold text-gray-900 bg-gray-100' : 'text-gray-500',
                          ].join(' ');

                          return (
                            <a key={section.sectionCode} href={section.href} class={sectionLinkClass}>
                              <span class="font-mono text-gray-400 mr-1">{section.sectionCodeDisplay}</span>
                              {section.title}
                            </a>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </nav>

      <div class="px-3 py-3 border-t border-gray-200 font-sans text-sm">
        <button
          type="button"
          onClick={() => {
            if (!allSectionUrls.length) return;
            window.location.href = allSectionUrls[Math.floor(Math.random() * allSectionUrls.length)];
          }}
          class="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Random Section
        </button>
      </div>
    </>
  );
}
