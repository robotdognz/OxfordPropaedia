import { h } from 'preact';
import Accordion from '../ui/Accordion';
import { formatEditionLabel } from '../../utils/readingData';
import { sectionReferenceUrl, slugify } from '../../utils/helpers';

// Matches "824.B.4" style refs (with section code + outline path),
// "section 824" style refs (bare code),
// and bare outline paths like "A.1", "B.3.c", "C.2.d.ii" (within the current section)
const CROSS_REF_RE = /\b(\d{2,3}(?:-\d{2})?)\.([A-Z](?:\.\d+[a-z]?)*)\.?|\bsection (\d{2,3}(?:-\d{2})?)\b/gi;
const OUTLINE_PATH_RE = /\b([A-Z](?:\.\d+[a-z]?(?:\.[ivxlc]+)?)*)\b/g;

function linkifyRationale(text: string, baseUrl: string, sectionCode?: string) {
  // First pass: linkify cross-section references (824.B.4, section 824)
  const parts: (string | h.JSX.Element)[] = [];
  let last = 0;
  let match;
  CROSS_REF_RE.lastIndex = 0;
  while ((match = CROSS_REF_RE.exec(text))) {
    const code = match[1] || match[3];
    const outlinePath = match[2] || '';
    if (match.index > last) parts.push(text.slice(last, match.index));
    const href = sectionReferenceUrl(code, outlinePath, baseUrl);
    parts.push(
      <a href={href} class="text-indigo-700 hover:text-indigo-900 hover:underline">
        {match[0]}
      </a>
    );
    last = CROSS_REF_RE.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));

  // Second pass: linkify bare outline paths (A.1, B.3.c) within plain text segments
  if (!sectionCode) return parts;

  return parts.flatMap((part) => {
    if (typeof part !== 'string') return [part];
    const subParts: (string | h.JSX.Element)[] = [];
    let subLast = 0;
    OUTLINE_PATH_RE.lastIndex = 0;
    while ((match = OUTLINE_PATH_RE.exec(part))) {
      // Only match if it looks like an outline path (has a dot with digits, not just a lone letter)
      if (!match[1].includes('.')) continue;
      if (match.index > subLast) subParts.push(part.slice(subLast, match.index));
      const href = sectionReferenceUrl(sectionCode.replace(/\//g, '-'), match[1], baseUrl);
      subParts.push(
        <a href={href} class="text-indigo-700 hover:text-indigo-900 hover:underline">
          {match[0]}
        </a>
      );
      subLast = OUTLINE_PATH_RE.lastIndex;
    }
    if (subLast < part.length) subParts.push(part.slice(subLast));
    return subParts.length > 0 ? subParts : [part];
  });
}

export interface VsiCardProps {
  title: string;
  author: string;
  rationaleAI: string;
  baseUrl: string;
  sectionCode?: string;
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
  sectionCode,
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
          <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
            <a href={`${baseUrl}/vsi/${slugify(title)}`} class="hover:text-indigo-700 transition-colors">{title}</a>
          </h4>
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
        <div class="mb-3 flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              class={`h-full rounded-full ${matchColor(matchPercent)}`}
              style={{ width: `${matchPercent}%` }}
            />
          </div>
          <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">
            {matchPercent}% relevance
          </span>
        </div>
      )}

      {rationale && (
        <Accordion title="Why this book?" defaultOpen={false}>
          <p class="text-gray-600">{linkifyRationale(rationale, baseUrl, sectionCode)}</p>
        </Accordion>
      )}
    </div>
  );
}
