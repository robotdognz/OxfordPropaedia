export const OUTLINE_VSI_SELECT_EVENT = 'propaedia:outline-select';

export interface OutlineSelectionDetail {
  sectionCode: string;
  outlinePath: string;
  text: string;
}

export interface SearchableVsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationale: string;
  subject?: string;
  keywords?: string[];
  abstract?: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeToken(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/['']s$/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (normalized.length > 4 && normalized.endsWith('s')) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenize(text: string): string[] {
  const unique = new Set<string>();

  for (const rawToken of text.split(/[^A-Za-z0-9.]+/)) {
    const token = normalizeToken(rawToken);
    if (!token || token.length < 3 || STOP_WORDS.has(token)) continue;
    unique.add(token);
  }

  return Array.from(unique);
}

function matchesOutlinePath(rationale: string, outlinePath: string): boolean {
  if (!outlinePath) return false;

  const escaped = escapeRegExp(outlinePath);
  const pathPattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?:\\.|[^A-Za-z0-9]|$)`, 'i');
  return pathPattern.test(rationale);
}

function keywordTokens(keywords: string[] | undefined): Set<string> {
  if (!keywords) return new Set();
  const tokens = new Set<string>();
  for (const kw of keywords) {
    for (const token of tokenize(kw)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function subjectTokens(subject: string | undefined): Set<string> {
  if (!subject) return new Set();
  const tokens = new Set<string>();
  for (const part of subject.split('/')) {
    for (const token of tokenize(part)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function countTokenMatches(tokenSet: Set<string>, contextTokens: string[]): number {
  let matched = 0;
  for (const token of contextTokens) {
    if (tokenSet.has(token)) matched++;
  }
  return matched;
}

function scoreMapping(mapping: SearchableVsiMapping, selection: OutlineSelectionDetail): number {
  const searchableText = `${mapping.vsiTitle} ${mapping.vsiAuthor} ${mapping.rationale}`;
  const mappingTokens = new Set(tokenize(searchableText));
  const selectionTokens = tokenize(selection.text);

  let score = 0;

  if (matchesOutlinePath(mapping.rationale, selection.outlinePath)) {
    score += selection.outlinePath.includes('.') ? 5 : 4;
  }

  let matchedTokenCount = 0;
  for (const token of selectionTokens) {
    if (mappingTokens.has(token)) {
      matchedTokenCount += 1;
      score += token.length >= 8 ? 2 : 1;
    }
  }

  if (matchedTokenCount >= 2) {
    score += 2;
  }

  // Boost if VSI subject matches the selection text
  const sToks = subjectTokens(mapping.subject);
  score += countTokenMatches(sToks, selectionTokens) * 2;

  // Boost if VSI keywords match the selection text
  const kwToks = keywordTokens(mapping.keywords);
  const kwMatches = countTokenMatches(kwToks, selectionTokens);
  score += kwMatches * 3;
  if (kwMatches >= 2) score += 3;

  return score;
}

export function filterMappingsForOutline<T extends SearchableVsiMapping>(
  mappings: T[],
  selection: OutlineSelectionDetail
): T[] {
  const scoredMappings = mappings
    .map((mapping) => ({ mapping, score: scoreMapping(mapping, selection) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  return scoredMappings.map(({ mapping }) => mapping);
}

/**
 * Sorts mappings by relevance to the section's title and outline text.
 * Used for the default (unfiltered) display order.
 */
/**
 * Computes a relevance score for a single mapping against section context.
 */
export function computeRelevanceScore(mapping: SearchableVsiMapping, contextTokens: string[]): number {
  let score = 0;

  const kwToks = keywordTokens(mapping.keywords);
  const kwMatches = countTokenMatches(kwToks, contextTokens);
  score += kwMatches * 3;
  if (kwMatches >= 3) score += 5;
  else if (kwMatches >= 2) score += 2;

  const titleTokens = tokenize(mapping.vsiTitle);
  const titleMatches = countTokenMatches(new Set(contextTokens), titleTokens);
  score += titleMatches * 2;

  const sToks = subjectTokens(mapping.subject);
  score += countTokenMatches(sToks, contextTokens);

  const rationaleTokens = new Set(tokenize(mapping.rationale));
  let rationaleMatches = 0;
  for (const token of contextTokens) {
    if (rationaleTokens.has(token)) rationaleMatches++;
  }
  score += Math.min(rationaleMatches, 5);

  return score;
}

/**
 * Sorts mappings by relevance to the section's title and outline text.
 * Returns mappings with scores attached.
 */
export function sortByDefaultRelevance<T extends SearchableVsiMapping>(
  mappings: T[],
  sectionTitle: string,
  sectionOutlineText?: string
): (T & { relevanceScore: number })[] {
  const contextText = `${sectionTitle} ${sectionOutlineText || ''}`;
  const contextTokens = tokenize(contextText);

  const scored = mappings.map((mapping) => ({
    ...mapping,
    relevanceScore: computeRelevanceScore(mapping, contextTokens),
  }));

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored;
}

/** Tokenize text — exported for use in build-time scoring. */
export { tokenize };
