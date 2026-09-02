// Per-piece part details and hardware derivation for the piece view.
// Pure functions, no rendering — same spirit as geometry.js / cutlist.js.
//
// Nothing here is hand-authored on the piece: everything is derived from the
// parts by convention (fronts face -y, thickness = smallest dimension, parts
// named door* are hinged doors, drawer bottoms mark drawer boxes, ...).

import { pieceLocalBBox } from './geometry.js';
import { findMaterial } from './materials.js';

const sortedDims = (size) => [...size].sort((a, b) => b - a); // [L, W, T]

// Edge banding by rule:
//  - 3/6mm boards (HDF backs, drawer bottoms) are never banded
//  - fronts (doors, drawer fronts) and worktops show all four edges
//  - every other carcass part shows one long edge (the front edge)
function banding(part) {
  const [L, W, T] = sortedDims(part.size);
  if (T <= 6) return { edges: 'none', length: 0 };
  const n = part.name;
  if (n.startsWith('door') || n.startsWith('drawer front') || n.startsWith('flap') || n.includes('desk top'))
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

  // coat hooks: explicitly modeled hardware parts when present, else derived
  // from the hook rail length (one per ~280mm, at least 3)
  const hookHw = parts.filter((p) => p.hardware && p.name.includes('hook')).length;
  const hooks =
    hookHw ||
    parts
      .filter((p) => p.name.includes('hook') && !p.hardware)
      .reduce((n, p) => n + Math.max(3, Math.round(sortedDims(p.size)[0] / 280)), 0);

  // other explicitly modeled hardware parts (legs, runners, ...) — hooks and
  // hanging rails are counted above, everything else is listed by name + size
  const extras = new Map();
  for (const p of parts) {
    if (!p.hardware || p.name.includes('hook') || p.name.includes('hanging')) continue;
    const key = `${p.name}|${p.size.join('x')}`;
    const row = extras.get(key) || { name: p.name, size: [...p.size], qty: 0 };
    row.qty += 1;
    extras.set(key, row);
  }

  return {
    hinges,
    hingesTotal,
    drawers,
    slideBoxDepth,
    shelves,
    shelfPins: shelves * 4,
    rails,
    hooks,
    extras: [...extras.values()],
  };
}

// Board + edge-banding cost from the materials registry (Elgrad KM prices).
// Boards are priced by cut area x the panel price for the part's thickness;
// banding uses the same edge rule as the parts table and the material's
// cheapest tape. Parts whose material (own or piece-level) has no price for
// their thickness land in `unpriced` instead of silently costing 0. Hardware
// parts (legs, runners) are counted but not priced - bought separately.
export function priceEstimate(piece) {
  const boards = new Map(); // material|thickness -> row
  const tapes = new Map(); // material -> meters
  const unpriced = new Map(); // name|cut -> row
  const hardware = new Map(); // name -> qty
  for (const p of piece.parts || []) {
    if (p.appliance) continue;
    const [L, W, T] = sortedDims(p.size);
    if (p.hardware) {
      hardware.set(p.name, (hardware.get(p.name) || 0) + 1);
      continue;
    }
    const mat = findMaterial(p.material || piece.material);
    const perM2 = mat?.panel?.[String(T)];
    if (!perM2) {
      const key = `${p.name}|${L}x${W}x${T}`;
      const row = unpriced.get(key) || {
        name: p.name,
        cut: `${L} × ${W} × ${T}`,
        qty: 0,
        reason: mat ? `no ${T}mm price for ${mat.id}` : 'no material set',
      };
      row.qty += 1;
      unpriced.set(key, row);
      continue;
    }
    const key = `${mat.id}|${T}`;
    const row = boards.get(key) || { material: mat.id, thickness: T, m2: 0, perM2 };
    row.m2 += (L * W) / 1e6;
    boards.set(key, row);
    const band = banding(p);
    if (band.length) tapes.set(mat.id, (tapes.get(mat.id) || 0) + band.length / 1000);
  }
  const boardRows = [...boards.values()].map((r) => ({ ...r, cost: r.m2 * r.perM2 }));
  const tapeRows = [...tapes.entries()].map(([id, meters]) => {
    const prices = Object.values(findMaterial(id)?.tape || {});
    const perM = prices.length ? Math.min(...prices) : null;
    return { material: id, meters, perM, cost: perM ? meters * perM : 0 };
  });
  const total =
    boardRows.reduce((n, r) => n + r.cost, 0) + tapeRows.reduce((n, r) => n + r.cost, 0);
  return {
    boardRows,
    tapeRows,
    unpriced: [...unpriced.values()],
    hardware: [...hardware.entries()].map(([name, qty]) => ({ name, qty })),
    total,
  };
}
