// Generates the jar racks for the garage shelf into
// src/data/apartments/gallery/pieces/: two slide-in modules (a wide one for
// the 150-high jars, a narrow one for the 85-high ones), a mock of the
// garage shelf they slide into, and the jars and bottles themselves so the
// capacity can be seen. The JSON stays the source of truth for the app;
// change a parameter here and re-run `node scripts/gen-jar-rack.mjs`.
//
// The garage shelf has a slot about 1050 wide x 750 deep, 350 high at the
// entrance (a front rail), about 400 further in. Both modules are 730 deep,
// stand straight on the shelf deck (the deck is the first floor: no bottom
// board, it would cost 18 mm of height), have no top (the modules stay low,
// the top tier's jars go in one by one once the module is in, still under
// the 350 entrance) and a 3 mm HDF back stapled over the rear edges. The
// extra 50 mm further in is useless: a fourth tier of small jars would need
// 434. A shelf is 727 deep = 8 jars of 90 (720).
//
// Tall module, 411 wide, 4 jars across (360 + 15 play), 2 tiers, 64 jars:
// stacked columns. Each side is one 18 mm piece per tier, all in one plane,
// with the full-width shelf between them - tier-1 side on the deck, shelf
// laid on its top edge so the side carries it along the whole length, and a
// 50 mm lip strip standing on the shelf. The load goes down through the
// boards. The shelf is tied to the sides under it by four 20x20x40 angle
// brackets of 2 mm sheet in the top corners of the tier below, in the
// headroom over the jars; the lip strips are screwed down through their 50
// into the shelf. Built top-down, upside down on the bench, because the
// brackets are only reachable while the tier under the shelf is still open.
//
// Small module, 231 wide, 2 jars across (180 + 15 play), 3 tiers, 48 jars:
// a plain carcass. Two full-height sides in one piece (rising the same 50
// lip over the top shelf), fixed shelves between them on three confirmats
// per edge through the sides. Narrow enough that nothing more is needed.
//
// Bottles stand straight on the deck in the ~380 left over at the right:
// 4 x 8 litre bottles.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- parameters (mm)
const D = 730; // module depth, HDF back included (slot ~750)
const T = 18; // board
const HDF = 3; // back
const JAR_D = 90; // jar diameter, both kinds
const JAR_TALL = 150;
const JAR_SMALL = 85;
const PLAY_W = 15; // width play in a bay beside the jars: ~7 per side, so a row can be spread to grip a jar
const PLAY_TALL = 8; // headroom over a jar under the shelf above
const PLAY_SMALL = 10;
const ACROSS_TALL = 4; // jars across in the tall module
const ACROSS_SMALL = 2; // and in the small one
const LIP = 50; // how far the sides rise over the top shelf, so the top jars cannot slide off
const BRACKET = 20; // 20x20x40 angle bracket legs (tall module)
const BRACKET_L = 40;
const BRACKET_T = 2; // its sheet: fits in the headroom over the jars and the 4.5 mm between jar and side
const MAT = 'W960 SM'; // classic white, the cheapest 18 mm board in the list
const SLOT_W = 1050; // garage shelf slot
const SLOT_D = 750;
const SLOT_ENTRY_H = 350; // under the front rail
const SLOT_H = 400; // behind it
const BOTTLE_D = 85; // 1 l bottle
const BOTTLE_H = 320;
const BOTTLES_ACROSS = 4;

// ---- derived
const boardD = D - HDF;
const deep = Math.floor(boardD / JAR_D);
const widthFor = (across) => across * JAR_D + PLAY_W + 2 * T;

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'apartments', 'gallery', 'pieces');
const write = (piece) => {
  fs.writeFileSync(path.join(outDir, `${piece.id}.json`), JSON.stringify(piece, null, 2) + '\n');
  console.log(`wrote ${piece.id}.json (${piece.parts.length} parts)`);
};

