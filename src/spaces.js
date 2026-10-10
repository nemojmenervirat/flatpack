// Storage spaces of a piece: the clear boxes inside the carcass where things
// go — between shelves, under a hanging rail, inside a drawer box. Pure, mm,
// piece-local coordinates (z up, fronts at -y). Derived from the boards alone,
// so a shelf moved in the JSON moves the spaces with it.
//
//   interiorSpaces(piece) -> [{ name, kind, pos, size, clear, note }]
//     kind   'open' (shelf space), 'hanging' (holds a rail), 'drawer' (inside the box)
//     clear  [width, depth, height] = size, the numbers to print
//
// How: the boards (not hardware, not fronts, not drawer boxes) cut the carcass
// into a grid of cells. From every empty cell the box grows along each axis
// until it meets a board, using the cell's own cross-section as the probe. A
// grown box that still contains a board (the grid cell was a sliver in front
// of a set-back shelf, say) is discarded, as is one that is not closed by a
// board on every side but the front. What is left, deduplicated, are the
// compartments.
import { aabbOf, overlaps } from './geometry.js';

const MIN = 60; // mm: anything thinner on some axis is a gap, not a space

const isFront = (p) => /^(door|drawer front|flap|pullout)/.test(p.name);
const isDrawerBox = (p) => /^drawer (box|bottom)/.test(p.name);

function structuralBoards(parts) {
  return parts.filter((p) => !p.hardware && !p.appliance && !isFront(p) && !isDrawerBox(p));
}

function edgesOf(boxes, axis) {
  const s = new Set();
  for (const b of boxes) {
    s.add(b.min[axis]);
    s.add(b.max[axis]);
  }
  return [...s].sort((a, b) => a - b);
}

const blocked = (box, boards) => boards.some((b) => overlaps(box, b));

// Grow the cell along one axis in one direction, slab by slab, while the slab
// (cell cross-section on the other axes) is free of boards. Returns the new
// edge and whether a board (rather than the grid end) stopped the growth.
function grow(cell, axis, dir, edges, boards) {
  const box = { min: [...cell.min], max: [...cell.max] };
  let idx = dir < 0 ? edges.indexOf(cell.min[axis]) : edges.indexOf(cell.max[axis]);
  while (true) {
    const next = dir < 0 ? idx - 1 : idx + 1;
    if (next < 0 || next >= edges.length) return { edge: dir < 0 ? box.min[axis] : box.max[axis], closed: false };
    const slab = { min: [...cell.min], max: [...cell.max] };
    slab.min[axis] = Math.min(edges[idx], edges[next]);
    slab.max[axis] = Math.max(edges[idx], edges[next]);
    if (blocked(slab, boards)) return { edge: dir < 0 ? box.min[axis] : box.max[axis], closed: true };
    if (dir < 0) box.min[axis] = edges[next];
    else box.max[axis] = edges[next];
    idx = next;
  }
}

function openBoxes(boards, frontPlane) {
  if (!boards.length) return [];
  const xs = edgesOf(boards, 0);
  const ys = edgesOf(boards, 1);
  const zs = edgesOf(boards, 2);
  const seen = new Set();
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++)
      for (let k = 0; k + 1 < zs.length; k++) {
        const cell = { min: [xs[i], ys[j], zs[k]], max: [xs[i + 1], ys[j + 1], zs[k + 1]] };
        if (blocked(cell, boards)) continue;
        const box = { min: [0, 0, 0], max: [0, 0, 0] };
        let closed = true;
        for (const axis of [0, 1, 2]) {
          const edges = [xs, ys, zs][axis];
          const lo = grow(cell, axis, -1, edges, boards);
          const hi = grow(cell, axis, +1, edges, boards);
          box.min[axis] = lo.edge;
          box.max[axis] = hi.edge;
          // every side but the front (-y) must be a board
          if (!hi.closed || (!lo.closed && axis !== 1)) closed = false;
        }
        if (!closed) continue;
        // open front: measure from the carcass front face, not from whatever
        // (an end panel, a plinth) happens to stick out before it
        if (frontPlane != null && box.min[1] < frontPlane) box.min[1] = frontPlane;
        if (box.min[1] >= box.max[1]) continue;
        const size = [0, 1, 2].map((a) => box.max[a] - box.min[a]);
        if (size.some((v) => v < MIN)) continue;
        if (blocked(box, boards)) continue; // grew through a set-back shelf: not a real compartment
        const key = box.min.join(',') + '/' + box.max.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ pos: box.min, size });
      }
  return out;
}

const spanOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Inside of a drawer box standing behind a drawer front: between the box
// sides, between the box front and back, from the bottom panel up to the top
// of the sides.
function drawerInside(front, parts) {
  const fb = aabbOf(front.pos, front.size);
  const members = parts.filter(
    (p) => isDrawerBox(p) && spanOverlap(p.pos[0], p.pos[0] + p.size[0], fb.min[0], fb.max[0]) > 0 &&
      spanOverlap(p.pos[2], p.pos[2] + p.size[2], fb.min[2], fb.max[2]) > 0
  );
  if (!members.length) return null;
  const boxes = members.map((p) => aabbOf(p.pos, p.size));
  const B = {
    min: [0, 1, 2].map((a) => Math.min(...boxes.map((b) => b.min[a]))),
    max: [0, 1, 2].map((a) => Math.max(...boxes.map((b) => b.max[a]))),
  };
  const thin = (p, axis) => p.size[axis] === Math.min(...p.size);
  const sides = members.filter((p) => thin(p, 0));
  const ends = members.filter((p) => thin(p, 1));
  const bottoms = members.filter((p) => thin(p, 2));
  const x0 = sides.length ? Math.min(...sides.filter((p) => p.pos[0] < (B.min[0] + B.max[0]) / 2).map((p) => p.pos[0] + p.size[0])) : B.min[0];
  const x1 = sides.length ? Math.max(...sides.filter((p) => p.pos[0] >= (B.min[0] + B.max[0]) / 2).map((p) => p.pos[0])) : B.max[0];
  const y0 = ends.length ? Math.min(...ends.filter((p) => p.pos[1] < (B.min[1] + B.max[1]) / 2).map((p) => p.pos[1] + p.size[1])) : B.min[1];
  const y1 = ends.length ? Math.max(...ends.filter((p) => p.pos[1] >= (B.min[1] + B.max[1]) / 2).map((p) => p.pos[1])) : B.max[1];
  const z0 = bottoms.length ? Math.max(...bottoms.map((p) => p.pos[2] + p.size[2])) : B.min[2];
  const z1 = B.max[2];
  return { pos: [x0, y0, z0], size: [x1 - x0, y1 - y0, z1 - z0] };
}

