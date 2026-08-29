// Audit for src/data/rooms.json: verifies every room area with exact
// rectangle arithmetic, independent of the app code.
//
//   node scripts/check-areas.mjs
//
// Checks:
//  1. rects within a room don't overlap (overlap would double-count m²)
//  2. rooms don't overlap each other
//  3. no room area lies on a floor-level wall or a door footprint
//  4. no room area lies off the apartment floor entirely
//  5. all walkable floor belongs to some room, except doorway passages
//  6. every room outline closes (west lines sum = east, south = north)
// and prints per-room m² + total. Exits 1 if any check fails.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../src/data');
const j = (name) => JSON.parse(readFileSync(join(dataDir, name + '.json'), 'utf8'));
const apartment = j('apartment');
const rooms = j('rooms').rooms;

const EPS = 0.5;
const box = (r) => [r.pos[0], r.pos[1], r.pos[0] + r.size[0], r.pos[1] + r.size[1]];
const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
const overlapBox = (a, b) => {
  const o = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return o[2] - o[0] > EPS && o[3] - o[1] > EPS ? o : null;
};

// rectangle difference: b minus c, as up to 4 rects
const cutBox = (b, c) => {
  if (!overlapBox(b, c)) return [b];
  const out = [];
  if (c[3] < b[3] - EPS) out.push([b[0], c[3], b[2], b[3]]);
  if (c[1] > b[1] + EPS) out.push([b[0], b[1], b[2], c[1]]);
  const my0 = Math.max(b[1], c[1]);
  const my1 = Math.min(b[3], c[3]);
  if (c[0] > b[0] + EPS) out.push([b[0], my0, c[0], my1]);
  if (c[2] < b[2] - EPS) out.push([c[2], my0, b[2], my1]);
  return out;
};
const cutAll = (boxes, cutters) => {
  let out = boxes;
  for (const c of cutters) out = out.flatMap((b) => cutBox(b, c));
  return out;
};

const floorWalls = apartment.walls.filter((w) => w.pos[2] < 50).map((w) => box(w));
const doors = apartment.openings.filter((o) => o.type === 'door').map((o) => box(o));
const floors = apartment.floors.map((f) => box(f));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log('  FAIL:', msg);
};
const fmt = (mm2) => (mm2 / 1e6).toFixed(2);

// outline of a set of non-overlapping boxes; used for the closure check
const outlineEdges = (boxes) => {
  const segs = [];
  for (const f of boxes) {
    const sides = [
      { axis: 'v', coord: f[0], from: f[1], to: f[3], inward: 1 },
      { axis: 'v', coord: f[2], from: f[1], to: f[3], inward: -1 },
      { axis: 'h', coord: f[1], from: f[0], to: f[2], inward: 1 },
      { axis: 'h', coord: f[3], from: f[0], to: f[2], inward: -1 },
    ];
    for (const s of sides) {
      let pieces = [[s.from, s.to]];
      for (const g of boxes) {
        if (g === f) continue;
        const touches =
          s.axis === 'v'
            ? Math.abs((s.inward === 1 ? g[2] : g[0]) - s.coord) < EPS
            : Math.abs((s.inward === 1 ? g[3] : g[1]) - s.coord) < EPS;
        if (!touches) continue;
        const c0 = s.axis === 'v' ? g[1] : g[0];
        const c1 = s.axis === 'v' ? g[3] : g[2];
        pieces = pieces.flatMap(([a, b]) => {
          const i0 = Math.max(a, c0);
          const i1 = Math.min(b, c1);
          if (i1 - i0 <= EPS) return [[a, b]];
          const rest = [];
          if (i0 - a > EPS) rest.push([a, i0]);
          if (b - i1 > EPS) rest.push([i1, b]);
          return rest;
        });
      }
      for (const [a, b] of pieces) segs.push({ ...s, from: a, to: b });
    }
  }
  return segs;
};

console.log('rooms.json audit —', rooms.length, 'rooms\n');
let total = 0;

for (const room of rooms) {
  const boxes = room.rects.map(box);
  const m2 = boxes.reduce((n, b) => n + area(b), 0);
  total += m2;
  console.log(`${room.name}  ${fmt(m2)} m²  (${boxes.length} rect${boxes.length > 1 ? 's' : ''})`);

  // 1. internal overlaps
  for (let i = 0; i < boxes.length; i++)
    for (let k = i + 1; k < boxes.length; k++) {
      const o = overlapBox(boxes[i], boxes[k]);
      if (o) fail(`rects ${i} and ${k} overlap by ${fmt(area(o))} m² — m² is double-counted`);
    }

  // 3. on walls / door footprints
  for (const b of boxes) {
    for (const w of floorWalls) {
      const o = overlapBox(b, w);
      if (o) fail(`${fmt(area(o))} m² lies on a wall at [${o[0]}, ${o[1]}]`);
    }
    for (const d of doors) {
      const o = overlapBox(b, d);
      if (o) fail(`${fmt(area(o))} m² lies on a door footprint at [${o[0]}, ${o[1]}]`);
    }
  }

  // 4. off the apartment floor
  const offFloor = cutAll(boxes, floors);
  const offArea = offFloor.reduce((n, b) => n + area(b), 0);
  if (offArea > 1e4) fail(`${fmt(offArea)} m² is not over any floor zone`);

  // 6. outline closes
  const edges = outlineEdges(boxes);
  const sum = (ax, inw) =>
    edges.filter((e) => e.axis === ax && e.inward === inw).reduce((n, e) => n + e.to - e.from, 0);
  if (Math.abs(sum('v', 1) - sum('v', -1)) > EPS || Math.abs(sum('h', 1) - sum('h', -1)) > EPS)
    fail('outline does not close — a rect is misaligned');
}

// 2. cross-room overlaps
for (let i = 0; i < rooms.length; i++)
  for (let k = i + 1; k < rooms.length; k++)
    for (const a of rooms[i].rects.map(box))
      for (const b of rooms[k].rects.map(box)) {
        const o = overlapBox(a, b);
        if (o)
          fail(`${rooms[i].name} and ${rooms[k].name} overlap by ${fmt(area(o))} m² at [${o[0]}, ${o[1]}]`);
      }

// 5. walkable floor not claimed by any room (doorway passages are expected)
const allRoomBoxes = rooms.flatMap((r) => r.rects.map(box));
const walkable = cutAll(floors, [...floorWalls, ...doors]);
const unclaimed = cutAll(walkable, allRoomBoxes);
const isPassage = (b) =>
  doors.some((d) => overlapBox([b[0] - 60, b[1] - 60, b[2] + 60, b[3] + 60], d)) ||
  apartment.floors.some((f) => f.name.includes('-th-') && overlapBox(box(f), b));
const suspicious = unclaimed.filter((b) => area(b) > 1e4 && !isPassage(b));
const passageArea = unclaimed.reduce((n, b) => n + area(b), 0);
console.log(`\nunclaimed walkable floor: ${fmt(passageArea)} m² (doorway passages — expected)`);
for (const b of suspicious)
  fail(`unclaimed floor that is not a doorway: ${fmt(area(b))} m² at [${b[0]}, ${b[1]}]–[${b[2]}, ${b[3]}]`);

console.log(`\nTOTAL ${fmt(total)} m²`);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