// Shared helpers over a parts array.
function tools(parts) {
  const B = (n, pos, size) => parts.push({ name: n, pos, size, material: MAT });
  const HW = (n, pos, size, color = '#4a4e55') => parts.push({ name: n, pos, size, color, metal: true, hardware: true });
  const staple = (pos) => HW('staple', pos, [2, 20, 2], '#9aa0a8');
  const stapleY = boardD + HDF - 20;
  // staples through the HDF into both sides' rear edges between z and z+h, every 60
  const sideStaples = (W, z, h) => {
    const at = [];
    for (let s = z + 30; s <= z + h - 25; s += 60) at.push(s);
    if (!at.length) at.push(z + h / 2);
    for (const s of at) for (const x of [T / 2, W - T / 2]) staple([x - 1, stapleY, s - 1]);
  };
  const shelfStaples = (W, sz) => {
    for (let x = T + 45; x < W - T; x += 90) staple([x - 1, stapleY, sz + T / 2 - 1]);
  };
  return { B, HW, sideStaples, shelfStaples };
}

// Tall module: stacked columns, brackets under the shelf, lips screwed down.
function rackStacked(id, name, jar, tiers, across) {
  const W = widthFor(across);
  const inner = W - 2 * T;
  const parts = [];
  const { B, HW, sideStaples, shelfStaples } = tools(parts);
  const lipScrew = (pos) => HW('wood screw 5x70', pos, [5, 5, 70]); // down through the lip into the shelf, head flush on top
  // a thin L hanging in the top corner of the tier under a shelf (z = shelf bottom): upright leg on the side, flat leg under the shelf
  const bracket = (left, y, z) => {
    HW('angle bracket', [left ? T : W - T - BRACKET_T, y, z - BRACKET], [BRACKET_T, BRACKET_L, BRACKET], '#9aa0a8');
    HW('angle bracket leg', [left ? T + BRACKET_T : W - T - BRACKET, y, z - BRACKET_T], [BRACKET - BRACKET_T, BRACKET_L, BRACKET_T], '#9aa0a8');
  };
  const sideX = [0, W - T];

  const n = tiers.length;
  const shelfZ = [];
  const pieceZ = []; // z of each tier's side pieces / the lips
  let z = 0;
  for (let i = 0; i < n; i++) {
    const top = i === n - 1;
    const h = top ? LIP : tiers[i];
    pieceZ.push(z);
    for (const x of sideX) B(top ? 'lip' : 'side', [x, 0, z], [T, boardD, h]);
    sideStaples(W, z, h);
    if (top) {
      for (const x of sideX) for (const y of [100, boardD / 2, boardD - 100]) lipScrew([x + T / 2 - 2.5, y - 2.5, z + LIP - 70]);
      z += h;
      break;
    }
    z += h;
    B('shelf', [0, 0, z], [W, boardD, T]);
    shelfZ.push(z);
    for (const left of [true, false]) for (const y of [0, boardD - BRACKET_L]) bracket(left, y, z);
    shelfStaples(W, z);
    z += T;
  }
  const H = z;
  const topJar = shelfZ[shelfZ.length - 1] + T + jar;
  parts.push({ name: 'back HDF', pos: [0, boardD, 0], size: [W, HDF, H], color: '#ffffff' });

  // Assembly runs top-down, upside down on the bench: the brackets under a
  // shelf are only reachable while the tier under it is still open.
  const assembly = [];
  const S = (title, sel, note, extra = {}) => assembly.push({ title, parts: sel, note, ...extra });
  S('Top shelf', [{ name: 'shelf', z: shelfZ[n - 2] }], `Start at the top, right side up on the bench: the top shelf ${W} x ${boardD}.`, { view: 'above' });
  S(
    'Lips',
    [{ name: 'lip', z: pieceZ[n - 1] }, { name: 'wood screw 5x70', z: pieceZ[n - 1] + LIP - 70 }],
    `Two ${LIP} mm strips along its outer edges, flush, so the top jars cannot slide off: three 5x70 wood screws down through each strip into the shelf (pre-drill the strip's full height), heads flush. Then turn the shelf over, lips down on the bench: the rest is built upside down.`,
    { view: 'above' },
  );
  for (let i = n - 2; i >= 0; i--) {
    const sz = shelfZ[i];
    if (i < n - 2) S(`Shelf ${i + 1}`, [{ name: 'shelf', z: sz }], `Lay shelf ${i + 1} on the free ends of those sides (upside down, so it goes on top). No joint here: in the finished rack these sides stand on it, and the shelf above is bracketed to them.`, { view: 'above' });
    S(
      `Tier ${i + 1}: sides`,
      [{ name: 'side', z: pieceZ[i] }, { name: 'angle bracket', z: sz - BRACKET }, { name: 'angle bracket leg', z: sz - BRACKET_T }],
      `Stand the two sides of tier ${i + 1} (${tiers[i]} high) on the underside of shelf ${i + 1}, flush with its outer edges and front. Four angle brackets in the corners between shelf and side, front and back: two 3.5x16 screws into the shelf, two into the side, all in reach because the tier is still open. Finished, the shelf rests on these sides along their whole length; the 2 mm sheet sits in the ${tiers[i] - jar} mm over the jars.`,
      { view: 'above' },
    );
  }
  S('Back', ['back HDF'], 'Square the stack (still upside down) and staple the 3 mm HDF back over every rear edge: side pieces, shelves and lips. Then turn the module over onto the sides of tier 1 and slide it in.', { view: 'back' });

  return {
    id,
    name,
    comment:
      `Slide-in jar rack for the garage shelf: ${W} x ${D} x ${H}, for the ${jar}-high jars (Ø${JAR_D}). Stacked columns: ` +
      `each side is one 18 mm piece per tier (${tiers.slice(0, -1).join(', ')} high, then a ${LIP} lip strip) stacked in one plane with the full-width shelves ${W} x ${boardD} between them (bottom faces at ${shelfZ.join(', ')}), each shelf resting on the side pieces below along its whole length. ` +
      `Each shelf is tied to the side pieces under it by four 20x20x40 angle brackets (2 mm sheet, four 3.5x16 screws) in the top corners of the tier below, front and back, in the headroom over the jars; the lip strips are screwed down into the top shelf with three 5x70 wood screws each. ` +
      `The load goes down through the boards; the brackets and screws only hold position. Built top-down, upside down on the bench. No bottom (the deck is the first floor), no top, 3 mm HDF back stapled over every rear edge. ` +
      `Tiers of ${tiers.join(' / ')} clear; the top tier's jars reach ${topJar} (entrance 350). ` +
      `${across} jars across x ${deep} deep = ${across * deep} per tier, ${across * deep * n} in the module. ` +
      `Generated by scripts/gen-jar-rack.mjs.`,
    buildable: true,
    color: '#ffffff',
    clearance: { front: 600 },
    assembly,
    parts,
    W,
    inner,
  };
}

