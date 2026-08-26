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
// "left" is -x, "right" is +x. Values are mm of free space required.
export function clearanceLocalBoxes(piece) {
  const c = piece.clearance || {};
  const bb = pieceLocalBBox(piece);
  const out = [];
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

export function overlaps(a, b) {
  return [0, 1, 2].every(
    (i) => a.min[i] < b.max[i] - EPS && b.min[i] < a.max[i] - EPS
  );
}

// Full fit report for a scene: resolved placements + list of issues.
// collision = two solid things intersect. warning = something sits inside
// a clearance zone (it fits, but you can't open/use it).
export function fitReport(scene, piecesById, apartment) {
  const placed = scene.placements.map((pl, i) => {
    const piece = piecesById[pl.piece];
    if (!piece) throw new Error(`Unknown piece id in scene: ${pl.piece}`);
    return {
      id: i,
      name: pl.label || piece.name,
      placement: pl,
      piece,
      bbox: placeBox(pieceLocalBBox(piece), pl),
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

  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      if (overlaps(a.bbox, b.bbox)) {
        issues.push({ level: 'collision', text: `${a.name} overlaps ${b.name}` });
        collidedIds.add(a.id);
        collidedIds.add(b.id);
      }
    }
    for (const w of walls) {
      if (overlaps(a.bbox, w.box)) {
        issues.push({ level: 'collision', text: `${a.name} overlaps wall (${w.name})` });
        collidedIds.add(a.id);
      }
    }
    for (const c of a.clearances) {
      for (const b of placed) {
        if (b !== a && overlaps(c.box, b.bbox)) {
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
