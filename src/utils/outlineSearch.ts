import type { OutlineGraph } from './outlineGraph';

export interface SearchOutlineEntry {
  url: string;
  title: string;
  pageType: 'Part' | 'Division' | 'Section';
  pageContext?: string;
  excerpt: string;
  keywords: string[];
}

const PART_NAMES: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
};

export function buildOutlineSearchEntries(outline: OutlineGraph, baseUrl: string): SearchOutlineEntry[] {
  const parts = outline.parts.map((part) => ({
    url: `${baseUrl}/part/${part.partNumber}`,
    title: part.title,
    pageType: 'Part' as const,
    pageContext: `Part ${PART_NAMES[part.partNumber]}`,
    excerpt: 'Browse this Part, its Divisions, introductory essay, and top recommended readings.',
    keywords: [
      `Part ${part.partNumber}`,
      `Part ${PART_NAMES[part.partNumber]}`,
      part.title,
      part.subtitle ?? '',
    ].filter(Boolean),
  }));

  const divisions = outline.flatDivisions.map((division) => {
    const part = outline.partByNumber.get(division.partNumber);

    return {
      url: `${baseUrl}/division/${division.divisionId}`,
      title: division.title,
      pageType: 'Division' as const,
      pageContext: part ? `Part ${PART_NAMES[division.partNumber]}: ${part.title}` : undefined,
      excerpt: 'Browse this Division, its Sections, and focused recommended readings.',
      keywords: [
        `Division ${division.romanNumeral}`,
        `Division ${division.divisionId}`,
        division.divisionId.replace('-', ' '),
        division.title,
        part?.title ?? '',
      ].filter(Boolean),
    };
  });

  const sections = outline.flatSections.map((section) => {
    const meta = outline.sectionMeta[section.sectionCode];
    const division = outline.divisionById.get(section.divisionId);
    const partName = PART_NAMES[section.partNumber];

    return {
      url: `${baseUrl}/section/${section.sectionCode.replace(/\//g, '-')}`,
      title: `${section.sectionCodeDisplay}: ${section.title}`,
      pageType: 'Section' as const,
      pageContext: meta
        ? `Part ${partName}: ${meta.partTitle} > Division ${division?.romanNumeral ?? ''}: ${meta.divisionTitle}`
        : undefined,
      excerpt: 'Open this Section outline and its mapped reading recommendations.',
      keywords: [
        `Section ${section.sectionCodeDisplay}`,
        section.sectionCodeDisplay,
        section.sectionCodeDisplay.replace(/\//g, '-'),
        section.sectionCode,
        section.sectionCode.replace(/\//g, '-'),
        section.title,
        meta?.divisionTitle ?? '',
        meta?.partTitle ?? '',
      ].filter(Boolean),
    };
  });

  return [...parts, ...divisions, ...sections];
}
