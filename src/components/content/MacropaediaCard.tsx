import { h } from 'preact';
import { slugify } from '../../utils/helpers';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';
import ReadingRecommendationCard from './ReadingRecommendationCard';

export interface MacropaediaCardProps {
  title: string;
  rationale?: h.JSX.Element;
  whyTitle?: string;
  baseUrl: string;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  badges?: RecommendationCardBadge[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  shelved: boolean;
  onShelvedChange: (shelved: boolean) => void;
}

export default function MacropaediaCard({
  title,
  rationale,
  whyTitle = 'Why this article?',
  baseUrl,
  matchPercent,
  flags,
  badges,
  checked,
  onCheckedChange,
  shelved,
  onShelvedChange,
}: MacropaediaCardProps) {
  return (
    <ReadingRecommendationCard
      title={title}
      href={`${baseUrl}/macropaedia/${slugify(title)}`}
      matchPercent={matchPercent}
      flags={flags}
      badges={badges}
      whyTitle={rationale ? whyTitle : undefined}
      whyContent={rationale}
      checked={checked}
      onCheckedChange={onCheckedChange}
      checkboxAriaLabel={`Mark ${title} as completed`}
      shelved={shelved}
      onShelvedChange={onShelvedChange}
      shelfAriaLabel={`Add ${title} to My Shelf`}
    />
  );
}
