// Per-piece part details and hardware derivation for the piece view.
// Pure functions, no rendering — same spirit as geometry.js / cutlist.js.
//
// Nothing here is hand-authored on the piece: everything is derived from the
// parts by convention (fronts face -y, thickness = smallest dimension, parts
// named door* are hinged doors, drawer bottoms mark drawer boxes, ...).

import { pieceLocalBBox } from './geometry.js';

const sortedDims = (size) => [...size].sort((a, b) => b - a); // [L, W, T]

// Edge banding by rule:
//  - 3/6mm boards (HDF backs, drawer bottoms) are never banded
//  - fronts (doors, drawer fronts) and worktops show all four edges
//  - every other carcass part shows one long edge (the front edge)
function banding(part) {
  const [L, W, T] = sortedDims(part.size);
  if (T <= 6) return { edges: 'none', length: 0 };
  const n = part.name;
  if (n.startsWith('door') || n.startsWith('drawer front') || n.includes('desk top'))
    return { edges: 'all', length: 2 * (L + W) };
  return { edges: 'long', length: L };
}

// Parts grouped by identical name + cut size, with banding and the indices of
// the raw parts in piece.parts (so the UI can cross-highlight 3D <-> table).
export function partRows(piece) {
  const rows = new Map();
  (piece.parts || []).forEach((p, i) => {
    if (p.appliance) return; // bought appliances — not cut, not banded
    const [L, W, T] = sortedDims(p.size);
    const key = `${p.name}|${L}x${W}x${T}`;
    const row =
      rows.get(key) || {
        name: p.name,
        length: L,
        width: W,
        thickness: T,
        qty: 0,
        indices: [],
        banding: banding(p),
      };
    row.qty += 1;
    row.indices.push(i);
    rows.set(key, row);
  });
  return [...rows.values()];
}

// Cabinet hinge count per door grows with door height.
const hingesPerDoor = (h) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2100 ? 4 : 5);

// Hardware needed to build the piece, derived from the parts:
//  - hinges: per door group (width x height), hinge side matching the viewer's
//    rule — hinge sits on the vertical edge farther from the piece's center
//  - drawer slides: one pair per drawer box, sized by the box depth
//  - shelf supports: 4 per shelf
//  - hanging rail: one per hanging-bay shelf, cut to the bay width
export function hardwareList(piece) {
  const parts = piece.parts || [];
  const bb = pieceLocalBBox(piece);
  const centerX = (bb.min[0] + bb.max[0]) / 2;

  const hingeGroups = new Map();
  for (const p of parts) {
    if (!p.name.startsWith('door')) continue;
    const w = p.size[0];
    const h = p.size[2];
    const side = p.pos[0] + w / 2 < centerX ? 'left' : 'right';
    const key = `${w}x${h}|${side}`;
    const row =
      hingeGroups.get(key) || { doorW: w, doorH: h, side, doors: 0, perDoor: hingesPerDoor(h) };
    row.doors += 1;
    hingeGroups.set(key, row);
  }
  const hinges = [...hingeGroups.values()];
  const hingesTotal = hinges.reduce((n, g) => n + g.doors * g.perDoor, 0);

  const bottoms = parts.filter((p) => p.name === 'drawer bottom');
  const drawers = bottoms.length || parts.filter((p) => p.name.startsWith('drawer front')).length;
  const slideBoxDepth = bottoms.length ? sortedDims(bottoms[0].size)[1] : 0;

  const shelves = parts.filter((p) => p.name.includes('shelf')).length;
  const rails = parts
    .filter((p) => p.name.includes('hanging'))
    .map((p) => ({ length: sortedDims(p.size)[0] }));

  // coat hooks: one per ~280mm of hook rail, at least 3
  const hooks = parts
    .filter((p) => p.name.includes('hook'))
    .reduce((n, p) => n + Math.max(3, Math.round(sortedDims(p.size)[0] / 280)), 0);

  return { hinges, hingesTotal, drawers, slideBoxDepth, shelves, shelfPins: shelves * 4, rails, hooks };
}
