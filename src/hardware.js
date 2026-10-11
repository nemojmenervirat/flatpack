// Per-piece part details and hardware derivation for the piece view.
// Pure functions, no rendering — same spirit as geometry.js / cutlist.js.
//
// Nothing here is hand-authored on the piece: everything is derived from the
// parts by convention (fronts face -y, thickness = smallest dimension, parts
// named door* are hinged doors, drawer bottoms mark drawer boxes, ...).

import { pieceLocalBBox, frontFrame } from './geometry.js';
import { banding, RAW_HDF } from './cutlist.js';
import { findMaterial, cuttingRate, tapeSpec, bandingRate } from './materials.js';
import hardwareCatalogue from './data/hardware.json';

// Bought hardware by part name: the real product and its price per piece.
export const hardwareItem = (name) => hardwareCatalogue.items[name] || null;

const sortedDims = (size) => [...size].sort((a, b) => b - a); // [L, W, T]

// Raw HDF for backs and drawer bottoms (3-6 mm). The price list has no decor
// row for it, so thin boards without a decor price are charged this flat rate
// under the cut list's RAW_HDF label.
const HDF_PER_M2 = 8; // KM/m²
const HDF_ID = RAW_HDF;

// Parts grouped by identical name + cut size, with banding and the indices of
// the raw parts in piece.parts (so the UI can cross-highlight 3D <-> table).
export function partRows(piece) {
  const rows = new Map();
  (piece.parts || []).forEach((p, i) => {
    if (p.appliance || p.hardware) return; // bought appliances / hardware (legs, hooks) — not cut, not banded
    const [L, W, T] = sortedDims(p.size);
    const band = banding(p, piece);
    const material = p.material || piece.material || '';
    // one row per name + size (+ material, banding)
    const key = `${p.name}|${L}x${W}x${T}|${material}|${band.edges}${band.L}${band.W}|${band.tape}`;
    const row =
      rows.get(key) || {
        name: p.name,
        length: L,
        width: W,
        thickness: T,
        qty: 0,
        indices: [],
        banding: band,
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

  const hingeGroups = new Map();
  for (const p of parts) {
    if (!p.name.startsWith('door') || p.name.startsWith('door bin')) continue;
    const { w, h, hingeLeft } = frontFrame(p, bb);
    const side = hingeLeft ? 'left' : 'right';
    const key = `${w}x${h}|${side}`;
    const row =
      hingeGroups.get(key) || { doorW: w, doorH: h, side, doors: 0, perDoor: hingesPerDoor(h) };
    row.doors += 1;
    hingeGroups.set(key, row);
  }
  const hinges = [...hingeGroups.values()];
  const hingesTotal = hinges.reduce((n, g) => n + g.doors * g.perDoor, 0);
  // one bar handle per door leaf, drawer front and (non-appliance) flap - the viewer draws them
  const handles =
    hinges.reduce((n, g) => n + g.doors, 0) +
    parts.filter((p) => p.name.startsWith('drawer front') || (p.name.startsWith('flap') && !p.appliance)).length;

  const bottoms = parts.filter((p) => p.name === 'drawer bottom');
  const drawers = bottoms.length || parts.filter((p) => p.name.startsWith('drawer front')).length;
  const slideBoxDepth = bottoms.length ? sortedDims(bottoms[0].size)[1] : 0;
  // slide pairs are derived per drawer unless the runners are modelled as
  // hardware parts (then they are listed by name with the extras instead)
  const runnerHw = parts.some((p) => p.hardware && p.name.startsWith('runner'));

  const shelves = parts.filter((p) => p.name.includes('shelf') && !p.hardware).length;
  // shelf pins: explicitly modeled hardware parts when present, else 4 per shelf
  const pinHw = parts.filter((p) => p.hardware && p.name.includes('shelf pin')).length;
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
    if (!p.hardware || p.name.includes('hook') || p.name.includes('hanging') || p.name.includes('shelf pin')) continue;
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
    handles,
    drawers: runnerHw ? 0 : drawers,
    slideBoxDepth,
    shelves,
    shelfPins: pinHw || shelves * 4,
    rails,
    hooks,
    extras: [...extras.values()],
  };
}

// The hardware list as flat table rows: { qty, name, detail, product, price,
// cost } — derived items (hinges, handles, slides, pins, rails, hooks) first,
// then the explicitly modelled parts. price/cost are null when the catalogue
// has no entry for the name.
export function hardwareRows(piece) {
  const hw = hardwareList(piece);
  const rows = [];
  const push = (qty, name, detail, item = hardwareItem(name), size = null) => {
    const price = item?.price ?? null;
    rows.push({ qty, name, detail, size, product: item?.product || null, price, cost: price != null ? qty * price : null });
  };
  if (hw.hingesTotal) {
    const doors = hw.hinges.reduce((n, g) => n + g.doors, 0);
    const per = [...new Set(hw.hinges.map((g) => g.perDoor))].join('/');
    push(hw.hingesTotal, 'hinge', `${doors} door${doors > 1 ? 's' : ''}, ${per} per door`);
  }
  if (hw.handles) push(hw.handles, 'handle', 'one per door leaf and drawer front');
  if (hw.drawers) push(hw.drawers, 'drawer slide pair', hw.slideBoxDepth ? `box depth ${hw.slideBoxDepth}` : '');
  if (hw.shelves && !(piece.parts || []).some((p) => p.hardware && p.name.includes('shelf pin')))
    push(hw.shelfPins, 'shelf support', `${hw.shelves} shelves × 4`);
  for (const r of hw.rails) push(1, 'hanging rail', `${r.length} mm`);
  if (hw.hooks) push(hw.hooks, 'coat hook', '');
  // screws, staples and drilled holes are consumables, not hardware to shop
  // for: they stay out of this table (the price estimate still counts them)
  const consumable = (name) => /screw|staple|shelf hole/.test(name);
  // a runner modelled as "<x> cabinet part" + "<x> drawer part" is bought as
  // one piece: one row under <x>, counted by the cabinet parts, priced by them
  const merged = new Map();
  for (const x of hw.extras) {
    if (consumable(x.name)) continue;
    const m = x.name.match(/^(.*) (cabinet|drawer) part$/);
    if (!m) {
      push(x.qty, x.name, `${x.size.join(' × ')} mm`, hardwareItem(x.name), x.size);
      continue;
    }
    const row = merged.get(m[1]) || { qty: 0, item: null };
    if (m[2] === 'cabinet') {
      row.qty = x.qty;
      row.item = hardwareItem(x.name);
    }
    merged.set(m[1], row);
  }
  for (const [name, r] of merged) push(r.qty, name, 'cabinet + drawer profile', r.item);
  const total = rows.reduce((n, r) => n + (r.cost || 0), 0);
  return { rows, total };
}

// CSV of the hardware table: one row per item, with the detail, the catalogue
// product and the prices; a total line at the end.
export function hardwareCsv(piece) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const { rows, total } = hardwareRows(piece);
  const lines = ['Piece,Qty,Item,Detail,Product,Each (KM),Total (KM)'];
  for (const r of rows)
    lines.push([q(piece.name), r.qty, q(r.name), q(r.detail), q(r.product), r.price != null ? r.price.toFixed(2) : '', r.cost != null ? r.cost.toFixed(2) : ''].join(','));
  lines.push([q(piece.name), '', q('total'), '', '', '', total.toFixed(2)].join(','));
  return lines.join('\n');
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
  // The material's tape row for a band thickness: the cheapest tape of that
  // thickness when the piece asks for one (e.g. "band": 0.8), else the
  // cheapest tape it has at all.
  const pickTape = (mat, thickness) => {
    const rows = Object.entries(mat?.tape || {}).sort((a, b) => a[1] - b[1]);
    if (thickness != null) {
      const same = rows.filter(([k]) => tapeSpec(k).thickness === thickness);
      if (same.length) return same[0];
    }
    return rows[0] || null;
  };
  // Worktops are sold by the running metre in fixed depth x thickness formats
  // (mat.worktop["600x38"]). A part named worktop* is priced by its length in
  // the narrowest format at least as deep as the part, nearest thickness.
  const worktopFormat = (mat, depth, T) => {
    const keys = Object.keys(mat?.worktop || {})
      .map((k) => k.split('x').map(Number))
      .filter(([d]) => d >= depth)
      .sort((a, b) => a[0] - b[0] || Math.abs(a[1] - T) - Math.abs(b[1] - T));
    if (!keys.length) return null;
    const [d, t] = keys[0];
    return { depth: d, thickness: t, perM: mat.worktop[`${d}x${t}`] };
  };

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
    const isWorktop = p.name.startsWith('worktop');
    const wt = isWorktop ? worktopFormat(mat, W, T) : null;

    const cut = cuttingRate(wt ? { ...mat, worktopSection: true } : mat, T);
    if (cut) {
      const row = cutting.get(cut.key) || { kind: 'cutting', name: cut.label.replace(/^Usluga rezanja\s*/, ''), meters: 0, perM: cut.price };
      row.meters += (2 * (L + W)) / 1000;
      cutting.set(cut.key, row);
    }

    if (wt) {
      // postformed worktop: priced per metre, finished front edge, no tape
      const key = `${mat.id}|wt${wt.depth}x${wt.thickness}`;
      const row =
        boards.get(key) || { material: mat.id, thickness: wt.thickness, worktop: `${wt.depth} × ${wt.thickness} mm worktop`, meters: 0, perM: wt.perM };
      row.meters += L / 1000;
      boards.set(key, row);
      continue;
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

    const band = banding(p, piece);
    if (!band.length) continue;
    const tKey = `${mat.id}|${band.tape ?? ''}`;
    tapes.set(tKey, (tapes.get(tKey) || 0) + band.length / 1000);
    const tape = pickTape(mat, band.tape);
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

  const boardRows = [...boards.values()].map((r) => ({
    ...r,
    cost: r.worktop ? r.meters * r.perM : r.perM2 ? r.m2 * r.perM2 : 0,
  }));
  const tapeRows = [...tapes.entries()].map(([key, meters]) => {
    const [id, t] = key.split('|');
    const tape = pickTape(findMaterial(id), t === '' ? null : Number(t));
    const perM = tape ? tape[1] : null;
    return { material: tape ? `${id} · ${tape[0]}` : id, meters, perM, cost: perM ? meters * perM : 0 };
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
  derived('handle', hw.handles);
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
