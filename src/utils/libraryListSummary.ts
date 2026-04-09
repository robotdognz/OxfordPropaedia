interface VisibleResultsSummaryOptions {
  visibleCount: number;
  matchingCount: number;
  scopeCount: number;
  noun: string;
  scopeLabel?: string;
}

export function buildVisibleResultsSummary({
  visibleCount,
  matchingCount,
  scopeCount,
  noun,
  scopeLabel,
}: VisibleResultsSummaryOptions): string | null {
  if (matchingCount === 0) return null;

  const suffix = scopeLabel ? ` ${scopeLabel}` : '';

  if (visibleCount < matchingCount) {
    return `Showing ${visibleCount} of ${matchingCount} matching ${noun}${suffix}`;
  }

  if (matchingCount < scopeCount) {
    return `${matchingCount} matching ${noun}${suffix}`;
  }

  return null;
}
