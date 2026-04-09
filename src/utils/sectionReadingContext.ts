import { getCollection } from 'astro:content';
import iotCatalog from '../data/iot-catalog.json';
import wikiCatalog from '../data/wikipedia-catalog.json';
import { loadOutlineGraph } from './outlineGraph';
import { resolveVsiCatalogEntry } from './vsiCatalog';
import { computeWikiRelevanceScore, tokenize } from './wikipediaOutlineFilter';
import { computeIotRelevanceScore } from './iotOutlineFilter';

interface ReverseReference {
  sourceSection: string;
  sourcePath?: string;
  targetPath?: string;
}

interface GroupedRef {
  sourceSection: string;
  sourcePath?: string;
  sectionTitle: string;
}

export interface SectionReadingSource {
  sectionCode: string;
  title: string;
  outline: any[];
  macropaediaReferences?: string[];
}

export interface GroupedReverseReferenceDivision {
  divisionId: string;
  romanNumeral: string;
  divisionTitle: string;
  refs: GroupedRef[];
}

export interface GroupedReverseReferencePart {
  partNumber: number;
  partTitle: string;
  divisions: GroupedReverseReferenceDivision[];
}

export interface EnrichedVsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationaleAI: string;
  relevantPathsAI?: string[];
  publicationYear?: number;
  edition?: number;
  pageCount?: number;
  wordCount?: number;
  subject?: string;
  keywords?: string[];
  abstract?: string;
}

export interface EnrichedWikiArticle {
  title: string;
  displayTitle?: string;
  url: string;
  category?: string;
  lowestLevel: number;
  wordCount?: number;
  extract?: string;
  toc?: string[];
  wikiCategories?: string[];
  rationale: string;
  relevantPathsAI: string[];
  matchPercent: number;
  _score: number;
}

export interface EnrichedIotEpisode {
  pid: string;
  title: string;
  url: string;
  synopsis?: string;
  datePublished?: string;
  durationSeconds?: number;
  rationale: string;
  relevantPathsAI: string[];
  matchPercent: number;
  _score: number;
}

export interface SectionReadingRecommendationsPayload {
  vsiMappings: EnrichedVsiMapping[];
  wikiArticles: EnrichedWikiArticle[];
  iotEpisodes: EnrichedIotEpisode[];
  macropaediaReferences: string[];
  sectionCode: string;
  sectionTitle: string;
  sectionOutlineText: string;
}

interface SectionReadingCaches {
  reverseIndex: Map<string, ReverseReference[]>;
  vsiMappingsBySection: Map<string, any[]>;
  wikiMappingsBySection: Map<string, any[]>;
  iotMappingsBySection: Map<string, any[]>;
  wikiCatalogLookup: Map<string, any>;
  iotCatalogLookup: Map<string, any>;
}

let cachesPromise: Promise<SectionReadingCaches> | undefined;

export function collectOutlineText(nodes: any[]): string {
  let text = '';
  for (const node of nodes || []) {
    text += ` ${node.text || ''}`;
    text += collectOutlineText(node.children);
  }
  return text;
}

async function loadCaches(): Promise<SectionReadingCaches> {
  if (!cachesPromise) {
    cachesPromise = buildCaches();
  }

  return cachesPromise;
}

