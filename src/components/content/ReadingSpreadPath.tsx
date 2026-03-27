import { h, type ComponentChildren } from 'preact';
import type { ReadingSectionSummary } from '../../utils/readingData';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';
import ReadingSectionLinks from './ReadingSectionLinks';

interface SpreadPathStepBase {
  title: string;
  checklistKey: string;
  sectionCount: number;
  newCoverageCount: number;
  cumulativeCoveredCount: number;
  newSections: ReadingSectionSummary[];
}

interface ReadingSpreadPathProps<TStep extends SpreadPathStepBase> {
  isOpen: boolean;
  onToggleOpen: () => void;
  steps: TStep[];
  remainingCoverageCount: number;
  checklistState: Record<string, boolean>;
  onCheckedChange: (checklistKey: string, checked: boolean) => void;
  getHref: (step: TStep) => string;
  renderMeta?: (step: TStep) => ComponentChildren;
  checkboxAriaLabel: (step: TStep) => string;
  itemSingular: string;
  itemPlural: string;
  coverageUnitSingular: string;
  coverageUnitPlural: string;
  emptyMessage: string;
  baseUrl: string;
  sectionLinksVariant?: 'details' | 'chips';
}

function countPartsSpanned(sections: ReadingSectionSummary[]): number {
  return new Set(sections.map((section) => section.partNumber)).size;
}

export default function ReadingSpreadPath<TStep extends SpreadPathStepBase>({
  isOpen,
  onToggleOpen,
  steps,
  remainingCoverageCount,
  checklistState,
  onCheckedChange,
  getHref,
  renderMeta,
  checkboxAriaLabel,
  itemSingular,
  itemPlural,
  coverageUnitSingular,
  coverageUnitPlural,
  emptyMessage,
  baseUrl,
  sectionLinksVariant = 'details',
}: ReadingSpreadPathProps<TStep>) {
  const bestNext = steps[0] ?? null;

  return (
    <section class="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
      <div class="flex flex-col gap-2.5">
        <div>
          <h2 class="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-amber-800">
            Knowledge-Spread Path
            <button
              type="button"
              onClick={onToggleOpen}
              class="inline-flex items-center justify-center"
              aria-label={isOpen ? 'Collapse path' : 'Expand path'}
            >
              <svg
                class={`h-4 w-4 text-amber-700 transition-transform hover:text-amber-900 ${isOpen ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width={2}
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </h2>
          <p class="mt-1 text-xs font-medium text-amber-900">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {remainingCoverageCount} {remainingCoverageCount === 1 ? coverageUnitSingular : coverageUnitPlural} uncovered
          </p>
        </div>
        {!isOpen && bestNext ? (
          <div>
            <a href={getHref(bestNext)} class="font-serif text-2xl leading-tight text-amber-950 hover:text-indigo-700 transition-colors">
              {bestNext.title}
            </a>
            {renderMeta ? renderMeta(bestNext) : null}
            <p class="mt-2 text-sm text-amber-900">
              Adds {bestNext.newCoverageCount} new {bestNext.newCoverageCount === 1 ? coverageUnitSingular : coverageUnitPlural} and touches {bestNext.sectionCount} linked {bestNext.sectionCount === 1 ? 'Section' : 'Sections'}.
            </p>
          </div>
        ) : !bestNext ? (
          <p class="text-sm text-amber-900">{emptyMessage}</p>
        ) : null}
      </div>

      {isOpen && steps.length > 0 ? (
        <div class="mt-5">
        <HorizontalCardScroll>
          {steps.map((step, index) => {
            const isChecked = Boolean(checklistState[step.checklistKey]);
            const newPartsSpanned = countPartsSpanned(step.newSections);

            return (
              <div key={step.checklistKey} class="rounded-xl border border-amber-200 bg-white p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Step {index + 1}
                    </p>
                    <h3 class="mt-1 font-serif text-xl leading-tight text-gray-900">
                      <a href={getHref(step)} class="hover:text-indigo-700 transition-colors">{step.title}</a>
                    </h3>
                    {renderMeta ? renderMeta(step) : null}
                  </div>
                  <label class="inline-flex flex-shrink-0 items-center gap-2 text-xs font-medium text-gray-500">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => {
                        onCheckedChange(step.checklistKey, (event.currentTarget as HTMLInputElement).checked);
                      }}
                      class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label={checkboxAriaLabel(step)}
                    />
                    Done
                  </label>
                </div>

                <div class="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                  <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                    +{step.newCoverageCount} new {step.newCoverageCount === 1 ? coverageUnitSingular : coverageUnitPlural}
                  </span>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                    {step.sectionCount} linked {step.sectionCount === 1 ? 'Section' : 'Sections'}
                  </span>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                    {step.cumulativeCoveredCount} total {step.cumulativeCoveredCount === 1 ? coverageUnitSingular : coverageUnitPlural} after this step
                  </span>
                </div>

                <p class="mt-3 text-sm leading-6 text-gray-600">
                  Why this next:{' '}
                  {step.newCoverageCount > 0 ? (
                    <>
                      it opens {step.newCoverageCount} new{' '}
                      {step.newCoverageCount === 1 ? coverageUnitSingular : coverageUnitPlural}
                      {newPartsSpanned > 0 ? ` across ${newPartsSpanned} ${newPartsSpanned === 1 ? 'Part' : 'Parts'}` : ''}.
                    </>
                  ) : (
                    <>it keeps this path visible, but does not add further new {coverageUnitPlural} right now.</>
                  )}
                </p>

                <ReadingSectionLinks
                  sections={step.newSections}
                  baseUrl={baseUrl}
                  label="Show the Sections this opens up"
                  variant={sectionLinksVariant}
                />
              </div>
            );
          })}
        </HorizontalCardScroll>
        </div>
      ) : isOpen ? (
        <div class="mt-5 rounded-xl border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
          {emptyMessage}
        </div>
      ) : null}
    </section>
  );
}
