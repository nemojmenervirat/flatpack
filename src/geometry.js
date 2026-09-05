// All dimensions in mm.
// Convention: sizes are [width, depth, height] = [x, y, z]; z is UP.
// Positions are the min corner of a box. The viewer converts to three.js
// coordinates (y-up) at render time — everything here stays in data space.
//
// Rotations are limited to 0/90/180/270 degrees around the vertical axis,
// counterclockwise viewed from above, pivoting on the piece's local origin.
// Because of that, every box stays axis-aligned and all placement math is
// simple AABB (min/max corner) arithmetic.

const EPS = 0.5; // mm — touching faces don't count as overlap

export function aabbOf(pos, size) {
  return {
    min: [pos[0], pos[1], pos[2]],
    max: [pos[0] + size[0], pos[1] + size[1], pos[2] + size[2]],
  };
}

function rotXY([x, y], rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

// World-space AABB of a piece-local box under a placement {pos, rot}.
export function placeBox(local, placement) {
  const rot = placement.rot || 0;
  const [ax, ay] = rotXY([local.min[0], local.min[1]], rot);
  const [bx, by] = rotXY([local.max[0], local.max[1]], rot);
  const [px, py, pz] = placement.pos;
  return {
    min: [Math.min(ax, bx) + px, Math.min(ay, by) + py, local.min[2] + pz],
    max: [Math.max(ax, bx) + px, Math.max(ay, by) + py, local.max[2] + pz],
  };
}

// Frame of a door / flap front. Fronts face local -y by default; a part may set
// "face": "+x" | "-x" | "+y" for a side-facing front (an L-shaped kitchen has
// runs whose fronts open toward different walls). Everything downstream works
// in the front's canonical frame - facing -y, width along x, origin at the left
// end (seen from the front) of the back plane - and turns it by `alpha` (CCW
// degrees) about `origin` to land in piece space:
//   w, t, h, z0   width along the face, thickness, height, bottom z
//   hingeLeft     explicit "hinge": "left" | "right" (seen from the front) wins,
//                 else the edge farther from the piece bbox centre
//   toLocal(box)  a piece-local AABB expressed in the canonical frame
export const FACE_ANGLE = { '-y': 0, '+x': 90, '+y': 180, '-x': 270 };
export function frontFrame(part, bbox) {
  const face = FACE_ANGLE[part.face] !== undefined ? part.face : '-y';
  const alpha = FACE_ANGLE[face];
  const [p0, p1, z0] = part.pos;
  const [s0, s1, h] = part.size;
  const sideways = alpha === 90 || alpha === 270;
  const w = sideways ? s1 : s0;
  const t = sideways ? s0 : s1;
  const origin = {
    '-y': [p0, p1 + s1],
    '+x': [p0, p1],
    '+y': [p0 + s0, p1],
    '-x': [p0 + s0, p1 + s1],
  }[face];
  const toLocalPt = ([x, y]) => rotXY([x - origin[0], y - origin[1]], -alpha);
  const toLocal = (box) => {
    const a = toLocalPt(box.min);
    const b = toLocalPt(box.max);
    return {
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), box.min[2]],
      max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), box.max[2]],
    };
  };
  let hingeLeft = true;
  if (part.hinge) hingeLeft = part.hinge === 'left';
  else if (bbox) {
    const c = toLocalPt([(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2]);
    hingeLeft = w / 2 < c[0];
  }
  return { face, alpha, origin, w, t, h, z0, hingeLeft, toLocal, toLocalPt };
}

// Local bounding box of a piece: union of its parts, or its plain size.
export function pieceLocalBBox(piece) {
  if (piece.parts && piece.parts.length) {
    const boxes = piece.parts.map((p) => aabbOf(p.pos, p.size));
    return {
      min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
      max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))),
    };
  }
  return aabbOf([0, 0, 0], piece.size);
}

// Clearance zones as piece-local boxes adjacent to the bbox.
// "front" is the -y side (where drawer fronts / doors face), "back" is +y,
// "left" is -x, "right" is +x. Values are mm of free space required. A piece
// whose fronts don't all share one bbox side (an L-shaped kitchen) lists
// explicit boxes instead: "zones": [{ "name", "pos", "size" }] in local mm.
export function clearanceLocalBoxes(piece) {
  const c = piece.clearance || {};
  const bb = pieceLocalBBox(piece);
  const out = [];
  for (const z of c.zones || []) {
    const b = aabbOf(z.pos, z.size);
    out.push({ side: z.name || 'zone', min: b.min, max: b.max });
  }
  if (c.front)
    out.push({
      side: 'front',
      min: [bb.min[0], bb.min[1] - c.front, bb.min[2]],
      max: [bb.max[0], bb.min[1], bb.max[2]],
    });
  if (c.back)
    out.push({
      side: 'back',
      min: [bb.min[0], bb.max[1], bb.min[2]],
      max: [bb.max[0], bb.max[1] + c.back, bb.max[2]],
    });
  if (c.left)
    out.push({
      side: 'left',
      min: [bb.min[0] - c.left, bb.min[1], bb.min[2]],
      max: [bb.min[0], bb.max[1], bb.max[2]],
    });
  if (c.right)
    out.push({
      side: 'right',
      min: [bb.max[0], bb.min[1], bb.min[2]],
      max: [bb.max[0] + c.right, bb.max[1], bb.max[2]],
    });
  return out;
}

