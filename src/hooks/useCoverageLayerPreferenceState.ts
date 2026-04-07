import { useEffect, useState } from 'preact/hooks';
import {
  getCoverageLayerPreference,
  subscribeCoverageLayerPreference,
} from '../utils/readingPreference';
import type { CoverageLayer } from '../utils/readingLibrary';

export function useCoverageLayerPreferenceState(): CoverageLayer {
  const [coverageLayer, setCoverageLayer] = useState<CoverageLayer>(() => getCoverageLayerPreference());

  useEffect(() => {
    setCoverageLayer(getCoverageLayerPreference());
    return subscribeCoverageLayerPreference((layer) => {
      setCoverageLayer(layer);
    });
  }, []);

  return coverageLayer;
}
