/**
 * Normalize a section code for use in filenames and URLs.
 * Converts slashes to hyphens: "96/10" → "96-10"
 */
export function normalizeSectionCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/\//g, '-');
}

/**
 * Get the display form of a section code (preserves original slashes).
 */
export function displaySectionCode(code: string): string {
  return code.replace(/-/g, '/');
}

/**
 * Get the URL path for a section.
 */
export function sectionUrl(sectionCode: string, base = ''): string {
  return `${base}/section/${normalizeSectionCode(sectionCode)}`;
}

export function normalizeOutlinePath(path: string): string {
  return path.replace(/\s+/g, '').replace(/^\.+/, '').replace(/\.+$/, '');
}

export function outlineAnchorId(sectionCode: string, outlinePath: string): string {
  const normalizedPath = normalizeOutlinePath(outlinePath);

  return `outline-${normalizeSectionCode(sectionCode).toLowerCase()}-${normalizedPath
    .split('.')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
    .join('-')}`;
}

export function sectionReferenceUrl(sectionCode: string, outlinePath = '', base = ''): string {
  const url = sectionUrl(sectionCode, base);
  const normalizedPath = normalizeOutlinePath(outlinePath);

  return normalizedPath
    ? `${url}#${outlineAnchorId(sectionCode, normalizedPath)}`
    : url;
}

/**
 * Get the URL path for a division.
 */
export function divisionUrl(divisionId: string, base = ''): string {
  return `${base}/division/${divisionId}`;
}

/**
 * Get the URL path for a part.
 */
export function partUrl(partNumber: number, base = ''): string {
  return `${base}/part/${partNumber}`;
}

/**
 * Part number to Roman numeral display (for Part titles).
 */
const PART_NAMES: Record<number, string> = {
  1: 'Part One',
  2: 'Part Two',
  3: 'Part Three',
  4: 'Part Four',
  5: 'Part Five',
  6: 'Part Six',
  7: 'Part Seven',
  8: 'Part Eight',
  9: 'Part Nine',
  10: 'Part Ten',
};

export function partDisplayName(partNumber: number): string {
  return PART_NAMES[partNumber] ?? `Part ${partNumber}`;
}

/**
 * Get the Tailwind color class for a part number.
 */
export function partColorClass(partNumber: number): string {
  return `part-${partNumber}`;
}
