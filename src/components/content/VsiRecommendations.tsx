import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import VsiCard from './VsiCard';
import {
  readChecklistState,
  subscribeChecklistState,
  vsiChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  filterMappingsForOutline,
  OUTLINE_VSI_SELECT_EVENT,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';

export interface VsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationale: string;
  publicationYear?: number;
  edition?: number;
}

export interface VsiRecommendationsProps {
  mappings: VsiMapping[];
  sectionCode: string;
}

export default function VsiRecommendations({ mappings, sectionCode }: VsiRecommendationsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(undefined);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    const handleOutlineSelect = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;

      setSelection(detail);
      setForceOpenKey(Date.now());

      window.requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };

    document.addEventListener(OUTLINE_VSI_SELECT_EVENT, handleOutlineSelect as EventListener);
    return () => {
      document.removeEventListener(OUTLINE_VSI_SELECT_EVENT, handleOutlineSelect as EventListener);
    };
  }, [mappings, sectionCode]);

  if (!mappings || mappings.length === 0) return null;

  const visibleMappings = selection ? filterMappingsForOutline(mappings, selection) : mappings;
  const totalCount = mappings.length;
  const visibleCount = visibleMappings.length;
  const isFiltered = selection !== null;
  const selectionPath = selection?.outlinePath ?? '';
  const selectionText = selection?.text ?? '';

  const clearFilter = () => {
    setSelection(null);
  };

  return (
    <section ref={sectionRef} id="vsi-recommendations" class="mt-6 scroll-mt-24">
      <Accordion title={`Oxford VSI Recommendations (${totalCount})`} forceOpenKey={forceOpenKey}>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div class="min-w-0">
            <p class="text-sm font-medium text-amber-900">
              {isFiltered
                ? `Showing ${visibleCount} of ${totalCount} recommendations for ${selectionPath}`
                : `Showing all ${totalCount} recommendations`}
            </p>
            {isFiltered && (
              <p class="mt-1 text-xs text-amber-800">
                {selectionText}
              </p>
            )}
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={clearFilter}
              class="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              Show all
            </button>
          )}
        </div>

        {visibleCount > 0 ? (
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleMappings.map((mapping, index) => {
              const checklistKey = vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor);

              return (
                <VsiCard
                  key={`${mapping.vsiTitle}-${mapping.vsiAuthor}-${index}`}
                  title={mapping.vsiTitle}
                  author={mapping.vsiAuthor}
                  rationale={mapping.rationale}
                  publicationYear={mapping.publicationYear}
                  edition={mapping.edition}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </div>
        ) : (
          <div class="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No Oxford VSI recommendations matched this outline item.
          </div>
        )}
      </Accordion>
    </section>
  );
}
