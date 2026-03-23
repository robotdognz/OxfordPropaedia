import type {
  IotAggregateEntry,
  MacropaediaAggregateEntry,
  VsiAggregateEntry,
  WikipediaAggregateEntry,
} from '../../utils/readingData';

export interface CircleNavigatorDivision {
  divisionId: string;
  romanNumeral: string;
  title: string;
}

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
  divisions: CircleNavigatorDivision[];
}

export interface SectionConnection {
  sourceSection: string;
  targetSection: string;
  sourcePath: string;
  targetPath: string;
  via?: string;
  sharedArticle?: string;
}

export interface SectionMeta {
  title: string;
  partNumber: number;
  sectionCode: string;
}

export type CircleNavigatorVsiEntry = Pick<
  VsiAggregateEntry,
  'title' | 'author' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export type CircleNavigatorWikipediaEntry = Pick<
  WikipediaAggregateEntry,
  'title' | 'displayTitle' | 'url' | 'lowestLevel' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export type CircleNavigatorIotEntry = Pick<
  IotAggregateEntry,
  'pid' | 'title' | 'url' | 'datePublished' | 'durationSeconds' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export type CircleNavigatorMacropaediaEntry = Pick<
  MacropaediaAggregateEntry,
  'title' | 'checklistKey' | 'sectionCount' | 'sections'
>;

export interface CircleNavigatorPartRecommendations {
  vsi: CircleNavigatorVsiEntry[];
  wiki: CircleNavigatorWikipediaEntry[];
  iot: CircleNavigatorIotEntry[];
  macro: CircleNavigatorMacropaediaEntry[];
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
  connections: Record<string, SectionConnection[]>;
  sectionMeta: Record<string, SectionMeta>;
  baseUrl: string;
}

export interface ConnectionSummary {
  sections: { section: SectionMeta; refCount: number }[];
  isDirect: boolean;
  hasKeyword: boolean;
  hasConnectionData: boolean;
}

export function getConnectionKey(a: number, b: number): string {
  return Math.min(a, b) + '-' + Math.max(a, b);
}
