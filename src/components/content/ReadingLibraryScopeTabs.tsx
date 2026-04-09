import { h } from 'preact';
import SelectorCardRail from '../ui/SelectorCardRail';
import { CONTROL_SURFACE_CLASS } from '../ui/controlTheme';
import type { ReadingLibraryScope } from '../../utils/readingPreference';

interface ReadingLibraryScopeTabsProps {
  scope: ReadingLibraryScope;
  onChange: (scope: ReadingLibraryScope) => void;
  totalCount: number;
  shelvedCount: number;
  bare?: boolean;
}

export default function ReadingLibraryScopeTabs({
  scope,
  onChange,
  totalCount,
  shelvedCount,
  bare = false,
}: ReadingLibraryScopeTabsProps) {
  const content = (
    <SelectorCardRail
      label="View"
      ariaLabel="Library view"
      value={scope}
      onChange={onChange}
      options={[
        {
          value: 'library',
          label: 'Library',
          meta: String(totalCount),
        },
        {
          value: 'shelf',
          label: 'Shelf',
          meta: String(shelvedCount),
        },
      ]}
      columns={2}
      size="compact"
    />
  );

  if (bare) {
    return content;
  }

  return (
    <section class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:p-3`}>
      {content}
    </section>
  );
}
