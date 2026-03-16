import {
  tokenize,
  pathMatchesSelection,
  countTokenMatches,
  keywordTokens,
  type OutlineSelectionDetail,
} from './vsiOutlineFilter';

export interface SearchableWikiArticle {
  title: string;
  displayTitle?: string;
  url?: string;
  category?: string;
  lowestLevel?: number;
  toc?: string[];
  wikiCategories?: string[];
  relevantPathsAI?: string[];
}

const TOC_EXCLUSIONS = new Set([
  'see also', 'references', 'sources', 'external links', 'further reading',
  'notes', 'bibliography', 'citations', 'footnotes', 'works cited',
  'explanatory notes', 'gallery',
  'early life', 'death', 'legacy', 'personal life', 'later life',
  'works', 'career', 'life', 'background', 'childhood',
  'family', 'awards and honors', 'awards and honours',
  'honours', 'honors', 'selected works', 'publications',
  'filmography', 'discography',
  'history', 'etymology', 'overview', 'definition', 'definitions',
  'types', 'classification', 'terminology', 'meaning',
  'characteristics', 'properties', 'structure', 'composition',
  'name', 'origins', 'development', 'formation', 'production',
  'other', 'others', 'general', 'introduction', 'summary',
  'description', 'causes', 'effects', 'impact', 'criticism',
  'controversy', 'uses', 'applications', 'methods', 'modern',
  'ancient', 'in culture', 'society and culture', 'modern era',
]);

export function filterTocHeadings(toc: string[] | undefined): string[] {
  return (toc || []).filter((h) => {
    const clean = h.replace(/<[^>]+>/g, '').trim().toLowerCase();
    return !TOC_EXCLUSIONS.has(clean);
  });
}

function articleKeywordTokens(article: SearchableWikiArticle): Set<string> {
  return keywordTokens([...(article.wikiCategories || []), ...filterTocHeadings(article.toc)]);
}

function scoreArticleForSelection(article: SearchableWikiArticle, selection: OutlineSelectionDetail): number {
  const selectionTokens = tokenize(selection.text);
  const titleTokens = new Set(tokenize(article.title));
  const kwToks = articleKeywordTokens(article);
  const subjectToks = keywordTokens(article.category ? [article.category] : []);

  let score = 0;

  if (pathMatchesSelection(article.relevantPathsAI, selection.outlinePath)) {
    score += selection.outlinePath.includes('.') ? 5 : 4;
  }

  score += countTokenMatches(titleTokens, selectionTokens) * 5;

  const kwMatches = countTokenMatches(kwToks, selectionTokens);
  score += kwMatches * 3;
  if (kwMatches >= 2) score += 3;

  score += countTokenMatches(subjectToks, selectionTokens) * 2;

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
    score += childrenMatched * 2;
    if (childrenMatched >= 3) score += 5;
  }

  return score;
}

export function filterArticlesForOutline<T extends SearchableWikiArticle>(
  articles: T[],
  selection: OutlineSelectionDetail,
): (T & { filterScore: number })[] {
  return articles
    .map((article) => ({ ...article, filterScore: scoreArticleForSelection(article, selection) }))
    .filter((a) => a.filterScore > 0)
    .sort((a, b) => b.filterScore - a.filterScore);
}

/**
 * Build-time relevance score for a Wikipedia article against section context.
 * Matches the VSI pattern: title 5x, keywords 3x (bonus at 3+/2+), subject 1x.
 */
export function computeWikiRelevanceScore(article: SearchableWikiArticle, contextTokens: string[]): number {
  let score = 0;

  const titleToks = new Set(tokenize(article.title));
  score += countTokenMatches(titleToks, contextTokens) * 5;

  const kwToks = articleKeywordTokens(article);
  const kwMatches = countTokenMatches(kwToks, contextTokens);
  score += kwMatches * 3;
  if (kwMatches >= 3) score += 5;
  else if (kwMatches >= 2) score += 2;

  const subToks = new Set(tokenize(article.category || ''));
  score += countTokenMatches(subToks, contextTokens);

  return score;
}

export { tokenize };
