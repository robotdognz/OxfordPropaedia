import { useEffect, useState } from 'preact/hooks';
import {
  getReadingPreference,
  subscribeReadingPreference,
  type ReadingType,
} from '../utils/readingPreference';

export function useReadingPreferenceState(): ReadingType {
  const [readingPreference, setReadingPreference] = useState<ReadingType>(() => getReadingPreference());

  useEffect(() => {
    setReadingPreference(getReadingPreference());
    return subscribeReadingPreference((type) => {
      setReadingPreference(type);
    });
  }, []);

  return readingPreference;
}
