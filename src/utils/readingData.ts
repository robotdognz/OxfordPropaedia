import {
  iotChecklistKey,
  macropaediaChecklistKey,
  vsiChecklistKey,
  wikipediaChecklistKey,
} from './readingChecklist';
import { macropaediaLookupKey, vsiLookupKey } from './readingIdentity';
import { analyzeSubsectionCoverage, buildSectionOutlinePathIndex } from './outlineCoverage';

export interface ReadingSectionSummary {
  sectionCode: string;
  sectionCodeDisplay: string;
  title: string;
  partNumber: number;
  partTitle?: string;
  divisionId: string;
  divisionTitle?: string;
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
    rationaleAI: string;
    relevantPathsAI?: string[];
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
  subsectionKeys?: string[];
  mappedPathCount?: number;
  mappedPathSectionCount?: number;
  fallbackSectionCount?: number;
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

export interface WikipediaAggregateEntry {
  title: string;
  displayTitle?: string;
  url: string;
  category?: string;
  lowestLevel: number;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
  subsectionKeys?: string[];
  mappedPathCount?: number;
  mappedPathSectionCount?: number;
  fallbackSectionCount?: number;
}

export interface IotAggregateEntry {
  pid: string;
  title: string;
  url: string;
  synopsis?: string;
  datePublished?: string;
  durationSeconds?: number;
  checklistKey: string;
  sectionCount: number;
  sections: ReadingSectionSummary[];
  subsectionKeys?: string[];
  mappedPathCount?: number;
  mappedPathSectionCount?: number;
  fallbackSectionCount?: number;
}

export interface IotCoveragePathStep {
  pid: string;
  title: string;
  url: string;
  synopsis?: string;
  datePublished?: string;
  durationSeconds?: number;
  checklistKey: string;
  sectionCount: number;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
}

export interface IotCoverageSnapshot {
  totalEpisodes: number;
  completedEpisodes: number;
  totalCoveredSections: number;
  currentlyCoveredSections: number;
  remainingSections: number;
  path: IotCoveragePathStep[];
}

interface OutlineBearingSection extends ReadingSectionSummary {
  outline?: Array<{
    level?: string;
    children?: any[];
  }>;
}

export interface WikipediaCoverageSnapshot {
  totalArticles: number;
  completedArticles: number;
  totalCoveredSections: number;
  currentlyCoveredSections: number;
  remainingSections: number;
  path: WikipediaCoveragePathStep[];
}

export interface WikipediaCoveragePathStep {
  title: string;
  url: string;
  checklistKey: string;
  sectionCount: number;
  newSectionCount: number;
  cumulativeCoveredSectionCount: number;
  newSections: ReadingSectionSummary[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

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
  sections: OutlineBearingSection[],
  mappings: VsiMappingRecord[],
  catalog: VsiCatalogTitle[]
): VsiAggregateEntry[] {
  const sectionLookup = new Map(sections.map((section) => [section.sectionCode, section]));
  const sectionOutlinePathIndex = buildSectionOutlinePathIndex(
    sections.map((section) => ({
      sectionCode: section.sectionCode,
      outline: section.outline ?? [],
    }))
  );
  const catalogLookup = new Map(
    catalog.map((entry) => [
      vsiLookupKey(entry.title, entry.author),
      entry,
    ])
  );
  const aggregateMap = new Map<
    string,
    {
      entry: VsiAggregateEntry;
      sectionCodes: Set<string>;
      subsectionKeys: Set<string>;
      mappedPathSectionCodes: Set<string>;
      fallbackSectionCodes: Set<string>;
      mappedPathCount: number;
    }
  >();

  for (const sectionMapping of mappings) {
    const section = sectionLookup.get(sectionMapping.sectionCode);
    if (!section) continue;

    for (const mappingEntry of sectionMapping.mappings) {
      const lookupKey = vsiLookupKey(mappingEntry.vsiTitle, mappingEntry.vsiAuthor);
      const catalogEntry = catalogLookup.get(lookupKey);
      const existing = aggregateMap.get(lookupKey);
      const subsectionCoverage = analyzeSubsectionCoverage(
        section.sectionCode,
        mappingEntry.relevantPathsAI,
        sectionOutlinePathIndex
      );
      const subsectionKeys = subsectionCoverage.coverageKeys;

      if (existing) {
        if (!existing.sectionCodes.has(section.sectionCode)) {
          existing.sectionCodes.add(section.sectionCode);
          existing.entry.sections.push(section);
          existing.entry.sectionCount = existing.entry.sections.length;
        }
        subsectionKeys.forEach((key) => existing.subsectionKeys.add(key));
        subsectionCoverage.matchedPathKeys.forEach(() => {
          existing.mappedPathSectionCodes.add(section.sectionCode);
        });
        if (subsectionCoverage.usedFallback) {
          existing.fallbackSectionCodes.add(section.sectionCode);
        }
        existing.mappedPathCount += subsectionCoverage.matchedPathKeys.length;
        continue;
      }

      const title = catalogEntry?.title ?? mappingEntry.vsiTitle;
      const author = catalogEntry?.author ?? mappingEntry.vsiAuthor;

      aggregateMap.set(lookupKey, {
        sectionCodes: new Set([section.sectionCode]),
        subsectionKeys: new Set(subsectionKeys),
        mappedPathSectionCodes: subsectionCoverage.matchedPathKeys.length > 0 ? new Set([section.sectionCode]) : new Set<string>(),
        fallbackSectionCodes: subsectionCoverage.usedFallback ? new Set([section.sectionCode]) : new Set<string>(),
        mappedPathCount: subsectionCoverage.matchedPathKeys.length,
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
          subsectionKeys,
          mappedPathCount: subsectionCoverage.matchedPathKeys.length,
          mappedPathSectionCount: subsectionCoverage.matchedPathKeys.length > 0 ? 1 : 0,
          fallbackSectionCount: subsectionCoverage.usedFallback ? 1 : 0,
        },
      });
    }
  }

