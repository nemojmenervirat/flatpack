// One cut list for the shop out of several pieces plus loose parts you only
// have on paper, nested onto boards so you know how many sheets to buy. The
// same thing the app's Cut plan view shows, from the shell.
//
//   node scripts/cut-plan.mjs <flat> <piece-id> [<piece-id>...] [options]
//
//   --part L x W            a loose part, 1 off (e.g. --part 564x480)
//   --part N x L x W        N of them (e.g. --part 3x546x480)
//   --t <mm>                thickness of the loose parts (default 18)
//   --material <id>         material of the loose parts (default "W960 SM")
//   --board L x W           sheet size (default 2800x2070, the Elgrad board)
//   --kerf <mm>             saw kerf (default 4)
//   --out <dir>             where the CSV and the layout SVGs go (default cut-plan/)
//
// Pieces are taken from the flat's pieces/ folder; they need not be placed
// in scene.json. Prints the table and the board count, writes cut-plan.csv
// (the shop's columns) and one SVG per board. The shop will nest it their
// own way; the SVG is to check it fits.

import fs from 'node:fs';
import path from 'node:path';
import { cutListCsv } from '../src/cutlist.js';
import { parseLoosePart, planRows, planBoards, labelFor, boardLayout } from '../src/cutplan.js';
import { loadApartment } from './lib/apartments.mjs';

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// ---- args
const argv = process.argv.slice(2);
const opts = { parts: [], t: 18, material: 'W960 SM', board: [2800, 2070], kerf: 4, out: 'cut-plan' };
const ids = [];
let flat = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--part') {
    const p = parseLoosePart(next());
    if (!p) die(`bad --part ${argv[i]}: use LxW or NxLxW`);
    opts.parts.push(p);
  } else if (a === '--t') opts.t = Number(next());
  else if (a === '--material') opts.material = next();
  else if (a === '--board') opts.board = next().toLowerCase().split('x').map(Number);
  else if (a === '--kerf') opts.kerf = Number(next());
  else if (a === '--out') opts.out = next();
  else if (a.startsWith('--')) die(`unknown option ${a}`);
  else if (!flat) flat = a;
  else ids.push(a);
}
if (!flat) die('usage: node scripts/cut-plan.mjs <flat> <piece-id>... [--part NxLxW]...');

// ---- rows
const { piecesById } = await loadApartment(flat);
for (const id of ids) if (!piecesById[id]) die(`no piece "${id}" in ${flat}`);
const rows = planRows(ids, piecesById, opts.parts, { material: opts.material, thickness: opts.t });
if (!rows.length) die('nothing to cut');

// ---- table
const pad = (s, n, right) => (right ? String(s).padStart(n) : String(s).padEnd(n));
const cols = [
  ['Piece', 32],
  ['Part', 10],
  ['L', 6, true],
  ['W', 6, true],
  ['T', 4, true],
  ['Qty', 4, true],
  ['Material', 12],
  ['Band', 6],
];
console.log(cols.map(([h, n, r]) => pad(h, n, r)).join('  '));
for (const r of rows) {
  const b = r.banding;
  const band = b.L + b.W ? `${b.L}L ${b.W}W` : '-';
  console.log([r.piece, r.part, r.length, r.width, r.thickness, r.qty, r.material || '', band].map((v, i) => pad(v, cols[i][1], cols[i][2])).join('  '));
}

// ---- nesting per material + thickness
const [BL, BW] = opts.board;
const groups = planBoards(rows, { length: BL, width: BW, kerf: opts.kerf });
console.log('');
for (const g of groups) {
  console.log(`${g.key}: ${g.count} parts, ${g.net.toFixed(2)} m² net -> ${g.nest.count} board${g.nest.count === 1 ? '' : 's'} ${BL} x ${BW}` + (g.nest.tooBig.length ? `, ${g.nest.tooBig.length} too big for the board!` : ''));
  for (const [i, b] of g.nest.boards.entries()) {
    const used = b.strips.reduce((a, s) => a + s.width * s.used, 0) / 1e6;
    console.log(`  board ${i + 1}: ${b.strips.length} strips, ${b.widthUsed} of ${BW} across, ${used.toFixed(2)} m² in parts`);
  }
}

// ---- files
fs.mkdirSync(opts.out, { recursive: true });
const csvPath = path.join(opts.out, 'cut-plan.csv');
fs.writeFileSync(csvPath, cutListCsv(rows) + '\n');
console.log(`\nwrote ${csvPath}`);

const safe = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
for (const g of groups) {
  g.nest.boards.forEach((b, bi) => {
    const S = 0.25;
    const w = BL * S;
    const h = BW * S;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 20}" height="${h + 40}" font-family="sans-serif" font-size="9">`];
    out.push(`<text x="10" y="14" font-size="12">${g.key}, board ${bi + 1} of ${g.nest.boards.length}: ${BL} x ${BW}, strips along the length, kerf ${opts.kerf}</text>`);
    out.push(`<g transform="translate(10,24)"><rect width="${w}" height="${h}" fill="#f4efe6" stroke="#333"/>`);
    for (const r of boardLayout(b, opts.kerf)) {
      out.push(`<rect x="${r.x * S}" y="${r.y * S}" width="${r.w * S}" height="${r.h * S}" fill="#dcd3bf" stroke="#555"/>`);
      out.push(`<text x="${(r.x + r.w / 2) * S}" y="${(r.y + r.h / 2) * S - 2}" text-anchor="middle">${labelFor(g.rows, r.w, r.h)}</text>`);
      out.push(`<text x="${(r.x + r.w / 2) * S}" y="${(r.y + r.h / 2) * S + 9}" text-anchor="middle">${r.w} x ${r.h}</text>`);
    }
    out.push('</g></svg>');
    const file = path.join(opts.out, `board-${safe(g.key)}-${bi + 1}.svg`);
    fs.writeFileSync(file, out.join('\n') + '\n');
    console.log(`wrote ${file}`);
  });
}
