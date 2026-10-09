// Assembly sequence for the piece view: ordered steps, each a set of part
// indices placed together, plus the direction every part comes in from so
// the viewer can slide boards into place and drive screws in.
// Pure functions, no three.js — same spirit as geometry.js / cutlist.js.
//
// Boards follow the piece's own "assembly" list when it has one:
//   "assembly": [{ "title": "Sides", "parts": ["side"], "note": "...",
//                  "view": "below" }, ...]
// A parts entry is a name (every part with that name) or a selector
// { "name": "side", "x": 0 } that also matches pos components (x/y/z) so a
// step can take one of several same-named parts. Names not listed are
// appended as their own steps, bottom up, fronts last. Without a list the
// whole order is derived. Hardware (screws, pins, staples, clips...) goes in
// the step of the LAST board it is driven into, i.e. when both things it
// joins exist — unless a step selects it explicitly.
// "view" says where the camera looks from for that step: front, back, left,
// right, above, below, or two joined with "-" (front-below); default is the
// side the step's fasteners come from, else where its board comes from.
// A sub-assembly built outside the piece (a drawer box) marks its steps with
// "stage": "<name>"; those parts are shown built on the floor in front of
// the piece until a step { "install": "<name>" } moves the whole group into
// place. "stageAt": [dx, dy, dz] on the install step overrides where it is
// built. A step { "handles": true } is where the viewer-drawn bar handles go
// on the doors and drawer fronts; before it the fronts show none.

import { aabbOf, overlaps, pieceLocalBBox } from './geometry.js';

const EPS = 0.5;
const isFront = (p) => {
  const n = p.name;
  return (
    n.startsWith('door') ||
    n.startsWith('drawer front') ||
    n.startsWith('flap') ||
    n.startsWith('plinth') ||
    n.startsWith('top filler') ||
    n === 'end panel'
  );
};

// axis of a part's thickness: 0 = x, 1 = y, 2 = z
const thinAxis = (p) => p.size.indexOf(Math.min(...p.size));

// gap between two boxes (0 when they touch or overlap)
const gap = (a, b) => [0, 1, 2].reduce((s, i) => s + Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]), 0);

// Direction (unit vector, data space) a part comes in from.
//  - a fastener with one free end comes in head first: from its free end outward
//  - one buried at both ends (a dowel) comes from the board placed later
//  - loose hardware (legs, clips, holders) comes from the side of its host
//    board it sits on; a drilled hole is not placed at all (zero vector)
//  - fronts come from the front (-y), the back from behind (+y)
//  - an upright board comes from its own side of the piece; one near the
//    middle (a partition) drops in from above
//  - a flat board high in the piece comes from above, a low one slides in
//    from the front (a shelf)
// hint = { host: box, later: box } from assemblySteps; without it the nearest
// board is the host and also the "later" one.
export function approachDir(part, parts, bb, hint = null) {
  const b = aabbOf(part.pos, part.size);
  const c = [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2);
  const pc = [0, 1, 2].map((a) => (bb.min[a] + bb.max[a]) / 2);
  const unit = (a, s) => [0, 1, 2].map((k) => (k === a ? s : 0));
  const center = (bx) => [0, 1, 2].map((a) => (bx.min[a] + bx.max[a]) / 2);
  if (part.hardware) {
    if (part.name === 'shelf hole') return [0, 0, 0]; // drilled, not placed
    const axis = part.size.indexOf(Math.max(...part.size));
    const boards = parts.filter((p) => !p.hardware);
    const boxes = boards.map((p) => aabbOf(p.pos, p.size));
    const buried = (pt) => boxes.some((bx) => [0, 1, 2].every((a) => pt[a] > bx.min[a] + EPS && pt[a] < bx.max[a] - EPS));
    const ends = [b.min, b.max].map((m) => c.map((v, a) => (a === axis ? m[a] : v)));
    const deep = ends.map(buried);
    if (deep[0] !== deep[1]) return unit(axis, deep[0] ? 1 : -1);
    let host = hint?.host || null;
    if (!host) {
      let best = Infinity;
      for (const bx of boxes) {
        const g = gap(b, bx);
        if (g < best) {
          best = g;
          host = bx;
        }
      }
    }
    if (!host) return [0, 0, 1];
    if (deep[0] && deep[1]) {
      // both ends in wood: come from the board that goes on later, along the axis
      const later = hint?.later || host;
      const s = Math.sign(center(later)[axis] - c[axis]) || -1;
      return unit(axis, s);
    }
    // loose: off the host's thin face
    const t = [0, 1, 2].indexOf(Math.min(host.max[0] - host.min[0], host.max[1] - host.min[1], host.max[2] - host.min[2]) === host.max[0] - host.min[0] ? 0 : host.max[1] - host.min[1] <= host.max[2] - host.min[2] ? 1 : 2);
    return unit(t, Math.sign(c[t] - center(host)[t]) || 1);
  }
  if (part.name.startsWith('back')) return [0, 1, 0];
  if (isFront(part)) return part.name === 'end panel' ? [1, 0, 0] : [0, -1, 0];
  const t = thinAxis(part);
  if (t === 0) return Math.abs(c[0] - pc[0]) < 100 ? [0, 0, 1] : unit(0, Math.sign(c[0] - pc[0]) || 1);
  if (t === 1) return [0, -1, 0];
  return c[2] > pc[2] + 0.4 * (bb.max[2] - bb.min[2]) ? [0, 0, 1] : [0, -1, 0];
}

