import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Accordion, { ACCORDION_ANIMATION_MS } from '../ui/Accordion';
import VsiCard from './VsiCard';
import {
  readChecklistState,
  subscribeChecklistState,
  vsiChecklistKey,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  filterMappingsForOutline,
  sortByDefaultRelevance,
  OUTLINE_SELECT_EVENT,
  type OutlineSelectionDetail,
} from '../../utils/vsiOutlineFilter';
import { getReadingPreference, getHideCheckedReadings, setHideCheckedReadings, subscribeHideCheckedReadings } from '../../utils/readingPreference';
import { classifyMappingPrecision, mappingPrecisionBadge } from '../../utils/mappingPrecision';
import HorizontalCardScroll from '../ui/HorizontalCardScroll';

export interface VsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationaleAI: string;
  relevantPathsAI?: string[];
  publicationYear?: number;
  edition?: number;
  subject?: string;
  keywords?: string[];
  abstract?: string;
}

export interface VsiRecommendationsProps {
  mappings: VsiMapping[];
  sectionCode: string;
  sectionTitle: string;
  sectionOutlineText?: string;
  baseUrl: string;
}

export default function VsiRecommendations({ mappings, sectionCode, sectionTitle, sectionOutlineText, baseUrl }: VsiRecommendationsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(() => getReadingPreference() === 'vsi' ? 0 : undefined);
  const [forceCloseKey, setForceCloseKey] = useState<number | undefined>(() => getReadingPreference() !== 'vsi' ? 0 : undefined);
  const sectionRef = useRef<HTMLElement>(null);

  const [hideChecked, setHideChecked] = useState(() => getHideCheckedReadings());

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    return subscribeHideCheckedReadings((hide) => setHideChecked(hide));
  }, []);

  useEffect(() => {
    const handleOutlineSelect = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;

      setSelection(detail);

      if (getReadingPreference() === 'vsi') {
        setForceOpenKey(Date.now());
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, ACCORDION_ANIMATION_MS + 50);
      } else {
        setForceCloseKey(Date.now());
      }
    };

    document.addEventListener(OUTLINE_SELECT_EVENT, handleOutlineSelect as EventListener);
    return () => {
      document.removeEventListener(OUTLINE_SELECT_EVENT, handleOutlineSelect as EventListener);
    };
  }, [mappings, sectionCode]);

  if (!mappings || mappings.length === 0) return null;

  const scoredMappings = sortByDefaultRelevance(mappings, sectionTitle, sectionOutlineText);
  const visibleMappings = selection ? filterMappingsForOutline(scoredMappings, selection) : scoredMappings;
  const displayMappings = hideChecked
    ? visibleMappings.filter(m => !checklistState[vsiChecklistKey(m.vsiTitle, m.vsiAuthor)])
    : visibleMappings;
  const totalCount = mappings.length;
  const visibleCount = displayMappings.length;
  const isFiltered = selection !== null;
  const selectionPath = selection?.outlinePath ?? '';
  const selectionText = selection?.text ?? '';

  const clearFilter = () => {
    setSelection(null);
  };

  return (
    <section ref={sectionRef} id="vsi-recommendations" class="scroll-mt-24">
      <Accordion title={`Oxford VSI Recommendations (${totalCount})`} forceOpenKey={forceOpenKey} forceCloseKey={forceCloseKey}>
        <div class="mb-4 flex items-center justify-between">
          <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideChecked}
              onChange={(e) => setHideCheckedReadings((e.currentTarget as HTMLInputElement).checked)}
              class="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Hide checked
          </label>
          <a
            href={`${baseUrl}/vsi#vsi-library`}
            class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Browse all Oxford VSI books
          </a>
        </div>

        {isFiltered && (
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-amber-900">
                Showing {visibleCount} of {totalCount} recommendations for {selectionPath}
              </p>
              <p class="mt-1 text-xs text-amber-800">
                {selectionText}
              </p>
            </div>
            <button
              type="button"
              onClick={clearFilter}
              class="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              Show all
            </button>
          </div>
        )}

        {visibleCount > 0 ? (
          <HorizontalCardScroll>
            {displayMappings.map((mapping, index) => {
              const checklistKey = vsiChecklistKey(mapping.vsiTitle, mapping.vsiAuthor);

              const filterScore = (mapping as any).filterScore;
              const relevanceScore = filterScore ?? (mapping as any).relevanceScore ?? 0;
              const maxScore = filterScore !== undefined
                ? Math.max(...displayMappings.map((m: any) => m.filterScore ?? 0), 1)
                : Math.max(...scoredMappings.map((m: any) => m.relevanceScore ?? 0), 1);
              const matchPercent = Math.round(Math.min(relevanceScore / maxScore, 1) * 100);
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(mapping.relevantPathsAI, selection?.outlinePath ?? null)
              );

              return (
                <VsiCard
                  key={`${mapping.vsiTitle}-${mapping.vsiAuthor}-${index}`}
                  title={mapping.vsiTitle}
                  author={mapping.vsiAuthor}
                  rationale={mapping.rationaleAI}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  publicationYear={mapping.publicationYear}
                  edition={mapping.edition}
                  matchPercent={matchPercent}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
                  checked={Boolean(checklistState[checklistKey])}
                  onCheckedChange={(checked) => writeChecklistState(checklistKey, checked)}
                />
              );
            })}
          </HorizontalCardScroll>
        ) : (
          <div class="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No Oxford VSI recommendations matched this outline item.
          </div>
        )}
      </Accordion>
    </section>
  );
}
