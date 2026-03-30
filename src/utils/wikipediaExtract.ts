const LEADING_WIKI_LINE_RE = /^(?:\||!\s*|class=|style=|alt=|source:|image(?:_alt|_caption)?\s*=|range_map|range_map_caption|taxon\s*=|authority\s*=|subdivision_ranks\s*=)/i;
const LEADING_MEDIA_RE = /^(?:thumb|frameless|upright(?:=[^|\s]+)?|left|right)\|.*?\]\]/i;
const BASIC_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&ndash;/g, '–'],
  [/&mdash;/g, '—'],
  [/&minus;/g, '−'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

function stripLeadingLineNoise(line: string): string {
  let value = line.trim();
  value = value.replace(/^(?:[A-Z][A-Z '&/:-]{2,}\}\}\s*)+/, '');
  value = value.replace(/^(?:\}\}\s*)+/, '');
  value = value.replace(LEADING_MEDIA_RE, '');
  return value.trim();
}

function looksLikeArticleProse(line: string): boolean {
  const value = stripLeadingLineNoise(line);
  if (!value) return false;
  if (LEADING_WIKI_LINE_RE.test(value)) return false;
  if (value.split(/\s+/).length < 5) return false;
  if (!/^[A-Z0-9"'(]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  return true;
}

function cleanLeadSentenceArtifacts(paragraph: string): string {
  let value = paragraph;

  value = value.replace(/;\s*Pronounced variously\b[^.]{0,200}?(?=\b(?:was|is|are|were)\b)/gi, ' ');
  value = value.replace(/\(\s*[^A-Za-z0-9)]{1,40}\)/g, '');
  value = value.replace(/\s*\}\}\s*/g, ' ');
  value = value.replace(/\s*;\s*(?=\b(?:was|is|are|were)\b)/g, ' ');
  value = value.replace(/\b(\d{4})(\d{1,2}[A-Z][a-z]+)\b/g, '$1 $2');
  value = value.replace(/\b(\d{1,2})([A-Z][a-z]+)\b/g, '$1 $2');
  value = value.replace(/\b([A-Za-z]{3,})(\d{3,4})\b/g, '$1 $2');

  return value;
}

function cleanParagraph(paragraph: string): string {
  let value = paragraph.trim();

  for (const [pattern, replacement] of BASIC_ENTITY_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }

  value = value.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
  value = value.replace(/\{\{[^{}]{0,200}\}\}/g, '');
  value = value.replace(/\b(?:class|style|alt)\s*=\s*[^|\]\n]+/gi, '');
  value = value.replace(/\b\d+px\b/gi, '');
  value = value.replace(/(?:^|\s)[|{}]+(?=\s|$)/g, ' ');
  value = cleanLeadSentenceArtifacts(value);
  value = value.replace(/\s+/g, ' ');
  value = value.replace(/\s+([,.;:!?])/g, '$1');
  value = value.replace(/\(\s*\)/g, '');

  return value.trim();
}

export function cleanWikipediaExtract(rawExtract?: string): string {
  if (!rawExtract) return '';

  const lines = rawExtract.replace(/\r\n/g, '\n').split('\n');
  const startIndex = lines.findIndex(looksLikeArticleProse);
  if (startIndex === -1) return '';

  const cleanedText = lines
    .slice(startIndex)
    .map((line, index) => (index === 0 ? stripLeadingLineNoise(line) : line.trimEnd()))
    .join('\n');

  const paragraphs = cleanedText
    .split(/\n{2,}/)
    .map(cleanParagraph)
    .filter((paragraph) => paragraph.length > 0)
    .filter((paragraph) => /[A-Za-z]/.test(paragraph))
    .filter((paragraph) => !LEADING_WIKI_LINE_RE.test(paragraph))
    .filter((paragraph) => !/^(?:thumb|frameless|upright|left|right)\b/i.test(paragraph));

  return paragraphs.join('\n\n').trim();
}

export function splitWikipediaExtractParagraphs(rawExtract?: string): string[] {
  const cleaned = cleanWikipediaExtract(rawExtract);
  if (!cleaned) return [];

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
