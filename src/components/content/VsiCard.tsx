import { h } from 'preact';
import { useReadingSpeedState } from '../../hooks/useReadingSpeedState';
import { formatEditionLabel } from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { linkifyRationaleReferences } from '../../utils/rationaleLinks';
import { formatEstimatedReadingTime } from '../../utils/readingSpeed';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';
import ReadingRecommendationCard from './ReadingRecommendationCard';

export interface VsiCardProps {
  title: string;
  author?: string;
  rationale?: string;
  baseUrl: string;
  sectionCode?: string;
  publicationYear?: number;
  edition?: number;
  wordCount?: number;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  badges?: RecommendationCardBadge[];
  whyTitle?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  shelved: boolean;
  onShelvedChange: (shelved: boolean) => void;
}

export default function VsiCard({
  title,
  author,
  rationale,
  baseUrl,
  sectionCode,
  publicationYear,
  edition,
  wordCount,
  matchPercent,
  flags,
  badges,
  whyTitle = 'Why this book?',
  checked,
  onCheckedChange,
  shelved,
  onShelvedChange,
}: VsiCardProps) {
  const readingSpeedWpm = useReadingSpeedState();
  const editionLabel = formatEditionLabel(edition);
  const metadata = [
    author,
    formatEstimatedReadingTime(wordCount, readingSpeedWpm),
    editionLabel,
    publicationYear ? String(publicationYear) : null,
  ].filter(Boolean).join(' · ');

  return (
    <ReadingRecommendationCard
      title={title}
      href={`${baseUrl}/vsi/${slugify(title)}`}
      metadata={metadata || null}
      matchPercent={matchPercent}
      flags={flags}
      badges={badges}
      whyTitle={rationale ? whyTitle : undefined}
      whyContent={rationale ? <p class="text-gray-600">{linkifyRationaleReferences(rationale, baseUrl, sectionCode)}</p> : undefined}
      checked={checked}
      onCheckedChange={onCheckedChange}
      checkboxAriaLabel={`Mark ${title}${author ? ` by ${author}` : ''} as completed`}
      shelved={shelved}
      onShelvedChange={onShelvedChange}
      shelfAriaLabel={`Add ${title}${author ? ` by ${author}` : ''} to My Shelf`}
    />
  );
}
