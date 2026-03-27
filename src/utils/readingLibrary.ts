import { divisionUrl, partUrl, sectionUrl } from './helpers';
import type { ReadingSectionSummary } from './readingData';

export interface ChecklistBackedReadingEntry {
  checklistKey: string;
  sections: ReadingSectionSummary[];
  progressSubsectionKeys?: string[];
}

export interface CoverageRing {
  label: string;
  count: number;
  total: number;
  color: string;
}

export type CoverageLayer = 'part' | 'division' | 'section' | 'subsection';

export const COVERAGE_LAYER_ORDER: CoverageLayer[] = ['part', 'division', 'section', 'subsection'];

export const COVERAGE_LAYER_META: Record<CoverageLayer, {
  label: string;
  pluralLabel: string;
  shortLabel: string;
}> = {
  part: {
    label: 'Part',
    pluralLabel: 'Parts',
    shortLabel: 'Parts',
  },
  division: {
    label: 'Division',
    pluralLabel: 'Divisions',
    shortLabel: 'Divisions',
  },
  section: {
    label: 'Section',
    pluralLabel: 'Sections',
    shortLabel: 'Sections',
  },
  subsection: {
    label: 'Subsection',
    pluralLabel: 'Subsections',
    shortLabel: 'Subsections',
  },
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function coverageLayerLabel(layer: CoverageLayer, count: number, options: {
  lowercase?: boolean;
} = {}): string {
  const meta = COVERAGE_LAYER_META[layer];
  const label = count === 1 ? meta.label : meta.pluralLabel;
  return options.lowercase ? label.toLowerCase() : label;
}

export function countEntryCoverageForLayer(
  entry: ChecklistBackedReadingEntry,
  layer: CoverageLayer,
): number {
  return uniqueTargetKeysForEntry(entry, layer).length;
}

export interface LayerCoveragePathStep<TEntry extends ChecklistBackedReadingEntry> {
  entry: TEntry;
  newCoverageCount: number;
  cumulativeCoveredCount: number;
  newSections: ReadingSectionSummary[];
}

export interface LayerCoverageSnapshot<TEntry extends ChecklistBackedReadingEntry> {
  layer: CoverageLayer;
  totalEntries: number;
  completedEntries: number;
  totalCoverageCount: number;
  currentlyCoveredCount: number;
  remainingCoverageCount: number;
  path: Array<LayerCoveragePathStep<TEntry>>;
}

export interface CoverageGapItem {
  key: string;
  label: string;
  href: string;
  uncoveredCount: number;
  candidateCount: number;
  description: string;
}

export function completedChecklistKeysFromState(checklistState: Record<string, boolean>): Set<string> {
  return new Set(Object.keys(checklistState).filter((key) => checklistState[key] === true));
}

export function countCompletedEntries<T extends { checklistKey: string }>(
  entries: T[],
  checklistState: Record<string, boolean>
): number {
  return entries.filter((entry) => Boolean(checklistState[entry.checklistKey])).length;
}

function coverageKeyForSection(section: ReadingSectionSummary, layer: CoverageLayer): string {
  switch (layer) {
    case 'part':
      return String(section.partNumber);
    case 'division':
      return section.divisionId;
    case 'section':
    case 'subsection':
    default:
      return section.sectionCode;
  }
}

function uniqueTargetKeysForEntry(
  entry: ChecklistBackedReadingEntry,
  layer: CoverageLayer
): string[] {
  if (layer === 'subsection') {
    return Array.from(new Set(entry.progressSubsectionKeys ?? []));
  }

  return Array.from(new Set(entry.sections.map((section) => coverageKeyForSection(section, layer))));
}

function buildEntryTargetKeyMap<TEntry extends ChecklistBackedReadingEntry>(
  entries: TEntry[],
  layer: CoverageLayer
): Map<string, string[]> {
  return new Map(
    entries.map((entry) => [entry.checklistKey, uniqueTargetKeysForEntry(entry, layer)])
  );
}

function sectionMatchesTargetKey(
  section: ReadingSectionSummary,
  layer: CoverageLayer,
  targetKey: string
): boolean {
  if (layer === 'subsection') {
    return targetKey.startsWith(`${section.sectionCode}::`);
  }

  return coverageKeyForSection(section, layer) === targetKey;
}

function sectionSort(a: ReadingSectionSummary, b: ReadingSectionSummary): number {
  if (a.partNumber !== b.partNumber) {
    return a.partNumber - b.partNumber;
  }

  return collator.compare(a.sectionCodeDisplay, b.sectionCodeDisplay);
}

function dedupeSections(sections: ReadingSectionSummary[]): ReadingSectionSummary[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    if (seen.has(section.sectionCode)) return false;
    seen.add(section.sectionCode);
    return true;
  });
}

