import { h } from 'preact';
import Accordion from '../ui/Accordion';
import { formatEditionLabel } from '../../utils/readingData';
import { sectionReferenceUrl } from '../../utils/helpers';

// Matches "824.B.4" style refs (with outline path) and "section 824" style refs (bare code)
const COMBINED_REF_RE = /\b(\d{2,3}(?:-\d{2})?)\.([A-Z](?:\.\d+[a-z]?)*)\.?|\bsection (\d{2,3}(?:-\d{2})?)\b/gi;

function linkifyRationale(text: string, baseUrl: string) {
  const parts: (string | h.JSX.Element)[] = [];
  let last = 0;
  let match;
  COMBINED_REF_RE.lastIndex = 0;
  while ((match = COMBINED_REF_RE.exec(text))) {
    const sectionCode = match[1] || match[3];
    const outlinePath = match[2] || '';
    if (match.index > last) parts.push(text.slice(last, match.index));
    const href = sectionReferenceUrl(sectionCode, outlinePath, baseUrl);
    parts.push(
      <a href={href} class="text-indigo-700 hover:text-indigo-900 hover:underline">
        {match[0]}
      </a>
    );
    last = COMBINED_REF_RE.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export interface VsiCardProps {
  title: string;
  author: string;
  rationale: string;
  baseUrl: string;
  publicationYear?: number;
  edition?: number;
  matchPercent?: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function matchColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-500';
  if (percent >= 40) return 'bg-emerald-400';
  if (percent >= 20) return 'bg-amber-400';
  return 'bg-gray-300';
}

export default function VsiCard({
  title,
  author,
  rationale,
  baseUrl,
  publicationYear,
  edition,
  matchPercent,
  checked,
  onCheckedChange,
}: VsiCardProps) {
  const editionLabel = formatEditionLabel(edition);
  const metadata = [author, editionLabel, publicationYear ? String(publicationYear) : null].filter(Boolean).join(' · ');
  const showMatch = matchPercent !== undefined && matchPercent > 0;

  return (
    <div class="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow duration-200">
      <div class="mb-2 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">{title}</h4>
          <p class="text-sm text-gray-500 mt-0.5">{metadata}</p>
        </div>
        <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange((event.currentTarget as HTMLInputElement).checked)}
            class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            aria-label={`Mark ${title} by ${author} as completed`}
          />
          Done
        </label>
      </div>

      {showMatch && (
        <div class="mb-3">
          <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              class={`h-full rounded-full ${matchColor(matchPercent)}`}
              style={{ width: `${matchPercent}%` }}
            />
          </div>
        </div>
      )}

      {rationale && (
        <Accordion title="Why this book?" defaultOpen={false}>
          <p class="text-gray-600">{linkifyRationale(rationale, baseUrl)}</p>
        </Accordion>
      )}
    </div>
  );
}