async function buildCaches(): Promise<SectionReadingCaches> {
  const [sections, vsiMappings, wikiMappings, iotMappings] = await Promise.all([
    getCollection('sections'),
    getCollection('vsi-mappings'),
    getCollection('wiki-mappings'),
    getCollection('iot-mappings'),
  ]);

  const reverseIndex = new Map<string, ReverseReference[]>();
  for (const section of sections) {
    for (const ref of section.data.crossReferences ?? []) {
      const refs = reverseIndex.get(ref.targetSection) ?? [];
      refs.push({
        sourceSection: section.data.sectionCode,
        sourcePath: ref.fromPath,
        targetPath: ref.targetPath,
      });
      reverseIndex.set(ref.targetSection, refs);
    }
  }

  const vsiMappingsBySection = new Map(
    vsiMappings.map((entry) => [
      entry.data.sectionCode,
      entry.data.mappings.flatMap((mapping: any) => {
        const catalogEntry = resolveVsiCatalogEntry(mapping.vsiTitle, mapping.vsiAuthor);
        if (!catalogEntry) {
          return [];
        }

        return [{
          ...mapping,
          vsiTitle: catalogEntry.title,
          vsiAuthor: catalogEntry.author,
        }];
      }),
    ])
  );

  const wikiMappingsBySection = new Map(
    wikiMappings.map((entry) => [entry.data.sectionCode, entry.data.mappings])
  );

  const iotMappingsBySection = new Map(
    iotMappings.map((entry) => [entry.data.sectionCode, entry.data.mappings])
  );

  const wikiCatalogLookup = new Map((wikiCatalog as any).articles.map((article: any) => [article.title, article]));
  const iotCatalogLookup = new Map((iotCatalog as any).episodes.map((episode: any) => [episode.pid, episode]));

  return {
    reverseIndex,
    vsiMappingsBySection,
    wikiMappingsBySection,
    iotMappingsBySection,
    wikiCatalogLookup,
    iotCatalogLookup,
  };
}

function groupReverseReferences(
  reverseRefs: ReverseReference[],
  outline: Awaited<ReturnType<typeof loadOutlineGraph>>
): GroupedReverseReferencePart[] {
  const refsByPart = new Map<number, Map<string, GroupedRef[]>>();

  for (const ref of reverseRefs) {
    const meta = outline.sectionMeta[ref.sourceSection];
    if (!meta) {
      throw new Error(`Cross-reference reverse index is invalid: unknown source section "${ref.sourceSection}".`);
    }

    if (!refsByPart.has(meta.partNumber)) refsByPart.set(meta.partNumber, new Map());
    const refsByDivision = refsByPart.get(meta.partNumber)!;
    if (!refsByDivision.has(meta.divisionId)) refsByDivision.set(meta.divisionId, []);
    refsByDivision.get(meta.divisionId)!.push({
      sourceSection: ref.sourceSection,
      sourcePath: ref.sourcePath,
      sectionTitle: meta.sectionTitle,
    });
  }

  const grouped: GroupedReverseReferencePart[] = [];
  for (const part of outline.parts) {
    const refsByDivision = refsByPart.get(part.partNumber);
    if (!refsByDivision) continue;

    const divisions: GroupedReverseReferenceDivision[] = [];
    for (const division of part.divisions) {
      const refs = refsByDivision.get(division.divisionId);
      if (!refs) continue;

      divisions.push({
        divisionId: division.divisionId,
        romanNumeral: division.romanNumeral,
        divisionTitle: division.title,
        refs,
      });
    }

    grouped.push({
      partNumber: part.partNumber,
      partTitle: part.title,
      divisions,
    });
  }

  return grouped;
}

export async function loadSectionReverseReferences(sectionCode: string): Promise<{
  reverseRefs: ReverseReference[];
  groupedReverseRefs: GroupedReverseReferencePart[];
}> {
  const [outline, caches] = await Promise.all([loadOutlineGraph(), loadCaches()]);
  const reverseRefs = caches.reverseIndex.get(sectionCode) ?? [];
  const groupedReverseRefs = groupReverseReferences(reverseRefs, outline);

  return {
    reverseRefs,
    groupedReverseRefs,
  };
}