function sectionSpreadScore(sections: ReadingSectionSummary[]): number {
  const parts = new Set(sections.map((section) => section.partNumber));
  const divisions = new Set(sections.map((section) => section.divisionId));
  const sectionCodes = new Set(sections.map((section) => section.sectionCode));
  return parts.size * 10000 + divisions.size * 100 + sectionCodes.size;
}

export function buildLayerCoverageSnapshot<TEntry extends ChecklistBackedReadingEntry & {
  title: string;
  sectionCount: number;
}>(
  entries: TEntry[],
  completedChecklistKeys: Set<string>,
  layer: CoverageLayer,
): LayerCoverageSnapshot<TEntry> {
  const totalTargets = new Map<string, number>();
  const coveredTargets = new Set<string>();
  let completedEntries = 0;
  const entryTargetKeys = buildEntryTargetKeyMap(entries, layer);

  for (const entry of entries) {
    const targetKeys = entryTargetKeys.get(entry.checklistKey) ?? [];
    targetKeys.forEach((key) => {
      if (!totalTargets.has(key)) {
        totalTargets.set(key, 1);
      }
    });

    if (!completedChecklistKeys.has(entry.checklistKey)) continue;
    completedEntries += 1;
    targetKeys.forEach((key) => coveredTargets.add(key));
  }

  const countTargets = (keys: Iterable<string>): number => {
    let total = 0;
    for (const key of keys) {
      total += totalTargets.get(key) ?? 1;
    }
    return total;
  };

  const currentlyCoveredCount = countTargets(coveredTargets);
  const totalCoverageCount = countTargets(totalTargets.keys());
  const remainingEntries = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey));
  const usedChecklistKeys = new Set<string>();
  const path: Array<LayerCoveragePathStep<TEntry>> = [];

  while (usedChecklistKeys.size < remainingEntries.length) {
    let bestEntry: TEntry | null = null;
    let bestNewCoverageCount = -1;
    let bestNewSections: ReadingSectionSummary[] = [];
    let bestTargetKeys: string[] = [];

    for (const entry of remainingEntries) {
      if (usedChecklistKeys.has(entry.checklistKey)) continue;

      const newTargetKeys = (entryTargetKeys.get(entry.checklistKey) ?? [])
        .filter((key) => !coveredTargets.has(key));
      const newCoverageCount = newTargetKeys.reduce(
        (total, key) => total + (totalTargets.get(key) ?? 1),
        0
      );
      const newSections = dedupeSections(
        entry.sections.filter((section) => newTargetKeys.some((key) => sectionMatchesTargetKey(section, layer, key)))
      );

      if (!bestEntry || newCoverageCount > bestNewCoverageCount) {
        bestEntry = entry;
        bestNewCoverageCount = newCoverageCount;
        bestNewSections = newSections;
        bestTargetKeys = newTargetKeys;
        continue;
      }

      if (newCoverageCount === bestNewCoverageCount) {
        const spreadScore = sectionSpreadScore(newSections);
        const bestSpreadScore = sectionSpreadScore(bestNewSections);

        if (spreadScore > bestSpreadScore) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
          continue;
        }

        if (spreadScore === bestSpreadScore && entry.sectionCount > bestEntry.sectionCount) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
        }
      }
    }

    if (!bestEntry || bestNewCoverageCount <= 0) break;

    usedChecklistKeys.add(bestEntry.checklistKey);
    bestTargetKeys.forEach((key) => coveredTargets.add(key));

    path.push({
      entry: bestEntry,
      newCoverageCount: bestNewCoverageCount,
      cumulativeCoveredCount: countTargets(coveredTargets),
      newSections: bestNewSections,
    });
  }

  return {
    layer,
    totalEntries: entries.length,
    completedEntries,
    totalCoverageCount,
    currentlyCoveredCount,
    remainingCoverageCount: Math.max(0, totalCoverageCount - currentlyCoveredCount),
    path,
  };
}

