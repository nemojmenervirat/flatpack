// The material registry: real boards from the Elgrad price list, each with the
// colour sampled from the supplier's swatch photo. Built by
// scripts/build-materials.mjs — do not hand-edit src/data/materials.json.
//
// A piece or a part can name a decor instead of inventing a colour:
//
//   { "id": "kitchen-north", "material": "U708 ST9 · Svijetlo siva", ... }
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
