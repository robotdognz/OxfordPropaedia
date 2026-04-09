import {
  DEFAULT_READING_SPEED_WPM,
  estimateReadingMinutes,
  formatEstimatedMinutes,
} from './readingSpeed';

export interface TimedSummaryEntry {
  checklistKey: string;
  wordCount?: number;
  durationSeconds?: number;
}

export interface TimedEntriesSummary {
  completedCount: number;
  timedEntryCount: number;
  completedMinutes: number;
  remainingMinutes: number;
  usesApproximateTime: boolean;
}

function estimateEntryMinutes(
  entry: TimedSummaryEntry,
  readingSpeedWpm: number,
): number | undefined {
  if (entry.durationSeconds && entry.durationSeconds > 0) {
    return entry.durationSeconds / 60;
  }

  return estimateReadingMinutes(entry.wordCount, readingSpeedWpm);
}

export function summarizeTimedEntries(
  entries: TimedSummaryEntry[],
  checklistState: Record<string, boolean>,
  readingSpeedWpm = DEFAULT_READING_SPEED_WPM,
): TimedEntriesSummary {
  let completedCount = 0;
  let timedEntryCount = 0;
  let completedMinutes = 0;
  let remainingMinutes = 0;

  const usesApproximateTime = !entries.some(
    (entry) => (entry.durationSeconds ?? 0) > 0,
  );

  for (const entry of entries) {
    const isCompleted = Boolean(checklistState[entry.checklistKey]);
    if (isCompleted) {
      completedCount += 1;
    }

    const minutes = estimateEntryMinutes(entry, readingSpeedWpm);
    if (!minutes || minutes <= 0) continue;

    timedEntryCount += 1;
    if (isCompleted) {
      completedMinutes += minutes;
    } else {
      remainingMinutes += minutes;
    }
  }

  return {
    completedCount,
    timedEntryCount,
    completedMinutes,
    remainingMinutes,
    usesApproximateTime,
  };
}

export function formatSummaryMinutes(
  minutes: number,
  approximate: boolean,
): string {
  if (minutes <= 0) return '0 min';
  return formatEstimatedMinutes(minutes, approximate) ?? '0 min';
}

export function summarizeTimedEntryLines(
  summary: TimedEntriesSummary,
  options?: {
    showCompletedCount?: boolean;
  },
): string[] {
  const lines: string[] = [];
  const showCompletedCount = options?.showCompletedCount !== false;

  if (showCompletedCount && summary.completedCount > 0) {
    lines.push(`${summary.completedCount} checked off`);
  }

  const timeParts: string[] = [];

  if (summary.completedMinutes > 0) {
    timeParts.push(`${formatSummaryMinutes(summary.completedMinutes, summary.usesApproximateTime)} spent`);
  }

  if (summary.remainingMinutes > 0) {
    timeParts.push(`${formatSummaryMinutes(summary.remainingMinutes, summary.usesApproximateTime)} remaining`);
  }

  if (timeParts.length > 0) {
    lines.push(timeParts.join(' · '));
  }

  return lines;
}
