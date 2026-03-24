import { h } from 'preact';
import {
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';

const LAYER_DESCRIPTIONS: Record<CoverageLayer, string> = {
  part: 'Build a broad foundation across the ten major fields.',
  division: 'Cover the main strands within those fields before you narrow further.',
  section: 'Reach more named topics across the outline.',
  subsection: 'Push into the finest mapped paths where specific path data is available.',
};

interface CoverageLayerTabsProps {
  activeLayer: CoverageLayer;
  onSelect: (layer: CoverageLayer) => void;
  snapshots: Array<Pick<LayerCoverageSnapshot<ChecklistBackedReadingEntry>, 'layer' | 'currentlyCoveredCount' | 'totalCoverageCount'>>;
}

export default function CoverageLayerTabs({
  activeLayer,
  onSelect,
  snapshots,
}: CoverageLayerTabsProps) {
  const activeSnapshot = snapshots.find((snapshot) => snapshot.layer === activeLayer);
  const activeMeta = COVERAGE_LAYER_META[activeLayer];

  return (
    <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="text-sm font-medium uppercase tracking-wide text-gray-500">Outline Layer</h2>
          <p class="mt-1 text-sm text-gray-600">
            Choose which layer of the outline you want the next recommendations to maximise.
          </p>
          {activeSnapshot ? (
            <p class="mt-1.5 text-sm leading-6 text-gray-600">
              <span class="font-medium text-gray-900">{activeMeta.label} coverage:</span>{' '}
              {LAYER_DESCRIPTIONS[activeLayer]} You have covered{' '}
              {activeSnapshot.currentlyCoveredCount} of {activeSnapshot.totalCoverageCount} so far.
            </p>
          ) : null}
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Coverage layer">
        {snapshots.map((snapshot) => {
          const isActive = snapshot.layer === activeLayer;
          const meta = COVERAGE_LAYER_META[snapshot.layer];

          return (
            <button
              key={snapshot.layer}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(snapshot.layer)}
              class={`rounded-full border px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <span class="font-medium">{meta.label}</span>
              <span class={`ml-2 text-xs ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>
                {snapshot.currentlyCoveredCount}/{snapshot.totalCoverageCount}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
