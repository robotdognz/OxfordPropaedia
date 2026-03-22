import { h } from 'preact';
import { sectionReferenceUrl } from './helpers';

const LINK_CLASS = 'text-indigo-700 hover:text-indigo-900 hover:underline';
const SECTION_CODE_PATTERN = String.raw`\d{2,3}(?:[-/]\d{2})?`;
const CROSS_SECTION_PATH_PATTERN = String.raw`[A-Z](?:\.(?:\d+|[a-z]+))*`;
const LOCAL_PATH_PATTERN = String.raw`[A-Z](?:\.(?:\d+|[a-z]+))+`;
const TERMINATOR_PATTERN = "(?=$|[\\s),.;:!?\\]'\\\"])";

const CROSS_SECTION_RE = new RegExp(
  String.raw`\b(${SECTION_CODE_PATTERN})\.(${CROSS_SECTION_PATH_PATTERN})${TERMINATOR_PATTERN}|\bsection\s+(${SECTION_CODE_PATTERN})\b`,
  'gi'
);
const LOCAL_PATH_RE = new RegExp(
  String.raw`\b(${LOCAL_PATH_PATTERN})${TERMINATOR_PATTERN}`,
  'g'
);
const LOCAL_MAJOR_RE = /\(([A-Z])\)(?=$|[\s,.;:!?'"])/g;

function makeReferenceLink(label: string, href: string) {
  return (
    <a href={href} class={LINK_CLASS}>
      {label}
    </a>
  );
}

function linkifyString(
  text: string,
  pattern: RegExp,
  toHref: (match: RegExpExecArray) => string | null,
  renderLabel?: (match: RegExpExecArray) => string | h.JSX.Element
) {
  const parts: (string | h.JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(text))) {
    const href = toHref(match);
    if (!href) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const rendered = renderLabel?.(match);
    parts.push(
      typeof rendered === 'string'
        ? makeReferenceLink(rendered, href)
        : rendered ?? makeReferenceLink(match[0], href)
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function linkifyRationaleReferences(text: string, baseUrl: string, sectionCode?: string) {
  const crossLinked = linkifyString(text, CROSS_SECTION_RE, (match) => {
    const referenceSection = match[1] || match[3];
    const outlinePath = match[2] || '';
    return sectionReferenceUrl(referenceSection, outlinePath, baseUrl);
  });

  if (!sectionCode) {
    return crossLinked;
  }

  const currentSection = sectionCode;

  return crossLinked.flatMap((part) => {
    if (typeof part !== 'string') {
      return [part];
    }

    const pathLinked = linkifyString(part, LOCAL_PATH_RE, (match) => (
      sectionReferenceUrl(currentSection, match[1], baseUrl)
    ));

    return pathLinked.flatMap((subPart) => {
      if (typeof subPart !== 'string') {
        return [subPart];
      }

      return linkifyString(
        subPart,
        LOCAL_MAJOR_RE,
        (match) => sectionReferenceUrl(currentSection, match[1], baseUrl),
        (match) => (
          <>
            {'('}
            {makeReferenceLink(match[1], sectionReferenceUrl(currentSection, match[1], baseUrl))}
            {')'}
          </>
        )
      );
    });
  });
}
