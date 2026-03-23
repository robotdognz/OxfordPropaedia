#!/usr/bin/env node

/**
 * BBC In Our Time Episode Scraper
 *
 * Scrapes episode data from BBC Radio 4's In Our Time programme.
 * Uses the public BBC Programmes HTML pages and JSON-LD structured data.
 *
 * Usage:
 *   node scripts/scrape-bbc-iot.mjs                    # Scrape all available episodes (listing pages)
 *   node scripts/scrape-bbc-iot.mjs --enrich           # Enrich catalog with per-episode JSON-LD (duration, full description)
 *   node scripts/scrape-bbc-iot.mjs --enrich --limit 5 # Enrich only first N unenriched episodes
 *   node scripts/scrape-bbc-iot.mjs --stats            # Print catalog stats
 *
 * Output: src/data/iot-catalog.json
 *
 * IMPORTANT FOR CLAUDE CODE AGENTS:
 *   - This script uses the public BBC Programmes HTML pages.
 *   - It does NOT require an API key.
 *   - Rate-limit requests: 1 request per second minimum.
 *   - The canonical data source is the JSON-LD on individual episode pages.
 *   - Do not modify the scraping logic without reading and understanding this file first.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// --- Config ---
const BASE_URL = 'https://www.bbc.co.uk/programmes';
const BRAND_PID = 'b006qykl'; // In Our Time
const LISTING_URL = `${BASE_URL}/${BRAND_PID}/episodes/player`;
const CATALOG_PATH = 'src/data/iot-catalog.json';
const USER_AGENT = 'Mozilla/5.0 (compatible; OxfordPropaedia/1.0)';
const DELAY_MS = 1200; // Rate limit: ~1 req/sec
const EPISODES_PER_PAGE = 10;

// --- CLI flags ---
const args = process.argv.slice(2);
const enrichFlag = args.includes('--enrich');
const statsFlag = args.includes('--stats');
const limitIdx = args.indexOf('--limit');
const limitFlag = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// --- HTTP helper ---
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout for ${url}`));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Parsing helpers ---

/**
 * Extract episode PIDs, titles, and synopses from a listing page.
 */
function parseListingPage(html) {
  const pids = [...html.matchAll(/data-pid="([^"]+)"/g)].map((m) => m[1]);
  const titles = [...html.matchAll(/programme__title[^>]*>.*?<span[^>]*>([^<]+)<\/span>/gs)].map((m) =>
    decodeEntities(m[1].trim()),
  );
  const synopses = [...html.matchAll(/programme__synopsis[^>]*>.*?<span[^>]*>([^<]+)<\/span>/gs)].map((m) =>
    decodeEntities(m[1].trim()),
  );

  const episodes = [];
  for (let i = 0; i < pids.length; i++) {
    episodes.push({
      pid: pids[i],
      title: titles[i] || '',
      synopsis: synopses[i] || '',
      url: `${BASE_URL}/${pids[i]}`,
    });
  }
  return episodes;
}

/**
 * Extract JSON-LD structured data from an individual episode page.
 * Returns { datePublished, duration, description, ... }
 */
function parseDurationISO(iso) {
  if (!iso) return null;
  const parts = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!parts) return null;
  return (parseInt(parts[1] || 0) * 3600) + (parseInt(parts[2] || 0) * 60) + parseInt(parts[3] || 0);
}

function parseEpisodePage(html) {
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  for (const block of ldBlocks) {
    try {
      const data = JSON.parse(block[1]);
      if (data['@type'] === 'RadioEpisode') {
        // Duration is in publication.duration (e.g., "PT3058S")
        const durationISO = data.publication?.duration || null;
        const durationSeconds = parseDurationISO(durationISO);

        // Try to get longer description from the page
        const descriptionPatterns = [
          /class="[^"]*programme-page__long-synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/,
          /class="[^"]*long-synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/,
          /data-testid="long-synopsis"[^>]*>([\s\S]*?)<\/div>/,
        ];
        let longDescription = null;
        for (const pattern of descriptionPatterns) {
          const synopsisMatch = html.match(pattern);
          if (!synopsisMatch) continue;
          const text = decodeEntities(synopsisMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
          if (text && (!longDescription || text.length > longDescription.length)) {
            longDescription = text;
          }
        }

        return {
          datePublished: data.datePublished || null,
          description: longDescription || data.description || null,
          durationSeconds,
        };
      }
    } catch {
      // skip non-JSON-LD blocks
    }
  }

  // Fallback: try to extract from meta tags
  const dateMatch = html.match(/release_date_time[^>]*content="([^"]+)"/);
  return {
    datePublished: dateMatch ? dateMatch[1].split('T')[0] : null,
    description: null,
    durationSeconds: null,
  };
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014');
}

// --- Load/save catalog ---
function loadCatalog() {
  if (fs.existsSync(CATALOG_PATH)) {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  }
  return { fetchedAt: null, episodes: [] };
}

function saveCatalog(catalog) {
  catalog.fetchedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
}

// --- Main workflows ---

/**
 * Phase 1: Scrape all listing pages to get PIDs, titles, synopses.
 */
