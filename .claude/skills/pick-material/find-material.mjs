#!/usr/bin/env node
// Search src/data/materials.json (the Elgrad board registry).
// Usage:
//   node .claude/skills/pick-material/find-material.mjs [terms...] [options]
// Options:
//   --section <s>     iverica | iveral | gloss | worktop (repeatable)
//   --brand <b>       filter by brand (substring, e.g. egger, kronospan, cleaf)
//   --thickness <mm>  only materials with a panel of this thickness (e.g. 18)
//   --max <price>     max panel price in KM/m² (worktops: KM/m¹)
//   --color <#hex>    sort by closeness to this colour instead of by relevance
//   --limit <n>       max rows (default 15)
//   --json            raw JSON output instead of the table
// Terms are matched (diacritic/case-insensitive) against id, code, name, brand, texture.
// No terms + no filters lists sections summary.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const db = JSON.parse(readFileSync(join(root, 'src/data/materials.json'), 'utf8'));

const args = process.argv.slice(2);
const opt = { section: [], limit: 15 };
const terms = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--section') opt.section.push(args[++i].toLowerCase());
  else if (a === '--brand') opt.brand = args[++i].toLowerCase();
  else if (a === '--thickness') opt.thickness = args[++i];
  else if (a === '--max') opt.max = parseFloat(args[++i]);
  else if (a === '--color') opt.color = args[++i];
  else if (a === '--limit') opt.limit = parseInt(args[++i], 10);
  else if (a === '--json') opt.json = true;
  else terms.push(a);
}

const fold = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const hex2rgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const all = Object.values(db.materials);

if (!terms.length && !opt.section.length && !opt.brand && !opt.thickness && opt.max == null && !opt.color) {
  const bySec = {};
  for (const m of all) (bySec[m.section] ??= []).push(m);
  console.log(`materials.json — ${all.length} materials (source: ${db.source}, prices in ${db.currency})`);
  for (const [sec, list] of Object.entries(bySec)) {
    const prices = list.flatMap((m) => Object.values(m.panel || {}));
    const rng = prices.length ? ` panel ${Math.min(...prices)}–${Math.max(...prices)}` : '';
    console.log(`  ${sec.padEnd(8)} ${String(list.length).padStart(3)} materials${rng}`);
  }
  console.log('\nPass search terms and/or filters — see the usage comment at the top of this script.');
  process.exit(0);
}

const want = hex2rgb(opt.color);
if (opt.color && !want) {
  console.error(`bad --color value: ${opt.color} (expected #rrggbb)`);
  process.exit(1);
}

const foldedTerms = terms.map(fold);
let rows = all
  .map((m) => {
    const hay = fold([m.id, m.code, m.name, m.brand, m.texture].filter(Boolean).join(' '));
    let score = 0;
    for (const t of foldedTerms) {
      if (!hay.includes(t)) return null;
      // exact code / word matches rank higher than substring hits
      if (fold(m.code) === t) score += 3;
      else if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) score += 2;
      else score += 1;
    }
    return { m, score };
  })
  .filter(Boolean);

if (opt.section.length)
  rows = rows.filter(
    ({ m }) => opt.section.includes(m.section) || (opt.section.includes('worktop') && m.worktop)
  );
if (opt.brand) rows = rows.filter(({ m }) => fold(m.brand).includes(fold(opt.brand)));
if (opt.thickness) rows = rows.filter(({ m }) => m.panel && opt.thickness in m.panel);
if (opt.max != null)
  rows = rows.filter(({ m }) => {
    const prices = [...Object.values(m.panel || {}), ...Object.values(m.worktop || {})];
    return prices.length && Math.min(...prices) <= opt.max;
  });
if (want)
  rows = rows.filter(({ m }) => hex2rgb(m.color)).map((r) => ({ ...r, d: dist(want, hex2rgb(r.m.color)) }));

rows.sort((a, b) => (want ? a.d - b.d : b.score - a.score) || cheapest(a.m) - cheapest(b.m));
function cheapest(m) {
  const p = [...Object.values(m.panel || {}), ...Object.values(m.worktop || {})];
  return p.length ? Math.min(...p) : Infinity;
}

const out = rows.slice(0, opt.limit);
if (opt.json) {
  console.log(JSON.stringify(out.map((r) => r.m), null, 2));
  process.exit(0);
}

if (!out.length) {
  console.log('No matches. Try fewer terms, or drop a filter.');
  process.exit(0);
}

console.log(`${rows.length} match(es), showing ${out.length} (prices in ${db.currency}):\n`);
for (const { m, d } of out) {
  const panel = m.panel
    ? Object.entries(m.panel).map(([t, p]) => `${t}mm ${p}/m²`).join(', ')
    : '';
  const worktop = m.worktop
    ? 'worktop ' + Object.entries(m.worktop).map(([t, p]) => `${t}mm ${p}/m¹`).join(', ')
    : '';
  const bits = [
    m.section,
    m.brand,
    [panel, worktop].filter(Boolean).join('; '),
    m.color,
    d != null ? `Δ${d.toFixed(0)}` : '',
    m.format,
  ].filter(Boolean);
  console.log(`  "${m.id}"`);
  console.log(`      ${bits.join(' · ')}`);
}
console.log('\nUse the quoted id verbatim as "material" in piece/part JSON.');
