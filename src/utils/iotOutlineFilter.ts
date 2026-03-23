import {
  countTokenMatches,
  OUTLINE_SELECT_EVENT,
  pathMatchesSelection,
  tokenize,
  type OutlineSelectionDetail,
} from './vsiOutlineFilter';

export { OUTLINE_SELECT_EVENT, type OutlineSelectionDetail };

export interface SearchableIotEpisode {
  title: string;
  synopsis?: string;
  relevantPathsAI?: string[];
}

function episodeContextTokens(episode: SearchableIotEpisode): Set<string> {
  return new Set(tokenize(episode.synopsis ?? ''));
}

function scoreEpisodeForSelection(episode: SearchableIotEpisode, selection: OutlineSelectionDetail): number {
  const selectionTokens = tokenize(selection.text);
  const titleTokens = new Set(tokenize(episode.title));
  const contextTokens = episodeContextTokens(episode);

  let score = 0;

  if (pathMatchesSelection(episode.relevantPathsAI, selection.outlinePath)) {
    score += selection.outlinePath.includes('.') ? 5 : 4;
  }

  score += countTokenMatches(titleTokens, selectionTokens) * 5;

  const contextMatches = countTokenMatches(contextTokens, selectionTokens);
  score += contextMatches * 2;
  if (contextMatches >= 3) score += 3;

  const childrenTexts = selection.childrenText || [];
  if (childrenTexts.length > 0) {
    let childrenMatched = 0;
    for (const childText of childrenTexts) {
      const childTokens = tokenize(childText);
      if (childTokens.some((token) => titleTokens.has(token) || contextTokens.has(token))) {
        childrenMatched += 1;
      }
    }

    score += childrenMatched * 2;
    if (childrenMatched >= 3) score += 5;
  }

  return score;
}

export function filterEpisodesForOutline<T extends SearchableIotEpisode>(
  episodes: T[],
  selection: OutlineSelectionDetail
): (T & { filterScore: number })[] {
  return episodes
    .map((episode) => ({ ...episode, filterScore: scoreEpisodeForSelection(episode, selection) }))
    .filter((episode) => episode.filterScore > 0)
    .sort((left, right) => right.filterScore - left.filterScore);
}

export function computeIotRelevanceScore(episode: SearchableIotEpisode, contextTokens: string[]): number {
  const titleTokens = new Set(tokenize(episode.title));
  const bodyTokens = episodeContextTokens(episode);

  let score = 0;
  score += countTokenMatches(titleTokens, contextTokens) * 5;

  const bodyMatches = countTokenMatches(bodyTokens, contextTokens);
  score += bodyMatches * 2;
  if (bodyMatches >= 4) score += 4;
  else if (bodyMatches >= 2) score += 2;

  return score;
}
