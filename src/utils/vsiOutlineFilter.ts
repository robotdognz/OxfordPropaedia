export const OUTLINE_SELECT_EVENT = 'propaedia:outline-select';

export interface OutlineSelectionDetail {
  sectionCode: string;
  outlinePath: string;
  text: string;
  childrenText?: string[];
}

export interface SearchableVsiMapping {
  vsiTitle: string;
  vsiAuthor: string;
  rationaleAI: string;
  subject?: string;
  keywords?: string[];
  abstract?: string;
  relevantPathsAI?: string[];
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

function matchesOutlinePath(rationaleAI: string, outlinePath: string): boolean {
  if (!outlinePath) return false;

  const escaped = escapeRegExp(outlinePath);
  const pathPattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?:\\.|[^A-Za-z0-9]|$)`, 'i');
  return pathPattern.test(rationaleAI);
}

export function keywordTokens(keywords: string[] | undefined): Set<string> {
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

export function countTokenMatches(tokenSet: Set<string>, contextTokens: string[]): number {
  let matched = 0;
  for (const token of contextTokens) {
    if (tokenSet.has(token)) matched++;
  }
  return matched;
}

export function pathMatchesSelection(paths: string[] | undefined, outlinePath: string): boolean {
  if (!paths || !outlinePath) return false;
  return paths.some((p) => outlinePath === p || outlinePath.startsWith(p + '.') || p.startsWith(outlinePath + '.'));
}

function scoreMapping(mapping: SearchableVsiMapping, selection: OutlineSelectionDetail): number {
  const selectionTokens = tokenize(selection.text);
  const titleTokens = new Set(tokenize(mapping.vsiTitle));
  const kwToks = keywordTokens(mapping.keywords);

  let score = 0;

  // Outline path match via relevantPathsAI
  if (pathMatchesSelection(mapping.relevantPathsAI, selection.outlinePath)) {
    score += selection.outlinePath.includes('.') ? 5 : 4;
  }

  // VSI title matching the selection text — strongest signal
  const titleMatches = countTokenMatches(titleTokens, selectionTokens);
  score += titleMatches * 5;

  // Keyword matches against selection text
  const kwMatches = countTokenMatches(kwToks, selectionTokens);
  score += kwMatches * 3;
  if (kwMatches >= 2) score += 3;

  // Subject matches
  const sToks = subjectTokens(mapping.subject);
  score += countTokenMatches(sToks, selectionTokens) * 2;

  // Sub-section coverage: reward books that match across more children of the selected item
  const childrenTexts = selection.childrenText || [];
  if (childrenTexts.length > 0) {
    let childrenMatched = 0;
    for (const childText of childrenTexts) {
      const childTokens = tokenize(childText);
      let hasMatch = false;
      for (const ct of childTokens) {
        if (titleTokens.has(ct) || kwToks.has(ct)) { hasMatch = true; break; }
      }
      if (hasMatch) childrenMatched++;
    }
    // Breadth bonus: how many sub-items does this book touch?
    score += childrenMatched * 2;
    if (childrenMatched >= 3) score += 5;
  }

  return score;
}

export function filterMappingsForOutline<T extends SearchableVsiMapping>(
  mappings: T[],
  selection: OutlineSelectionDetail
): (T & { filterScore: number })[] {
  const scoredMappings = mappings
    .map((mapping) => ({ ...mapping, filterScore: scoreMapping(mapping, selection) }))
    .filter((m) => m.filterScore > 0)
    .sort((left, right) => right.filterScore - left.filterScore);

  return scoredMappings;
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

  const rationaleTokens = new Set(tokenize(mapping.rationaleAI));
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
