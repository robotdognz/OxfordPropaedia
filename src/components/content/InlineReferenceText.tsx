import { Fragment } from 'preact';
import { divisionUrl, partUrl, sectionUrl } from '../../utils/helpers';

export interface InlineReferenceTextProps {
  text: string;
  baseUrl: string;
  className?: string;
  currentHref?: string;
}

const PART_WORD_TO_NUMBER: Record<string, number> = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Ten: 10,
};

const ROMAN_TO_NUMBER: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

const REFERENCE_PATTERN =
  /Division\s+(?<divisionOfPartRoman>[IVX]+)\s+of\s+Part\s+(?<divisionOfPartWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)|Part\s+(?<partDivisionWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten),\s*Division\s+(?<partDivisionRoman>[IVX]+)|Part\s+(?<singlePartWord>One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)|(?<sectionCode>10\/\d{2}|(?<!\d)\d\s*\d\s*\d(?:\/\d{1,2})?(?!\d))(?<sectionPath>\s*(?:\.[A-Za-z0-9]+)+\.?)?/g;

function normalizeSectionCode(code: string) {
  return code.replace(/\s+/g, '');
}

function divisionId(partNumber: number, divisionNumber: number) {
  return `${partNumber}-${String(divisionNumber).padStart(2, '0')}`;
}

function referenceHref(groups: Record<string, string | undefined>, baseUrl: string) {
  if (groups.divisionOfPartRoman && groups.divisionOfPartWord) {
    const partNumber = PART_WORD_TO_NUMBER[groups.divisionOfPartWord];
    const divisionNumber = ROMAN_TO_NUMBER[groups.divisionOfPartRoman];
    if (partNumber && divisionNumber) {
      return divisionUrl(divisionId(partNumber, divisionNumber), baseUrl);
    }
  }

  if (groups.partDivisionWord && groups.partDivisionRoman) {
    const partNumber = PART_WORD_TO_NUMBER[groups.partDivisionWord];
    const divisionNumber = ROMAN_TO_NUMBER[groups.partDivisionRoman];
    if (partNumber && divisionNumber) {
      return divisionUrl(divisionId(partNumber, divisionNumber), baseUrl);
    }
  }

  if (groups.singlePartWord) {
    const partNumber = PART_WORD_TO_NUMBER[groups.singlePartWord];
    if (partNumber) {
      return partUrl(partNumber, baseUrl);
    }
  }

  if (groups.sectionCode) {
    return sectionUrl(normalizeSectionCode(groups.sectionCode), baseUrl);
  }

  return null;
}

export default function InlineReferenceText({
  text,
  baseUrl,
  className,
  currentHref,
}: InlineReferenceTextProps) {
  const fragments: Array<string | JSX.Element> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      fragments.push(text.slice(lastIndex, index));
    }

    const href = referenceHref((match.groups ?? {}) as Record<string, string | undefined>, baseUrl);
    const label = match[0];

    if (href && href !== currentHref) {
      fragments.push(
        <a
          href={href}
          class="text-indigo-700 underline-offset-2 transition-colors hover:text-indigo-900 hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded-sm"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </a>
      );
    } else {
      fragments.push(label);
    }

    lastIndex = index + label.length;
  }

  if (lastIndex < text.length) {
    fragments.push(text.slice(lastIndex));
  }

  if (fragments.length === 0) {
    return <span class={className}>{text}</span>;
  }

  return (
    <span class={className}>
      {fragments.map((fragment, index) => (
        <Fragment key={index}>{fragment}</Fragment>
      ))}
    </span>
  );
}
