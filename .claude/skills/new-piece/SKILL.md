---
name: new-piece
description: Create a new furniture piece for flatpack — design the JSON, place it in a room, register it, and verify it. Use whenever Milan asks for a new piece of furniture (wardrobe, desk, shelf, bed, combined/L-shaped units) or to move/resize an existing one.
---

# Creating a new furniture piece

The JSON is the source of truth; the 3D view is read-only. A new piece means:
piece JSON in `src/data/`, a placement in `src/data/scene.json`, registration in
`src/App.jsx`, verification via `geometry.js`.

## Order of work

1. **Read the room first.** `src/data/apartment.json` (walls/openings near the target
   spot) and `src/data/scene.json` (what already stands there). Work out the piece's
   **world-space** footprint as min/max coordinates against real wall faces before
   designing any parts. Useful interior faces are wall `pos`/`pos+size` values.
2. **Pick the rotation before authoring parts.** Doors must face local −y (see
   constraints), so decide which world direction the fronts face, then choose `rot`
   from the table below, then author parts in local coordinates that map onto the
   world footprint.
3. Author the piece JSON (schema + construction rules below).
4. Place it in `scene.json`, register it in `piecesById` in `App.jsx` (import + entry).
5. **Verify with the check command** (below) — fit report must be clean and parts must
   not overlap each other. Also hand-check that cut sizes add up to the outer size.

## Schema

```json
{
  "id": "kebab-id",            // == filename without .json
  "name": "Human name",
  "buildable": true,            // false for bought furniture (excluded from cut list)
  "color": "#c9a36b",          // default part color; parts may override
  "clearance": { "front": 600 },// optional; see clearance semantics
  "parts": [ { "name": "side", "pos": [x,y,z], "size": [w,d,h], "color": "#..." } ]
}
```

- Units mm. `size` = `[width, depth, height]` = `[x, y, z]`, z up. `pos` = min corner.
- Piece local origin: parts live in the positive octant except fronts (doors/drawer
  fronts), which overlay the carcass at 18 mm *before* the carcass front face.

## Hard constraints (things that silently break)

- **Fronts face local −y by default.** The Viewer's `Door` component (`Viewer.jsx`)
  animates any part whose name starts with `door`: width along x, 18 mm thickness
  along y, hinge auto-picked on the vertical edge farther from the *whole piece's*
  bbox center. Orient the piece so doors face −y and use `rot` to aim them. The one
  exception is a combined piece with runs facing different ways (the kitchen): a door
  or flap there sets `"face": "+x" | "-x" | "+y"` and is then thin along the other
  axis; `frontFrame()` in `geometry.js` handles it for the Viewer and the hinge count.
  `"hinge": "left" | "right"` (seen from the front) pins a door's swing when the
  bbox-center rule would pick wrong (wide merged pieces). Drawers/pullouts are −y only.
- **Clearance for an L.** Bbox-side clearances (`front`/`back`/…) span the whole bbox
  side, which is wrong for an L-piece; use explicit local boxes instead:
  `"clearance": { "zones": [{ "name", "pos", "size" }] }`.
- **Don't name non-door parts `door*`.** `drawer front` is fine (not animated).
- **Bbox is the rectangular union of all parts** (`pieceLocalBBox`), but collisions
  are only *broad-phased* on it — `fitReport` confirms every hit against the actual
  part boxes (piece-vs-piece, piece-vs-wall, and clearance-vs-piece). So another
  piece CAN sit inside an L-piece's notch (a desk chair in the knee space is fine),
  and an L-piece's bbox may span a wall as long as no part touches it. Consequence:
  the notch no longer self-reserves door-swing/knee space against other placements —
  only what physically stands there blocks it. Clearance zones still span the full
  bbox side.
- **Clearance boxes span the full bbox side**, not just the relevant part:
  `front` = −y side, `back` = +y, `left` = −x, `right` = +x, in *local* space,
  rotated with the piece. A placement can override with its own `"clearance"`.
- Rotations only 0/90/180/270, CCW from above, pivot at local origin.

