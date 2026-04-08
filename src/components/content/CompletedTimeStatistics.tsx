import { h } from 'preact';
import {
  DEFAULT_READING_SPEED_WPM,
  estimateReadingMinutes,
  formatEstimatedMinutes,
} from '../../utils/readingSpeed';

export const BRITANNICA_TIME_UNAVAILABLE_MESSAGE =
  'Time summaries for Britannica will appear here once article-length data is available.';

interface CompletedTimeStatisticsEntry {
  checklistKey: string;
  wordCount?: number;
  durationSeconds?: number;
}

interface CompletedTimeStatisticsProps {
  entries: CompletedTimeStatisticsEntry[];
  checklistState: Record<string, boolean>;
  sourceLabel: string;
  readingSpeedWpm?: number;
  unsupportedMessage?: string;
}

function estimateEntryMinutes(
  entry: CompletedTimeStatisticsEntry,
  readingSpeedWpm: number,
): number | undefined {
  if (entry.durationSeconds && entry.durationSeconds > 0) {
    return entry.durationSeconds / 60;
  }

  return estimateReadingMinutes(entry.wordCount, readingSpeedWpm);
}

export default function CompletedTimeStatistics({
  entries,
  checklistState,
  sourceLabel,
  readingSpeedWpm = DEFAULT_READING_SPEED_WPM,
  unsupportedMessage,
}: CompletedTimeStatisticsProps) {
  if (unsupportedMessage) {
    return (
      <p class="text-xs leading-5 text-slate-500">
        {unsupportedMessage}
      </p>
    );
  }

  let completedCount = 0;
  let timedCount = 0;
  let totalMinutes = 0;

  for (const entry of entries) {
    if (!checklistState[entry.checklistKey]) continue;

    completedCount += 1;
    const estimatedMinutes = estimateEntryMinutes(entry, readingSpeedWpm);
    if (!estimatedMinutes) continue;

    timedCount += 1;
    totalMinutes += estimatedMinutes;
  }

  if (completedCount === 0) {
    return (
      <p class="text-xs leading-5 text-slate-500">
        No completed {sourceLabel} items yet.
      </p>
    );
  }

  const timeLabel = formatEstimatedMinutes(totalMinutes, timedCount > 0 && !entries.some((entry) => entry.durationSeconds && entry.durationSeconds > 0));
  if (!timeLabel || timedCount === 0) {
    return (
      <p class="text-xs leading-5 text-slate-500">
        {completedCount} {completedCount === 1 ? 'item' : 'items'} completed here, but time data is not available yet.
      </p>
    );
  }

  return (
    <p class="text-xs leading-5 text-slate-500">
      <span class="font-medium text-slate-700">{timeLabel}</span>{' '}
      spent across {completedCount} {completedCount === 1 ? 'item' : 'items'} in {sourceLabel}.
    </p>
  );
}
