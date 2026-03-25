import { h } from 'preact';
import Accordion from '../ui/Accordion';
import { linkifyRationaleReferences } from '../../utils/rationaleLinks';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';

export interface IotCardProps {
  pid: string;
  title: string;
  synopsis?: string;
  rationale?: string;
  baseUrl: string;
  sectionCode?: string;
  matchPercent?: number;
  precisionLabel?: string;
  precisionClassName?: string;
  datePublished?: string;
  durationSeconds?: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function matchColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-500';
  if (percent >= 40) return 'bg-emerald-400';
  if (percent >= 20) return 'bg-amber-400';
  return 'bg-gray-300';
}

export default function IotCard({
  pid,
  title,
  synopsis,
  rationale,
  baseUrl,
  sectionCode,
  matchPercent,
  precisionLabel,
  precisionClassName,
  datePublished,
  durationSeconds,
  checked,
  onCheckedChange,
}: IotCardProps) {
  const showMatch = matchPercent !== undefined && matchPercent > 0;
  const metadata = formatIotEpisodeMeta({ datePublished, durationSeconds });

  return (
    <div class={`border rounded-lg p-4 bg-white hover:shadow-md transition-shadow duration-200 ${checked ? 'border-slate-300 bg-slate-200/70 opacity-50' : 'border-gray-200'}`}>
      <div class="mb-2 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
            <a href={`${baseUrl}/iot/${pid}`} class="hover:text-indigo-700 transition-colors">
              {title}
            </a>
          </h4>
          {metadata && (
            <p class="mt-1 text-xs text-gray-500">{metadata}</p>
          )}
        </div>
        <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange((event.currentTarget as HTMLInputElement).checked)}
            class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            aria-label={`Mark ${title} as listened`}
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

      {precisionLabel && (
        <div class="mb-3 flex flex-wrap gap-1.5 text-[10px] font-medium tracking-[0.02em]">
          <span class={`inline-flex items-center rounded-md border px-2 py-0.5 ${precisionClassName ?? 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            {precisionLabel}
          </span>
        </div>
      )}

      {rationale && (
        <p class="mb-3 text-sm leading-6 text-gray-600">{linkifyRationaleReferences(rationale, baseUrl, sectionCode)}</p>
      )}

      {synopsis && !rationale && (
        <p class="mb-3 text-sm leading-6 text-gray-600">{synopsis}</p>
      )}
    </div>
  );
}
