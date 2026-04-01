import { h } from 'preact';
import {
  COVERAGE_LAYER_META,
  type ChecklistBackedReadingEntry,
  type CoverageLayer,
  type LayerCoverageSnapshot,
} from '../../utils/readingLibrary';
import SelectorCardRail from '../ui/SelectorCardRail';
import { CONTROL_SURFACE_CLASS } from '../ui/controlTheme';

const LAYER_ACCENT_COLORS: Record<CoverageLayer, string> = {
  part: '#6366f1',
  division: '#8b5cf6',
  section: '#a78bfa',
  subsection: '#c4b5fd',
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
  return (
    <section class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:p-3`}>
      <SelectorCardRail
        label="Coverage Layer"
        ariaLabel="Coverage layer"
        value={activeLayer}
        options={snapshots.map((snapshot) => ({
          value: snapshot.layer,
          label: COVERAGE_LAYER_META[snapshot.layer].pluralLabel,
          meta: `${snapshot.currentlyCoveredCount}/${snapshot.totalCoverageCount}`,
          accentColor: LAYER_ACCENT_COLORS[snapshot.layer],
        }))}
        onChange={onSelect}
        size="compact"
      />
    </section>
  );
}
