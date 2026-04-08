#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LIVE_CATALOG_PATH = resolve(ROOT, 'src/content/vsi/catalog.json');
const SCRAPED_REPORT_PATH = resolve(ROOT, 'scripts/output/vsi-oup-catalog.json');
const OUTPUT_DIR = resolve(ROOT, 'scripts/output');
const CANDIDATE_PATH = resolve(OUTPUT_DIR, 'vsi-catalog-candidate.json');
const DIFF_PATH = resolve(OUTPUT_DIR, 'vsi-catalog-candidate-diff.json');

const referenceDateFlag = process.argv.find((arg) => arg.startsWith('--reference-date='));
const referenceDateLabel = referenceDateFlag?.split('=').slice(1).join('=').trim() || '2026-04-08';
const referenceDate = new Date(`${referenceDateLabel}T23:59:59Z`);

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeIdentity(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeAuthorNameKey(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s.'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeAuthorNameLooseKey(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripAuthorPrefix(value) {
  return normalizeWhitespace(value)
    .replace(/^(?:author|prof(?:essor)?|dr|sir)\s+/i, '')
    .trim();
}

function normalizeAuthorListForComparison(value) {
  const text = stripAuthorPrefix(
    normalizeWhitespace(value).replace(/\((?:author|editor|ed\.)\)/gi, ''),
  );
  if (!text) return [];

  return text
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => normalizeAuthorNameLooseKey(stripAuthorPrefix(part)))
    .filter(Boolean);
}

function parseAuthorNames(value) {
  const text = normalizeWhitespace(value)
    .replace(/\((?:author|editor|ed\.)\)/gi, '')
    .trim();
  if (!text) return [];

  const parts = text
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => normalizeWhitespace(part).replace(/^(?:edited by|author)\s+/i, '').trim())
    .filter(Boolean);

  const names = [];
  for (const part of parts) {
    const match = part.match(/^([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})\b/);
    if (!match?.[1]) continue;
    names.push(match[1]);
  }

  const deduped = [];
  const seen = new Set();
  for (const name of names) {
    const key = normalizeAuthorNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(name);
  }
  return deduped;
}

function authorSurname(value) {
  const parts = normalizeAuthorNameKey(value).split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function titlesMatch(current, scraped) {
  if (!scraped) return false;
  return normalizeIdentity(current.title) === normalizeIdentity(scraped.title ?? current.title);
}

function catalogKey(entry) {
  return `${normalizeIdentity(entry.title)}::${normalizeIdentity(entry.author)}::${entry.edition ?? 1}`;
}

function normalizeStableKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function deriveVsiId(entry) {
  if (entry.id) return entry.id;
  if (entry.printIsbn) return `isbn-${entry.printIsbn}`;
  return `legacy-${normalizeStableKeyPart(entry.title)}-${normalizeStableKeyPart(entry.author)}`;
}

const MANUAL_PUBLISHED_CANONICAL_OVERRIDES = new Map([
  ['medical ethics', { author: 'Michael Dunn, Tony Hope' }],
  ['social work', { author: 'Sally Holland, Jonathan Scourfield' }],
  ['presocratic philosophy', { author: 'Catherine Rowett' }],
  ['indian cinema', { author: 'Ashish Rajadhyaksha' }],
  ['schizophrenia', { author: 'Chris Frith, Eve C. Johnstone' }],
  ['renaissance art', { author: 'Geraldine A Johnson' }],
  ['the united nations', { author: 'Jussi M. Hanhimäki' }],
  ['biblical archaeology', { title: 'Biblical Archaeology', author: 'Eric H Cline' }],
  ['the avant-garde', { title: 'The Avant-Garde' }],
  ['the palestinian–israeli conflict', { title: 'The Palestinian-Israeli Conflict' }],
  ['humour', { author: 'Noël Carroll' }],
  ['environmental politics', { author: 'Andrew Dobson' }],
  ['adolescence', { author: 'Peter K. Smith' }],
  ['populism', { author: 'Cas Mudde, Cristóbal Rovira Kaltwasser' }],
  ['clinical psychology', { author: 'Susan Llewelyn, Katie Aafjes-van Doorn' }],
  ['freemasonry', { author: 'Andreas Önnerfors' }],
  ['organized crime', { author: 'Georgios A Antonopoulos, Georgios Papanicolaou' }],
  ['emile zola', { title: 'Émile Zola' }],
  ['volcanoes', { author: 'Michael J Branney, Jan Zalasiewicz' }],
  ['war & religion', { title: 'War & Religion' }],
  ['creativity', { author: 'Vlad Glăveanu' }],
  ['ibn sīnā (avicenna)', { title: 'Ibn Sīnā (Avicenna)' }],
]);

const MANUAL_IDENTITY_OVERRIDES = new Set([
  'the great depression and the new deal',
  'hiv/aids',
  'diplomacy',
  'telescopes',
  'dostoevsky',
]);

function arraysEqual(left, right) {
  const leftItems = Array.isArray(left) ? left.map((item) => normalizeWhitespace(item)).filter(Boolean) : [];
  const rightItems = Array.isArray(right) ? right.map((item) => normalizeWhitespace(item)).filter(Boolean) : [];
  if (leftItems.length !== rightItems.length) return false;
  return leftItems.every((item, index) => item === rightItems[index]);
}

function valuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return arraysEqual(left, right);
  }
  if (typeof left === 'string' || typeof right === 'string') {
    return normalizeWhitespace(left) === normalizeWhitespace(right);
  }
  return left === right;
}

