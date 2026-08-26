# TASKS

Planning file for flatpack. New ideas go under **Later**, get pulled into **Next** when
they're wanted, **Now** is what's actively being worked on. Finished items move to
**Done** with a date.

## Now

_(empty)_

## Next

- Parametric generators: a function/prompt template that takes (type, W, D, H, options)
  and emits a piece JSON — wardrobe, bookshelf, kitchen carcass. Removes hand-writing parts.
- Door swing arcs: model door swings (room doors and wardrobe doors) as clearance
  shapes so the fit report catches "door hits the bed".
  (Viewer half done 2026-08-26: furniture parts named `door*` open/close on click with
  a damped swing animation, hinge auto-picked on the outer edge. Room doors too: door
  openings render as 40mm leaves swinging per `hinge`/`swing` fields in apartment.json.
  Fit-report arcs still open.)
- Top-down floor-plan camera + front elevation views (canned camera buttons).

## Later

- Scene editing without touching JSON: select a piece, nudge with arrow keys, rotate
  with R, write the change back to scene.json.
- GLB models for bought furniture: `"model": "bed.glb"` field on a piece, scaled into
  its bounding box; boxes remain the source of truth for fit checks.
- Multiple rooms / whole apartment: rooms as named groups, doorways connecting them.
- Delivery-path check: can the assembled piece travel from the apartment door to its
  target room (corridor widths, turns)?
- Board count / cost estimate: given board size and price, compute boards needed and
  rough cost directly in the app (before cutlistoptimizer).
- Wall openings by subtraction (CSG) instead of hand-split wall segments.
- Edge banding lengths in the cut list (perimeter of visible edges).
- Hardware list per piece: hinges, drawer slides, screws, rail — as data on the piece.
- Unit tests for geometry.js and cutlist.js (vitest).
- Labels in the 3D view (piece names floating over boxes, drei `<Html>`).
- Export scene as PNG snapshot.

## Done

- 2026-08-26 — Door styles: openings carry a `"style"` field (`entrance` brown solid,
  `balcony` glass with white border, `inner` plain white, `living` white with glass
  middle); Viewer composes each leaf from parts (`doorLeafParts`). Unstyled doors
  default to `inner`.
- 2026-08-26 — New piece `wardrobe-hall` (1700 × 600 × 2600 full height): graphite
  carcass, sage two-tier doors (3 + 3), hanging bay + shelf column. Placed in the hall
  against `north-hall`; replaces the temporary second placement of the bedroom wardrobe.
- 2026-08-26 — Door added at the living room entrance (90/210, `door-living-V2`): the
  145 cm open passage between hall and living got a door + 55 cm jamb + lintel. Not on
  the architectural plan (open passage there) — owner's choice.
- 2026-08-26 — Fixed mirrored view: the data→three.js mapping used `three.z = +y`,
  which flips handedness and mirrors the plan. Now `three.z = -y` (Viewer.jsx and
  CLAUDE.md updated). Data files were always correct — render-only bug.
- 2026-08-26 — Apartment re-traced from the architectural plan `src/data/apartment1.pdf`
  (replaces the electrical-plan trace). Scale locked to the plan's dimension chains;
  doors from the V1–V4 schedule (V1 100/210, V2 90/210, V3 80/210, V4 80/210), windows
  from types 1–4 with sill heights; loggia doors 80/240. QA: flood-filled room areas
  match the plan's room schedule within ±0.3 m² (bath 7.15 vs 7.21, master 17.63 vs
  17.73, hall+living+kitchen 47.18 vs 46.96). Remaining assumption: ceiling height 2600.

- 2026-08-26 — Arrow-key camera panning (OrbitControls keyEvents on window); default
  camera and shadow camera re-framed for the real apartment size.
- 2026-08-26 — Dimension labels in the 3D view, shown on hover: pointing at a wall,
  door/window, or piece highlights it and floats its size in cm above it
  (drei `<Html>`, scales with distance). Walls show length, openings width,
  pieces W × D × H.
- 2026-08-26 — Real apartment (L2-39/40, Lamela 2) traced from `src/data/apartment.pdf`
  into `apartment.json`: walls, door gaps with lintels, windows, loggias with railings.
  Scale calibrated from the plan's 200/180 cm dimension lines (~±5 cm accuracy). Sample
  placements moved into bedroom 10.1. Unverified guesses: window sill heights, bathroom
  wing internals, bathroom windows on the north side.
- 2026-08-26 — v0 scaffold: JSON schema (apartment / pieces / scene), 3D viewer with
  shadows and orbit controls, fit report (collisions + clearance warnings), cut list
  with CSV export, sample room with wardrobe + bed.