// Column names from the distinct x-spans of the spaces: elementary spans
// (those that contain no other) are left/middle/right or "column n"; a space
// spanning several is named after all of them, or "full width".
function columnNamer(spaces) {
  const spans = [];
  for (const s of spaces) {
    const sp = s.col;
    if (!spans.some((t) => t[0] === sp[0] && t[1] === sp[1])) spans.push(sp);
  }
  const elementary = spans
    .filter((a) => !spans.some((b) => b !== a && b[0] >= a[0] && b[1] <= a[1] && (b[0] > a[0] || b[1] < a[1])))
    .sort((a, b) => a[0] - b[0]);
  const names =
    elementary.length === 1 ? [''] :
    elementary.length === 2 ? ['left', 'right'] :
    elementary.length === 3 ? ['left', 'middle', 'right'] :
    elementary.map((_, i) => `column ${i + 1}`);
  return (s) => {
    const [x0, x1] = s.col;
    const covered = elementary.map((e, i) => (e[0] >= x0 - 0.5 && e[1] <= x1 + 0.5 ? i : -1)).filter((i) => i >= 0);
    if (covered.length === elementary.length) return elementary.length > 1 ? 'full width' : '';
    return covered.map((i) => names[i]).join(' + ');
  };
}

export function interiorSpaces(piece) {
  const parts = piece.parts || [];
  const boards = structuralBoards(parts).map((p) => aabbOf(p.pos, p.size));
  const fronts = parts.filter(isFront);
  // the front plane is the back face of the thin front panels (a pullout is a
  // front too, but it runs deep into the carcass)
  const panels = fronts.filter((p) => p.size[1] <= 30);
  const frontPlane = panels.length ? Math.max(...panels.map((p) => p.pos[1] + p.size[1])) : null;
  // col: the compartment's x-span, kept for naming when a drawer box replaces the box
  let spaces = openBoxes(boards, frontPlane).map((b) => ({ ...b, kind: 'open', note: '', col: [b.pos[0], b.pos[0] + b.size[0]] }));

  // drawers: report the inside of the box instead of the compartment it runs in
  for (const f of fronts.filter((p) => /^drawer front/.test(p.name))) {
    const fb = aabbOf(f.pos, f.size);
    const inside = drawerInside(f, parts);
    const hit = spaces.findIndex(
      (s) => spanOverlap(s.pos[0], s.pos[0] + s.size[0], fb.min[0], fb.max[0]) > MIN &&
        spanOverlap(s.pos[2], s.pos[2] + s.size[2], fb.min[2], fb.max[2]) > MIN
    );
    if (hit < 0) continue;
    if (inside) spaces[hit] = { ...inside, col: spaces[hit].col, kind: 'drawer', note: 'inside the drawer box' };
    else spaces[hit] = { ...spaces[hit], kind: 'drawer', note: 'drawer compartment' };
  }

  // hanging rails: the space holding the rail, with the drop below it
  for (const r of parts.filter((p) => /rail$/.test(p.name) && !/holder/.test(p.name))) {
    const c = r.pos.map((v, a) => v + r.size[a] / 2);
    const s = spaces.find((s) => [0, 1, 2].every((a) => c[a] >= s.pos[a] && c[a] <= s.pos[a] + s.size[a]));
    if (!s) continue;
    s.kind = 'hanging';
    s.note = `${r.pos[2] - s.pos[2]} drop under the rail, ${s.pos[2] + s.size[2] - (r.pos[2] + r.size[2])} above it`;
  }

  // order: columns left to right, bottom to top; name them
  spaces.sort((a, b) => a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  const colName = columnNamer(spaces);
  const perCol = {};
  for (const s of spaces) {
    const col = colName(s);
    (perCol[col] = perCol[col] || []).push(s);
  }
  const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
  for (const [col, list] of Object.entries(perCol)) {
    list.sort((a, b) => a.pos[2] - b.pos[2]);
    list.forEach((s, i) => {
      const what = s.kind === 'drawer' ? 'drawer' : s.kind === 'hanging' ? 'hanging' : 'shelf space';
      const where = list.length > 1 ? `${ordinal(i + 1)} from bottom` : '';
      s.name = [col, where, what].filter(Boolean).join(', ');
    });
  }
  // final order: by column (left to right), then bottom to top
  const colOrder = Object.keys(perCol);
  spaces.sort((a, b) => colOrder.indexOf(colName(a)) - colOrder.indexOf(colName(b)) || a.pos[2] - b.pos[2]);
  return spaces.map(({ col, ...s }) => ({ ...s, clear: s.size }));
}