export function buildLayerCoverageSnapshotWithReferenceEntries<
  TEntry extends ChecklistBackedReadingEntry & {
    title: string;
    sectionCount: number;
  },
  TReferenceEntry extends ChecklistBackedReadingEntry,
>(
  entries: TEntry[],
  referenceEntries: TReferenceEntry[],
  completedChecklistKeys: Set<string>,
  layer: CoverageLayer,
): LayerCoverageSnapshot<TEntry> {
  const totalTargets = new Map<string, number>();
  const coveredTargets = new Set<string>();
  const candidateTargetKeys = buildEntryTargetKeyMap(entries, layer);
  const referenceTargetKeys = buildEntryTargetKeyMap(referenceEntries, layer);
  let completedEntries = 0;

  for (const entry of referenceEntries) {
    const targetKeys = referenceTargetKeys.get(entry.checklistKey) ?? [];
    targetKeys.forEach((key) => {
      if (!totalTargets.has(key)) {
        totalTargets.set(key, 1);
      }
    });

    if (!completedChecklistKeys.has(entry.checklistKey)) continue;
    targetKeys.forEach((key) => coveredTargets.add(key));
  }

  for (const entry of entries) {
    const targetKeys = candidateTargetKeys.get(entry.checklistKey) ?? [];
    targetKeys.forEach((key) => {
      if (!totalTargets.has(key)) {
        totalTargets.set(key, 1);
      }
    });

    if (completedChecklistKeys.has(entry.checklistKey)) {
      completedEntries += 1;
    }
  }

  const countTargets = (keys: Iterable<string>): number => {
    let total = 0;
    for (const key of keys) {
      total += totalTargets.get(key) ?? 1;
    }
    return total;
  };

  const currentlyCoveredCount = countTargets(coveredTargets);
  const totalCoverageCount = countTargets(totalTargets.keys());
  const remainingEntries = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey));
  const usedChecklistKeys = new Set<string>();
  const path: Array<LayerCoveragePathStep<TEntry>> = [];

  while (usedChecklistKeys.size < remainingEntries.length) {
    let bestEntry: TEntry | null = null;
    let bestNewCoverageCount = -1;
    let bestNewSections: ReadingSectionSummary[] = [];
    let bestTargetKeys: string[] = [];

    for (const entry of remainingEntries) {
      if (usedChecklistKeys.has(entry.checklistKey)) continue;

      const newTargetKeys = (candidateTargetKeys.get(entry.checklistKey) ?? [])
        .filter((key) => !coveredTargets.has(key));
      const newCoverageCount = newTargetKeys.reduce(
        (total, key) => total + (totalTargets.get(key) ?? 1),
        0
      );
      const newSections = dedupeSections(
        entry.sections.filter((section) => newTargetKeys.some((key) => sectionMatchesTargetKey(section, layer, key)))
      );

      if (!bestEntry || newCoverageCount > bestNewCoverageCount) {
        bestEntry = entry;
        bestNewCoverageCount = newCoverageCount;
        bestNewSections = newSections;
        bestTargetKeys = newTargetKeys;
        continue;
      }

      if (newCoverageCount === bestNewCoverageCount) {
        const spreadScore = sectionSpreadScore(newSections);
        const bestSpreadScore = sectionSpreadScore(bestNewSections);

        if (spreadScore > bestSpreadScore) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
          continue;
        }

        if (spreadScore === bestSpreadScore && entry.sectionCount > bestEntry.sectionCount) {
          bestEntry = entry;
          bestNewCoverageCount = newCoverageCount;
          bestNewSections = newSections;
          bestTargetKeys = newTargetKeys;
        }
      }
    }

    if (!bestEntry || bestNewCoverageCount <= 0) break;

    usedChecklistKeys.add(bestEntry.checklistKey);
    bestTargetKeys.forEach((key) => coveredTargets.add(key));

    path.push({
      entry: bestEntry,
      newCoverageCount: bestNewCoverageCount,
      cumulativeCoveredCount: countTargets(coveredTargets),
      newSections: bestNewSections,
    });
  }

  return {
    layer,
    totalEntries: entries.length,
    completedEntries,
    totalCoverageCount,
    currentlyCoveredCount,
    remainingCoverageCount: Math.max(0, totalCoverageCount - currentlyCoveredCount),
    path,
  };
}

