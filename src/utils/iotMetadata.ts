const dateFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatIotDate(datePublished?: string): string | null {
  if (!datePublished) return null;

  const parsed = new Date(datePublished);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateFormatter.format(parsed);
}

export function formatIotDuration(durationSeconds?: number): string | null {
  if (!durationSeconds || durationSeconds <= 0) return null;

  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatIotEpisodeMeta(input: {
  datePublished?: string;
  durationSeconds?: number;
}): string {
  return [
    formatIotDate(input.datePublished),
    formatIotDuration(input.durationSeconds),
  ]
    .filter(Boolean)
    .join(' · ');
}