## Rotation cheat sheet

`rotXY`: 90° → `(x,y)→(−y,x)`; 180° → `(−x,−y)`; 270° → `(y,−x)`.

Where local −y (the fronts) points in the world, and the world bbox of a piece with
local extent `[W, D]` (x, y) placed at `pos = [px, py]`:

| rot | fronts face world | world bbox x | world bbox y |
|-----|-------------------|--------------|--------------|
| 0   | −y (south)        | px … px+W    | py … py+D    |
| 90  | +x (east)         | px−D … px    | py … py+W    |
| 180 | +y (north)        | px−W … px    | py−D … py    |
| 270 | −x (west)         | px … px+D    | py−W … py    |

Recipe: write down the target world min/max, pick rot from the fronts row, read off
`pos` from the bbox columns, then map every part with the inverse (e.g. rot 90:
`local.x = world.y − py`, `local.y = px − world.x`).

## Construction rules

- Board 18 mm; back is 3 mm HDF inset between the sides (see `wardrobe-hall.json` as
  the reference piece). Worktops may be 28 mm.
- Cut list (`cutlist.js`): thickness = smallest dimension, other two = cut size; rows
  group by `name + sorted dims`, so give sections distinct names (`desk top`,
  `shelf column`, …) and identical repeated parts identical names.
- Doors: 3 mm reveal at outer edges, 4 mm gaps between doors, 18 mm thick, positioned
  at `y = carcassFrontY − 18`. Doors + gaps must sum exactly to the carcass width.
- Parts must never overlap each other (touching faces are fine — collision EPS is
  0.5 mm). Fronts overlap nothing because they sit fully in front of the carcass.
- Leave a small practical gap (~18 mm) to neighboring furniture rather than 0.
- Verify arithmetic: sides + bottom/top widths = outer width; panel heights + top
  thickness = outer height; shelf widths = interior width.

## Verify command

Run from the repo root; add the new piece id to `ids`. Must print `issues: none` and
`internal part overlaps: 0`.

```bash
node --input-type=module -e "
import { fitReport, aabbOf, overlaps } from './src/geometry.js';
import { readFileSync } from 'fs';
const j = (p) => JSON.parse(readFileSync('src/data/'+p+'.json','utf8'));
const scene = j('scene');
const ids = scene.placements.map(p => p.piece);
const piecesById = Object.fromEntries([...new Set(ids)].map(id => [id, j(id)]));
const r = fitReport(scene, piecesById, j('apartment'));
console.log('issues:', r.issues.length ? r.issues : 'none');
for (const [id, piece] of Object.entries(piecesById)) {
  const boxes = (piece.parts||[]).map(p => aabbOf(p.pos, p.size));
  let bad = 0;
  for (let i=0;i<boxes.length;i++) for (let k=i+1;k<boxes.length;k++)
    if (overlaps(boxes[i], boxes[k])) { bad++; console.log('OVERLAP in', id, piece.parts[i].name, 'vs', piece.parts[k].name); }
  if (bad) console.log(id, 'internal part overlaps:', bad);
}
console.log('internal part overlaps checked for all pieces');
"
```

## Room naming

Data uses the plan's numbering: `room5` (first bedroom, window south), `room6`
(bedroom at loggia 7), `master`. If Milan says "room 1 / room 2 / first room",
confirm against which bed/label he means — historically "room 1" ≈ `room5`.

## Reference pieces

- `wardrobe-hall.json` — cleanest carcass (partition, shelf column, two-tier doors).
- `kitchen.json` — the whole kitchen as one L-piece (bases + uppers, two runs): uses
  `face`, `hinge` and clearance `zones`. Generated by merging the former per-run pieces;
  edit it directly from now on.
- `wardrobe-desk-room5.json` — L-shaped combined unit authored for `rot: 90`
  (doors local −y → world +x); shows the axis-swapped local authoring.
- `bed-90.json` — a bought (`buildable: false`) piece with placement-level
  clearance override in `scene.json`.
