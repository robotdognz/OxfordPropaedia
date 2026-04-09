import { h } from 'preact';
import { linkifyRationaleReferences } from '../../utils/rationaleLinks';
import { formatIotEpisodeMeta } from '../../utils/iotMetadata';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';
import ReadingRecommendationCard from './ReadingRecommendationCard';

export interface IotCardProps {
  pid?: string;
  title: string;
  synopsis?: string;
  rationale?: string;
  baseUrl: string;
  sectionCode?: string;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  datePublished?: string;
  durationSeconds?: number;
  badges?: RecommendationCardBadge[];
  whyTitle?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  shelved: boolean;
  onShelvedChange: (shelved: boolean) => void;
}

export default function IotCard({
  pid,
  title,
  synopsis,
  rationale,
  baseUrl,
  sectionCode,
  matchPercent,
  flags,
  datePublished,
  durationSeconds,
  badges,
  whyTitle = 'Why this episode?',
  checked,
  onCheckedChange,
  shelved,
  onShelvedChange,
}: IotCardProps) {
  const metadata = formatIotEpisodeMeta({ datePublished, durationSeconds });

  return (
    <ReadingRecommendationCard
      title={title}
      href={pid ? `${baseUrl}/iot/${pid}` : `${baseUrl}/iot`}
      metadata={metadata || null}
      matchPercent={matchPercent}
      flags={flags}
      badges={badges}
      whyTitle={rationale ? whyTitle : undefined}
      whyContent={rationale ? <p class="text-gray-600">{linkifyRationaleReferences(rationale, baseUrl, sectionCode)}</p> : undefined}
      checked={checked}
      onCheckedChange={onCheckedChange}
      checkboxAriaLabel={`Mark ${title} as listened`}
      shelved={shelved}
      onShelvedChange={onShelvedChange}
      shelfAriaLabel={`Add ${title} to My Shelf`}
    />
  );
}