// Small module: plain carcass, full-height sides, shelves on confirmats.
function rackPlain(id, name, jar, tiers, across) {
  const W = widthFor(across);
  const inner = W - 2 * T;
  const parts = [];
  const { B, HW, sideStaples, shelfStaples } = tools(parts);
  const confirmat = (pos) => HW('confirmat screw', pos, [50, 7, 7]); // through the side into the shelf edge, cap flush outside

  const shelfZ = [];
  let z = 0;
  for (let i = 0; i < tiers.length - 1; i++) {
    z += tiers[i];
    shelfZ.push(z);
    z += T;
  }
  const H = z + LIP;
  const topJar = z + jar;

  B('side', [0, 0, 0], [T, boardD, H]);
  B('side', [W - T, 0, 0], [T, boardD, H]);
  sideStaples(W, 0, H);
  for (const sz of shelfZ) {
    B('shelf', [T, 0, sz], [inner, boardD, T]);
    for (const y of [60, boardD / 2, boardD - 60]) {
      confirmat([0, y - 3.5, sz + T / 2 - 3.5]);
      confirmat([W - 50, y - 3.5, sz + T / 2 - 3.5]);
    }
    shelfStaples(W, sz);
  }
  parts.push({ name: 'back HDF', pos: [0, boardD, 0], size: [W, HDF, H], color: '#ffffff' });

  const assembly = [
    { title: 'Left side', parts: [{ name: 'side', x: 0 }], note: `Lay the left side flat, inner face up: one piece ${H} high, the top ${LIP} is the lip over the top shelf. No bottom: the shelf deck is the first floor.`, view: 'left' },
    ...shelfZ.map((sz, i) => ({
      title: `Shelf ${i + 1}`,
      parts: [{ name: 'shelf', z: sz }],
      note: `Shelf ${inner} x ${boardD} with its bottom face ${sz} up, flush at the front; three confirmats through the side into its edge, caps flush outside.`,
      view: 'left',
    })),
    { title: 'Right side', parts: [{ name: 'side', x: W - T }], note: 'Right side on, three confirmats per shelf edge, caps flush. Stand it up.', view: 'right' },
    { title: 'Back', parts: ['back HDF'], note: 'Square it and staple the 3 mm HDF back over the rear edges of sides and shelves.', view: 'back' },
  ];

  return {
    id,
    name,
    comment:
      `Slide-in jar rack for the garage shelf: ${W} x ${D} x ${H}, for the ${jar}-high jars (Ø${JAR_D}). A plain carcass: ` +
      `two 18 mm sides ${boardD} deep standing straight on the shelf deck (no bottom - the deck is the first floor), one piece each, rising a ${LIP} lip over the top shelf; ` +
      `${shelfZ.length} fixed shelves ${inner} x ${boardD} (bottom faces at ${shelfZ.join(', ')}) on three confirmats per edge through the sides; 3 mm HDF back stapled over the rear edges; no top. ` +
      `Narrow enough (${across} jars across) that the confirmats are all it needs. Tiers of ${tiers.join(' / ')} clear; the top tier's jars reach ${topJar} (entrance 350). ` +
      `${across} jars across x ${deep} deep = ${across * deep} per tier, ${across * deep * tiers.length} in the module. ` +
      `Generated by scripts/gen-jar-rack.mjs.`,
    buildable: true,
    color: '#ffffff',
    clearance: { front: 600 },
    assembly,
    parts,
    W,
    inner,
  };
}

