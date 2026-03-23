import { getCollection } from 'astro:content';
import iotCatalog from '../data/iot-catalog.json';
import { loadOutlineGraph } from './outlineGraph';

export interface IotTopReading {
  pid: string;
  title: string;
  count: number;
  sections?: number;
  paths?: number;
  relevance: number;
}

interface IndexedIotEntry {
  title: string;
  divisions: Record<number, Set<string>>;
  partSections: Record<number, Set<string>>;
  partPaths: Record<number, number>;
  divSections: Record<string, Set<string>>;
  divPaths: Record<string, number>;
  divSectionPaths: Record<string, Record<string, number>>;
}

interface IotScopedRecommendations {
  partReadingsByPart: Map<number, IotTopReading[]>;
  divisionReadingsByDivision: Map<string, IotTopReading[]>;
}

const MIN_RESULTS = 5;
let cachedRecommendationsPromise: Promise<IotScopedRecommendations> | undefined;

function entropy(counts: number[]): number {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;

  let result = 0;
  for (const count of counts) {
    if (count <= 0) continue;
    const p = count / total;
    result -= p * Math.log2(p);
  }

  return result;
}

function compositeScore(spread: number, count: number, sections: number, paths: number): number {
  return spread * 10000 + count * 1000 + sections * 100 + paths;
}

