import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import {
  buildCoverageGapItems,
  completedChecklistKeysFromState,
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
} from '../../utils/readingLibrary';

interface CoverageGapPanelProps<TEntry extends ChecklistBackedReadingEntry> {
  entries: TEntry[];
  checklistState: Record<string, boolean>;
  activeLayer: CoverageLayer;
  baseUrl: string;
  itemLabelPlural: string;
  outlineItemCounts?: Record<string, number>;
  isComplete: boolean;
}

function gapIntro(layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return 'These are the Parts still missing from your current coverage.';
    case 'division':
      return 'These are the Divisions still missing from your current coverage.';
    case 'section':
      return 'These are the Sections still missing from your current coverage.';
    case 'subsection':
      return 'These are the Sections with the most uncovered Subsections still missing from your current coverage.';
    default:
      return '';
  }
}

export default function CoverageGapPanel<TEntry extends ChecklistBackedReadingEntry>({
  entries,
  checklistState,
  activeLayer,
  baseUrl,
  itemLabelPlural,
  outlineItemCounts,
  isComplete,
}: CoverageGapPanelProps<TEntry>) {
  const gapItems = useMemo(() => {
    return buildCoverageGapItems(
      entries,
      completedChecklistKeysFromState(checklistState),
      activeLayer,
      baseUrl,
      {
        outlineItemCounts,
        itemLabelPlural,
        limit: 5,
      }
    );
  }, [entries, checklistState, activeLayer, baseUrl, outlineItemCounts, itemLabelPlural]);
  const layerMeta = COVERAGE_LAYER_META[activeLayer];

  return (
    <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
      <div class="max-w-3xl">
        <h2 class="font-serif text-2xl text-slate-900">Biggest Remaining {layerMeta.pluralLabel}</h2>
        <p class="mt-2 text-sm leading-6 text-slate-700">{gapIntro(activeLayer)}</p>
      </div>

      {isComplete ? (
        <div class="mt-5 rounded-xl border border-emerald-200 bg-white px-4 py-5 text-sm text-emerald-800">
          You have covered every mapped {layerMeta.pluralLabel} in this tab.
        </div>
      ) : gapItems.length > 0 ? (
        <div class="mt-5 grid gap-3 lg:grid-cols-2">
          {gapItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              class="rounded-xl border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-sm font-semibold text-slate-900">{item.label}</h3>
                {activeLayer === 'subsection' ? (
                  <span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {item.uncoveredCount}
                  </span>
                ) : null}
              </div>
              <p class="mt-2 text-sm text-slate-600">{item.description}</p>
            </a>
          ))}
        </div>
      ) : (
        <div class="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-600">
          No uncovered {layerMeta.pluralLabel} are left for this reading list right now.
        </div>
      )}
    </section>
  );
}