// The jars standing in a module: a bought piece of discs, one per jar,
// placed at the module's origin. Tier floors are the deck (0) and the top
// faces of the shelves.
function jars(id, name, jarH, rack) {
  const parts = [];
  const across = Math.floor(rack.inner / JAR_D);
  const floors = [0, ...rack.parts.filter((p) => p.name === 'shelf').map((p) => p.pos[2] + T)];
  const x0 = T + (rack.inner - across * JAR_D) / 2;
  const y0 = (boardD - deep * JAR_D) / 2;
  const d = JAR_D - 2; // 2 mm between neighbours
  const lid = 10;
  for (const z of floors)
    for (let i = 0; i < across; i++)
      for (let k = 0; k < deep; k++) {
        const x = x0 + i * JAR_D + 1;
        const y = y0 + k * JAR_D + 1;
        parts.push({ name: 'jar', pos: [x, y, z], size: [d, d, jarH - lid], color: '#d9e6dc', disc: 'z' });
        parts.push({ name: 'lid', pos: [x + 2, y + 2, z + jarH - lid], size: [d - 4, d - 4, lid], color: '#c9a227', disc: 'z', metal: true });
      }
  return {
    id,
    name,
    comment: `${parts.length / 2} jars Ø${JAR_D} x ${jarH} standing in the rack, ${across} across x ${deep} deep per tier. Not built: only here to show the capacity.`,
    buildable: false,
    color: '#d9e6dc',
    parts,
  };
}