async function buildRecommendations(): Promise<IotScopedRecommendations> {
  const [outline, iotMappings] = await Promise.all([
    loadOutlineGraph(),
    getCollection('iot-mappings'),
  ]);

  const catalogLookup = new Map((iotCatalog as any).episodes.map((episode: any) => [episode.pid, episode]));
  const sectionToPart = new Map(outline.flatSections.map((section) => [section.sectionCode, section.partNumber]));
  const sectionToDivision = new Map(outline.flatSections.map((section) => [section.sectionCode, section.divisionId]));
  const divisionSectionCount = new Map(outline.flatDivisions.map((division) => [division.divisionId, division.sections.length]));

  const index = new Map<string, IndexedIotEntry>();

  for (const sectionMapping of iotMappings) {
    const sectionCode = sectionMapping.data.sectionCode;
    const partNumber = sectionToPart.get(sectionCode);
    const divisionId = sectionToDivision.get(sectionCode);
    if (!partNumber || !divisionId) continue;

    for (const mapping of sectionMapping.data.mappings) {
      const pathCount = (mapping.relevantPathsAI || []).length || 1;
      const existing = index.get(mapping.pid);

      if (!existing) {
        index.set(mapping.pid, {
          title: catalogLookup.get(mapping.pid)?.title ?? mapping.episodeTitle,
          divisions: { [partNumber]: new Set([divisionId]) },
          partSections: { [partNumber]: new Set([sectionCode]) },
          partPaths: { [partNumber]: pathCount },
          divSections: { [divisionId]: new Set([sectionCode]) },
          divPaths: { [divisionId]: pathCount },
          divSectionPaths: { [divisionId]: { [sectionCode]: pathCount } },
        });
        continue;
      }

      if (!existing.divisions[partNumber]) existing.divisions[partNumber] = new Set<string>();
      existing.divisions[partNumber].add(divisionId);

      if (!existing.partSections[partNumber]) existing.partSections[partNumber] = new Set<string>();
      existing.partSections[partNumber].add(sectionCode);
      existing.partPaths[partNumber] = (existing.partPaths[partNumber] || 0) + pathCount;

      if (!existing.divSections[divisionId]) existing.divSections[divisionId] = new Set<string>();
      existing.divSections[divisionId].add(sectionCode);
      existing.divPaths[divisionId] = (existing.divPaths[divisionId] || 0) + pathCount;

      if (!existing.divSectionPaths[divisionId]) existing.divSectionPaths[divisionId] = {};
      existing.divSectionPaths[divisionId][sectionCode] = (existing.divSectionPaths[divisionId][sectionCode] || 0) + pathCount;
    }
  }

  const getPartDivDistribution = (entry: IndexedIotEntry, partNumber: number): number[] => {
    const divisionCounts = new Map<string, number>();
    const sections = entry.partSections[partNumber];
    if (!sections) return [];

    for (const sectionCode of sections) {
      const divisionId = sectionToDivision.get(sectionCode);
      if (!divisionId) continue;
      divisionCounts.set(divisionId, (divisionCounts.get(divisionId) || 0) + 1);
    }

    return [...divisionCounts.values()];
  };

  const partItems = (partNumber: number): IotTopReading[] => {
    const part = outline.partByNumber.get(partNumber);
    const totalDivisions = part?.divisions.length || 1;
    const totalSectionsInPart = part?.divisions.reduce((sum, division) => sum + division.sections.length, 0) || 1;

    const thresholds = [
      { divPct: 0.5, secPct: 0.2, relCutoff: 30 },
      { divPct: 0.4, secPct: 0.15, relCutoff: 25 },
      { divPct: 0.3, secPct: 0.1, relCutoff: 20 },
      { divPct: 0, secPct: 0, relCutoff: 0 },
    ];

    for (const { divPct, secPct, relCutoff } of thresholds) {
      const minDivisions = Math.max(2, Math.ceil(totalDivisions * divPct));
      const minSections = Math.max(2, Math.ceil(totalSectionsInPart * secPct));
      const items: Array<IotTopReading & { _score: number }> = [];

      for (const [pid, entry] of index) {
        const divisions = entry.divisions[partNumber];
        if (!divisions || divisions.size < minDivisions) continue;

        const sectionCount = entry.partSections[partNumber]?.size || 0;
        if (sectionCount < minSections) continue;

        const pathCount = entry.partPaths[partNumber] || 0;
        const spread = entropy(getPartDivDistribution(entry, partNumber));
        items.push({
          pid,
          title: entry.title,
          count: divisions.size,
          sections: sectionCount,
          paths: pathCount,
          relevance: 0,
          _score: compositeScore(spread, divisions.size, sectionCount, pathCount),
        });
      }

      items.sort((left, right) => right._score - left._score || left.title.localeCompare(right.title));
      const maxScore = items[0]?._score || 1;
      const result = items
        .map(({ _score, ...item }) => ({ ...item, relevance: Math.round((_score / maxScore) * 100) }))
        .filter((item) => item.relevance >= relCutoff);

      if (result.length >= MIN_RESULTS) return result;
    }

    return [];
  };

  const divisionItems = (divisionId: string): IotTopReading[] => {
    const totalSections = divisionSectionCount.get(divisionId) || 1;

    const thresholds = [
      { secPct: 0.2, relCutoff: 30, minSections: 2 },
      { secPct: 0.15, relCutoff: 20, minSections: 2 },
      { secPct: 0, relCutoff: 0, minSections: 2 },
      { secPct: 0, relCutoff: 0, minSections: 1 },
    ];

    for (const threshold of thresholds) {
      const minSections = Math.max(threshold.minSections, Math.ceil(totalSections * threshold.secPct));
      const items: Array<IotTopReading & { _score: number }> = [];

      for (const [pid, entry] of index) {
        const sections = entry.divSections[divisionId];
        if (!sections || sections.size < minSections) continue;

        const pathCount = entry.divPaths[divisionId] || 0;
        const sectionPathCounts = entry.divSectionPaths[divisionId]
          ? Object.values(entry.divSectionPaths[divisionId])
          : [...sections].map(() => 1);
        const spread = entropy(sectionPathCounts);
        const coverageRatio = sections.size / totalSections;

        items.push({
          pid,
          title: entry.title,
          count: sections.size,
          paths: pathCount,
          relevance: 0,
          _score: spread * 10000 + coverageRatio * 5000 + sections.size * 1000 + pathCount,
        });
      }

      items.sort((left, right) => right._score - left._score || left.title.localeCompare(right.title));
      const maxScore = items[0]?._score || 1;
      const result = items
        .map(({ _score, ...item }) => ({ ...item, relevance: Math.round((_score / maxScore) * 100) }))
        .filter((item) => item.relevance >= threshold.relCutoff);

      if (result.length >= MIN_RESULTS) return result;
    }

    return [];
  };

  return {
    partReadingsByPart: new Map(outline.parts.map((part) => [part.partNumber, partItems(part.partNumber)])),
    divisionReadingsByDivision: new Map(outline.flatDivisions.map((division) => [division.divisionId, divisionItems(division.divisionId)])),
  };
}

export async function loadIotTopReadings(): Promise<IotScopedRecommendations> {
  if (!cachedRecommendationsPromise) {
    cachedRecommendationsPromise = buildRecommendations();
  }

  return cachedRecommendationsPromise;
}
