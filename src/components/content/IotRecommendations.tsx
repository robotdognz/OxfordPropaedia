import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Accordion from '../ui/Accordion';
import IotCard from './IotCard';
import {
  iotChecklistKey,
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';
import {
  filterEpisodesForOutline,
  OUTLINE_SELECT_EVENT,
  type OutlineSelectionDetail,
} from '../../utils/iotOutlineFilter';
import { getReadingPreference } from '../../utils/readingPreference';
import { ACCORDION_ANIMATION_MS } from '../ui/Accordion';
import { classifyMappingPrecision, mappingPrecisionBadge } from '../../utils/mappingPrecision';

export interface IotEpisodeRef {
  pid: string;
  title: string;
  url: string;
  synopsis?: string;
  datePublished?: string;
  durationSeconds?: number;
  rationale?: string;
  relevantPathsAI?: string[];
  matchPercent?: number;
}

export interface IotRecommendationsProps {
  episodes: IotEpisodeRef[];
  sectionCode: string;
  baseUrl: string;
}

export default function IotRecommendations({ episodes, sectionCode, baseUrl }: IotRecommendationsProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<OutlineSelectionDetail | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<number | undefined>(() => getReadingPreference() === 'iot' ? 0 : undefined);
  const [forceCloseKey, setForceCloseKey] = useState<number | undefined>(() => getReadingPreference() !== 'iot' ? 0 : undefined);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setChecklistState(readChecklistState());
    return subscribeChecklistState(() => {
      setChecklistState(readChecklistState());
    });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OutlineSelectionDetail>).detail;
      if (!detail || detail.sectionCode !== sectionCode) return;
      setSelection(detail);

      if (getReadingPreference() === 'iot') {
        setForceOpenKey(Date.now());
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, ACCORDION_ANIMATION_MS + 50);
      } else {
        setForceCloseKey(Date.now());
      }
    };

    document.addEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
    return () => document.removeEventListener(OUTLINE_SELECT_EVENT, handler as EventListener);
  }, [sectionCode]);

  if (!episodes || episodes.length === 0) return null;

  const visibleEpisodes: (IotEpisodeRef & { filterScore?: number })[] = selection
    ? filterEpisodesForOutline(episodes, selection)
    : [...episodes].sort((a, b) => (b.matchPercent || 0) - (a.matchPercent || 0));
  const isFiltered = selection !== null;
  const totalCount = episodes.length;
  const visibleCount = visibleEpisodes.length;
  const maxScore = selection
    ? Math.max(...visibleEpisodes.map((episode) => episode.filterScore || 0), 1)
    : Math.max(...visibleEpisodes.map((episode) => episode.matchPercent || 0), 1);

  return (
    <section ref={sectionRef} class="scroll-mt-24">
      <Accordion title={`BBC In Our Time Episodes (${totalCount})`} forceOpenKey={forceOpenKey} forceCloseKey={forceCloseKey}>
        <div class="mb-4 flex justify-end">
          <a
            href={`${baseUrl}/iot#iot-library`}
            class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Browse all BBC In Our Time episodes
          </a>
        </div>

        {isFiltered && (
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-amber-900">
                Showing {visibleCount} of {totalCount} episodes for {selection.outlinePath}
              </p>
              <p class="mt-1 text-xs text-amber-800">{selection.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              class="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              Show all
            </button>
          </div>
        )}

        {visibleCount > 0 ? (
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleEpisodes.map((episode) => {
              const checkKey = iotChecklistKey(episode.pid);
              const isChecked = Boolean(checklistState[checkKey]);
              const matchPercent = selection
                ? Math.round(Math.min((episode.filterScore || 0) / maxScore, 1) * 100)
                : (episode.matchPercent || 0);
              const precision = mappingPrecisionBadge(
                classifyMappingPrecision(episode.relevantPathsAI, selection?.outlinePath ?? null)
              );

              return (
                <IotCard
                  key={episode.pid}
                  pid={episode.pid}
                  title={episode.title}
                  synopsis={episode.synopsis}
                  rationale={episode.rationale}
                  baseUrl={baseUrl}
                  sectionCode={sectionCode}
                  matchPercent={matchPercent}
                  precisionLabel={precision.label}
                  precisionClassName={precision.className}
                  datePublished={episode.datePublished}
                  durationSeconds={episode.durationSeconds}
                  checked={isChecked}
                  onCheckedChange={(checked) => writeChecklistState(checkKey, checked)}
                />
              );
            })}
          </div>
        ) : (
          <div class="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-sm text-gray-600">
            No BBC In Our Time episodes matched this outline item.
          </div>
        )}
      </Accordion>
    </section>
  );
}
