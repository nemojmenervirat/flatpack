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
- Hardware/banding as authored data on the piece where the derived rule is wrong
  (hardware.js currently derives everything by convention).
- Unit tests for geometry.js and cutlist.js (vitest).
- Labels in the 3D view (piece names floating over boxes, drei `<Html>`).
- Export scene as PNG snapshot.

## Done

- 2026-08-27 — UI rework: the right side panel is gone, replaced by a 36px menu rail
  on the right — 🏠 whole apartment, a chip per piece (W5, W6, WH, B9, …), and the
  clearance-zones toggle ⛶. Current view + toggle persist in localStorage across
  refreshes. Clicking a piece opens a single-piece view: the piece alone in 3D
  (auto-framed, doors still clickable) plus a floating panel with the parts table
  (cut size, thickness, qty, edge banding per part + total), hardware list (hinges
  per door with side and count, drawer slide pairs with box depth, shelf supports,
  hanging rail lengths) and a per-piece cut-list CSV button; hovering a table row
  highlights the parts in 3D and vice versa. Apartment view keeps the fit report as
  a floating chip (only when there are issues) and a full-CSV button. New pure module
  `src/hardware.js` derives banding + hardware from parts by convention (covers the
  two "Later" items about banding/hardware; authored overrides stay in Later).
- 2026-08-27 — New piece `wardrobe-room6`: built-in wardrobe + work desk L for room 6.
  Wardrobe 2000 × 600 × 2600 filling the niche in the east wall (back against
  `niche-east`, front flush with the room's wall plane at x 11596): hanging bay +
  shelf column behind two-tier doors (2 + 2, split at 1900), and an open shelf bay
  (6 shelves, one flush with the desk top) at the south end next to the desk. Desk
  1189 × 600 × 750 along the window wall from the wardrobe to the edge of the bed's
  500 mm aisle clearance (which caps its length), top butted to the wardrobe front.
  Placed rot 270 at [10407, 3598]; no external clearance — the L-notch self-reserves
  chair + door-swing space. Fit report clean.
- 2026-08-26 — New piece `wardrobe-desk-room5`: L-shaped wardrobe + work desk in one
  connected unit in room 5. Wardrobe 2750 × 600 × 2600 (full ceiling height) along the
  west wall, running wall-to-wall from the south (window) wall up to the bed foot:
  open shelf bay at the corner next to the desk (6 shelves — one flush with the desk
  top at 750, one below, four above), then a hanging bay and a shelf column behind
  two-tier doors (4 upper + 4 lower, split at 1900 like wardrobe-hall). The shelf
  column bay has a 3-drawer block at the bottom (external fronts to 717, boxes on
  slides, lower doors over that bay start at 741). Desk 1700 × 600 × 750 along the
  south wall under the window (28 mm top butted to the wardrobe front, end panel +
  back apron); it ends at x 8299 so the loggia-7 balcony door (hinge at the nook,
  801 leaf) swings fully clear. Placed rot 90 at [8299, 250]; no external clearance —
  the L-notch
  (knee/door space) is inside the piece bbox and self-reserves. Fit report clean.
- 2026-08-26 — Skill `.claude/skills/new-piece`: step-by-step recipe for authoring new
  pieces (rotation cheat sheet, door-animation constraint, clearance semantics,
  construction rules, verify command).
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
