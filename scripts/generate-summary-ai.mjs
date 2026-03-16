#!/usr/bin/env node
/**
 * Generates summaryAI fields for VSI and Wikipedia catalog entries.
 *
 * Usage:
 *   node scripts/generate-summary-ai.mjs --type vsi       # Process VSI catalog
 *   node scripts/generate-summary-ai.mjs --type wikipedia # Process Wikipedia catalog
 *   node scripts/generate-summary-ai.mjs --type vsi --limit 10  # Test with 10 entries
 *   node scripts/generate-summary-ai.mjs --type vsi --force     # Regenerate all (even existing)
 *   node scripts/generate-summary-ai.mjs --validate              # Validate existing summaries
 *
 * Requires:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY environment variable
 *
 * Note: This script is also used as a reference by Claude Code subagents, which
 * replicate the prompts and logic inline (reading batch files from /tmp) rather
 * than calling the Anthropic API directly. The system prompt, guidelines, and
 * validation rules here are the canonical source of truth for those agents.
 */

import fs from 'fs';

async function getAnthropicClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

// --- Configuration ---
const BATCH_SIZE = 20;
const MODEL = 'claude-sonnet-4-6';
const MIN_SUMMARY_WORDS = 60;
const MAX_SUMMARY_WORDS = 100;
const CONCURRENCY = 3; // parallel batch requests

// --- CLI args ---
const args = process.argv.slice(2);
const typeFlag = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const limitFlag = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const forceFlag = args.includes('--force');
const validateFlag = args.includes('--validate');

if (!validateFlag && (!typeFlag || !['vsi', 'wikipedia'].includes(typeFlag))) {
  console.error('Usage: node scripts/generate-summary-ai.mjs --type vsi|wikipedia [--limit N] [--force]');
  console.error('       node scripts/generate-summary-ai.mjs --validate');
  process.exit(1);
}

