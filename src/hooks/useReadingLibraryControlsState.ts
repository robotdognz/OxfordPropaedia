import { useEffect, useState } from 'preact/hooks';
import {
  getReadingLibraryControlsPreference,
  setReadingLibraryControlsPreference,
  type ReadingLibraryControlsPreference,
  type ReadingLibraryScope,
  type ReadingType,
} from '../utils/readingPreference';

export function useReadingLibraryControlsState<TSortField extends string>(
  readingType: ReadingType,
  defaultSortField: TSortField,
  defaultSortDirection: 'asc' | 'desc' = 'desc'
) {
  const [controls, setControls] = useState<ReadingLibraryControlsPreference<TSortField>>(() =>
    getReadingLibraryControlsPreference(readingType, defaultSortField, defaultSortDirection)
  );

  useEffect(() => {
    setControls(getReadingLibraryControlsPreference(readingType, defaultSortField, defaultSortDirection));
  }, [readingType, defaultSortField, defaultSortDirection]);

  useEffect(() => {
    setReadingLibraryControlsPreference(readingType, controls);
  }, [readingType, controls]);

  return {
    scope: controls.scope,
    checkedOnly: controls.checkedOnly,
    sortField: controls.sortField,
    sortDirection: controls.sortDirection,
    setScope: (scope: ReadingLibraryScope) => {
      setControls((previous) => ({ ...previous, scope }));
    },
    setCheckedOnly: (checkedOnly: boolean) => {
      setControls((previous) => ({ ...previous, checkedOnly }));
    },
    setSortField: (sortField: TSortField) => {
      setControls((previous) => ({ ...previous, sortField }));
    },
    setSortDirection: (sortDirection: 'asc' | 'desc') => {
      setControls((previous) => ({ ...previous, sortDirection }));
    },
  };
}
