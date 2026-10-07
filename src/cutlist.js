// Derive a cut list from the scene: every part of every buildable piece,
// grouped by identical name + cut size + thickness.
// A part's thickness is its smallest dimension; the other two are the cut size.

// Edge banding by rule (the piece panel and the price estimate use the same):
//  - 3/6mm boards (HDF backs, drawer bottoms) are never banded
//  - fronts (doors, drawer fronts, flaps) and worktops show all four edges
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
  const front = T === sz ? sx : T === sx ? sz : Math.max(sx, sz);
  return front === L ? { edges: 'front', L: 1, W: 0, tape, length: L } : { edges: 'front', L: 0, W: 1, tape, length: W };
}

export function cutList(scene, piecesById) {
  const rows = new Map();
  for (const pl of scene.placements) {
    const piece = piecesById[pl.piece];
    if (!piece?.buildable || !piece.parts) continue;
    for (const p of piece.parts) {
      if (p.appliance || p.hardware) continue; // bought appliances / hardware (runners, hinges)

      const dims = [...p.size].sort((a, b) => b - a); // [L, W, T]
      const material = p.material || piece.material || '';
      const band = banding(p, piece);
      const key = `${piece.id}|${p.name}|${dims.join('x')}|${material}|${band.tape}`;
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
