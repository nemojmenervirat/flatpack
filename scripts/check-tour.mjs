// Simulate the scripted tour (src/data/tour.js) against the real apartment:
// same obstacle boxes as the viewer, same runner, 60 fps. Reports every step
// that gets stuck, times out, or selects nothing, and the total run time.
//
//   node scripts/check-tour.mjs           # play through once, report
//   node scripts/check-tour.mjs --dump    # also list placed pieces / doors for waypoint planning
//   node scripts/check-tour.mjs --trace   # print the body position after every step
import { readFileSync } from 'node:fs';
import { fitReport, walkObstacles, walkMove } from '../src/geometry.js';
import { createTour, tickTour, endTour, resolveTarget, doorGeometry, inDoorSweep, TOUR } from '../src/tour.js';
import { tour } from '../src/data/tour.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}.json`, import.meta.url), 'utf8'));
const apartment = json('apartment');
const scene = json('scene');
const piecesById = Object.fromEntries([...new Set(scene.placements.map((p) => p.piece))].map((id) => [id, json(id)]));
const report = fitReport(scene, piecesById, apartment);

const WALK = { radius: 200, zlo: 100, zhi: 1650 };
const boxes = walkObstacles(apartment, report.placed, WALK.zlo, WALK.zhi);

// Openables the way the viewer classifies them (approximation of Placement's
// grouping: leaves, drawer fronts, flaps, pull-outs) plus the room doors.
const open = new Map();
const records = [];
report.placed.forEach((e) => {
  (e.piece.parts || []).forEach((p, i) => {
    const n = p.name;
    const kind = n.startsWith('door bin')
      ? null
      : n.startsWith('door')
        ? 'door'
        : n.startsWith('drawer front')
          ? 'drawer'
          : n.startsWith('flap')
            ? 'flap'
            : n.startsWith('pullout')
              ? 'pullout'
              : null;
    if (!kind) return;
    const b = e.partBoxes[i];
    const key = `${e.id}:${i}`;
    records.push({
      key,
      kind,
      piece: e.name,
      pieceId: e.piece.id,
      part: n,
      center: [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2),
      setOpen: (v) => open.set(key, v),
    });
  });
});
(apartment.openings || [])
  .filter((o) => o.type === 'door')
  .forEach((o) => {
    const key = `opening:${o.name}`;
    records.push({
      key,
      kind: 'roomdoor',
      piece: '',
      pieceId: '',
      part: o.name,
      center: [0, 1, 2].map((a) => o.pos[a] + o.size[a] / 2),
      setOpen: (v) => open.set(key, v),
    });
  });

if (process.argv.includes('--dump')) {
  console.log('placed pieces (bbox min → max, mm):');
  for (const e of report.placed) {
    const b = e.bbox;
    console.log(`  ${e.name.padEnd(36)} [${b.min.map(Math.round)}] → [${b.max.map(Math.round)}]  rot ${e.placement.rot || 0}`);
  }
  console.log('doors:');
  for (const o of apartment.openings.filter((o) => o.type === 'door')) console.log(`  ${o.name.padEnd(18)} pos ${o.pos} size ${o.size}`);
  console.log(`openables: ${records.length}`);
}

const warnings = [];
const body = { pos: [0, 0], yaw: Math.PI, pitch: 0 };
let state; // assigned below; the checks report the current step index
const warnOnce = new Set();
const warn = (m) => {
  if (warnOnce.has(m)) return;
  warnOnce.add(m);
  warnings.push(m);
};

// Room-door checks: never cross a closed door, never brush the open leaf, and
// never stand where the swinging leaf would pass through the camera.
const doors = (apartment.openings || []).filter((o) => o.type === 'door').map(doorGeometry);
const doorOpen = (d) => open.get(`opening:${d.name}`) === true;
const segDist = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
};
const checkMove = (p) => {
  for (const d of doors) {
    const inside = p[0] > d.box.min[0] - 50 && p[0] < d.box.max[0] + 50 && p[1] > d.box.min[1] - 50 && p[1] < d.box.max[1] + 50;
    if (inside && !doorOpen(d)) warn(`step ${state.i}: walked through the CLOSED door ${d.name}`);
    if (doorOpen(d)) {
      const tip = [d.hinge[0] + d.open[0] * d.w, d.hinge[1] + d.open[1] * d.w];
      if (segDist(p, d.hinge, tip) < TOUR.radius) warn(`step ${state.i}: walked through the open leaf of ${d.name}`);
    }
  }
};

const ctx = {
  body,
  eye: TOUR.eye,
  move: (pos, delta) => {
    const np = walkMove(pos, delta, boxes, TOUR.radius);
    checkMove(np);
    return np;
  },
  openables: () => records,
  doors,
  setOpen: (r, v) => {
    r.setOpen(v);
    if (r.kind === 'roomdoor') {
      const d = doors.find((x) => x.name === r.part);
      if (d && inDoorSweep(d, body.pos, TOUR.radius))
        warn(`step ${state.i}: ${d.name} ${v ? 'opens' : 'closes'} through the body at [${Math.round(body.pos[0])}, ${Math.round(body.pos[1])}]`);
    }
  },
  resolve: (t) => resolveTarget(t, { placed: report.placed, openings: apartment.openings, eye: TOUR.eye }),
  say: () => {},
  warn,
};

state = createTour(tour, { loop: false });
const dt = 1 / 60;
let time = 0;
let lastStep = -1;
const trace = process.argv.includes('--trace');
while (tickTour(state, ctx, dt)) {
  time += dt;
  if (trace && state.i !== lastStep) {
    lastStep = state.i;
    const s = tour[Math.max(0, state.i - 1)];
    console.log(`t=${time.toFixed(1).padStart(6)}s  after step ${String(state.i - 1).padStart(3)} ${JSON.stringify(s).slice(0, 60).padEnd(60)} pos [${Math.round(body.pos[0])}, ${Math.round(body.pos[1])}] yaw ${Math.round((body.yaw * 180) / Math.PI)}°`);
  }
  if (time > 3600) {
    warnings.push('tour ran over an hour - runaway?');
    break;
  }
}
const leftOpen = [...open.entries()].filter(([, v]) => v).map(([k]) => k);
endTour(state, ctx);
const stillOpen = [...open.entries()].filter(([, v]) => v).map(([k]) => k);

console.log(`tour: ${tour.length} steps, ${(time / 60).toFixed(1)} min, ${records.length} openables, ${boxes.length} obstacle boxes`);
if (leftOpen.length) console.log(`script leaves open at the end (endTour closes them): ${leftOpen.join(', ')}`);
if (stillOpen.length) console.log(`STILL OPEN after endTour: ${stillOpen.join(', ')}`);
for (const w of warnings) console.log('  ! ' + w);
console.log(warnings.length ? `${warnings.length} problem(s)` : 'ok - no stuck steps, no door crossed or swept while closed, every selector matched');
process.exit(warnings.length || stillOpen.length ? 1 : 0);