// --- Wiki markup cleanup ---
function cleanWikiMarkup(text) {
  if (!text) return '';
  let cleaned = text;

  // Remove ref tags and their content first (can contain templates)
  cleaned = cleaned.replace(/<ref[^>]*\/>/g, '');
  cleaned = cleaned.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Remove image/thumb markup: [[File:...|...]] or [[Image:...]]
  cleaned = cleaned.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');

  // Remove nested templates {{ ... }} — repeat until stable
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, '');
  } while (cleaned !== prev);

  // Remove any remaining }} or {{ fragments
  cleaned = cleaned.replace(/\}\}/g, '').replace(/\{\{/g, '');

  // Remove wiki link markup but keep display text: [[target|display]] → display
  cleaned = cleaned.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');

  // Remove table/infobox row markup (lines starting with | or !)
  cleaned = cleaned.replace(/^[|!].*$/gm, '');

  // Remove wiki list markup (* and #) at line starts
  cleaned = cleaned.replace(/^\*+\s*/gm, '');
  cleaned = cleaned.replace(/^#+\s*/gm, '');

  // Remove dangling pipe-separated fragments (e.g., " | 4.3% Islam")
  cleaned = cleaned.replace(/^\s*\|\s*.*$/gm, '');

  // Remove lines that are just punctuation/whitespace artifacts
  cleaned = cleaned.replace(/^\s*[;:]+\s*$/gm, '');

  // Collapse multiple blank lines and spaces
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/ {2,}/g, ' ');

  return cleaned.trim();
}

// --- Load Propaedia taxonomy ---
function buildTaxonomyText() {
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

const TAXONOMY = buildTaxonomyText();

// --- System prompt ---
const SYSTEM_PROMPT = `You produce summaryAI fields for an AI knowledge-mapping pipeline.

These summaries serve as a normalization layer: regardless of source type (books, encyclopedia articles, course syllabi, etc.), the summaryAI is the canonical, self-contained content signal that downstream mapping agents consume. This ensures consistent mapping quality across all source types.

A mapping agent will use each summaryAI to:
  (a) decide which Propaedia sections the item maps to
  (b) identify which specific outline paths within those sections it covers
  (c) write a rationale explaining the connection

The full Propaedia taxonomy is provided below for reference. Use it to understand what distinctions and terminology matter — but do NOT cite specific section numbers in the summaries.

${TAXONOMY}

Guidelines:
- ${MIN_SUMMARY_WORDS}-${MAX_SUMMARY_WORDS} words per summary. Dense factual signal, not prose for humans.
- SCOPE: state time periods, geographic regions, disciplines, and sub-topics covered
- BREADTH: list all distinct topics and sub-topics touched, not just the main theme
- DISTINCTIONS: what makes this item different from adjacent or overlapping topics
- CONNECTIONS: how concepts relate across knowledge domains (without citing section numbers)
- SELF-CONTAINED: include all mapping-relevant information — do not assume the reader has access to the item's title, keywords, or other metadata
- Ignore source framing language ("This book explores...", "A Very Short Introduction to...")
- Plain text only, no markdown
- Output as a JSON array of objects: [{"id": "...", "summaryAI": "..."}]`;

// --- Entry preparation ---
function prepareVsiEntries() {
  const catalog = JSON.parse(fs.readFileSync('src/content/vsi/catalog.json', 'utf8'));
  return catalog.titles.map((t) => ({
    id: `${t.title}::${t.author}`,
    title: t.title,
    author: t.author,
    source: t.abstract || '',
    keywords: (t.keywords || []).join(', '),
    subject: t.subject || '',
    existing: t.summaryAI,
  }));
}

function prepareWikiEntries() {
  const catalog = JSON.parse(fs.readFileSync('src/data/wikipedia-catalog.json', 'utf8'));
  return catalog.articles.map((a) => ({
    id: a.title,
    title: a.title,
    source: cleanWikiMarkup(a.extract || '').substring(0, 4000),
    toc: (a.toc || []).join(', '),
    category: a.category || '',
    wikiCategories: (a.wikiCategories || []).slice(0, 15).join(', '),
    existing: a.summaryAI,
  }));
}

function formatEntryForPrompt(entry, type) {
  if (type === 'vsi') {
    return [
      `ID: ${entry.id}`,
      `Title: ${entry.title}`,
      `Author: ${entry.author}`,
      entry.subject ? `Subject: ${entry.subject}` : null,
      entry.keywords ? `Keywords: ${entry.keywords}` : null,
      `Abstract: ${entry.source}`,
    ].filter(Boolean).join('\n');
  } else {
    return [
      `ID: ${entry.id}`,
      `Title: ${entry.title}`,
      entry.category ? `Category: ${entry.category}` : null,
      entry.wikiCategories ? `Wiki categories: ${entry.wikiCategories}` : null,
      entry.toc ? `Table of contents: ${entry.toc}` : null,
      `Extract: ${entry.source}`,
    ].filter(Boolean).join('\n');
  }
}

// --- API call ---
async function generateBatch(client, entries, type) {
  const userMessage = entries
    .map((e) => formatEntryForPrompt(e, type))
    .join('\n\n---\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to parse JSON from response:', text.substring(0, 200));
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse error:', err.message);
    return [];
  }
}

// --- Write results ---
function writeVsiResults(summaries) {
  const catalog = JSON.parse(fs.readFileSync('src/content/vsi/catalog.json', 'utf8'));
  const lookup = new Map(summaries.map((s) => [s.id, s.summaryAI]));
  let updated = 0;

  for (const title of catalog.titles) {
    const key = `${title.title}::${title.author}`;
    if (lookup.has(key)) {
      title.summaryAI = lookup.get(key);
      title._summaryGeneratedAt = new Date().toISOString().split('T')[0];
      updated++;
    }
  }

  fs.writeFileSync('src/content/vsi/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  return updated;
}

function writeWikiResults(summaries) {
  const catalog = JSON.parse(fs.readFileSync('src/data/wikipedia-catalog.json', 'utf8'));
  const lookup = new Map(summaries.map((s) => [s.id, s.summaryAI]));
  let updated = 0;

  for (const article of catalog.articles) {
    if (lookup.has(article.title)) {
      article.summaryAI = lookup.get(article.title);
      article._summaryGeneratedAt = new Date().toISOString().split('T')[0];
      updated++;
    }
  }

  fs.writeFileSync('src/data/wikipedia-catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  return updated;
}

// --- Validation ---
const SECTION_REF_RE = /\b(?:Section|Part|Division)\s+\d/i;
const FRAMING_RE = /\b(?:This book|This article|A Very Short Introduction|This VSI)\b/i;

function validateSummary(id, summary) {
  const issues = [];
  if (!summary || typeof summary !== 'string') {
    issues.push('EMPTY: no summary text');
    return issues;
  }

  const words = summary.split(/\s+/).length;
  if (words < MIN_SUMMARY_WORDS) issues.push(`SHORT: ${words} words (min ${MIN_SUMMARY_WORDS})`);
  if (words > MAX_SUMMARY_WORDS + 10) issues.push(`LONG: ${words} words (max ${MAX_SUMMARY_WORDS})`);
  if (SECTION_REF_RE.test(summary)) issues.push('SECTION_REF: contains section/part/division number');
  if (FRAMING_RE.test(summary)) issues.push('FRAMING: contains framing language');
  if (summary.includes('#') || summary.includes('**') || summary.includes('- ')) {
    issues.push('MARKDOWN: contains markdown formatting');
  }

  return issues;
}

function runValidation() {
  console.log('=== Validating existing summaryAI fields ===\n');

  let totalChecked = 0;
  let totalIssues = 0;

  // VSI
  const vsiCatalog = JSON.parse(fs.readFileSync('src/content/vsi/catalog.json', 'utf8'));
  const vsiWithSummary = vsiCatalog.titles.filter((t) => t.summaryAI);
  console.log(`VSI: ${vsiWithSummary.length}/${vsiCatalog.titles.length} have summaryAI`);

  for (const t of vsiWithSummary) {
    totalChecked++;
    const issues = validateSummary(`${t.title}::${t.author}`, t.summaryAI);
    if (issues.length > 0) {
      totalIssues++;
      console.log(`  ${t.title}: ${issues.join(', ')}`);
    }
  }

  // Wikipedia
  const wikiCatalog = JSON.parse(fs.readFileSync('src/data/wikipedia-catalog.json', 'utf8'));
  const wikiWithSummary = wikiCatalog.articles.filter((a) => a.summaryAI);
  console.log(`Wikipedia: ${wikiWithSummary.length}/${wikiCatalog.articles.length} have summaryAI`);

  for (const a of wikiWithSummary) {
    totalChecked++;
    const issues = validateSummary(a.title, a.summaryAI);
    if (issues.length > 0) {
      totalIssues++;
      console.log(`  ${a.title}: ${issues.join(', ')}`);
    }
  }

  console.log(`\nChecked: ${totalChecked}, Issues: ${totalIssues}`);
  if (totalIssues === 0 && totalChecked > 0) console.log('All summaries passed validation.');
}

// --- Main ---
async function main() {
  if (validateFlag) {
    runValidation();
    return;
  }

  const client = await getAnthropicClient();

  console.log(`Generating summaryAI for ${typeFlag} entries...`);
  console.log(`Model: ${MODEL}, Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}`);

  const allEntries = typeFlag === 'vsi' ? prepareVsiEntries() : prepareWikiEntries();
  const entries = forceFlag
    ? allEntries.slice(0, limitFlag)
    : allEntries.filter((e) => !e.existing).slice(0, limitFlag);

  console.log(`Entries to process: ${entries.length} (${allEntries.length} total, ${allEntries.length - entries.length} already have summaryAI)`);

  if (entries.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Split into batches
  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(entries.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches...`);

  const allSummaries = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const promises = chunk.map((batch, j) => {
      const batchNum = i + j + 1;
      console.log(`  Batch ${batchNum}/${batches.length} (${batch.length} entries)...`);
      return generateBatch(client, batch, typeFlag);
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      allSummaries.push(...result);
    }

    // Save incrementally after each chunk
    const writer = typeFlag === 'vsi' ? writeVsiResults : writeWikiResults;
    const updated = writer(allSummaries);
    console.log(`  Saved ${updated} summaries so far.`);
  }

  // Post-generation validation
  console.log('\n=== Post-generation validation ===');
  let issues = 0;
  for (const s of allSummaries) {
    const problems = validateSummary(s.id, s.summaryAI);
    if (problems.length > 0) {
      issues++;
      console.log(`  ${s.id}: ${problems.join(', ')}`);
    }
  }
  if (issues === 0) {
    console.log(`All ${allSummaries.length} summaries passed validation.`);
  } else {
    console.log(`${issues}/${allSummaries.length} summaries have issues.`);
  }

  console.log(`\nDone. Generated ${allSummaries.length} summaries.`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
