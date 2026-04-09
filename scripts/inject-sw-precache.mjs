#!/usr/bin/env node
/**
 * Post-build: injects division page URLs into the service worker's pre-cache list.
 * Run after `astro build` completes.
 */
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const SW_PATH = path.join(DIST, 'sw.js');
const BASE = '/NeoPropaedia/';

// Find all division pages
const divDir = path.join(DIST, 'division');
const divisionUrls = [];
if (fs.existsSync(divDir)) {
  for (const entry of fs.readdirSync(divDir)) {
    const indexPath = path.join(divDir, entry, 'index.html');
    if (fs.existsSync(indexPath)) {
      divisionUrls.push(BASE + 'division/' + entry + '/');
    }
  }
}

// Inject into sw.js
let sw = fs.readFileSync(SW_PATH, 'utf8');
sw = sw.replace('/*INJECT_DIVISION_URLS*/[]', JSON.stringify(divisionUrls));
fs.writeFileSync(SW_PATH, sw);

console.log(`Injected ${divisionUrls.length} division URLs into sw.js`);
console.log(`Total pre-cache: ${14 + divisionUrls.length} URLs (home + library + about + offline + 10 parts + ${divisionUrls.length} divisions)`);
