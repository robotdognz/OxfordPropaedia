import {
  macropaediaChecklistKey,
  vsiChecklistKey,
} from './readingChecklist';

export interface ReadingSectionSummary {
  sectionCode: string;
  sectionCodeDisplay: string;
  title: string;
  partNumber: number;
  divisionId: string;
}

export interface VsiCatalogTitle {
  title: string;
  author: string;
  number?: number;
  subject?: string;
  publicationYear?: number;
  edition?: number;
}

export interface VsiMappingRecord {
  sectionCode: string;
  mappings: Array<{
    vsiTitle: string;
    vsiAuthor: string;
    rationale: string;
  }>;
}

export interface SectionReadingSource extends ReadingSectionSummary {
  macropaediaReferences: string[];
}

export interface VsiAggregateEntry {
  title: string;
  author: string;
  number?: number;
  subject?: string;
  publicationYear?: number;
  edition?: number;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
}

export interface MacropaediaAggregateEntry {
  title: string;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
}

export interface VsiCoveragePathStep {
  title: string;
  author: string;
  number?: number;
  subject?: string;
  publicationYear?: number;
  edition?: number;
  checklistKey: string;
  sectionCount: number;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
}

export interface VsiCoverageSnapshot {
  totalTitles: number;
  completedTitles: number;
  totalCoveredSections: number;
  currentlyCoveredSections: number;
  remainingSections: number;
  path: VsiCoveragePathStep[];
}

export interface MacropaediaCoveragePathStep {
  title: string;
  checklistKey: string;
  sectionCount: number;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
}

