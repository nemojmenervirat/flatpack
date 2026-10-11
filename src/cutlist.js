// Derive a cut list from the scene: every part of every buildable piece,
// grouped by identical name + cut size + thickness.
// A part's thickness is its smallest dimension; the other two are the cut size.

// Edge banding by rule (the piece panel and the price estimate use the same):
//  - 3/6mm boards (HDF backs, drawer bottoms) are never banded
//  - fronts (doors, drawer fronts, flaps) and worktops show all four edges
//  - drawer box parts show their top edge (the long one)
//  - every other part shows exactly one edge: the one facing the room. Parts
//    are authored in piece-local space with the front at -y, so that edge runs
//    along x for a horizontal board (thin along z: tops, bottoms, shelves),
//    along z for an upright one (thin along x: sides, partitions), and is the
//    longer of the two for a strip thin along y (plinth, filler).
// Result, in the shop's notation: L = how many of the two length edges are
// banded, W = how many of the two width edges (0, 1 or 2), where length is the
// longer cut dimension; tape = the band thickness in mm ("band" on the part,
// else on the piece, else null = unspecified); length = tape for one part in
// mm, only used later for the cost estimate. edges keeps the rule name.
export function banding(part, piece) {
  const [sx, sy, sz] = part.size;
  const T = Math.min(sx, sy, sz);
  const [L, W] = [sx, sy, sz].sort((a, b) => b - a);
  if (T <= 6) return { edges: 'none', L: 0, W: 0, tape: null, length: 0 };
  const tape = part.band ?? piece?.band ?? null;
  const n = part.name;
  if (n.startsWith('door') || n.startsWith('drawer front') || n.startsWith('flap') || n.includes('desk top'))
    return { edges: 'all', L: 2, W: 2, tape, length: 2 * (L + W) };
  if (n.startsWith('drawer box')) return { edges: 'front', L: 1, W: 0, tape, length: L }; // the box's top edge
  const front = T === sz ? sx : T === sx ? sz : Math.max(sx, sz);
  return front === L ? { edges: 'front', L: 1, W: 0, tape, length: L } : { edges: 'front', L: 0, W: 1, tape, length: W };
}

// Raw HDF for backs and drawer bottoms (3-6 mm): the price list has no decor
// row for it, so a thin board without a decor is exported under this name
// (the price estimate charges it a flat rate under the same label).
export const RAW_HDF = 'HDF (raw)';
export const isRawHdf = (part, piece) => !part.material && !piece?.material && Math.min(...part.size) <= 6;

export function cutList(scene, piecesById) {
  const rows = new Map();
  for (const pl of scene.placements) {
    const piece = piecesById[pl.piece];
    if (!piece?.buildable || !piece.parts) continue;
    for (const p of piece.parts) {
      if (p.appliance || p.hardware) continue; // bought appliances / hardware (runners, hinges)

      const dims = [...p.size].sort((a, b) => b - a); // [L, W, T]
      const material = p.material || piece.material || (isRawHdf(p, piece) ? RAW_HDF : '');
      const band = banding(p, piece);
      // one row per name + size (+ material, banding): parts meant to share
      // a line share a name in the JSON
      const key = `${piece.id}|${p.name}|${dims.join('x')}|${material}|${band.edges}${band.L}${band.W}|${band.tape}`;
      const row = rows.get(key) || {
        piece: piece.name,
        part: p.name,
        length: dims[0],
        width: dims[1],
        thickness: dims[2],
        qty: 0,
        material,
        banding: band,
      };
      row.qty += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.thickness - a.thickness || b.length - a.length || b.width - a.width
  );
}

// CSV of the cut list as the parts table shows it: one row per part group,
// with the material and the edge banding in the shop's notation — how many
// edges to band on the length and on the width (0, 1 or 2) and the band
// thickness in mm (blank when the piece doesn't say).
export function cutListCsv(rows) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['Piece,Part,Length,Width,Thickness,Qty,Material,Band length edges,Band width edges,Band mm'];
  for (const r of rows) {
    const b = r.banding || banding({ name: r.part, size: [r.length, r.width, r.thickness] });
    const tape = b.L + b.W > 0 && b.tape != null ? b.tape : '';
    lines.push([q(r.piece), q(r.part), r.length, r.width, r.thickness, r.qty, q(r.material || ''), b.L, b.W, tape].join(','));
  }
  return lines.join('\n');
}

// Which narrow faces of a board carry the tape, for the viewer: piece-local
// face keys (+x -x +y -y +z -z). narrow = the four edge faces (those not
// perpendicular to the thin axis); banded = the taped ones among them. The
// rest show raw chipboard. A strip facing the room (plinth, filler) bands the
// long edge you see: the bottom edge when it sits high, the top edge low down.
export function bandedFaces(part) {
  const [sx, sy, sz] = part.size;
  const T = Math.min(sx, sy, sz);
  const thin = T === sz ? 'z' : T === sx ? 'x' : 'y';
  const narrow = thin === 'z' ? ['+x', '-x', '+y', '-y'] : thin === 'x' ? ['+y', '-y', '+z', '-z'] : ['+x', '-x', '+z', '-z'];
  const b = banding(part);
  if (b.edges === 'none') return { narrow, banded: [] };
  if (b.edges === 'all') return { narrow, banded: narrow };
  if (part.name.startsWith('drawer box')) return { narrow, banded: ['+z'] };
  if (thin !== 'y') return { narrow, banded: ['-y'] };
  return { narrow, banded: [part.pos[2] > 1000 ? '-z' : '+z'] };
}
