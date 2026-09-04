# flatpack

Text-based furniture and apartment planner. You describe furniture and rooms as JSON
(usually with AI writing the JSON for you), flatpack renders them in 3D, checks what
fits where, and generates the cut list for the pieces you'll build yourself.

No drag & drop, no 3D modeling. The design lives in text; the 3D view is just for looking.

## Why

- Everything I build is boxes (panels, carcasses, rooms) — a full CAD tool is overkill.
- JSON is data: cut lists, collision checks, and clearance checks are computed, not eyeballed.
- AI writes and edits JSON well. "Make the wardrobe 1000 wide with 4 drawers" is a text edit.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. You get a 3D view of the sample room (orbit with mouse, scroll to
zoom) and a side panel with the fit report and cut list.

## How it works

Three kinds of data, all under `src/data/`:

- **apartment.json** — the room: walls, floor, door/window openings. All boxes.
- **piece files** (`wardrobe.json`, `bed.json`, …) — one file per furniture piece.
  - Buildable pieces have `parts`: every panel with its size and position. Cut lists
    come from these.
  - Bought pieces (bed, sofa, fridge) are just an outer `size`. They participate in
    fit checks but have no cut list.
- **scene.json** — which pieces go where: `{ "piece": "wardrobe", "pos": [200, 2900, 0], "rot": 0 }`.

The app computes:

- **Fit report** — collisions (two solid things overlap, red) and clearance warnings
  (something sits where a door needs to swing or you need to walk, yellow).
- **Cut list** — every panel of every buildable piece, grouped by size, with a
  CSV export button for [cutlistoptimizer.com](https://www.cutlistoptimizer.com)
  to get the board-cutting diagram.

## Conventions

- All dimensions in **mm**.
- Sizes are `[width, depth, height]` = `[x, y, z]`, **z is up**. Positions are the
  box's min corner. (The viewer converts to three.js y-up internally — data never
  cares about that.)
- Rotations are 0/90/180/270° around vertical, counterclockwise from above, pivoting
  on the piece's local origin. Everything stays axis-aligned, which keeps all fit
  math exact and simple.
- A piece's "front" (doors, drawer fronts) faces **−y** in its local coordinates.
- `clearance` on a piece declares free space it needs: `{ "front": 600 }` means
  600 mm in front must stay empty (door swing, drawer pull, walking space).

## Kitchen build rules

`src/data/kitchen.json` is drawn the way an iverica (18 mm melamine chipboard) kitchen
is actually built, so the cut list can go straight to the board shop:

- **Separate cabinets**, each with its own two sides; runs are never one long carcass.
  Every part fits a 2800 × 2070 board; worktops come in 4100 × 600 × 38.
- **Base cabinets**: a full-width bottom with the sides standing on it (the legs screw into
  the bottom) and two full-width top rails lying flat on the sides (100 front, 80 back) instead
  of a full top, so the sides are 764 × 540; the sink cabinet has no front rail (bowl), 3 mm HDF nailed on the back. The carcass
  stands 19 mm off the wall for pipes and plaster; the 600 worktop overhangs the fronts
  by 20 mm. Oven housing: a drawer below, the oven on a fixed shelf in a 600 niche up to the worktop, no rails (hob body above, oven behind; worktop on angle brackets) and no back.
- **Legs and plinth**: the same 120 mm adjustable legs as the wardrobes, wound down to a
  100 mm plinth (carcass top 900, worktop 938), 4 per cabinet (6 over 1200 wide), 40 mm in
  from the sides; plinth recessed 50 mm, none in front of the dishwasher. The dishwasher
  must be a built-in model that adjusts down to 815 mm.
- **Fronts**: 18 mm, 3 mm reveal at cabinet edges, 4 mm between fronts. Drawer boxes
  450 deep for the 450 roller runners, 13 mm runner clearance per side, 250 high boxes
  behind 395 fronts. A sink cabinet gets doors, not drawers.
- **Corners**: the run that reaches the corner is a blind cabinet with a fixed panel; the
  first opening front on either run starts 63 mm past the other run's front plane.
- **Wall cabinets**: 332 deep, bottom at 1450 (512 above the worktop, 507 above the hob),
  top at 2500 so a 100 mm top filler with a backer closes the gap to the 2600 ceiling.
  HDF sits 20 mm in from the back edge; a 100 mm hanger rail and two hangers per
  cabinet hook a steel wall rail in that recess. Doors over 900 high get 3 hinges.
- **Fillers**: 30 mm scribe filler with a cleat at every wall end so doors clear the plaster.
- **Appliances** (`"appliance": true`) are modelled at their real installation sizes: AEG
  oven 559 × 548 × 576 with 595 × 594 fascia, 583 × 513 hob over a 560 × 490 cutout,
  Electrolux LFP326AB hood inside a 600 niche, 600 dishwasher on the floor.

## Materials

`src/data/materials.json` is a registry of boards you can actually buy: every decor
in the Elgrad retail price list (`inputs/BiH-cjenovnik-MPC-*.pdf`), with prices per
thickness, the ABS edging options, and — for the ones with a swatch photo on
elgrad.ba — the **real colour**, sampled as the mean of that photo.

Open it with the **▩** button in the sidebar: search, filter by colour family or
thickness, click a decor for its full price table and a link to the supplier.

A piece or a part can then name a decor instead of inventing a hex:

```json
{ "id": "kitchen", "material": "U708 ST9 · Svijetlo siva",
  "parts": [ { "name": "door sink", "material": "6029 OW", ... } ] }
```

Resolution order is explicit `color`, then the part's `material`, then the piece's
`material`, then the piece `color` (`src/materials.js`).

The registry also carries the price list's **services** page (`services`): cutting
per metre by board class and edge-banding labour by board thickness and tape
thickness. The piece panel's price estimate adds both to boards and tape — cutting
as each part's perimeter, banding labour on the same edges the parts table bands.
Thin boards without a decor price (HDF backs, drawer bottoms) are charged a flat raw-HDF
rate set in `src/hardware.js`. Hardware parts (`"hardware": true`) are listed under
Hardware and never cut; `src/data/hardware.json` names the bought product and its
per-piece price by part name (legs today), and the estimate adds those.

Rebuild the registry when the price list changes (drop the new PDF in `inputs/`):

```
node scripts/build-materials.mjs            # parse + fetch any new swatches
node scripts/build-materials.mjs --offline  # prices only, no network
```

Colours are the average of a supplier photo, not a colorimetric match — good enough
to tell a warm oak from a cool one, not a substitute for a physical sample.

## Typical workflow

1. Measure the room once, write `apartment.json`.
2. Describe a piece to AI → get a piece JSON with all parts.
3. Place it in `scene.json`, look at it in 3D, read the fit report.
4. Iterate in text until it fits.
5. Copy the cut list CSV into cutlistoptimizer.com, buy boards, cut, build.

## Stack

Vite + React + [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) +
[@react-three/drei](https://github.com/pmndrs/drei). Plain JavaScript, no backend,
no build magic.
