import { h } from 'preact';
import Accordion from '../ui/Accordion';
import VsiCard from './VsiCard';

export interface VsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationale: string;
}

export interface VsiRecommendationsProps {
  mappings: VsiMapping[];
}

export default function VsiRecommendations({ mappings }: VsiRecommendationsProps) {
  if (!mappings || mappings.length === 0) return null;

  return (
    <section class="mt-6">
      <Accordion title={`Oxford VSI Recommendations (${mappings.length})`}>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mappings.map((m, i) => (
            <VsiCard
              key={`${m.vsiTitle}-${i}`}
              title={m.vsiTitle}
              author={m.vsiAuthor}
              rationale={m.rationale}
            />
          ))}
        </div>
      </Accordion>
    </section>
  );
}