async function scrapeListings() {
  const catalog = loadCatalog();
  const existingPids = new Set(catalog.episodes.map((e) => e.pid));

  console.log(`Existing catalog: ${catalog.episodes.length} episodes`);
  console.log('Scraping listing pages...\n');

  let page = 1;
  let totalNew = 0;
  let consecutiveEmpty = 0;

  while (consecutiveEmpty < 3) {
    const url = `${LISTING_URL}?page=${page}`;
    process.stdout.write(`  Page ${page}... `);

    try {
      const html = await fetchPage(url);
      const episodes = parseListingPage(html);

      if (episodes.length === 0) {
        console.log('empty — stopping');
        consecutiveEmpty++;
        page++;
        await sleep(DELAY_MS);
        continue;
      }

      consecutiveEmpty = 0;
      let newOnPage = 0;

      for (const ep of episodes) {
        if (!existingPids.has(ep.pid)) {
          catalog.episodes.push({
            pid: ep.pid,
            title: ep.title,
            synopsis: ep.synopsis,
            url: ep.url,
            datePublished: null,
            durationSeconds: null,
            _enriched: false,
          });
          existingPids.add(ep.pid);
          newOnPage++;
          totalNew++;
        }
      }

      console.log(`${episodes.length} episodes (${newOnPage} new)`);
    } catch (err) {
      console.log(`error: ${err.message}`);
      consecutiveEmpty++;
    }

    // Save checkpoint every 10 pages
    if (page % 10 === 0) {
      catalog.episodes.sort((a, b) => a.title.localeCompare(b.title));
      saveCatalog(catalog);
      console.log(`  [checkpoint saved: ${catalog.episodes.length} episodes]`);
    }

    page++;
    await sleep(DELAY_MS);
  }

  // Sort by title for consistency
  catalog.episodes.sort((a, b) => a.title.localeCompare(b.title));

  saveCatalog(catalog);
  console.log(`\nDone. Total: ${catalog.episodes.length} episodes (${totalNew} new added)`);
  console.log(`Catalog written to ${CATALOG_PATH}`);
}

/**
 * Phase 2: Enrich each episode with data from its individual page (date, duration).
 */
async function enrichEpisodes() {
  const catalog = loadCatalog();
  const unenriched = catalog.episodes.filter((e) => !e._enriched || !e.durationSeconds || !e.description);

  if (unenriched.length === 0) {
    console.log('All episodes already enriched.');
    return;
  }

  const toProcess = limitFlag ? unenriched.slice(0, limitFlag) : unenriched;
  console.log(`Enriching ${toProcess.length} of ${unenriched.length} unenriched episodes...\n`);

  let enriched = 0;
  for (const ep of toProcess) {
    process.stdout.write(`  ${ep.pid} (${ep.title})... `);

    try {
      const html = await fetchPage(ep.url);
      const data = parseEpisodePage(html);

      ep.datePublished = data.datePublished || ep.datePublished;
      ep.durationSeconds = data.durationSeconds || ep.durationSeconds;
      if (data.description && data.description.length > (ep.synopsis || '').length) {
        ep.description = data.description;
        ep.synopsis = data.description;
      }
      ep._enriched = true;
      enriched++;
      console.log(`OK (${ep.datePublished || '?'}, ${ep.durationSeconds ? Math.round(ep.durationSeconds / 60) + 'min' : '?'})`);
    } catch (err) {
      console.log(`error: ${err.message}`);
    }

    // Save periodically (every 50 episodes)
    if (enriched % 50 === 0 && enriched > 0) {
      saveCatalog(catalog);
      console.log(`  [saved checkpoint at ${enriched}]`);
    }

    await sleep(DELAY_MS);
  }

  saveCatalog(catalog);
  console.log(`\nDone. Enriched ${enriched} episodes.`);
  console.log(`Catalog written to ${CATALOG_PATH}`);
}

/**
 * Print catalog stats.
 */
function printStats() {
  const catalog = loadCatalog();
  const eps = catalog.episodes;
  const enriched = eps.filter((e) => e._enriched).length;
  const withDate = eps.filter((e) => e.datePublished).length;
  const withDuration = eps.filter((e) => e.durationSeconds).length;
  const withDescription = eps.filter((e) => e.description).length;

  console.log('=== In Our Time Catalog Stats ===');
  console.log(`Total episodes: ${eps.length}`);
  console.log(`Enriched: ${enriched}/${eps.length}`);
  console.log(`With date: ${withDate}/${eps.length}`);
  console.log(`With duration: ${withDuration}/${eps.length}`);
  console.log(`With description: ${withDescription}/${eps.length}`);

  if (eps.length > 0) {
    const dates = eps.filter((e) => e.datePublished).map((e) => e.datePublished).sort();
    if (dates.length > 0) {
      console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }
    console.log(`\nSample episodes:`);
    eps.slice(0, 5).forEach((e) => {
      console.log(`  ${e.pid}: ${e.title} (${e.datePublished || 'no date'})`);
    });
  }

  console.log(`\nCatalog last updated: ${catalog.fetchedAt || 'never'}`);
}

// --- Entry point ---
async function main() {
  if (statsFlag) {
    printStats();
  } else if (enrichFlag) {
    await enrichEpisodes();
  } else {
    await scrapeListings();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
