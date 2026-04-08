#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/content/vsi/catalog.json');
const OUTPUT_PATH = resolve(ROOT, 'src/data/vsi-checklist-lookup.json');

function normalizeStableKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));

const lookup = {
  generatedAt: new Date().toISOString(),
  entries: catalog.titles.map((entry) => ({
    id: entry.id,
    titleSlug: normalizeStableKeyPart(entry.title),
    authorSlug: normalizeStableKeyPart(entry.author),
    printIsbn: entry.printIsbn || null,
  })),
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(lookup, null, 2)}\n`);
console.log(`Wrote ${lookup.entries.length} VSI checklist lookup entries to ${OUTPUT_PATH}`);