// Everything solid at body height that blocks a first-person walk: walls
// (lintels above the head drop out), the entrance door opening (a "closed
// front door") and every placed furniture part box. Inner room doors are not
// obstacles - the walker (or the tour) passes through them.
export function walkObstacles(apartment, placed, zlo, zhi) {
  const atBody = (b) => b.min[2] < zhi && b.max[2] > zlo;
  return [
    ...apartment.walls.map((w) => aabbOf(w.pos, w.size)),
    ...(apartment.openings || [])
      .filter((o) => o.style === 'entrance')
      .map((o) => aabbOf(o.pos, o.size)),
    ...placed.flatMap((p) => p.partBoxes),
  ].filter(atBody);
}

// First-person walk collision: slide a circular body (radius mm) in the XY
// plane from pos by delta against world AABBs (pre-filtered to body height by
// the caller). Tries the full move, then each axis alone, so the body slides
// along obstacles instead of sticking to them. Circle-vs-box is approximated
// by expanding each box by the radius (square corners — fine at 200mm scale).
export function walkMove(pos, delta, boxes, radius) {
  const blocked = (x, y) =>
    boxes.some(
      (b) =>
        x > b.min[0] - radius &&
        x < b.max[0] + radius &&
        y > b.min[1] - radius &&
        y < b.max[1] + radius
    );
  const [x0, y0] = pos;
  const x1 = x0 + delta[0];
  const y1 = y0 + delta[1];
  // already inside an expanded box (the slimmer tour body squeezed through a
  // gap, then the user took over): let it walk out instead of pinning it
  if (blocked(x0, y0)) return [x1, y1];
  if (!blocked(x1, y1)) return [x1, y1];
  if (!blocked(x1, y0)) return [x1, y0];
  if (!blocked(x0, y1)) return [x0, y1];
  return [x0, y0];
}

export function overlaps(a, b) {
  return [0, 1, 2].every(
    (i) => a.min[i] < b.max[i] - EPS && b.min[i] < a.max[i] - EPS
  );
}

// Full fit report for a scene: resolved placements + list of issues.
// collision = two solid things intersect. warning = something sits inside
// a clearance zone (it fits, but you can't open/use it).
// Collisions are broad-phase bbox first, then confirmed against the actual
// part boxes — so a piece may sit inside another piece's L-notch (a desk
// chair in the knee space) without a false positive.
export function fitReport(scene, piecesById, apartment) {
  const placed = scene.placements.map((pl, i) => {
    const piece = piecesById[pl.piece];
    if (!piece) throw new Error(`Unknown piece id in scene: ${pl.piece}`);
    const bbox = placeBox(pieceLocalBBox(piece), pl);
    return {
      id: i,
      name: pl.label || piece.name,
      placement: pl,
      piece,
      bbox,
      partBoxes: piece.parts?.length
        ? piece.parts.map((p) => placeBox(aabbOf(p.pos, p.size), pl))
        : [bbox],
      // a placement may override the piece's clearance (e.g. wall side differs)
      clearances: clearanceLocalBoxes(
        pl.clearance ? { ...piece, clearance: pl.clearance } : piece
      ).map((c) => ({
        side: c.side,
        box: placeBox(c, pl),
      })),
    };
  });

  const walls = (apartment.walls || []).map((w) => ({
    name: w.name,
    box: aabbOf(w.pos, w.size),
  }));

  const issues = [];
  const collidedIds = new Set();

  const hitsParts = (box, entry) =>
    overlaps(box, entry.bbox) && entry.partBoxes.some((pb) => overlaps(box, pb));

  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      if (
        overlaps(a.bbox, b.bbox) &&
        a.partBoxes.some((pa) => hitsParts(pa, b))
      ) {
        issues.push({ level: 'collision', text: `${a.name} overlaps ${b.name}` });
        collidedIds.add(a.id);
        collidedIds.add(b.id);
      }
    }
    for (const w of walls) {
      if (hitsParts(w.box, a)) {
        issues.push({ level: 'collision', text: `${a.name} overlaps wall (${w.name})` });
        collidedIds.add(a.id);
      }
    }
    for (const c of a.clearances) {
      for (const b of placed) {
        if (b !== a && hitsParts(c.box, b)) {
          issues.push({
            level: 'warning',
            text: `${b.name} blocks ${a.name}'s ${c.side} clearance`,
          });
        }
      }
      for (const w of walls) {
        if (overlaps(c.box, w.box)) {
          issues.push({
            level: 'warning',
            text: `wall (${w.name}) blocks ${a.name}'s ${c.side} clearance`,
          });
        }
      }
    }
  }

  return { placed, issues, collidedIds };
}