  return Array.from(aggregateMap.values())
    .map(({ entry, subsectionKeys, mappedPathSectionCodes, fallbackSectionCodes, mappedPathCount }) => ({
      ...entry,
      sections: [...entry.sections].sort(sectionSort),
      sectionCount: entry.sections.length,
      subsectionKeys: [...subsectionKeys].sort(),
      mappedPathCount,
      mappedPathSectionCount: mappedPathSectionCodes.size,
      fallbackSectionCount: fallbackSectionCodes.size,
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
      const lookupKey = macropaediaLookupKey(title);

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
  pathLength = Infinity
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
  pathLength = Infinity
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

export function buildWikipediaAggregateEntries(
  articles: Array<{
    title: string;
    displayTitle?: string;
    url: string;
    category?: string;
    lowestLevel: number;
    sectionCodes: string[];
    subsectionKeys?: string[];
    mappedPathCount?: number;
    mappedPathSectionCount?: number;
    fallbackSectionCount?: number;
  }>,
  sectionLookup: Map<string, ReadingSectionSummary>
): WikipediaAggregateEntry[] {
  return articles.map((article) => {
    const sections = (article.sectionCodes || [])
      .map((code) => sectionLookup.get(code))
      .filter((s): s is ReadingSectionSummary => s !== undefined)
      .sort(sectionSort);

    return {
      title: article.title,
      displayTitle: article.displayTitle,
      url: article.url,
      category: article.category,
      lowestLevel: article.lowestLevel,
      checklistKey: wikipediaChecklistKey(article.title),
      sectionCount: sections.length,
      sections,
      subsectionKeys: Array.from(new Set(article.subsectionKeys ?? [])).sort(),
      mappedPathCount: article.mappedPathCount ?? 0,
      mappedPathSectionCount: article.mappedPathSectionCount ?? 0,
      fallbackSectionCount: article.fallbackSectionCount ?? 0,
    };
  }).sort((a, b) => {
    if (a.sectionCount !== b.sectionCount) return b.sectionCount - a.sectionCount;
    return collator.compare(a.title, b.title);
  });
}

export function buildIotAggregateEntries(
  episodes: Array<{
    pid: string;
    title: string;
    url: string;
    synopsis?: string;
    datePublished?: string;
    durationSeconds?: number;
    sectionCodes: string[];
    subsectionKeys?: string[];
    mappedPathCount?: number;
    mappedPathSectionCount?: number;
    fallbackSectionCount?: number;
  }>,
  sectionLookup: Map<string, ReadingSectionSummary>
): IotAggregateEntry[] {
  return episodes.map((episode) => {
    const sections = (episode.sectionCodes || [])
      .map((code) => sectionLookup.get(code))
      .filter((section): section is ReadingSectionSummary => section !== undefined)
      .sort(sectionSort);

    return {
      pid: episode.pid,
      title: episode.title,
      url: episode.url,
      synopsis: episode.synopsis,
      datePublished: episode.datePublished,
      durationSeconds: episode.durationSeconds,
      checklistKey: iotChecklistKey(episode.pid),
      sectionCount: sections.length,
      sections,
      subsectionKeys: Array.from(new Set(episode.subsectionKeys ?? [])).sort(),
      mappedPathCount: episode.mappedPathCount ?? 0,
      mappedPathSectionCount: episode.mappedPathSectionCount ?? 0,
      fallbackSectionCount: episode.fallbackSectionCount ?? 0,
    };
  }).sort((a, b) => {
    if (a.sectionCount !== b.sectionCount) return b.sectionCount - a.sectionCount;
    return collator.compare(a.title, b.title);
  });
}

export function buildIotCoverageSnapshot(
  entries: IotAggregateEntry[],
  completedChecklistKeys: Set<string>,
  pathLength = Infinity
): IotCoverageSnapshot {
  const snapshot = buildCoverageSnapshot(entries, completedChecklistKeys, pathLength);

  return {
    totalEpisodes: snapshot.totalEntries,
    completedEpisodes: snapshot.completedEntries,
    totalCoveredSections: snapshot.totalCoveredSections,
    currentlyCoveredSections: snapshot.currentlyCoveredSections,
    remainingSections: snapshot.remainingSections,
    path: snapshot.path.map(({ entry, ...rest }) => ({
      ...entry,
      ...rest,
    })),
  };
}

export function buildWikipediaCoverageSnapshot(
  entries: WikipediaAggregateEntry[],
  completedChecklistKeys: Set<string>,
  pathLength = Infinity
): WikipediaCoverageSnapshot {
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
        // Prefer the book whose new sections span the most different parts and divisions
        const spread = (sections: ReadingSectionSummary[]) => {
          const parts = new Set(sections.map((s) => s.partNumber));
          const divisions = new Set(sections.map((s) => s.divisionId));
          return parts.size * 100 + divisions.size;
        };
        const entrySpread = spread(newSections);
        const bestSpread = spread(bestNewSections);

        if (entrySpread > bestSpread) {
          bestEntry = entry;
          bestNewSections = newSections;
          continue;
        }

        // If spread is equal, prefer the book with more total section coverage
        if (entrySpread === bestSpread && entry.sectionCount > bestEntry.sectionCount) {
          bestEntry = entry;
          bestNewSections = newSections;
          continue;
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
