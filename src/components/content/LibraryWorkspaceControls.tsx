import { h } from 'preact';
import ReadingSelectionStrip from '../ui/ReadingSelectionStrip';
import ReadingLibraryScopeTabs from './ReadingLibraryScopeTabs';
import {
  setReadingLibraryCheckedFilterPreference,
  READING_TYPE_ORDER,
  READING_TYPE_UI_META,
  setReadingLibraryScopePreference,
  setReadingPreference,
  type ReadingLibraryCheckedFilter,
  type ReadingLibraryScope,
  type ReadingType,
} from '../../utils/readingPreference';

interface LibraryWorkspaceControlsProps {
  baseUrl: string;
  readingType: ReadingType;
  onReadingTypeChange: (type: ReadingType) => void;
  scope: ReadingLibraryScope;
  onScopeChange: (scope: ReadingLibraryScope) => void;
  checkedFilter: ReadingLibraryCheckedFilter;
  totalCount: number;
  shelvedCount: number;
  showWikipediaLevelSelector?: boolean;
}

function libraryUrlFor(baseUrl: string, source: ReadingType): string {
  return `${baseUrl}/library?source=${source}`;
}

export default function LibraryWorkspaceControls({
  baseUrl,
  readingType,
  onReadingTypeChange,
  scope,
  onScopeChange,
  checkedFilter,
  totalCount,
  shelvedCount,
  showWikipediaLevelSelector = false,
}: LibraryWorkspaceControlsProps) {
  return (
    <ReadingSelectionStrip
      readingTypeValue={readingType}
      readingTypeOptions={READING_TYPE_ORDER.map((type) => ({
        value: type,
        label: READING_TYPE_UI_META[type].label,
        eyebrow: READING_TYPE_UI_META[type].eyebrow,
      }))}
      onReadingTypeChange={(type) => {
        setReadingLibraryScopePreference(type, scope);
        setReadingLibraryCheckedFilterPreference(type, checkedFilter);
        onReadingTypeChange(type);
        setReadingPreference(type);

        if (typeof window !== 'undefined') {
          const nextUrl = libraryUrlFor(baseUrl, type);
          window.history.replaceState(null, '', nextUrl);
          document.dispatchEvent(
            new CustomEvent('propaedia:workspace-change', {
              detail: {
                workspace: 'library',
                urlKey: `${window.location.pathname}${window.location.search}`,
              },
            }),
          );
        }
      }}
      readingTypeAriaLabel="Library reading type"
      extraSelector={(
        <ReadingLibraryScopeTabs
          bare
          scope={scope}
          onChange={onScopeChange}
          totalCount={totalCount}
          shelvedCount={shelvedCount}
        />
      )}
      showWikipediaLevelSelector={showWikipediaLevelSelector}
    />
  );
}
