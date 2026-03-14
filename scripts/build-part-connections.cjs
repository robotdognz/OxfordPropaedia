#!/usr/bin/env node
/**
 * Generates src/data/part-connections.json from the canonical cross-references
 * data. Includes both direct and 1-hop transitive connections.
 *
 * Usage: node scripts/build-part-connections.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SECTIONS_DIR = path.join(ROOT, 'src/content/sections');
const CROSS_REFS_PATH = path.join(ROOT, 'src/data/cross-references.json');
const OUTPUT_PATH = path.join(ROOT, 'src/data/part-connections.json');

// Load section metadata
const sectionToPart = {};
const sectionTitle = {};
for (const file of fs.readdirSync(SECTIONS_DIR)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
  sectionToPart[data.sectionCode] = data.partNumber;
  sectionTitle[data.sectionCode] = data.title;
}

// Load cross-references
const { references } = JSON.parse(fs.readFileSync(CROSS_REFS_PATH, 'utf8'));

// Build outgoing adjacency list
const outgoing = {};
references.forEach((r) => {
  if (!outgoing[r.sourceSection]) outgoing[r.sourceSection] = [];
  outgoing[r.sourceSection].push(r);
});

function connectionKey(a, b) {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

// 1. Collect direct cross-part references
const direct = {};
references.forEach((r) => {
  const sp = sectionToPart[r.sourceSection];
  const tp = sectionToPart[r.targetSection];
  if (!sp || !tp || sp === tp) return;
  const key = connectionKey(sp, tp);
  if (!direct[key]) direct[key] = [];
  direct[key].push({
    sourceSection: r.sourceSection,
    targetSection: r.targetSection,
    sourcePath: r.sourcePath || '',
    targetPath: r.targetPath || '',
  });
});

// 2. Find 1-hop transitive connections for pairs with no direct references
const allPairs = [];
for (let i = 1; i <= 10; i++) {
  for (let j = i + 1; j <= 10; j++) {
    allPairs.push(connectionKey(i, j));
  }
}

const transitive = {};
allPairs.forEach((key) => {
  if (direct[key]) return; // already have direct connections

  const [partA, partB] = key.split('-').map(Number);
  const found = [];
  const seen = new Set();

  references.forEach((r) => {
    const sp = sectionToPart[r.sourceSection];
    if (!sp) return;

    // Source in Part A, target is intermediate
    if (sp === partA) {
      (outgoing[r.targetSection] || []).forEach((next) => {
        if (sectionToPart[next.targetSection] === partB) {
          const sig = `${r.sourceSection}>${r.targetSection}>${next.targetSection}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: r.sourceSection,
              targetSection: next.targetSection,
              sourcePath: r.sourcePath || '',
              targetPath: next.targetPath || '',
              via: r.targetSection,
            });
          }
        }
      });
    }

    // Source in Part B, target is intermediate
    if (sp === partB) {
      (outgoing[r.targetSection] || []).forEach((next) => {
        if (sectionToPart[next.targetSection] === partA) {
          const sig = `${next.targetSection}>${r.targetSection}>${r.sourceSection}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: next.targetSection,
              targetSection: r.sourceSection,
              sourcePath: next.targetPath || '',
              targetPath: r.sourcePath || '',
              via: r.targetSection,
            });
          }
        }
      });
    }
  });

  if (found.length > 0) {
    transitive[key] = found;
  }
});

// 3. Find shared Macropaedia references for pairs still uncovered
const sectionMacro = {};
for (const file of fs.readdirSync(SECTIONS_DIR)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
  if (data.macropaediaReferences && data.macropaediaReferences.length > 0) {
    sectionMacro[data.sectionCode] = data.macropaediaReferences;
  }
}

// Build article -> sections map
const articleToSections = {};
Object.entries(sectionMacro).forEach(([code, articles]) => {
  articles.forEach((article) => {
    if (!articleToSections[article]) articleToSections[article] = [];
    articleToSections[article].push(code);
  });
});

const sharedMacro = {};
allPairs.forEach((key) => {
  if (direct[key] || transitive[key]) return;

  const [partA, partB] = key.split('-').map(Number);
  const found = [];
  const seen = new Set();

  Object.entries(articleToSections).forEach(([article, sections]) => {
    const inA = sections.filter((s) => sectionToPart[s] === partA);
    const inB = sections.filter((s) => sectionToPart[s] === partB);
    if (inA.length > 0 && inB.length > 0) {
      // Create a connection for each pair of sections sharing this article
      inA.forEach((a) => {
        inB.forEach((b) => {
          const sig = `${a}>${b}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: a,
              targetSection: b,
              sourcePath: '',
              targetPath: '',
              sharedArticle: article,
            });
          }
        });
      });
    }
  });

  if (found.length > 0) {
    sharedMacro[key] = found;
  }
});

// 4. Merge into output
const output = {};
allPairs.forEach((key) => {
  if (direct[key]) {
    output[key] = direct[key];
  } else if (transitive[key]) {
    output[key] = transitive[key];
  } else if (sharedMacro[key]) {
    output[key] = sharedMacro[key];
  }
});

// Sort keys for stable output
const sorted = {};
Object.keys(output)
  .sort((a, b) => {
    const [a1, a2] = a.split('-').map(Number);
    const [b1, b2] = b.split('-').map(Number);
    return a1 - b1 || a2 - b2;
  })
  .forEach((k) => {
    sorted[k] = output[k];
  });

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');

const directCount = Object.keys(direct).length;
const transitiveCount = Object.keys(transitive).length;
const macroCount = Object.keys(sharedMacro).length;
const totalPairs = allPairs.length;
const coveredPairs = Object.keys(sorted).length;
const uncoveredPairs = totalPairs - coveredPairs;

console.log(`Direct connections: ${directCount} pairs`);
console.log(`Transitive connections: ${transitiveCount} pairs`);
console.log(`Shared Macropaedia: ${macroCount} pairs`);
console.log(`Total coverage: ${coveredPairs}/${totalPairs} pairs`);
if (uncoveredPairs > 0) {
  const missing = allPairs.filter((k) => !sorted[k]);
  console.log(`Uncovered: ${missing.join(', ')}`);
}
console.log(`Written to ${OUTPUT_PATH}`);
