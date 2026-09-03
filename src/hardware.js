// Per-piece part details and hardware derivation for the piece view.
// Pure functions, no rendering — same spirit as geometry.js / cutlist.js.
//
// Nothing here is hand-authored on the piece: everything is derived from the
// parts by convention (fronts face -y, thickness = smallest dimension, parts
// named door* are hinged doors, drawer bottoms mark drawer boxes, ...).

import { pieceLocalBBox } from './geometry.js';
import { findMaterial, cuttingRate, tapeSpec, bandingRate } from './materials.js';
import hardwareCatalogue from './data/hardware.json';

// Bought hardware by part name: the real product and its price per piece.
export const hardwareItem = (name) => hardwareCatalogue.items[name] || null;

const sortedDims = (size) => [...size].sort((a, b) => b - a); // [L, W, T]

// Raw HDF for backs and drawer bottoms (3-6 mm). The price list has no decor
// row for it, so thin boards without a decor price are charged this flat rate.
const HDF_PER_M2 = 8; // KM/m²
const HDF_ID = 'HDF (raw)';

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
    if (p.appliance || p.hardware) return; // bought appliances / hardware (legs, hooks) — not cut, not banded
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
    const item = hardwareItem(p.name);
    const row =
      extras.get(key) || { name: p.name, size: [...p.size], qty: 0, product: item?.product || null, price: item?.price ?? null };
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

// Board, edge-banding tape and labour cost from the materials registry (Elgrad
// KM prices). Boards are priced by cut area x the panel price for the part's
// thickness; tape uses the same edge rule as the parts table and the
// material's cheapest tape. Labour comes from the price list's services page:
// cutting is charged per metre of cut, taken as each part's perimeter (the
// usual way a cutting service is quoted); banding labour per metre of banded
// edge, by board thickness and the tape's thickness. Parts whose material (own
// or piece-level) has no price for their thickness land in `unpriced` instead
// of silently costing 0 - they are still cut, so they still carry cutting
// labour. Hardware parts (legs, runners) are priced per piece from
// data/hardware.json when the part name is listed there, else just counted.
export function priceEstimate(piece) {
  const boards = new Map(); // material|thickness -> row
  const tapes = new Map(); // material -> meters
  const cutting = new Map(); // cutting class -> row
  const bandLabour = new Map(); // thickness band|tape -> row
  const unpriced = new Map(); // name|cut -> row
  const hardware = new Map(); // name -> qty
  const cheapestTape = (mat) =>
    Object.entries(mat?.tape || {}).sort((a, b) => a[1] - b[1])[0] || null;

  for (const p of piece.parts || []) {
    if (p.appliance) continue;
    const [L, W, T] = sortedDims(p.size);
    if (p.hardware) {
      const item = hardwareItem(p.name);
      const row = hardware.get(p.name) || { name: p.name, qty: 0, product: item?.product || null, price: item?.price ?? null };
      row.qty += 1;
      hardware.set(p.name, row);
      continue;
    }
    const mat = findMaterial(p.material || piece.material);

    const cut = cuttingRate(mat, T);
    if (cut) {
      const row = cutting.get(cut.key) || { kind: 'cutting', name: cut.label.replace(/^Usluga rezanja\s*/, ''), meters: 0, perM: cut.price };
      row.meters += (2 * (L + W)) / 1000;
      cutting.set(cut.key, row);
    }

    const decorPrice = mat?.panel?.[String(T)];
    const rawHdf = !decorPrice && T <= 6;
    const perM2 = decorPrice ?? (rawHdf ? HDF_PER_M2 : null);
    if (!perM2) {
      // Still a board row (area, thickness, 0 KM) so the estimate lists every
      // part; the reason says what is missing.
      const reason = mat ? `no ${T}mm price for ${mat.id}` : 'no material set';
      const key = `?${p.name}|${T}|${reason}`;
      const row = boards.get(key) || { material: null, part: p.name, thickness: T, m2: 0, perM2: null, reason };
      row.m2 += (L * W) / 1e6;
      boards.set(key, row);
      const uk = `${p.name}|${L}x${W}x${T}`;
      const u = unpriced.get(uk) || { name: p.name, cut: `${L} × ${W} × ${T}`, qty: 0, reason };
      u.qty += 1;
      unpriced.set(uk, u);
      continue;
    }
    const matId = rawHdf ? HDF_ID : mat.id;
    const key = `${matId}|${T}`;
    const row = boards.get(key) || { material: matId, thickness: T, m2: 0, perM2 };
    row.m2 += (L * W) / 1e6;
    boards.set(key, row);
    if (rawHdf) continue; // never banded, no tape

    const band = banding(p);
    if (!band.length) continue;
    tapes.set(mat.id, (tapes.get(mat.id) || 0) + band.length / 1000);
    const tape = cheapestTape(mat);
    const rate = tape && bandingRate(T, tapeSpec(tape[0]));
    if (rate) {
      const k = `${rate.maxThickness}|${rate.tape}|${rate.glue}`;
      const r = bandLabour.get(k) || {
        kind: 'banding',
        name: `board ≤${rate.maxThickness} mm · ${rate.tape} mm ABS${rate.glue === 'laser' ? ' laser' : ''}`,
        meters: 0,
        perM: rate.price,
      };
      r.meters += band.length / 1000;
      bandLabour.set(k, r);
    }
  }

  const boardRows = [...boards.values()].map((r) => ({ ...r, cost: r.perM2 ? r.m2 * r.perM2 : 0 }));
  const tapeRows = [...tapes.entries()].map(([id, meters]) => {
    const tape = cheapestTape(findMaterial(id));
    const perM = tape ? tape[1] : null;
    return { material: id, meters, perM, cost: perM ? meters * perM : 0 };
  });
  const serviceRows = [...cutting.values(), ...bandLabour.values()].map((r) => ({ ...r, cost: r.meters * r.perM }));
  const boardsTotal = boardRows.reduce((n, r) => n + r.cost, 0);
  const materialsTotal = boardsTotal + tapeRows.reduce((n, r) => n + r.cost, 0);
  const servicesTotal = serviceRows.reduce((n, r) => n + r.cost, 0);
  // Derived hardware (hinges by door height, slides per drawer, pins per
  // shelf, hooks) is listed too, priced from the catalogue when it has an
  // entry there. Hooks modelled as hardware parts are already in the map.
  const hw = hardwareList(piece);
  const derived = (name, qty) => {
    if (qty <= 0 || hardware.has(name)) return;
    const item = hardwareItem(name);
    hardware.set(name, { name, qty, product: item?.product || null, price: item?.price ?? null });
  };
  derived('hinge', hw.hingesTotal);
  derived('drawer slide pair', hw.drawers);
  derived('shelf support', hw.shelfPins);
  if (![...hardware.keys()].some((k) => k.includes('hook'))) derived('coat hook', hw.hooks);
  // Unpriced hardware still shows as a row at 0 KM (price stays null so the
  // UI can mark it as missing).
  const hardwareRows = [...hardware.values()].map((r) => ({ ...r, cost: r.price != null ? r.qty * r.price : 0 }));
  const hardwareTotal = hardwareRows.reduce((n, r) => n + (r.cost || 0), 0);
  return {
    boardRows,
    tapeRows,
    serviceRows,
    unpriced: [...unpriced.values()],
    hardware: hardwareRows,
    boardsTotal,
    materialsTotal,
    servicesTotal,
    hardwareTotal,
    total: materialsTotal + servicesTotal + hardwareTotal,
  };
}