const VIEW_DIRS = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], above: [0, 0, 1], below: [0, 0, -1] };
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
export const viewDir = (word) => norm(String(word).split('-').map((w) => VIEW_DIRS[w] || [0, 0, 0]).reduce((a, b) => a.map((x, i) => x + b[i]), [0, 0, 0]));

export const DIR_WORDS = { '1,0,0': 'from the right', '-1,0,0': 'from the left', '0,1,0': 'from behind', '0,-1,0': 'from the front', '0,0,1': 'from above', '0,0,-1': 'from below' };
export const dirWord = (d) => DIR_WORDS[d.join(',')] || '';

// { steps: [{ title, note, parts: [i], boards: [i], hardware: [i] }],
//   stepOf: part index -> step index, dirs: part index -> approach direction }
export function assemblySteps(piece) {
  const parts = piece.parts || [];
  const bb = pieceLocalBBox(piece);
  const boxes = parts.map((p) => aabbOf(p.pos, p.size));
  const boardIdx = parts.map((p, i) => (p.hardware ? -1 : i)).filter((i) => i >= 0);

  // --- board steps
  const authored = Array.isArray(piece.assembly) ? piece.assembly : [];
  const selName = (sel) => (typeof sel === 'string' ? sel : sel.name);
  const matches = (sel, p) =>
    typeof sel === 'string'
      ? p.name === sel
      : p.name === sel.name && ['x', 'y', 'z'].every((k, a) => sel[k] === undefined || p.pos[a] === sel[k]);
  const steps = authored.map((s) => ({
    title: s.title || (s.parts || []).map(selName).join(', '),
    note: s.note || '',
    view: s.view || null,
    sels: s.parts || [],
    stage: s.stage || null,
    install: s.install || null,
    stageAt: s.stageAt || null,
    handles: !!s.handles,
  }));
  const listed = new Set(steps.flatMap((s) => s.sels.map(selName)));
  // every board name not listed gets its own step: by lowest z, fronts last, name as tie-break
  const rest = [...new Set(parts.filter((p) => !p.hardware && !listed.has(p.name)).map((p) => p.name))];
  const zOf = (name) => Math.min(...parts.filter((p) => p.name === name).map((p) => p.pos[2]));
  const frontOf = (name) => isFront(parts.find((p) => p.name === name));
  rest.sort((a, b) => frontOf(a) - frontOf(b) || zOf(a) - zOf(b) || a.localeCompare(b));
  for (const name of rest) steps.push({ title: name, note: '', view: null, sels: [name], stage: null, install: null, stageAt: null, handles: false });

  const stepOf = new Array(parts.length).fill(-1);
  steps.forEach((s, si) => {
    parts.forEach((p, i) => {
      if (stepOf[i] < 0 && s.sels.some((sel) => matches(sel, p))) stepOf[i] = si;
    });
  });

  // --- hardware: the step of the last board it is driven into (overlap);
  // loose hardware the last board it touches; else the nearest board.
  // An explicit listing wins. host/later feed the approach direction.
  const hints = new Array(parts.length).fill(null);
  parts.forEach((p, i) => {
    if (!p.hardware) return;
    const inside = boardIdx.filter((k) => overlaps(boxes[i], boxes[k]));
    const touching = inside.length ? inside : boardIdx.filter((k) => gap(boxes[i], boxes[k]) <= EPS);
    let related = touching;
    if (!related.length) {
      let best = Infinity;
      let near = -1;
      for (const k of boardIdx) {
        const g = gap(boxes[i], boxes[k]);
        if (g < best) {
          best = g;
          near = k;
        }
      }
      related = near >= 0 ? [near] : [];
    }
    if (!related.length) {
      if (stepOf[i] < 0) stepOf[i] = steps.length - 1;
      return;
    }
    const later = related.reduce((a, k) => (stepOf[k] > stepOf[a] ? k : a));
    const host = related.reduce((a, k) => (stepOf[k] < stepOf[a] ? k : a));
    hints[i] = { host: boxes[host], later: boxes[later] };
    if (stepOf[i] < 0) stepOf[i] = stepOf[later];
  });

  const dirs = parts.map((p, i) => approachDir(p, parts, bb, hints[i]));

  // staged sub-assemblies: which stage each part belongs to (via its step),
  // where it is built, and the step that installs it
  const stageOf = parts.map((_, i) => (stepOf[i] >= 0 ? steps[stepOf[i]].stage : null));
  const stages = {};
  steps.forEach((s, si) => {
    if (s.stage && !stages[s.stage]) stages[s.stage] = { name: s.stage, offset: [0, 0, 0], installStep: -1 };
    if (s.install) {
      stages[s.install] = stages[s.install] || { name: s.install, offset: [0, 0, 0], installStep: -1 };
      stages[s.install].installStep = si;
      if (s.stageAt) stages[s.install].offset = s.stageAt;
    }
  });
  for (const st of Object.values(stages)) {
    if (st.installStep < 0) st.installStep = steps.length; // never installed: stays outside
    const idx = parts.map((_, i) => i).filter((i) => stageOf[i] === st.name);
    if (!idx.length || Object.values(stages).some((o) => o === st && o.offset.some((v) => v))) continue;
    // default: on the floor, 500 in front of the piece
    const hi = Math.max(...idx.map((i) => boxes[i].max[1]));
    const lo = Math.min(...idx.map((i) => boxes[i].min[2]));
    st.offset = [0, bb.min[1] - 500 - hi, -lo];
  }

  const handlesStep = steps.findIndex((s) => s.handles);
  return {
    stepOf,
    dirs,
    stageOf,
    stages,
    handlesStep: handlesStep >= 0 ? handlesStep : null,
    steps: steps.map((s, si) => {
      const idx = parts.map((_, i) => i).filter((i) => stepOf[i] === si);
      const boards = idx.filter((i) => !parts[i].hardware);
      const hardware = idx.filter((i) => parts[i].hardware && dirs[i].some((v) => v !== 0));
      // what the camera looks at: the step's own parts; from where: the
      // authored view, else the most common fastener direction, else the
      // main board's approach, tilted a little so it never looks straight along an axis
      const bx = idx.length ? idx.map((i) => boxes[i]) : [bb];
      const lo = [0, 1, 2].map((a) => Math.min(...bx.map((b) => b.min[a])));
      const hi = [0, 1, 2].map((a) => Math.max(...bx.map((b) => b.max[a])));
      let dir;
      if (s.view) dir = viewDir(s.view);
      else {
        const pool = hardware.length ? hardware : boards.length ? [boards[0]] : [];
        const count = new Map();
        for (const i of pool) {
          const k = dirs[i].join(',');
          count.set(k, (count.get(k) || 0) + 1);
        }
        const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        dir = best ? best[0].split(',').map(Number) : [0, -1, 0];
      }
      if (Math.abs(dir[2]) > 0.9) dir = norm([dir[0], dir[1] - 0.5, dir[2]]);
      else dir = norm([dir[0], dir[1], dir[2] + 0.35]);
      return {
        title: s.title,
        note: s.note,
        install: s.install,
        handles: s.handles,
        parts: idx,
        boards,
        hardware: idx.filter((i) => parts[i].hardware),
        focus: [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2),
        span: Math.max(...[0, 1, 2].map((a) => hi[a] - lo[a])),
        camDir: dir,
      };
    }),
  };
}

