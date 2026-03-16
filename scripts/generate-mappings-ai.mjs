#!/usr/bin/env node
/**
 * Generates or updates section mappings (relevantPathsAI + rationaleAI) using summaryAI.
 *
 * Modes:
 *   --mode remap    Improve existing mappings with better paths and rationales (default)
 *   --mode assign   Full recompute: select items for each section from catalog + assign paths
 *   --mode discover Find which sections an item maps to from the full catalog
 *
 * Usage:
 *   node scripts/generate-mappings-ai.mjs --section 824                    # Remap one section
 *   node scripts/generate-mappings-ai.mjs --all                            # Remap all 177 sections
 *   node scripts/generate-mappings-ai.mjs --all --empty-only               # Only sections with empty paths
 *   node scripts/generate-mappings-ai.mjs --all --limit 5                  # Process first 5 sections
 *   node scripts/generate-mappings-ai.mjs --all --type vsi                 # VSI only
 *   node scripts/generate-mappings-ai.mjs --mode assign --all --type wikipedia  # Full Wikipedia recompute
 *   node scripts/generate-mappings-ai.mjs --mode assign --section 824 --type vsi  # Assign one section
 *   node scripts/generate-mappings-ai.mjs --mode discover --item "Buddhism::Damien Keown" --type vsi
 *   node scripts/generate-mappings-ai.mjs --mode discover --new-only --type vsi
 *   node scripts/generate-mappings-ai.mjs --validate                       # Validate existing mappings
 *   node scripts/generate-mappings-ai.mjs --coverage                       # Coverage gap report
 *   node scripts/generate-mappings-ai.mjs --section 824 --dry-run          # Preview without writing
 *
 * Requires:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY environment variable
 *   summaryAI fields populated in catalog files (run generate-summary-ai.mjs first)
 */

import fs from 'fs';

// Lazy import — only loaded when API calls are needed
async function getAnthropicClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

// --- Configuration ---
const MODEL = 'claude-sonnet-4-6';
const CONCURRENCY = 3;
const DISCOVER_TOP_SECTIONS = 50; // candidate sections per item in discover mode
const ASSIGN_CANDIDATES = 60; // candidate items per section in assign mode

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
function hasFlag(name) { return args.includes('--' + name); }

const sectionFlag = getArg('section');
const allFlag = hasFlag('all');
const limitFlag = getArg('limit') ? parseInt(getArg('limit'), 10) : Infinity;
const typeFlag = getArg('type') || 'both';
const modeFlag = getArg('mode') || 'remap';
const itemFlag = getArg('item');
const emptyOnlyFlag = hasFlag('empty-only');
const newOnlyFlag = hasFlag('new-only');
const validateFlag = hasFlag('validate');
const coverageFlag = hasFlag('coverage');
const dryRunFlag = hasFlag('dry-run');

if (!validateFlag && !coverageFlag) {
  if (modeFlag === 'remap' && !sectionFlag && !allFlag) {
    console.error('Remap mode requires --section CODE or --all');
    process.exit(1);
  }
  if (modeFlag === 'assign' && !sectionFlag && !allFlag) {
    console.error('Assign mode requires --section CODE or --all');
    process.exit(1);
  }
  if (modeFlag === 'assign' && typeFlag === 'both') {
    console.error('Assign mode requires --type vsi or --type wikipedia');
    process.exit(1);
  }
  if (modeFlag === 'discover' && !itemFlag && !allFlag && !newOnlyFlag) {
    console.error('Discover mode requires --item ID, --all, or --new-only');
    process.exit(1);
  }
  if (modeFlag === 'discover' && typeFlag === 'both') {
    console.error('Discover mode requires --type vsi or --type wikipedia');
    process.exit(1);
  }
}

