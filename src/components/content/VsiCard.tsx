import { h } from 'preact';
import Accordion from '../ui/Accordion';

export interface VsiCardProps {
  title: string;
  author: string;
  rationale: string;
  publicationYear?: number;
  edition?: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function formatEdition(edition?: number) {
  if (!edition) return null;

  const mod100 = edition % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${edition}th ed.`;
  }

  const mod10 = edition % 10;
  if (mod10 === 1) return `${edition}st ed.`;
  if (mod10 === 2) return `${edition}nd ed.`;
  if (mod10 === 3) return `${edition}rd ed.`;
  return `${edition}th ed.`;
}

export default function VsiCard({
  title,
  author,
  rationale,
  publicationYear,
  edition,
  checked,
  onCheckedChange,
}: VsiCardProps) {
  const editionLabel = formatEdition(edition);
  const metadata = [author, editionLabel, publicationYear ? String(publicationYear) : null].filter(Boolean).join(' · ');

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

      {rationale && (
        <Accordion title="Why this book?" defaultOpen={false}>
          <p class="text-gray-600">{rationale}</p>
        </Accordion>
      )}
    </div>
  );
}
