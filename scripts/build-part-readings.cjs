#!/usr/bin/env node
/**
 * Generates per-part and per-division reading recommendation files
 * as individual JSON files in content collections.
 *
 * Part-level: only includes items that appear in multiple divisions within the part.
 *   "count" = number of divisions the item appears in.
 * Division-level: only includes items that appear in multiple sections within the division.
 *   "count" = number of sections the item appears in.
 *
 * Output:
 *   src/content/part-readings/part-01.json through part-10.json
 *   src/content/division-readings/div-1-01.json through div-10-06.json
 *
 * Usage: node scripts/build-part-readings.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NAV_PATH = path.join(ROOT, 'src/data/navigation.json');
const VSI_MAPPINGS_DIR = path.join(ROOT, 'src/content/vsi-mappings');
const WIKI_MAPPINGS_DIR = path.join(ROOT, 'src/content/wiki-mappings');
const SECTIONS_DIR = path.join(ROOT, 'src/content/sections');
const PART_OUTPUT_DIR = path.join(ROOT, 'src/content/part-readings');
const DIV_OUTPUT_DIR = path.join(ROOT, 'src/content/division-readings');

// Ensure output directories exist
for (const dir of [PART_OUTPUT_DIR, DIV_OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Build lookups
const navigation = JSON.parse(fs.readFileSync(NAV_PATH, 'utf8'));
const sectionToPart = {};
const sectionToDivision = {};
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    for (const sec of div.sections) {
      sectionToPart[sec.sectionCode] = part.partNumber;
      sectionToDivision[sec.sectionCode] = div.divisionId;
    }
  }
}

/**
 * Build an index tracking which sections and divisions each title appears in,
 * plus total outline path count for ranking depth.
 */
function buildIndex(mappingsDir, getKey, getAuthor, getPathCount) {
  const index = new Map();
  const files = fs.readdirSync(mappingsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(mappingsDir, file), 'utf8'));
    const sectionCode = data.sectionCode;
    const partNumber = sectionToPart[sectionCode];
    const divisionId = sectionToDivision[sectionCode];
    if (!partNumber || !divisionId) continue;

    for (const mapping of data.mappings || []) {
      const key = getKey(mapping);
      if (!key) continue;
      const pathCount = getPathCount ? getPathCount(mapping) : 1;

      if (!index.has(key)) {
        index.set(key, {
          author: getAuthor ? getAuthor(mapping) : undefined,
          divisions: {},        // partNumber -> Set<divisionId>
          partSections: {},     // partNumber -> Set<sectionCode>
          partPaths: {},        // partNumber -> total outline path count
          divSections: {},      // divisionId -> Set<sectionCode>
          divPaths: {},         // divisionId -> total outline path count
        });
      }
      const entry = index.get(key);

      // Part-level tracking
      if (!entry.divisions[partNumber]) entry.divisions[partNumber] = new Set();
      entry.divisions[partNumber].add(divisionId);
      if (!entry.partSections[partNumber]) entry.partSections[partNumber] = new Set();
      entry.partSections[partNumber].add(sectionCode);
      entry.partPaths[partNumber] = (entry.partPaths[partNumber] || 0) + pathCount;

      // Division-level tracking
      if (!entry.divSections[divisionId]) entry.divSections[divisionId] = new Set();
      entry.divSections[divisionId].add(sectionCode);
      entry.divPaths[divisionId] = (entry.divPaths[divisionId] || 0) + pathCount;
    }
  }

  return index;
}

function buildMacroIndex() {
  const index = new Map();
  const files = fs.readdirSync(SECTIONS_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
    const sectionCode = data.sectionCode;
    const partNumber = sectionToPart[sectionCode];
    const divisionId = sectionToDivision[sectionCode];
    if (!partNumber || !divisionId) continue;

    for (const ref of data.macropaediaReferences || []) {
      if (!index.has(ref)) {
        index.set(ref, { divisions: {}, partSections: {}, partPaths: {}, divSections: {}, divPaths: {} });
      }
      const entry = index.get(ref);

      if (!entry.divisions[partNumber]) entry.divisions[partNumber] = new Set();
      entry.divisions[partNumber].add(divisionId);
      if (!entry.partSections[partNumber]) entry.partSections[partNumber] = new Set();
      entry.partSections[partNumber].add(sectionCode);
      entry.partPaths[partNumber] = (entry.partPaths[partNumber] || 0) + 1;

      if (!entry.divSections[divisionId]) entry.divSections[divisionId] = new Set();
      entry.divSections[divisionId].add(sectionCode);
      entry.divPaths[divisionId] = (entry.divPaths[divisionId] || 0) + 1;
    }
  }

  return index;
}

const vsiIndex = buildIndex(VSI_MAPPINGS_DIR, m => m.vsiTitle, m => m.vsiAuthor, m => (m.relevantPathsAI || []).length || 1);
const wikiIndex = buildIndex(WIKI_MAPPINGS_DIR, m => m.articleTitle, null, m => (m.relevantPathsAI || []).length || 1);
const macroIndex = buildMacroIndex();

/**
 * Shannon entropy of a distribution. Higher = more evenly spread.
 * Input: array of counts (e.g., [3, 3, 3] or [8, 1, 1])
 */
function entropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * For a given title within a part, get the distribution of its section counts
 * across divisions. Used to compute spread evenness at the Part level.
 */