// --- Tokenization (for discover pre-filtering) ---
function tokenize(text) {
  const tokens = new Set();
  for (const word of (text || '').split(/[^A-Za-z0-9']+/)) {
    let t = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.length > 4 && t.endsWith('s')) t = t.slice(0, -1);
    if (t && t.length >= 3) tokens.add(t);
  }
  return tokens;
}

function countOverlap(setA, setB) {
  let count = 0;
  for (const t of setA) {
    if (setB.has(t)) count++;
  }
  return count;
}

// --- Load data ---
function loadTaxonomy() {
  const nav = JSON.parse(fs.readFileSync('src/data/navigation.json', 'utf8'));
  const lines = [];
  for (const p of nav.parts) {
    lines.push(`Part ${p.partNumber}: ${p.title}`);
    for (const d of p.divisions) {
      lines.push(`  Division ${d.romanNumeral}: ${d.title}`);
      for (const s of d.sections) {
        lines.push(`    Section ${s.sectionCode}: ${s.title}`);
      }
    }
  }
  return lines.join('\n');
}

function collectOutlineText(items) {
  let text = '';
  for (const item of items || []) {
    text += ' ' + (item.text || '');
    text += collectOutlineText(item.children);
  }
  return text;
}

function loadSectionOutline(sectionCode) {
  const filePath = `src/content/sections/${sectionCode}.json`;
  if (!fs.existsSync(filePath)) return null;
  const section = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  function formatOutline(items, indent = 0) {
    let text = '';
    for (const item of items) {
      text += '  '.repeat(indent) + item.level + ': ' + item.text + '\n';
      if (item.children?.length > 0) text += formatOutline(item.children, indent + 1);
    }
    return text;
  }

  return {
    sectionCode: section.sectionCode,
    title: section.title,
    outlineText: formatOutline(section.outline),
    fullText: section.title + ' ' + collectOutlineText(section.outline),
  };
}

function loadAllSectionData() {
  const codes = getAllSectionCodes();
  const sections = [];
  for (const code of codes) {
    const s = loadSectionOutline(code);
    if (s) {
      s.tokens = tokenize(s.fullText);
      sections.push(s);
    }
  }
  return sections;
}

function loadVsiCatalog() {
  const catalog = JSON.parse(fs.readFileSync('src/content/vsi/catalog.json', 'utf8'));
  return new Map(catalog.titles.map((t) => [
    `${t.title}::${t.author}`,
    {
      title: t.title,
      author: t.author,
      summaryAI: t.summaryAI || '',
      keywords: (t.keywords || []).join(', '),
      subject: t.subject || '',
    },
  ]));
}

function loadWikiCatalog() {
  const catalog = JSON.parse(fs.readFileSync('src/data/wikipedia-catalog.json', 'utf8'));
  return new Map(catalog.articles.map((a) => [
    a.title,
    {
      title: a.title,
      summaryAI: a.summaryAI || '',
      keywords: (a.wikiCategories || []).join(', '),
      subject: a.category || '',
    },
  ]));
}

function loadExistingMappings(sectionCode, type) {
  const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
  const filePath = `${dir}/${sectionCode}.json`;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAllSectionCodes() {
  return fs.readdirSync('src/content/sections')
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort();
}

// --- Find which sections an item is currently mapped to ---
function findExistingMappedSections(itemId, type) {
  const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const sections = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
    for (const m of data.mappings) {
      const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
      if (id === itemId) {
        sections.push(data.sectionCode);
        break;
      }
    }
  }

  return sections;
}

// --- System prompts ---
function buildRemapSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive a section's outline and a list of items (books or articles) with their summaryAI. For each item, determine:
1. Which outline paths (e.g., A, A.1, B.3.c) the item genuinely covers
2. A brief rationale (1-2 sentences) explaining the connection

The full Propaedia taxonomy for context:

${taxonomy}

Guidelines:
- Only assign paths where there is genuine topical overlap, not tangential connections
- Use the most specific path that applies (A.3.b rather than just A if the item specifically covers that sub-topic)
- Also include broader parent paths (A) if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This book covers..." — write direct factual rationales
- Rationales should mention the outline paths they reference, e.g., "Buddhist meditation practices (B.4) and the vipassana tradition (C.2.a.ii)"

Output format — a JSON array:
[{
  "id": "item identifier",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

function buildDiscoverSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive one item (a book or article) with its summaryAI, and a list of candidate Propaedia sections with their outlines. Your job is to determine which sections the item genuinely maps to, and for each match, identify the specific outline paths and write a rationale.

The full Propaedia taxonomy for context:

${taxonomy}

Guidelines:
- Only confirm a section mapping if there is genuine, substantive topical overlap — not just tangential mention
- For each confirmed section, assign specific outline paths where the item's content matches
- Use the most specific path that applies, and also include broader parent paths if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This book covers..." — write direct factual rationales
- It is fine to confirm only a few sections or even none — quality over quantity
- If a candidate section has no genuine overlap, omit it entirely from the output

Output format — a JSON array (only include sections with genuine matches):
[{
  "sectionCode": "824",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

// --- Format items for prompt ---
function formatItemsForPrompt(items, type) {
  return items.map((item, i) => {
    const num = i + 1;
    if (type === 'vsi') {
      return `${num}. ID: ${item.id}\n   Title: ${item.title}\n   Author: ${item.author}\n   summaryAI: ${item.summaryAI}`;
    } else {
      return `${num}. ID: ${item.id}\n   Title: ${item.title}\n   summaryAI: ${item.summaryAI}`;
    }
  }).join('\n\n');
}

// --- API calls ---
async function generateRemapMappings(client, systemPrompt, section, items, type) {
  // Find uncovered paths to include as context
  const { uncovered } = findUncoveredPaths(section.sectionCode);
  const uncoveredNote = uncovered.length > 0
    ? `\n\nIMPORTANT — The following ${uncovered.length} outline paths currently have NO recommendations. ` +
      `If any of the items below genuinely cover these topics, please include these paths in their relevantPathsAI:\n` +
      uncovered.map((u) => `  ${u.path}: ${u.text.substring(0, 80)}`).join('\n')
    : '';

  const userMessage = `Section ${section.sectionCode}: ${section.title}

Outline:
${section.outlineText}${uncoveredNote}

---

Items to map (${items.length} ${type === 'vsi' ? 'VSI books' : 'Wikipedia articles'}):

${formatItemsForPrompt(items, type)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for section ${section.sectionCode}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for section ${section.sectionCode}: ${err.message}`);
    return [];
  }
}

async function generateDiscoverMappings(client, systemPrompt, item, candidateSections, type) {
  const sectionsText = candidateSections.map((s, i) =>
    `${i + 1}. Section ${s.sectionCode}: ${s.title}\nOutline:\n${s.outlineText}`
  ).join('\n---\n\n');

  const itemText = type === 'vsi'
    ? `Title: ${item.title}\nAuthor: ${item.author}\nsummaryAI: ${item.summaryAI}`
    : `Title: ${item.title}\nsummaryAI: ${item.summaryAI}`;

  const userMessage = `Item to map:
${itemText}

---

Candidate sections (${candidateSections.length}):

${sectionsText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for item ${item.id}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for item ${item.id}: ${err.message}`);
    return [];
  }
}

// --- Pre-filter: score item against all sections ---
function rankSectionsForItem(item, allSections) {
  // Combine all available text for richer token matching
  const textParts = [item.summaryAI, item.title];
  if (item.author) textParts.push(item.author);
  if (item.keywords) textParts.push(item.keywords);
  if (item.subject) textParts.push(item.subject);
  const itemTokens = tokenize(textParts.join(' '));

  const scored = allSections.map((section) => ({
    ...section,
    score: countOverlap(itemTokens, section.tokens),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, DISCOVER_TOP_SECTIONS);
}

// --- Write results ---
function writeMappingResults(sectionCode, results, type, existingData) {
  const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
  const filePath = `${dir}/${sectionCode}.json`;

  const resultLookup = new Map(results.map((r) => [r.id, r]));

  const mappings = existingData.mappings.map((m) => {
    const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
    const result = resultLookup.get(id);

    if (result) {
      const updated = { ...m };
      updated.relevantPathsAI = result.relevantPathsAI || [];
      updated.rationaleAI = result.rationaleAI || m.rationaleAI || '';
      return updated;
    }
    return m;
  });

  const output = { sectionCode, mappings, _curatedBy: 'ai' };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
}

function writeDiscoverResult(sectionCode, item, result, type) {
  const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
  const filePath = `${dir}/${sectionCode}.json`;

  let data;
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } else {
    data = { sectionCode, mappings: [], _curatedBy: 'ai' };
  }

  // Check if item already exists in this section's mappings
  const existingIdx = data.mappings.findIndex((m) => {
    const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
    return id === item.id;
  });

  const newMapping = type === 'vsi'
    ? {
        vsiTitle: item.title,
        vsiAuthor: item.author,
        relevantPathsAI: result.relevantPathsAI || [],
        rationaleAI: result.rationaleAI || '',
      }
    : {
        articleTitle: item.title,
        relevantPathsAI: result.relevantPathsAI || [],
        rationaleAI: result.rationaleAI || '',
      };

  if (existingIdx >= 0) {
    data.mappings[existingIdx] = newMapping;
  } else {
    data.mappings.push(newMapping);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// --- Prepare items for remap ---
function prepareRemapItems(sectionCode, type, catalog) {
  const existing = loadExistingMappings(sectionCode, type);
  if (!existing) return { items: [], existing: null };

  const items = existing.mappings
    .map((m) => {
      const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
      const catalogEntry = catalog.get(id);
      if (!catalogEntry?.summaryAI) return null;
      if (emptyOnlyFlag && m.relevantPathsAI?.length > 0) return null;

      return {
        id,
        title: type === 'vsi' ? m.vsiTitle : m.articleTitle,
        author: type === 'vsi' ? m.vsiAuthor : undefined,
        summaryAI: catalogEntry.summaryAI,
      };
    })
    .filter(Boolean);

  return { items, existing };
}

// --- Get items for discover mode ---
function getDiscoverItems(type, catalog) {
  if (itemFlag) {
    const entry = catalog.get(itemFlag);
    if (!entry) {
      console.error(`Item not found in catalog: ${itemFlag}`);
      process.exit(1);
    }
    if (!entry.summaryAI) {
      console.error(`Item has no summaryAI: ${itemFlag} (run generate-summary-ai.mjs first)`);
      process.exit(1);
    }
    return [{
      id: itemFlag,
      title: entry.title,
      author: entry.author,
      summaryAI: entry.summaryAI,
    }];
  }

  // All items or new-only
  const items = [];
  const mappedIds = new Set();

  if (newOnlyFlag) {
    // Find all items currently mapped to ANY section
    const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
      for (const m of data.mappings) {
        const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
        mappedIds.add(id);
      }
    }
  }

  for (const [id, entry] of catalog) {
    if (!entry.summaryAI) continue;
    if (newOnlyFlag && mappedIds.has(id)) continue;
    items.push({
      id,
      title: entry.title,
      author: entry.author,
      summaryAI: entry.summaryAI,
    });
  }

  return items.slice(0, limitFlag);
}

// --- Remap: process a single section ---
async function processRemapSection(client, systemPrompt, sectionCode, type, catalog) {
  const section = loadSectionOutline(sectionCode);
  if (!section) {
    return { processed: 0, skipped: true };
  }

  const { items, existing } = prepareRemapItems(sectionCode, type, catalog);
  if (items.length === 0) {
    return { processed: 0, skipped: true };
  }

  if (dryRunFlag) {
    console.log(`  Section ${sectionCode} (${type}): would process ${items.length} items`);
    return { processed: items.length, skipped: false };
  }

  const results = await generateRemapMappings(client, systemPrompt, section, items, type);
  if (results.length > 0) {
    writeMappingResults(sectionCode, results, type, existing);
  }

  return { processed: results.length, skipped: false };
}

// --- Discover: process a single item ---
async function processDiscoverItem(client, systemPrompt, item, allSections, type) {
  const candidates = rankSectionsForItem(item, allSections);

  if (candidates.length === 0) {
    console.log(`  ${item.id}: no candidate sections found`);
    return { discovered: 0 };
  }

  if (dryRunFlag) {
    console.log(`  ${item.id}: ${candidates.length} candidate sections (top: ${candidates.slice(0, 5).map((s) => s.sectionCode).join(', ')})`);
    return { discovered: candidates.length };
  }

  const results = await generateDiscoverMappings(client, systemPrompt, item, candidates, type);

  for (const result of results) {
    if (result.sectionCode && result.relevantPathsAI?.length > 0) {
      writeDiscoverResult(result.sectionCode, item, result, type);
    }
  }

  return { discovered: results.length };
}

// --- Assign mode: select articles for a section from candidates + assign paths ---

function buildAssignSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive a section's full outline and a list of candidate items (books or articles) with their summaryAI. Your job is to:
1. DECIDE which candidates genuinely belong in this section (reject those with only tangential overlap)
2. For each confirmed item, assign the specific outline paths it covers (relevantPathsAI)
3. Write a brief rationale (1-2 sentences) explaining the connection

The full Propaedia taxonomy for context:

${taxonomy}

IMPORTANT RULES:
- Only confirm items with genuine, substantive topical overlap — not just tangential mention of a keyword
- Every outline path in the section should ideally have at least one item covering it, so that users clicking any subsection see recommendations. If a candidate is the only item that covers a particular outline path, include it even if the overlap is moderate.
- Use the most specific path that applies (e.g., A.3.b rather than just A), AND also include broader parent paths if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This article covers..." — write direct factual rationales
- It is fine to reject many candidates — quality over quantity
- If no candidates genuinely match, return an empty array

Output format — a JSON array (only include confirmed items):
[{
  "id": "item identifier",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

function rankCandidatesForSection(section, allItems) {
  const scored = allItems
    .filter((item) => item.summaryAI)
    .map((item) => {
      const textParts = [item.summaryAI, item.title];
      if (item.keywords) textParts.push(item.keywords);
      if (item.subject) textParts.push(item.subject);
      const itemTokens = tokenize(textParts.join(' '));
      return { ...item, score: countOverlap(itemTokens, section.tokens) };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, ASSIGN_CANDIDATES);
}

async function generateAssignMappings(client, systemPrompt, section, candidates, type) {
  // Include all outline paths and flag which ones currently have no coverage from OTHER source types
  const outlinePaths = collectAllOutlinePaths(section.sectionCode);

  // Check coverage from the OTHER type (e.g., if assigning wikipedia, check what VSI already covers)
  const otherType = type === 'wiki' ? 'vsi-mappings' : 'wiki-mappings';
  const otherPaths = new Set();
  const otherFile = `src/content/${otherType}/${section.sectionCode}.json`;
  if (fs.existsSync(otherFile)) {
    const otherData = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
    for (const m of otherData.mappings) {
      for (const p of m.relevantPathsAI || []) otherPaths.add(p);
    }
  }

  // Find paths not covered by the other type
  const uncoveredByOther = outlinePaths.filter((op) => {
    for (const ip of otherPaths) {
      if (pathCovers(ip, op.path)) return false;
    }
    return true;
  });

  const coverageNote = uncoveredByOther.length > 0
    ? `\n\nCOVERAGE PRIORITY — The following ${uncoveredByOther.length} outline paths have NO recommendations from other source types. ` +
      `Prioritize including candidates that cover these paths, even if the overlap is moderate, so that every subsection has at least one recommendation:\n` +
      uncoveredByOther.map((u) => `  ${u.path}: ${u.text.substring(0, 80)}`).join('\n')
    : '';

  const userMessage = `Section ${section.sectionCode}: ${section.title}

Outline:
${section.outlineText}${coverageNote}

---

Candidate items to evaluate (${candidates.length} ${type === 'vsi' ? 'VSI books' : 'Wikipedia articles'}):

${formatItemsForPrompt(candidates, type)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for section ${section.sectionCode}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for section ${section.sectionCode}: ${err.message}`);
    return [];
  }
}

function writeAssignResults(sectionCode, results, type) {
  const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
  const filePath = `${dir}/${sectionCode}.json`;

  const mappings = results.map((r) => {
    if (type === 'vsi') {
      // Parse "Title::Author" ID format
      const parts = r.id.split('::');
      return {
        vsiTitle: parts[0],
        vsiAuthor: parts[1] || '',
        relevantPathsAI: r.relevantPathsAI || [],
        rationaleAI: r.rationaleAI || '',
      };
    } else {
      return {
        articleTitle: r.id,
        relevantPathsAI: r.relevantPathsAI || [],
        rationaleAI: r.rationaleAI || '',
      };
    }
  });

  const output = { sectionCode, mappings, _curatedBy: 'ai' };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
}

async function processAssignSection(client, systemPrompt, sectionCode, type, allItems, sectionData) {
  const section = sectionData || loadSectionOutline(sectionCode);
  if (!section) {
    return { confirmed: 0, candidates: 0, skipped: true };
  }
  if (!section.tokens) section.tokens = tokenize(section.fullText);

  const candidates = rankCandidatesForSection(section, allItems);
  if (candidates.length === 0) {
    return { confirmed: 0, candidates: 0, skipped: true };
  }

  if (dryRunFlag) {
    console.log(`  Section ${sectionCode} (${type}): ${candidates.length} candidates (top: ${candidates.slice(0, 5).map((c) => c.title).join(', ')})`);
    return { confirmed: 0, candidates: candidates.length, skipped: false };
  }

  const results = await generateAssignMappings(client, systemPrompt, section, candidates, type);
  if (results.length > 0) {
    writeAssignResults(sectionCode, results, type);
  } else {
    // Write empty mapping file to indicate this section was processed
    writeAssignResults(sectionCode, [], type);
  }

  return { confirmed: results.length, candidates: candidates.length, skipped: false };
}

// --- Coverage analysis ---
function pathCovers(itemPath, outlinePath) {
  return itemPath === outlinePath ||
    outlinePath.startsWith(itemPath + '.') ||
    itemPath.startsWith(outlinePath + '.');
}

function collectAllOutlinePaths(sectionCode) {
  const section = JSON.parse(fs.readFileSync(`src/content/sections/${sectionCode}.json`, 'utf8'));
  const paths = [];
  function collect(items, prefix = []) {
    for (const item of items) {
      const p = [...prefix, item.level].join('.');
      paths.push({ path: p, text: item.text });
      if (item.children?.length > 0) collect(item.children, [...prefix, item.level]);
    }
  }
  collect(section.outline);
  return paths;
}

function getItemPathsForSection(sectionCode) {
  const allPaths = new Set();
  for (const type of ['vsi-mappings', 'wiki-mappings']) {
    const filePath = `src/content/${type}/${sectionCode}.json`;
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const m of data.mappings) {
      for (const p of m.relevantPathsAI || []) allPaths.add(p);
    }
  }
  return allPaths;
}

function findUncoveredPaths(sectionCode) {
  const outlinePaths = collectAllOutlinePaths(sectionCode);
  const itemPaths = getItemPathsForSection(sectionCode);
  const uncovered = [];

  for (const op of outlinePaths) {
    let covered = false;
    for (const ip of itemPaths) {
      if (pathCovers(ip, op.path)) { covered = true; break; }
    }
    if (!covered) uncovered.push(op);
  }

  return { total: outlinePaths.length, uncovered };
}

function runCoverageReport() {
  console.log('=== Outline Path Coverage Report ===\n');
  const codes = getAllSectionCodes();
  let totalPaths = 0;
  let totalUncovered = 0;
  const gaps = [];

  for (const code of codes) {
    const { total, uncovered } = findUncoveredPaths(code);
    totalPaths += total;
    totalUncovered += uncovered.length;

    if (uncovered.length > 0) {
      const section = loadSectionOutline(code);
      gaps.push({ code, title: section?.title || code, total, uncovered: uncovered.length, paths: uncovered });
    }
  }

  console.log(`Total outline paths: ${totalPaths}`);
  console.log(`Covered: ${totalPaths - totalUncovered} (${Math.round((totalPaths - totalUncovered) / totalPaths * 100)}%)`);
  console.log(`Uncovered: ${totalUncovered} (${Math.round(totalUncovered / totalPaths * 100)}%)`);
  console.log(`Sections with gaps: ${gaps.length}/${codes.length}\n`);

  gaps.sort((a, b) => b.uncovered - a.uncovered);

  for (const g of gaps) {
    console.log(`${g.code} — ${g.title} (${g.uncovered}/${g.total} uncovered)`);
    for (const p of g.paths.slice(0, 10)) {
      console.log(`  ${p.path}: ${p.text.substring(0, 70)}`);
    }
    if (g.paths.length > 10) console.log(`  ... and ${g.paths.length - 10} more`);
    console.log('');
  }
}

// --- Validation ---
function runValidation() {
  console.log('=== Validating existing mappings ===\n');
  const sectionCodes = getAllSectionCodes();
  let totalMappings = 0;
  let emptyPaths = 0;
  let emptyRationale = 0;
  let invalidPaths = 0;

  for (const code of sectionCodes) {
    const validPaths = new Set();
    function collectPaths(items, prefix = []) {
      for (const item of items) {
        const p = [...prefix, item.level].join('.');
        validPaths.add(p);
        if (item.children?.length > 0) collectPaths(item.children, [...prefix, item.level]);
      }
    }
    const sectionData = JSON.parse(fs.readFileSync(`src/content/sections/${code}.json`, 'utf8'));
    collectPaths(sectionData.outline);

    for (const type of ['vsi', 'wiki']) {
      const dir = type === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings';
      const filePath = `${dir}/${code}.json`;
      if (!fs.existsSync(filePath)) continue;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const m of data.mappings) {
        totalMappings++;
        if (!m.relevantPathsAI || m.relevantPathsAI.length === 0) emptyPaths++;
        if (!m.rationaleAI || m.rationaleAI.length < 10) emptyRationale++;

        for (const p of m.relevantPathsAI || []) {
          if (!validPaths.has(p)) {
            invalidPaths++;
            if (invalidPaths <= 20) {
              const id = m.vsiTitle || m.articleTitle;
              console.log(`  Invalid path: ${code}/${id} → "${p}"`);
            }
          }
        }
      }
    }
  }

  console.log(`\nTotal mappings: ${totalMappings}`);
  console.log(`Empty relevantPathsAI: ${emptyPaths}`);
  console.log(`Empty/short rationaleAI: ${emptyRationale}`);
  console.log(`Invalid paths (not in outline): ${invalidPaths}`);
}

// --- Main ---
async function main() {
  if (validateFlag) {
    runValidation();
    return;
  }

  if (coverageFlag) {
    runCoverageReport();
    return;
  }

  const taxonomy = loadTaxonomy();
  const client = dryRunFlag ? null : await getAnthropicClient();

  if (modeFlag === 'assign') {
    await runAssignMode(client, taxonomy);
  } else if (modeFlag === 'discover') {
    await runDiscoverMode(client, taxonomy);
  } else {
    await runRemapMode(client, taxonomy);
  }
}

async function runRemapMode(client, taxonomy) {
  const systemPrompt = buildRemapSystemPrompt(taxonomy);

  const vsiCatalog = (typeFlag === 'vsi' || typeFlag === 'both') ? loadVsiCatalog() : null;
  const wikiCatalog = (typeFlag === 'wikipedia' || typeFlag === 'both') ? loadWikiCatalog() : null;

  let sectionCodes = sectionFlag ? [sectionFlag] : getAllSectionCodes().slice(0, limitFlag);

  if (vsiCatalog) {
    const withSummary = [...vsiCatalog.values()].filter((v) => v.summaryAI).length;
    console.log(`VSI catalog: ${withSummary}/${vsiCatalog.size} have summaryAI`);
  }
  if (wikiCatalog) {
    const withSummary = [...wikiCatalog.values()].filter((v) => v.summaryAI).length;
    console.log(`Wikipedia catalog: ${withSummary}/${wikiCatalog.size} have summaryAI`);
  }

  const types = [];
  if (typeFlag === 'vsi' || typeFlag === 'both') types.push('vsi');
  if (typeFlag === 'wikipedia' || typeFlag === 'both') types.push('wiki');

  console.log(`\nMode: remap, Sections: ${sectionCodes.length}, Types: ${types.join(', ')}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  if (emptyOnlyFlag) console.log('Processing only mappings with empty relevantPathsAI');
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  const work = [];
  for (const code of sectionCodes) {
    for (const type of types) {
      const catalog = type === 'vsi' ? vsiCatalog : wikiCatalog;
      if (catalog) work.push({ sectionCode: code, type, catalog });
    }
  }

  let totalProcessed = 0;
  let totalSkipped = 0;

  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const chunk = work.slice(i, i + CONCURRENCY);
    const promises = chunk.map(({ sectionCode, type, catalog }) => {
      console.log(`  Processing ${sectionCode} (${type})...`);
      return processRemapSection(client, systemPrompt, sectionCode, type, catalog);
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.skipped) totalSkipped++;
      else totalProcessed += r.processed;
    }

    const done = Math.min(i + CONCURRENCY, work.length);
    console.log(`  Progress: ${done}/${work.length} tasks (${totalProcessed} items mapped)\n`);
  }

  // Post-run coverage check
  if (!dryRunFlag && totalProcessed > 0) {
    console.log('=== Post-run coverage check ===');
    let gapsBefore = 0;
    let gapsAfter = 0;
    for (const code of sectionCodes) {
      const { uncovered } = findUncoveredPaths(code);
      gapsAfter += uncovered.length;
    }
    console.log(`Remaining uncovered paths in processed sections: ${gapsAfter}`);
  }

  console.log(`Done. Processed ${totalProcessed} mappings, skipped ${totalSkipped} sections.`);
}

async function runDiscoverMode(client, taxonomy) {
  const systemPrompt = buildDiscoverSystemPrompt(taxonomy);
  const type = typeFlag === 'wikipedia' ? 'wiki' : 'vsi';
  const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();

  const withSummary = [...catalog.values()].filter((v) => v.summaryAI).length;
  console.log(`${type} catalog: ${withSummary}/${catalog.size} have summaryAI`);

  console.log('Loading all section outlines for pre-filtering...');
  const allSections = loadAllSectionData();
  console.log(`Loaded ${allSections.length} sections`);

  const items = getDiscoverItems(type, catalog);
  console.log(`\nMode: discover, Items: ${items.length}, Type: ${type}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  console.log(`Pre-filter: top ${DISCOVER_TOP_SECTIONS} sections per item by token overlap`);
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  let totalDiscovered = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const promises = chunk.map((item) => {
      console.log(`  Discovering: ${item.id}...`);
      return processDiscoverItem(client, systemPrompt, item, allSections, type);
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      totalDiscovered += r.discovered;
    }

    const done = Math.min(i + CONCURRENCY, items.length);
    console.log(`  Progress: ${done}/${items.length} items (${totalDiscovered} section mappings discovered)\n`);
  }

  console.log(`Done. Discovered ${totalDiscovered} section mappings for ${items.length} items.`);
}

async function runAssignMode(client, taxonomy) {
  const systemPrompt = buildAssignSystemPrompt(taxonomy);
  const type = typeFlag === 'wikipedia' ? 'wiki' : 'vsi';
  const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();

  const withSummary = [...catalog.values()].filter((v) => v.summaryAI).length;
  console.log(`${type} catalog: ${withSummary}/${catalog.size} have summaryAI`);

  if (withSummary === 0) {
    console.error('No items have summaryAI. Run generate-summary-ai.mjs first.');
    process.exit(1);
  }

  // Pre-compute all items as array with tokens for ranking
  const allItems = [...catalog.entries()].map(([id, entry]) => ({
    id,
    title: entry.title,
    author: entry.author,
    summaryAI: entry.summaryAI,
    keywords: entry.keywords,
    subject: entry.subject,
  }));

  let sectionCodes = sectionFlag ? [sectionFlag] : getAllSectionCodes().slice(0, limitFlag);

  console.log(`\nMode: assign, Sections: ${sectionCodes.length}, Type: ${type}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  console.log(`Candidates per section: up to ${ASSIGN_CANDIDATES} (pre-filtered by token overlap)`);
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  let totalConfirmed = 0;
  let totalCandidates = 0;
  let totalSkipped = 0;

  // Pre-load all section data with tokens
  const sectionDataMap = new Map();
  for (const code of sectionCodes) {
    const s = loadSectionOutline(code);
    if (s) {
      s.tokens = tokenize(s.fullText);
      sectionDataMap.set(code, s);
    }
  }

  for (let i = 0; i < sectionCodes.length; i += CONCURRENCY) {
    const chunk = sectionCodes.slice(i, i + CONCURRENCY);
    const promises = chunk.map((code) => {
      console.log(`  Assigning ${code} (${type})...`);
      return processAssignSection(client, systemPrompt, code, type, allItems, sectionDataMap.get(code));
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.skipped) totalSkipped++;
      else {
        totalConfirmed += r.confirmed;
        totalCandidates += r.candidates;
      }
    }

    const done = Math.min(i + CONCURRENCY, sectionCodes.length);
    console.log(`  Progress: ${done}/${sectionCodes.length} sections (${totalConfirmed} items assigned from ${totalCandidates} candidates)\n`);
  }

  // Post-run coverage check
  if (!dryRunFlag && totalConfirmed > 0) {
    console.log('=== Post-assign coverage check ===');
    let totalPaths = 0;
    let uncoveredPaths = 0;
    for (const code of sectionCodes) {
      const { total, uncovered } = findUncoveredPaths(code);
      totalPaths += total;
      uncoveredPaths += uncovered.length;
    }
    console.log(`Outline paths in processed sections: ${totalPaths}`);
    console.log(`Covered: ${totalPaths - uncoveredPaths} (${Math.round((totalPaths - uncoveredPaths) / totalPaths * 100)}%)`);
    console.log(`Uncovered: ${uncoveredPaths} (${Math.round(uncoveredPaths / totalPaths * 100)}%)`);
  }

  console.log(`\nDone. Assigned ${totalConfirmed} items across ${sectionCodes.length - totalSkipped} sections (${totalCandidates} candidates evaluated).`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