function isFuturePublication(entry) {
  if (entry.publicationDate) {
    const parsed = new Date(entry.publicationDate);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.getTime() > referenceDate.getTime();
    }
  }

  return Number.isFinite(entry.publicationYear) && entry.publicationYear > Number(referenceDateLabel.slice(0, 4));
}

function isIdentityCompatible(current, scraped) {
  if (!scraped) return false;
  return titlesMatch(current, scraped)
    && normalizeIdentity(current.author) === normalizeIdentity(scraped.author ?? current.author);
}

function canMergeMetadata(current, scraped) {
  if (!scraped) return false;
  if (isIdentityCompatible(current, scraped)) return true;
  return titlesMatch(current, scraped) && !isFuturePublication(scraped);
}

function resolveAcceptedAuthor(current, scraped) {
  if (!scraped || !titlesMatch(current, scraped) || isFuturePublication(scraped)) return undefined;

  const currentNormalized = normalizeAuthorListForComparison(current.author);
  const scrapedNormalized = normalizeAuthorListForComparison(scraped.author);
  if (
    currentNormalized.length > 0
    && currentNormalized.length === scrapedNormalized.length
    && currentNormalized.every((name, index) => name === scrapedNormalized[index])
  ) {
    return scraped.author;
  }

  const manualOverride = MANUAL_PUBLISHED_CANONICAL_OVERRIDES.get(normalizeIdentity(current.title));
  if (manualOverride?.author && !manualOverride.title) {
    return manualOverride.author;
  }

  const currentNames = parseAuthorNames(current.author);
  const scrapedNames = parseAuthorNames(scraped.author);
  if (currentNames.length === 0 || scrapedNames.length === 0) return undefined;

  const remaining = scrapedNames.slice();
  const matched = [];

  for (const currentName of currentNames) {
    const currentSurname = authorSurname(currentName);
    const index = remaining.findIndex((candidate) => authorSurname(candidate) === currentSurname);
    if (index === -1) {
      return undefined;
    }
    matched.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return matched.join(', ');
}

function resolveAcceptedIdentity(current, scraped) {
  if (!scraped || isFuturePublication(scraped)) return undefined;

  const manualOverride = MANUAL_PUBLISHED_CANONICAL_OVERRIDES.get(normalizeIdentity(current.title));
  if (manualOverride) {
    return {
      title: manualOverride.title ?? current.title,
      author: manualOverride.author ?? current.author,
      edition: manualOverride.edition ?? scraped.edition ?? current.edition,
    };
  }

  if (!MANUAL_IDENTITY_OVERRIDES.has(normalizeIdentity(current.title))) return undefined;

  return {
    title: scraped.title ?? current.title,
    author: scraped.author ?? current.author,
    edition: scraped.edition ?? current.edition,
  };
}

function buildCandidateEntry(current, scraped) {
  const candidate = { ...current, id: deriveVsiId(current) };
  const identityCompatible = isIdentityCompatible(current, scraped);
  const acceptedIdentity = resolveAcceptedIdentity(current, scraped);
  const mergeMetadata = canMergeMetadata(current, scraped);
  const acceptedAuthor = resolveAcceptedAuthor(current, scraped);

  if (acceptedIdentity) {
    candidate.title = acceptedIdentity.title;
    candidate.author = acceptedIdentity.author;
    candidate.edition = acceptedIdentity.edition ?? candidate.edition;
  } else if (acceptedAuthor) {
    candidate.author = acceptedAuthor;
  }

  if (mergeMetadata || acceptedIdentity) {
    candidate.publicationDate = scraped.publicationDate ?? candidate.publicationDate;
    candidate.publicationYear = scraped.publicationYear ?? candidate.publicationYear;
    candidate.edition = scraped.edition ?? candidate.edition;
    candidate.printIsbn = scraped.printIsbn ?? candidate.printIsbn;
    candidate.pageCount = scraped.pageCount ?? candidate.pageCount;
    candidate.wordCount = scraped.wordCount ?? candidate.wordCount;
    if ((scraped.highlights?.length ?? 0) > 0) {
      candidate.highlights = scraped.highlights;
    }
    if ((scraped.newToThisEdition?.length ?? 0) > 0) {
      candidate.newToThisEdition = scraped.newToThisEdition;
    }
  }

  if (isFuturePublication(candidate)) {
    candidate.hidden = true;
    candidate.hiddenReason = `Not yet published as of ${referenceDateLabel}`;
  } else {
    delete candidate.hidden;
    delete candidate.hiddenReason;
  }

  return { candidate, identityCompatible, acceptedAuthor, acceptedIdentity };
}

function compareField(differences, fieldCounts, field, currentValue, candidateValue) {
  if (candidateValue == null || candidateValue === '') return;
  if (currentValue == null || currentValue === '') {
    differences[field] = { current: currentValue ?? null, candidate: candidateValue };
    fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
    return;
  }
  if (!valuesEqual(currentValue, candidateValue)) {
    differences[field] = { current: currentValue, candidate: candidateValue };
    fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const liveCatalog = JSON.parse(readFileSync(LIVE_CATALOG_PATH, 'utf8'));
const scrapedReport = JSON.parse(readFileSync(SCRAPED_REPORT_PATH, 'utf8'));
const scrapedLookup = new Map(
  (scrapedReport.entries ?? [])
    .filter((entry) => entry.current && entry.scraped)
    .map((entry) => [catalogKey(entry.current), entry.scraped]),
);

const mergedTitles = [];
const diffEntries = [];
const fieldCounts = {};
const hiddenEntries = [];
const identityDifferences = [];
const futureIdentityDifferences = [];

for (const current of liveCatalog.titles) {
  const scraped = scrapedLookup.get(catalogKey(current));
  const { candidate, identityCompatible, acceptedAuthor, acceptedIdentity } = buildCandidateEntry(current, scraped);
  mergedTitles.push(candidate);

  if (candidate.hidden) {
    hiddenEntries.push({
      title: candidate.title,
      author: candidate.author,
      publicationDate: candidate.publicationDate ?? null,
      publicationYear: candidate.publicationYear ?? null,
      hiddenReason: candidate.hiddenReason,
    });
  }

  if (scraped && !identityCompatible && !acceptedAuthor && !acceptedIdentity) {
    const entry = {
      title: current.title,
      author: current.author,
      scrapedTitle: scraped.title ?? null,
      scrapedAuthor: scraped.author ?? null,
      scrapedEdition: scraped.edition ?? null,
      scrapedPublicationDate: scraped.publicationDate ?? null,
      productUrl: scraped.productUrl ?? null,
    };
    if (isFuturePublication(scraped)) {
      futureIdentityDifferences.push(entry);
    } else {
      identityDifferences.push(entry);
    }
  }

  const differences = {};
  compareField(differences, fieldCounts, 'title', current.title, candidate.title);
  compareField(differences, fieldCounts, 'author', current.author, candidate.author);
  compareField(differences, fieldCounts, 'publicationYear', current.publicationYear, candidate.publicationYear);
  compareField(differences, fieldCounts, 'publicationDate', current.publicationDate, candidate.publicationDate);
  compareField(differences, fieldCounts, 'edition', current.edition ?? 1, candidate.edition ?? 1);
  compareField(differences, fieldCounts, 'printIsbn', current.printIsbn, candidate.printIsbn);
  compareField(differences, fieldCounts, 'pageCount', current.pageCount, candidate.pageCount);
  compareField(differences, fieldCounts, 'wordCount', current.wordCount, candidate.wordCount);
  if ((candidate.highlights?.length ?? 0) > 0 && !arraysEqual(current.highlights, candidate.highlights)) {
    differences.highlights = {
      current: current.highlights ?? null,
      candidate: candidate.highlights,
    };
    fieldCounts.highlights = (fieldCounts.highlights ?? 0) + 1;
  }
  if ((candidate.newToThisEdition?.length ?? 0) > 0 && !arraysEqual(current.newToThisEdition, candidate.newToThisEdition)) {
    differences.newToThisEdition = {
      current: current.newToThisEdition ?? null,
      candidate: candidate.newToThisEdition,
    };
    fieldCounts.newToThisEdition = (fieldCounts.newToThisEdition ?? 0) + 1;
  }
  if (!valuesEqual(current.hidden, candidate.hidden)) {
    differences.hidden = {
      current: current.hidden ?? false,
      candidate: candidate.hidden ?? false,
    };
    fieldCounts.hidden = (fieldCounts.hidden ?? 0) + 1;
  }
  if (!valuesEqual(current.hiddenReason, candidate.hiddenReason) && candidate.hiddenReason) {
    differences.hiddenReason = {
      current: current.hiddenReason ?? null,
      candidate: candidate.hiddenReason,
    };
    fieldCounts.hiddenReason = (fieldCounts.hiddenReason ?? 0) + 1;
  }

  if (Object.keys(differences).length > 0) {
    diffEntries.push({
      title: current.title,
      author: current.author,
      edition: current.edition,
      differences,
    });
  }
}

const candidateCatalog = {
  ...liveCatalog,
  candidateBuiltAt: new Date().toISOString(),
  candidateReferenceDate: referenceDateLabel,
  titles: mergedTitles,
};

const diffReport = {
  generatedAt: new Date().toISOString(),
  referenceDate: referenceDateLabel,
  sourceScrapeGeneratedAt: scrapedReport.generatedAt ?? null,
  totalTitles: liveCatalog.titles.length,
  changedEntries: diffEntries.length,
  hiddenEntries,
  identityDifferences,
  futureIdentityDifferences,
  fieldCounts,
  entries: diffEntries,
};

writeFileSync(CANDIDATE_PATH, JSON.stringify(candidateCatalog, null, 2) + '\n');
writeFileSync(DIFF_PATH, JSON.stringify(diffReport, null, 2) + '\n');

console.log(`Candidate catalog written to: ${CANDIDATE_PATH}`);
console.log(`Candidate diff written to: ${DIFF_PATH}`);
console.log(`Changed entries: ${diffEntries.length}`);
console.log(`Hidden entries: ${hiddenEntries.length}`);
console.log(`Identity differences requiring review: ${identityDifferences.length}`);
console.log(`Future identity differences requiring review: ${futureIdentityDifferences.length}`);