function getPartDivDistribution(entry, partNumber, sectionToDivision) {
  const divCounts = {};
  const sections = entry.partSections[partNumber];
  if (!sections) return [];
  for (const sec of sections) {
    const divId = sectionToDivision[sec];
    if (divId) divCounts[divId] = (divCounts[divId] || 0) + 1;
  }
  return Object.values(divCounts);
}

/**
 * For a given title within a division, get the distribution of its path counts
 * across sections. Used to compute spread evenness at the Division level.
 */
function getDivSectionDistribution(entry, divisionId) {
  // We need per-section path counts within this division.
  // The index tracks total paths per division, not per section.
  // Use section count as proxy — each section contributes equally.
  const secs = entry.divSections[divisionId];
  if (!secs) return [];
  // All we know is which sections it appears in. Assume roughly even paths per section.
  // For a better signal, count 1 per section (the entropy of presence/absence is the spread).
  return Array.from(secs).map(() => 1);
}

/**
 * Compute a composite relevance score combining entropy, breadth, and depth.
 * Returns a value where higher = more relevant.
 * Components are weighted so entropy dominates, then count, then sections, then paths.
 */
function compositeScore(spread, count, sections, paths) {
  // Entropy typically ranges 0 to ~3.3 (log2(10))
  // Normalise each component and weight them
  return spread * 10000 + count * 1000 + (sections || 0) * 100 + (paths || 0);
}

// Part-level: items appearing in 2+ divisions within the part
// Ranked by: entropy of spread across divisions (primary), division count (secondary),
// section count (tertiary), outline paths (quaternary)
// Outputs a normalised relevance score (0-100) for bar display
function partItems(index, partNumber, hasAuthor) {
  const items = [];
  for (const [title, entry] of index) {
    const divs = entry.divisions[partNumber];
    if (!divs || divs.size < 2) continue;
    const sectionCount = entry.partSections[partNumber]?.size || 0;
    const pathCount = entry.partPaths[partNumber] || 0;
    const distribution = getPartDivDistribution(entry, partNumber, sectionToDivision);
    const spread = entropy(distribution);
    const score = compositeScore(spread, divs.size, sectionCount, pathCount);
    const item = { title, count: divs.size, sections: sectionCount, paths: pathCount, _score: score };
    if (hasAuthor && entry.author) item.author = entry.author;
    items.push(item);
  }
  items.sort((a, b) => b._score - a._score || a.title.localeCompare(b.title));
  // Normalise scores to 0-100 relative to the top item
  const maxScore = items.length > 0 ? items[0]._score : 1;
  return items.map(({ _score, ...rest }) => ({
    ...rest,
    relevance: Math.round((_score / maxScore) * 100),
  }));
}

// Division-level: items appearing in 2+ sections within the division
// Ranked by: section count (primary), outline paths as depth (secondary)
// Outputs a normalised relevance score (0-100) for bar display
function divItems(index, divisionId, hasAuthor) {
  const items = [];
  for (const [title, entry] of index) {
    const secs = entry.divSections[divisionId];
    if (!secs || secs.size < 2) continue;
    const pathCount = entry.divPaths[divisionId] || 0;
    const score = compositeScore(0, secs.size, 0, pathCount);
    const item = { title, count: secs.size, paths: pathCount, _score: score };
    if (hasAuthor && entry.author) item.author = entry.author;
    items.push(item);
  }
  items.sort((a, b) => b._score - a._score || a.title.localeCompare(b.title));
  const maxScore = items.length > 0 ? items[0]._score : 1;
  return items.map(({ _score, ...rest }) => ({
    ...rest,
    relevance: Math.round((_score / maxScore) * 100),
  }));
}

// Write per-part files
let partCount = 0;
let partItemTotal = 0;
for (const part of navigation.parts) {
  const pn = part.partNumber;
  const vsi = partItems(vsiIndex, pn, true);
  const wiki = partItems(wikiIndex, pn, true);
  const macro = partItems(macroIndex, pn, false);

  const data = { partNumber: pn, readings: {} };
  if (vsi.length > 0) data.readings.vsi = vsi;
  if (wiki.length > 0) data.readings.wiki = wiki;
  if (macro.length > 0) data.readings.macro = macro;
  partItemTotal += vsi.length + wiki.length + macro.length;

  const filename = `part-${String(pn).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(PART_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
  partCount++;
}

// Write per-division files
let divCount = 0;
let divItemTotal = 0;
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    const vsi = divItems(vsiIndex, div.divisionId, true);
    const wiki = divItems(wikiIndex, div.divisionId, true);
    const macro = divItems(macroIndex, div.divisionId, false);

    const data = { divisionId: div.divisionId, readings: {} };
    if (vsi.length > 0) data.readings.vsi = vsi;
    if (wiki.length > 0) data.readings.wiki = wiki;
    if (macro.length > 0) data.readings.macro = macro;
    divItemTotal += vsi.length + wiki.length + macro.length;

    const filename = `div-${div.divisionId}.json`;
    fs.writeFileSync(path.join(DIV_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
    divCount++;
  }
}

console.log(`Generated ${partCount} part reading files (${partItemTotal} total items, multi-division only)`);
console.log(`Generated ${divCount} division reading files (${divItemTotal} total items, multi-section only)`);
