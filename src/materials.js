// The material registry: real boards from the Elgrad price list, each with the
// colour sampled from the supplier's swatch photo. Built by
// scripts/build-materials.mjs — do not hand-edit src/data/materials.json.
//
// A piece or a part can name a decor instead of inventing a colour:
//
//   { "id": "kitchen", "material": "U708 ST9 · Svijetlo siva", ... }
//   { "name": "door sink", "material": "6029 OW", ... }
//
// Resolution order for a part is explicit colour, then the part's material,
// then the piece's material, then the piece colour. Pure — no DOM, no three.js.

import registry from './data/materials.json';

export const materials = registry.materials;
export const materialsMeta = {
  source: registry.source,
  currency: registry.currency,
  units: registry.units,
  note: registry.note,
};

export const materialIds = Object.keys(materials);

// Labour prices (page 12 of the price list, KM per running metre): cutting by
// board class, edge banding by board-thickness band x tape thickness.
export const services = registry.services || null;

// Cutting class for a part: worktops and gloss boards have their own rate,
// otherwise it goes by thickness, with the basic whites (W960 / W908 / 116)
// a little cheaper in the 10-18 mm band.
export function cuttingRate(mat, thickness) {
  const c = services?.cutting;
  if (!c) return null;
  const pick = (key) => (c[key] ? { key, ...c[key] } : null);
  if (mat?.worktopSection || mat?.section === 'worktop') return pick('worktop');
  if (mat?.section === 'gloss') return pick('gloss');
  if (thickness <= 8) return pick('thin');
  if (thickness <= 18) return (/^(W960|W908|116)$/.test(mat?.code || '') && pick('panel-thin-white')) || pick('panel-thin');
  if (thickness <= 28) return pick('panel-25');
  return pick('panel-38');
}

// Tape keys read "<thickness>/<width>": "0,8/23", "2 (1,5)/43", "laser 1/23".
export function tapeSpec(key) {
  const m = String(key).replace(/laser/i, '').trim().match(/^(\d+(?:,\d+)?)/);
  return { thickness: m ? Number(m[1].replace(',', '.')) : 1, laser: /laser/i.test(key) };
}

// Banding labour per metre: the thinnest board band that fits, standard glue
// (laser rows for laser tape), ABS column of the tape's thickness or the next
// one up (there is no 0.4 mm column, so 0.4 mm tape is charged as 0.5).
export function bandingRate(thickness, tape) {
  const rows = services?.banding;
  if (!rows) return null;
  const fits = (glue) =>
    rows.filter((r) => r.glue === glue && r.maxThickness >= thickness).sort((a, b) => a.maxThickness - b.maxThickness)[0];
  const row = (tape.laser && fits('laser')) || fits('standard');
  if (!row) return null;
  const cols = Object.keys(row.abs).map(Number).sort((a, b) => a - b);
  if (!cols.length) return null;
  const col = cols.find((c) => c >= tape.thickness) ?? cols[cols.length - 1];
  return { price: row.abs[String(col)], maxThickness: row.maxThickness, tape: col, glue: row.glue };
}

// Ids carry the decor name after "·" when a code has variants, so a piece may
// name either the full id or just the code+texture, whichever reads better.
export function findMaterial(id) {
  if (!id) return null;
  if (materials[id]) return materials[id];
  const prefix = `${id} ·`;
  const hit = materialIds.find((k) => k.startsWith(prefix));
  return hit ? materials[hit] : null;
}

export function materialColor(id) {
  return findMaterial(id)?.color || null;
}

export function partColor(part, piece, fallback = '#c9a36b') {
  return (
    part.color ||
    materialColor(part.material) ||
    materialColor(piece?.material) ||
    piece?.color ||
    fallback
  );
}

// Cheapest listed thickness price, used to sort and to show "from X KM/m²".
export function fromPrice(m) {
  const all = [...Object.values(m.panel || {}), ...Object.values(m.worktop || {})];
  return all.length ? Math.min(...all) : null;
}

export function thicknesses(m) {
  return Object.keys(m.panel || {})
    .map(Number)
    .sort((a, b) => a - b);
}

// Rough colour family, for filtering a 348-row list down to "the beige ones".
// Hue/saturation of the sampled mean; wood decors land in yellow/orange and
// are split out by name because their hue says little.
export function family(m) {
  if (!m.color) return 'unknown';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(m.color.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (/hrast|orah|jasen|bukva|breza|trešnj|bor|drvo|wood|oak|nussbaum|jela |smrek/i.test(m.name)) return 'wood';
  if (s < 0.08) return l > 0.75 ? 'white' : l > 0.3 ? 'grey' : 'black';
  const h =
    (max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) *
    60;
  if (h < 20 || h >= 330) return 'red';
  if (h < 45) return s < 0.3 ? 'beige' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}