const strip = ({ W, inner, ...piece }) => piece; // W/inner are for the jars, not the JSON

const tall = rackStacked('jar-rack-tall', 'Jar rack - tall jars (2 tiers)', JAR_TALL, [JAR_TALL + PLAY_TALL, JAR_TALL + PLAY_TALL], ACROSS_TALL);
const small = rackPlain('jar-rack-small', 'Jar rack - small jars (3 tiers)', JAR_SMALL, [JAR_SMALL + PLAY_SMALL, JAR_SMALL + PLAY_SMALL, JAR_SMALL + PLAY_SMALL], ACROSS_SMALL);
write(strip(tall));
write(strip(small));
write(jars('jars-tall', 'Jars 150 (in the tall rack)', JAR_TALL, tall));
write(jars('jars-small', 'Jars 85 (in the small rack)', JAR_SMALL, small));

// Bottles standing on the deck in the bay right of the modules: a bought piece
// placed at the bay's origin, body + neck + cap per bottle.
{
  const parts = [];
  const bd = Math.floor(boardD / JAR_D);
  for (let i = 0; i < BOTTLES_ACROSS; i++)
    for (let k = 0; k < bd; k++) {
      const x = i * (BOTTLE_D + 5) + 1;
      const y = (boardD - bd * JAR_D) / 2 + k * JAR_D + 1;
      const d = BOTTLE_D - 2;
      parts.push({ name: 'bottle', pos: [x, y, 0], size: [d, d, BOTTLE_H - 90], color: '#3f5f3e', disc: 'z' });
      parts.push({ name: 'neck', pos: [x + (d - 32) / 2, y + (d - 32) / 2, BOTTLE_H - 90], size: [32, 32, 78], color: '#3f5f3e', disc: 'z' });
      parts.push({ name: 'cap', pos: [x + (d - 34) / 2, y + (d - 34) / 2, BOTTLE_H - 12], size: [34, 34, 12], color: '#c9a227', disc: 'z', metal: true });
    }
  write({
    id: 'bottles',
    name: `Bottles 1 l (${parts.length / 3} standing)`,
    comment: `${parts.length / 3} litre bottles Ø${BOTTLE_D} x ${BOTTLE_H} standing straight on the shelf deck in the bay next to the jar racks, ${BOTTLES_ACROSS} across x ${bd} deep. Not built: only here to show the bay. The 350 entrance takes bottles up to about 340 standing.`,
    buildable: false,
    color: '#3f5f3e',
    parts,
  });
}

// The garage shelf itself: a mock of the slot the modules go into. Uprights,
// a deck the modules stand on (its top is z 20), a deck above, and the front
// rail that makes the entrance 350 when the slot is 400 behind it.
const UP = 30;
const DECK = 20;
const RAIL = SLOT_H - SLOT_ENTRY_H;
const shelfH = DECK + SLOT_H + DECK;
write({
  id: 'garage-shelf',
  name: 'Garage shelf (slot for the jar racks)',
  comment: `Mock of the existing garage shelf: a slot ${SLOT_W} wide, ${SLOT_D} deep, ${SLOT_ENTRY_H} high at the entrance (front rail) and ${SLOT_H} behind it. Not built. Modules stand on the deck at z ${DECK}.`,
  buildable: false,
  color: '#a8936f',
  parts: [
    { name: 'upright', pos: [0, 0, 0], size: [UP, SLOT_D, shelfH] },
    { name: 'upright', pos: [UP + SLOT_W, 0, 0], size: [UP, SLOT_D, shelfH] },
    { name: 'deck', pos: [UP, 0, 0], size: [SLOT_W, SLOT_D, DECK] },
    { name: 'deck', pos: [UP, 0, DECK + SLOT_H], size: [SLOT_W, SLOT_D, DECK] },
    { name: 'front rail', pos: [UP, 0, DECK + SLOT_ENTRY_H], size: [SLOT_W, 60, RAIL] },
  ],
});
