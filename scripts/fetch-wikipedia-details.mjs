#!/usr/bin/env node
/**
 * Fetches full intro text + table of contents for all Wikipedia vital articles.
 * Rate limited to 1 req/sec to avoid Wikipedia rate limits.
 *
 * Usage: node scripts/fetch-wikipedia-details.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIKI_PATH = resolve(__dirname, '..', 'src/data/wikipedia-vital-articles.json');
const CACHE_PATH = resolve(__dirname, 'wikipedia-details-cache.json');
const API_BASE = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'OxfordPropaediaBot/1.0 (educational project)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanWikitext(wt) {
  return wt
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1') // strip wikilinks, keep display text
    .replace(/\{\{[^}]*\}\}/g, '')                      // strip templates
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')          // strip ref tags with content
    .replace(/<ref[^>]*\/>/g, '')                        // strip self-closing refs
    .replace(/<[^>]+>/g, '')                             // strip HTML
    .replace(/'{2,}/g, '')                               // strip bold/italic
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchArticleDetails(title) {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'sections|wikitext',
    format: 'json',
  });

  const res = await fetch(`${API_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) return null;
  const text = await res.text();
  if (text.startsWith('<') || text.includes('too many requests')) return null;

  const data = JSON.parse(text);
  if (data.error) return null;

  // Extract table of contents
  const toc = (data.parse.sections || [])
    .filter((s) => !['See also', 'References', 'Sources', 'External links', 'Further reading', 'Notes', 'Bibliography', 'Citations'].includes(s.line))
    .map((s) => s.line);

  // Extract intro (everything before first == heading)
  const wikitext = data.parse.wikitext?.['*'] || '';
  const introEnd = wikitext.indexOf('\n==');
  const rawIntro = introEnd > 0 ? wikitext.substring(0, introEnd) : wikitext.substring(0, 3000);
  const intro = cleanWikitext(rawIntro);

  return { intro, toc };
}

async function main() {
  const wiki = JSON.parse(readFileSync(WIKI_PATH, 'utf8'));

  // Collect unique titles
  const allTitles = new Set();
  for (const level of Object.values(wiki.levels)) {
    for (const a of level.articles) allTitles.add(a.title);
  }

  // Load cache
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
  const missing = [...allTitles].filter((t) => !cache[t]);

  console.log(`Total: ${allTitles.size} | Cached: ${Object.keys(cache).length} | To fetch: ${missing.length}`);

  if (missing.length === 0) {
    console.log('All cached. Updating main data file...');
  } else {
    let fetched = 0;
    let failed = 0;

    for (let i = 0; i < missing.length; i++) {
      const details = await fetchArticleDetails(missing[i]);
      if (details) {
        cache[missing[i]] = details;
        fetched++;
      } else {
        failed++;
        await sleep(3000); // Extra backoff on failure
      }

      if (i % 50 === 0) {
        process.stdout.write(`\r  ${i}/${missing.length} (${fetched} ok, ${failed} fail)`);
        writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
      }

      await sleep(1000); // 1 req/sec
    }

    console.log(`\r  Done: ${fetched} fetched, ${failed} failed`);
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
  }

  // Update main data file
  for (const level of Object.values(wiki.levels)) {
    for (const a of level.articles) {
      const details = cache[a.title];
      if (details) {
        a.extract = details.intro;
        a.toc = details.toc;
      }
    }
  }

  writeFileSync(WIKI_PATH, JSON.stringify(wiki, null, 2) + '\n');

  const withIntro = [...allTitles].filter((t) => cache[t]?.intro?.length > 100).length;
  const withToc = [...allTitles].filter((t) => cache[t]?.toc?.length > 0).length;
  console.log(`Updated: ${withIntro} with intros, ${withToc} with TOCs`);
}

main().catch(console.error);