export interface MacropaediaCoverageSnapshot {
  totalArticles: number;
  completedArticles: number;
  totalCoveredSections: number;
  currentlyCoveredSections: number;
  remainingSections: number;
  path: MacropaediaCoveragePathStep[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function normalizeLookupText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sectionSort(a: ReadingSectionSummary, b: ReadingSectionSummary): number {
  if (a.partNumber !== b.partNumber) {
    return a.partNumber - b.partNumber;
  }

  return collator.compare(a.sectionCodeDisplay, b.sectionCodeDisplay);
}

function vsiSort(a: VsiAggregateEntry, b: VsiAggregateEntry): number {
  if (a.sectionCount !== b.sectionCount) {
    return b.sectionCount - a.sectionCount;
  }

  const titleCompare = collator.compare(a.title, b.title);
  if (titleCompare !== 0) return titleCompare;

  return collator.compare(a.author, b.author);
}

function macropaediaSort(a: MacropaediaAggregateEntry, b: MacropaediaAggregateEntry): number {
  if (a.sectionCount !== b.sectionCount) {
    return b.sectionCount - a.sectionCount;
  }

  return collator.compare(a.title, b.title);
}

export function formatEditionLabel(edition?: number): string | null {
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

export function buildVsiAggregateEntries(
  sections: ReadingSectionSummary[],
  mappings: VsiMappingRecord[],
  catalog: VsiCatalogTitle[]
): VsiAggregateEntry[] {
  const sectionLookup = new Map(sections.map((section) => [section.sectionCode, section]));
  const catalogLookup = new Map(
    catalog.map((entry) => [
      `${normalizeLookupText(entry.title)}::${normalizeLookupText(entry.author)}`,
      entry,
    ])
  );
  const aggregateMap = new Map<
    string,
    {
      entry: VsiAggregateEntry;
      sectionCodes: Set<string>;
    }
  >();

  for (const sectionMapping of mappings) {
    const section = sectionLookup.get(sectionMapping.sectionCode);
    if (!section) continue;

    const seenInSection = new Set<string>();

    for (const mappingEntry of sectionMapping.mappings) {
      const lookupKey = `${normalizeLookupText(mappingEntry.vsiTitle)}::${normalizeLookupText(mappingEntry.vsiAuthor)}`;
      if (seenInSection.has(lookupKey)) continue;
      seenInSection.add(lookupKey);

      const catalogEntry = catalogLookup.get(lookupKey);
      const existing = aggregateMap.get(lookupKey);

      if (existing) {
        if (!existing.sectionCodes.has(section.sectionCode)) {
          existing.sectionCodes.add(section.sectionCode);
          existing.entry.sections.push(section);
          existing.entry.sectionCount = existing.entry.sections.length;
        }
        continue;
      }

      const title = catalogEntry?.title ?? mappingEntry.vsiTitle;
      const author = catalogEntry?.author ?? mappingEntry.vsiAuthor;

      aggregateMap.set(lookupKey, {
        sectionCodes: new Set([section.sectionCode]),
        entry: {
          title,
          author,
          number: catalogEntry?.number,
          subject: catalogEntry?.subject,
          publicationYear: catalogEntry?.publicationYear,
          edition: catalogEntry?.edition,
          checklistKey: vsiChecklistKey(title, author),
          sectionCount: 1,
          sections: [section],
        },
      });
    }
  }

  return Array.from(aggregateMap.values())
    .map(({ entry }) => ({
      ...entry,
      sections: [...entry.sections].sort(sectionSort),
      sectionCount: entry.sections.length,
    }))
    .sort(vsiSort);
}

export function buildMacropaediaAggregateEntries(
  sections: SectionReadingSource[]
): MacropaediaAggregateEntry[] {
  const aggregateMap = new Map<
    string,
    {
      entry: MacropaediaAggregateEntry;
      sectionCodes: Set<string>;
    }
  >();

  for (const section of sections) {
    const seenInSection = new Set<string>();

    for (const reference of section.macropaediaReferences ?? []) {
      const title = reference.replace(/\s+/g, ' ').trim();
      const lookupKey = normalizeLookupText(title);

      if (!title || seenInSection.has(lookupKey)) continue;
      seenInSection.add(lookupKey);

      const existing = aggregateMap.get(lookupKey);
      if (existing) {
        if (!existing.sectionCodes.has(section.sectionCode)) {
          existing.sectionCodes.add(section.sectionCode);
          existing.entry.sections.push(section);
          existing.entry.sectionCount = existing.entry.sections.length;
        }
        continue;
      }

      aggregateMap.set(lookupKey, {
        sectionCodes: new Set([section.sectionCode]),
        entry: {
          title,
          checklistKey: macropaediaChecklistKey(title),
          sectionCount: 1,
          sections: [section],
        },
      });
    }
  }

  return Array.from(aggregateMap.values())
    .map(({ entry }) => ({
      ...entry,
      sections: [...entry.sections].sort(sectionSort),
      sectionCount: entry.sections.length,
    }))
    .sort(macropaediaSort);
}

export function buildVsiCoverageSnapshot(
  entries: VsiAggregateEntry[],
  completedChecklistKeys: Set<string>,
  pathLength = 12
): VsiCoverageSnapshot {
  const snapshot = buildCoverageSnapshot(entries, completedChecklistKeys, pathLength);

  return {
    totalTitles: snapshot.totalEntries,
    completedTitles: snapshot.completedEntries,
    totalCoveredSections: snapshot.totalCoveredSections,
    currentlyCoveredSections: snapshot.currentlyCoveredSections,
    remainingSections: snapshot.remainingSections,
    path: snapshot.path.map(({ entry, ...rest }) => ({
      ...entry,
      ...rest,
    })),
  };
}

export function buildMacropaediaCoverageSnapshot(
  entries: MacropaediaAggregateEntry[],
  completedChecklistKeys: Set<string>,
  pathLength = 12
): MacropaediaCoverageSnapshot {
  const snapshot = buildCoverageSnapshot(entries, completedChecklistKeys, pathLength);

  return {
    totalArticles: snapshot.totalEntries,
    completedArticles: snapshot.completedEntries,
    totalCoveredSections: snapshot.totalCoveredSections,
    currentlyCoveredSections: snapshot.currentlyCoveredSections,
    remainingSections: snapshot.remainingSections,
    path: snapshot.path.map(({ entry, ...rest }) => ({
      ...entry,
      ...rest,
    })),
  };
}

function buildCoverageSnapshot<TEntry extends {
  title: string;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
}>(
  entries: TEntry[],
  completedChecklistKeys: Set<string>,
  pathLength: number
): {
  totalEntries: number;
  completedEntries: number;
  totalCoveredSections: number;
  currentlyCoveredSections: number;
  remainingSections: number;
  path: Array<{
    entry: TEntry;
    newSectionCount: number;
    cumulativeCoveredSectionCount: number;
    newSections: ReadingSectionSummary[];
  }>;
} {
  const coveredSectionCodes = new Set<string>();
  let completedEntries = 0;

  for (const entry of entries) {
    if (!completedChecklistKeys.has(entry.checklistKey)) continue;

    completedEntries += 1;
    for (const section of entry.sections) {
      coveredSectionCodes.add(section.sectionCode);
    }
  }

  const totalSectionCodes = new Set<string>();
  for (const entry of entries) {
    for (const section of entry.sections) {
      totalSectionCodes.add(section.sectionCode);
    }
  }

  const currentlyCoveredSections = coveredSectionCodes.size;

  const remainingEntries = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey));
  const path: Array<{
    entry: TEntry;
    newSectionCount: number;
    cumulativeCoveredSectionCount: number;
    newSections: ReadingSectionSummary[];
  }> = [];

  while (path.length < pathLength) {
    let bestEntry: TEntry | null = null;
    let bestNewSections: ReadingSectionSummary[] = [];

    for (const entry of remainingEntries) {
      if (path.some((step) => step.checklistKey === entry.checklistKey)) continue;

      const newSections = entry.sections.filter((section) => !coveredSectionCodes.has(section.sectionCode));
      if (newSections.length === 0) continue;

      if (!bestEntry) {
        bestEntry = entry;
        bestNewSections = newSections;
        continue;
      }

      if (newSections.length > bestNewSections.length) {
        bestEntry = entry;
        bestNewSections = newSections;
        continue;
      }

      if (newSections.length === bestNewSections.length) {
        if (entry.sectionCount > bestEntry.sectionCount) {
          bestEntry = entry;
          bestNewSections = newSections;
          continue;
        }

        if (
          entry.sectionCount === bestEntry.sectionCount &&
          collator.compare(entry.title, bestEntry.title) < 0
        ) {
          bestEntry = entry;
          bestNewSections = newSections;
        }
      }
    }

    if (!bestEntry || bestNewSections.length === 0) break;

    for (const section of bestNewSections) {
      coveredSectionCodes.add(section.sectionCode);
    }

    path.push({
      entry: bestEntry,
      newSectionCount: bestNewSections.length,
      cumulativeCoveredSectionCount: coveredSectionCodes.size,
      newSections: [...bestNewSections].sort(sectionSort),
    });
  }

  return {
    totalEntries: entries.length,
    completedEntries,
    totalCoveredSections: totalSectionCodes.size,
    currentlyCoveredSections,
    remainingSections: totalSectionCodes.size - currentlyCoveredSections,
    path,
  };
}