export function selectDefaultCoverageLayer(
  snapshots: Array<Pick<LayerCoverageSnapshot<ChecklistBackedReadingEntry>, 'layer' | 'currentlyCoveredCount' | 'totalCoverageCount'>>
): CoverageLayer {
  for (const layer of COVERAGE_LAYER_ORDER) {
    const snapshot = snapshots.find((candidate) => candidate.layer === layer);
    if (snapshot && snapshot.currentlyCoveredCount < snapshot.totalCoverageCount) {
      return layer;
    }
  }

  return snapshots[snapshots.length - 1]?.layer ?? 'section';
}

export function buildCoverageRings<T extends ChecklistBackedReadingEntry>(
  entries: T[],
  checklistState: Record<string, boolean>,
  options: {
    includeSubsections?: boolean;
  } = {}
): CoverageRing[] {
  return buildCoverageRingsForCompleted(entries, completedChecklistKeysFromState(checklistState), options);
}

export function buildCoverageRingsForCompleted<T extends ChecklistBackedReadingEntry>(
  entries: T[],
  completedChecklistKeys: Set<string>,
  options: {
    includeSubsections?: boolean;
  } = {}
): CoverageRing[] {
  const allParts = new Set<number>();
  const allDivisions = new Set<string>();
  const allSections = new Set<string>();
  const allSubsectionKeys = new Set<string>();
  const coveredSubsectionKeys = new Set<string>();
  const coveredParts = new Set<number>();
  const coveredDivisions = new Set<string>();
  const coveredSections = new Set<string>();

  for (const entry of entries) {
    const isChecked = completedChecklistKeys.has(entry.checklistKey);
    for (const section of entry.sections) {
      allParts.add(section.partNumber);
      allDivisions.add(section.divisionId);
      allSections.add(section.sectionCode);
      if (isChecked) {
        coveredParts.add(section.partNumber);
        coveredDivisions.add(section.divisionId);
        coveredSections.add(section.sectionCode);
      }
    }

    for (const subsectionKey of entry.progressSubsectionKeys ?? []) {
      allSubsectionKeys.add(subsectionKey);
    }

    if (isChecked) {
      for (const subsectionKey of entry.progressSubsectionKeys ?? []) {
        coveredSubsectionKeys.add(subsectionKey);
      }
    }
  }

  const includeSubsections = options.includeSubsections !== false;
  const totalSubsectionItems = allSubsectionKeys.size;
  const coveredOutlineItems = coveredSubsectionKeys.size;

  return [
    { label: 'Parts', count: coveredParts.size, total: allParts.size, color: '#6366f1' },
    { label: 'Divisions', count: coveredDivisions.size, total: allDivisions.size, color: '#8b5cf6' },
    { label: 'Sections', count: coveredSections.size, total: allSections.size, color: '#a78bfa' },
    ...(includeSubsections && totalSubsectionItems > 0
      ? [{ label: 'Subsections', count: coveredOutlineItems, total: totalSubsectionItems, color: '#c4b5fd' }]
      : []),
  ];
}

export interface PartCoverageSegment {
  partNumber: number;
  colorHex: string;
  title: string;
  covered: number;
  total: number;
  fraction: number;
  /** Composite score from all layers below the active one, for tiebreaking. */
  depthScore: number;
}

const LAYERS_BELOW: Record<CoverageLayer, CoverageLayer[]> = {
  part: ['division', 'section', 'subsection'],
  division: ['section', 'subsection'],
  section: ['subsection'],
  subsection: [],
};

function groupCoverageByPart(
  entries: ChecklistBackedReadingEntry[],
  checklistState: Record<string, boolean>,
  layer: CoverageLayer,
  partNumbers: number[],
): { allByPart: Map<number, Set<string>>; coveredByPart: Map<number, Set<string>> } {
  const allByPart = new Map<number, Set<string>>();
  const coveredByPart = new Map<number, Set<string>>();
  for (const pn of partNumbers) {
    allByPart.set(pn, new Set());
    coveredByPart.set(pn, new Set());
  }

  for (const entry of entries) {
    const isChecked = Boolean(checklistState[entry.checklistKey]);

    if (layer === 'subsection') {
      const sectionPartMap = new Map<string, number>();
      for (const section of entry.sections) {
        sectionPartMap.set(section.sectionCode, section.partNumber);
      }
      for (const key of entry.progressSubsectionKeys ?? []) {
        const sectionCode = key.includes('::') ? key.split('::')[0] : key;
        const partNumber = sectionPartMap.get(sectionCode);
        if (partNumber === undefined) continue;
        allByPart.get(partNumber)?.add(key);
        if (isChecked) coveredByPart.get(partNumber)?.add(key);
      }
    } else {
      for (const section of entry.sections) {
        const key = coverageKeyForSection(section, layer);
        allByPart.get(section.partNumber)?.add(key);
        if (isChecked) coveredByPart.get(section.partNumber)?.add(key);
      }
    }
  }

  return { allByPart, coveredByPart };
}

