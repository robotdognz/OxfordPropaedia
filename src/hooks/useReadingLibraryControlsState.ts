import { useEffect, useState } from 'preact/hooks';
import {
  getReadingLibraryControlsPreference,
  setReadingLibraryControlsPreference,
  type ReadingLibraryCheckedFilter,
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
    checkedFilter: controls.checkedFilter,
    sortField: controls.sortField,
    sortDirection: controls.sortDirection,
    setScope: (scope: ReadingLibraryScope) => {
      setControls((previous) => ({ ...previous, scope }));
    },
    setCheckedFilter: (checkedFilter: ReadingLibraryCheckedFilter) => {
      setControls((previous) => ({ ...previous, checkedFilter }));
    },
    setSortField: (sortField: TSortField) => {
      setControls((previous) => ({ ...previous, sortField }));
    },
    setSortDirection: (sortDirection: 'asc' | 'desc') => {
      setControls((previous) => ({ ...previous, sortDirection }));
    },
  };
}
