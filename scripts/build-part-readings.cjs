#!/usr/bin/env node
/**
 * Generates per-part and per-division reading recommendation files
 * as individual JSON files in content collections.
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

const TOP_N = 8;

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

// Accumulate counts per grouping
function buildIndex(mappingsDir, getKey, getAuthor) {
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

      if (!index.has(key)) {
        index.set(key, {
          author: getAuthor ? getAuthor(mapping) : undefined,
          parts: {},
          divisions: {},
        });
      }
      const entry = index.get(key);

      if (!entry.parts[partNumber]) entry.parts[partNumber] = new Set();
      entry.parts[partNumber].add(sectionCode);

      if (!entry.divisions[divisionId]) entry.divisions[divisionId] = new Set();
      entry.divisions[divisionId].add(sectionCode);
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
        index.set(ref, { parts: {}, divisions: {} });
      }
      const entry = index.get(ref);

      if (!entry.parts[partNumber]) entry.parts[partNumber] = new Set();
      entry.parts[partNumber].add(sectionCode);

      if (!entry.divisions[divisionId]) entry.divisions[divisionId] = new Set();
      entry.divisions[divisionId].add(sectionCode);
    }
  }

  return index;
}

const vsiIndex = buildIndex(VSI_MAPPINGS_DIR, m => m.vsiTitle, m => m.vsiAuthor);
const wikiIndex = buildIndex(WIKI_MAPPINGS_DIR, m => m.articleTitle, null);
const macroIndex = buildMacroIndex();

function topItemsForGroup(index, groupField, groupKey, hasAuthor) {
  const items = [];
  for (const [title, entry] of index) {
    const sections = entry[groupField][groupKey];
    if (!sections || sections.size === 0) continue;
    const item = { title, count: sections.size };
    if (hasAuthor && entry.author) item.author = entry.author;
    items.push(item);
  }
  items.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return items.slice(0, TOP_N);
}

// Write per-part files
let partCount = 0;
for (const part of navigation.parts) {
  const pn = part.partNumber;
  const vsi = topItemsForGroup(vsiIndex, 'parts', pn, true);
  const wiki = topItemsForGroup(wikiIndex, 'parts', pn, true);
  const macro = topItemsForGroup(macroIndex, 'parts', pn, false);

  const data = {
    partNumber: pn,
    readings: {},
  };
  if (vsi.length > 0) data.readings.vsi = vsi;
  if (wiki.length > 0) data.readings.wiki = wiki;
  if (macro.length > 0) data.readings.macro = macro;

  const filename = `part-${String(pn).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(PART_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
  partCount++;
}

// Write per-division files
let divCount = 0;
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    const vsi = topItemsForGroup(vsiIndex, 'divisions', div.divisionId, true);
    const wiki = topItemsForGroup(wikiIndex, 'divisions', div.divisionId, true);
    const macro = topItemsForGroup(macroIndex, 'divisions', div.divisionId, false);

    const data = {
      divisionId: div.divisionId,
      readings: {},
    };
    if (vsi.length > 0) data.readings.vsi = vsi;
    if (wiki.length > 0) data.readings.wiki = wiki;
    if (macro.length > 0) data.readings.macro = macro;

    const filename = `div-${div.divisionId}.json`;
    fs.writeFileSync(path.join(DIV_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
    divCount++;
  }
}

// Clean up old monolithic files if they exist
for (const old of ['src/data/part-readings.json', 'src/data/division-readings.json']) {
  const p = path.join(ROOT, old);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`Removed old ${old}`); }
}

console.log(`Generated ${partCount} part reading files in src/content/part-readings/`);
console.log(`Generated ${divCount} division reading files in src/content/division-readings/`);