export async function loadSectionRecommendationsPayload(
  section: SectionReadingSource,
): Promise<SectionReadingRecommendationsPayload> {
  const caches = await loadCaches();

  const vsiMappings = (caches.vsiMappingsBySection.get(section.sectionCode) ?? []).flatMap((entry: any) => {
    const catalogEntry = resolveVsiCatalogEntry(entry.vsiTitle, entry.vsiAuthor);
    if (!catalogEntry) {
      return [];
    }

    return [{
      ...entry,
      vsiTitle: catalogEntry.title,
      vsiAuthor: catalogEntry.author,
      publicationYear: catalogEntry.publicationYear,
      edition: catalogEntry.edition,
      pageCount: catalogEntry.pageCount,
      wordCount: catalogEntry.wordCount,
      subject: catalogEntry.subject,
      keywords: catalogEntry.keywords,
      abstract: catalogEntry.abstract,
    }];
  });

  const sectionOutlineText = collectOutlineText(section.outline).trim();
  const sectionTokens = tokenize(`${section.title} ${sectionOutlineText}`);
  let wikiArticles = (caches.wikiMappingsBySection.get(section.sectionCode) ?? []).map((entry: any) => {
    const catalogEntry = caches.wikiCatalogLookup.get(entry.articleTitle);
    return {
      title: entry.articleTitle,
      displayTitle: catalogEntry?.displayTitle,
      url: catalogEntry?.url || `https://en.wikipedia.org/wiki/${entry.articleTitle.replace(/ /g, '_')}`,
      category: catalogEntry?.category,
      lowestLevel: catalogEntry?.lowestLevel || 3,
      wordCount: catalogEntry?.wordCount,
      extract: catalogEntry?.extract,
      toc: catalogEntry?.toc,
      wikiCategories: catalogEntry?.wikiCategories,
      rationale: entry.rationaleAI || '',
      relevantPathsAI: entry.relevantPathsAI || [],
      _score: computeWikiRelevanceScore(
        {
          title: entry.articleTitle,
          category: catalogEntry?.category,
          toc: catalogEntry?.toc,
          wikiCategories: catalogEntry?.wikiCategories,
        },
        sectionTokens
      ),
      matchPercent: 0,
    };
  });

  const maxWikiScore = Math.max(...wikiArticles.map((article) => article._score), 1);
  wikiArticles = wikiArticles
    .map((article) => ({
      ...article,
      matchPercent: Math.round(Math.min(article._score / maxWikiScore, 1) * 100),
    }))
    .sort((left, right) => right._score - left._score);

  let iotEpisodes = (caches.iotMappingsBySection.get(section.sectionCode) ?? []).map((entry: any) => {
    const catalogEntry = caches.iotCatalogLookup.get(entry.pid);
    const title = catalogEntry?.title ?? entry.episodeTitle;
    const synopsis = catalogEntry?.description ?? catalogEntry?.synopsis;
    return {
      pid: entry.pid,
      title,
      url: catalogEntry?.url || `https://www.bbc.co.uk/programmes/${entry.pid}`,
      synopsis,
      datePublished: catalogEntry?.datePublished,
      durationSeconds: catalogEntry?.durationSeconds,
      rationale: entry.rationaleAI || '',
      relevantPathsAI: entry.relevantPathsAI || [],
      _score: computeIotRelevanceScore(
        {
          title,
          synopsis,
          relevantPathsAI: entry.relevantPathsAI,
        },
        sectionTokens
      ),
      matchPercent: 0,
    };
  });

  const maxIotScore = Math.max(...iotEpisodes.map((episode) => episode._score), 1);
  iotEpisodes = iotEpisodes
    .map((episode) => ({
      ...episode,
      matchPercent: Math.round(Math.min(episode._score / maxIotScore, 1) * 100),
    }))
    .sort((left, right) => right._score - left._score);

  return {
    vsiMappings,
    wikiArticles,
    iotEpisodes,
    macropaediaReferences: section.macropaediaReferences ?? [],
    sectionCode: section.sectionCode,
    sectionTitle: section.title,
    sectionOutlineText,
  };
}

export async function loadSectionReadingContext(section: SectionReadingSource): Promise<{
  reverseRefs: ReverseReference[];
  groupedReverseRefs: GroupedReverseReferencePart[];
  vsiMappings: EnrichedVsiMapping[];
  wikiArticlesForSection: EnrichedWikiArticle[];
  iotEpisodesForSection: EnrichedIotEpisode[];
}> {
  const [{ reverseRefs, groupedReverseRefs }, recommendations] = await Promise.all([
    loadSectionReverseReferences(section.sectionCode),
    loadSectionRecommendationsPayload(section),
  ]);

  return {
    reverseRefs,
    groupedReverseRefs,
    vsiMappings: recommendations.vsiMappings,
    wikiArticlesForSection: recommendations.wikiArticles,
    iotEpisodesForSection: recommendations.iotEpisodes,
  };
}