export function buildPartCoverageSegments<T extends ChecklistBackedReadingEntry>(
  entries: T[],
  checklistState: Record<string, boolean>,
  layer: CoverageLayer,
  partsMeta: Array<{ partNumber: number; colorHex: string; title: string }>,
): PartCoverageSegment[] {
  const partNumbers = partsMeta.map(pm => pm.partNumber);
  const { allByPart, coveredByPart } = groupCoverageByPart(entries, checklistState, layer, partNumbers);

  // Compute coverage at all layers below for composite tiebreak score
  const belowLayers = LAYERS_BELOW[layer];
  const belowData = belowLayers.map(bl => groupCoverageByPart(entries, checklistState, bl, partNumbers));

  return partsMeta.map((pm) => {
    const all = allByPart.get(pm.partNumber) ?? new Set();
    const covered = coveredByPart.get(pm.partNumber) ?? new Set();
    const total = all.size;
    const count = covered.size;

    // Composite depth score: weight each sub-layer so higher layers dominate
    // e.g. for Parts layer: division fraction * 10000 + section fraction * 100 + subsection fraction
    let depthScore = 0;
    for (let i = 0; i < belowData.length; i++) {
      const bd = belowData[i];
      const bdAll = bd.allByPart.get(pm.partNumber) ?? new Set();
      const bdCovered = bd.coveredByPart.get(pm.partNumber) ?? new Set();
      const frac = bdAll.size > 0 ? bdCovered.size / bdAll.size : 0;
      const weight = Math.pow(100, belowData.length - i);
      depthScore += frac * weight;
    }

    return {
      partNumber: pm.partNumber,
      colorHex: pm.colorHex,
      title: pm.title,
      covered: count,
      total,
      fraction: total > 0 ? count / total : 0,
      depthScore,
    };
  });
}