// Human instructions for one step: boards with cut size and qty, fasteners
// with qty and the side they go in from.
export function stepInstructions(step, parts, dirs) {
  const dims = (p) => [...p.size].sort((a, b) => b - a);
  const boards = new Map();
  for (const i of step.boards) {
    const p = parts[i];
    const d = dims(p);
    const k = `${p.name}|${d.join('x')}`;
    const row = boards.get(k) || { name: p.name, cut: `${d[0]} × ${d[1]} × ${d[2]}`, qty: 0 };
    row.qty += 1;
    boards.set(k, row);
  }
  const hardware = new Map();
  for (const i of step.hardware) {
    const p = parts[i];
    const drill = dirs[i].every((v) => v === 0);
    const from = drill ? '' : dirWord(dirs[i]);
    const k = `${p.name}|${from}`;
    const row = hardware.get(k) || { name: p.name, from, drill, qty: 0 };
    row.qty += 1;
    hardware.set(k, row);
  }
  const out = [...hardware.values()];
  if (step.handles) {
    // one bar handle per door leaf, drawer front and flap, as the viewer draws them
    const n = parts.filter(
      (p) => (p.name.startsWith('door') && !p.name.startsWith('door bin')) || p.name.startsWith('drawer front') || (p.name.startsWith('flap') && !p.appliance)
    ).length;
    if (n) out.push({ name: 'handle', from: 'from the front', drill: false, qty: n });
  }
  return { boards: [...boards.values()], hardware: out };
}