export function buildCoverageGapItems<TEntry extends ChecklistBackedReadingEntry>(
  entries: TEntry[],
  completedChecklistKeys: Set<string>,
  layer: CoverageLayer,
  baseUrl: string,
  options: {
    itemLabelPlural?: string;
    limit?: number;
  } = {}
): CoverageGapItem[] {
  const totalTargets = new Map<string, number>();
  const coveredTargets = new Set<string>();
  const unreadEntries = entries.filter((entry) => !completedChecklistKeys.has(entry.checklistKey));
  const sectionLookup = new Map<string, ReadingSectionSummary>();
  const partTitleLookup = new Map<number, string>();
  const divisionTitleLookup = new Map<string, string>();
  const entryTargetKeys = buildEntryTargetKeyMap(entries, layer);
  const unreadTargetKeys = buildEntryTargetKeyMap(unreadEntries, layer);
  const candidateCounts = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const section of entry.sections) {
      if (!sectionLookup.has(section.sectionCode)) {
        sectionLookup.set(section.sectionCode, section);
      }
      if (section.partTitle && !partTitleLookup.has(section.partNumber)) {
        partTitleLookup.set(section.partNumber, section.partTitle);
      }
      if (section.divisionTitle && !divisionTitleLookup.has(section.divisionId)) {
        divisionTitleLookup.set(section.divisionId, section.divisionTitle);
      }
    }

    const targetKeys = entryTargetKeys.get(entry.checklistKey) ?? [];
    targetKeys.forEach((key) => {
      if (!totalTargets.has(key)) {
        totalTargets.set(key, 1);
      }
    });

    if (completedChecklistKeys.has(entry.checklistKey)) {
      targetKeys.forEach((key) => coveredTargets.add(key));
    }
  }

  for (const entry of unreadEntries) {
    const targetKeys = unreadTargetKeys.get(entry.checklistKey) ?? [];
    for (const key of targetKeys) {
      if (!candidateCounts.has(key)) {
        candidateCounts.set(key, new Set());
      }
      candidateCounts.get(key)!.add(entry.checklistKey);
    }
  }

  const unresolvedKeys = Array.from(totalTargets.keys()).filter((key) => !coveredTargets.has(key));
  const itemLabelPlural = options.itemLabelPlural ?? 'items';

  if (layer === 'subsection') {
    const grouped = new Map<string, {
      section: ReadingSectionSummary;
      uncoveredCount: number;
      candidateKeys: Set<string>;
    }>();

    for (const key of unresolvedKeys) {
      const [sectionCode] = key.split('::');
      const section = sectionLookup.get(sectionCode);
      if (!section) continue;

      if (!grouped.has(sectionCode)) {
        grouped.set(sectionCode, {
          section,
          uncoveredCount: 0,
          candidateKeys: new Set(),
        });
      }

      const group = grouped.get(sectionCode)!;
      group.uncoveredCount += totalTargets.get(key) ?? 1;
      (candidateCounts.get(key) ?? []).forEach((checklistKey) => group.candidateKeys.add(checklistKey));
    }

    return Array.from(grouped.values())
      .sort((left, right) => {
        if (right.uncoveredCount !== left.uncoveredCount) {
          return right.uncoveredCount - left.uncoveredCount;
        }
        if (right.candidateKeys.size !== left.candidateKeys.size) {
          return right.candidateKeys.size - left.candidateKeys.size;
        }
        return sectionSort(left.section, right.section);
      })
      .slice(0, options.limit ?? 5)
      .map(({ section, uncoveredCount, candidateKeys }) => {
        const candidateLabel = candidateKeys.size === 1 ? itemLabelPlural.replace(/s$/, '') : itemLabelPlural;
        return {
          key: section.sectionCode,
          label: `Section ${section.sectionCodeDisplay}: ${section.title}`,
          href: sectionUrl(section.sectionCode, baseUrl),
          uncoveredCount,
          candidateCount: candidateKeys.size,
          description: `${uncoveredCount} uncovered ${uncoveredCount === 1 ? 'Subsection' : 'Subsections'} · ${candidateKeys.size} unread ${candidateLabel} can still help here`,
        };
      });
  }

  return unresolvedKeys
    .map((key) => {
      const uncoveredCount = totalTargets.get(key) ?? 1;
      const candidateCount = candidateCounts.get(key)?.size ?? 0;
      const candidateLabel = candidateCount === 1 ? itemLabelPlural.replace(/s$/, '') : itemLabelPlural;

      if (layer === 'part') {
        const partNumber = Number(key);
        const partTitle = partTitleLookup.get(partNumber);
        return {
          key,
          label: partTitle ? `Part ${key}: ${partTitle}` : `Part ${key}`,
          href: partUrl(partNumber, baseUrl),
          uncoveredCount,
          candidateCount,
          description: `${candidateCount} unread ${candidateLabel} can still help cover this Part`,
        };
      }

      if (layer === 'division') {
        const divisionTitle = divisionTitleLookup.get(key);
        return {
          key,
          label: divisionTitle ? `Division ${key}: ${divisionTitle}` : `Division ${key}`,
          href: divisionUrl(key, baseUrl),
          uncoveredCount,
          candidateCount,
          description: `${candidateCount} unread ${candidateLabel} can still help cover this Division`,
        };
      }

      const section = sectionLookup.get(key);
      return {
        key,
        label: section ? `Section ${section.sectionCodeDisplay}: ${section.title}` : `Section ${key}`,
        href: sectionUrl(key, baseUrl),
        uncoveredCount,
        candidateCount,
        description: `${candidateCount} unread ${candidateLabel} can still help cover this Section`,
      };
    })
    .sort((left, right) => {
      if (right.uncoveredCount !== left.uncoveredCount) {
        return right.uncoveredCount - left.uncoveredCount;
      }
      if (right.candidateCount !== left.candidateCount) {
        return right.candidateCount - left.candidateCount;
      }
      if (layer === 'part') {
        return Number(left.key) - Number(right.key);
      }
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    })
    .slice(0, options.limit ?? 5);
}
