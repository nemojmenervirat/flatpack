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

- 2026-08-27 — Kitchen base (L-shape) + fridges: the L runs from `kitchen-south-stub`
  along the west wall, turns at the NW corner and follows `north-kitchen` to the
  fridge zone in front of `shaft-hall-1`. Authored as TWO pieces because the fit
  checker uses rectangular bboxes — one L-piece would falsely collide with
  `west-nw-corner` and reserve the whole kitchen floor.
  `kitchen-west` (1500 × 600, rot 90 at [780, 5149], fronts east): oven housing 600
  with cooktop on the worktop + 900 two-door cabinet; front clearance 600.
  `kitchen-north` (4000 × 600, rot 0 at [494, 6667], fronts south): blind corner
  panel 600 (its front is behind the west leg's worktop — hence no clearance on this
  piece, the west counter would falsely trip it), sink cabinet 800 (2 doors, basin +
  tap), 600 dishwasher opening (no plinth/bottom there), two 1000 bays with 2 pot
  drawers each (boxes on slides, 995 × 355 fronts).
  Counters: plinth 150 + carcass 720 + worktop 28 = 898 high; 18 fronts + 560 carcass
  + 22 service gap = 600 deep, worktop flush to wall. New bought piece `fridge`
  (600 × 630 × 1850 + door/handle) placed twice at x 4534 and 5158 — freestanding,
  not integrated, 40 mm ventilation gaps to the counter end and to the shaft.
  Parts can now carry `"appliance": true` (oven, cooktop, sink, tap, dishwasher):
  rendered in 3D but skipped by cutlist.js and hardware.js banding/parts table.
  Small dead corner void (x 494–798 behind the counters' meeting point) is closed
  by the corner panel. Known quirk: the derived hinge rule puts both sink-door
  hinges on the same side (rule uses whole-piece center). Fit report clean.

- 2026-08-27 — New piece `desk-master`: work desk + open shelving L in the master's
  SW corner. Shelf unit 1200 × 400 × 2000 against `room6-master-s` (two 573 columns,
  4 shelf levels, one flush with the desk top at 750); desk 1379 × 600 × 750 under
  the south window, running from the shelf unit to exactly the edge of
  wardrobe-master-2's front clearance. No doors, so authored in natural orientation,
  rot 0 at [11797, 250]; the L-notch self-reserves the knee space. Fit report clean.
- 2026-08-27 — New piece `wardrobe-master-2`: 2918 × 600 × 2600 full-height wardrobe
  along `east-1` in the master, from the south wall up to 3 mm short of the bed's
  500 mm getting-in aisle (bed headboard is on the same wall). Two hanging bays +
  shelf column, two-tier doors (4 × 725 lower + upper), doors facing west, rot 270
  at [14194, 3168]. Front clearance 600, all clear. Fit report clean.
- 2026-08-27 — New bought piece `water-heater` (100 l, 500 × 500 × 950 + pipe stubs
  and dial): wall-mounted on `bath-south` centered above the dryer, bottom at 1150
  (300 above the dryer top), top at 2100. First placement using a non-zero pos z.
  Fit report clean.
- 2026-08-27 — Laundry corner: new bought pieces `washer` and `dryer` (600 × 600 × 850,
  body + glass drum door + control panel) side by side against `bath-south`, rot 180
  facing north — washer x 13594–14194, dryer flush to the east wall at 14194–14794.
  Clear of the door swing, sink clearance and tub entry zone. Fit report clean.
- 2026-08-27 — Bathroom fitted out: `sink` and `toilet` (reused pieces, rot 90 facing
  east) on the bath side of `wc-east` — sink at y 7200–7800 near the door, toilet at
  y 8300–8800 — and a new bought piece `bathtub` (1700 × 750, rim overhanging the
  open sides, tap at the corner end) in the NE corner against `wing-north` and the
  east wall, under the window (tub 780 ≤ sill 900). All clearances clear of the door
  swing and each other. Fit report clean.
- 2026-08-27 — WC fitted out, left to right from the door: walk-in `shower` (900-wide
  full-depth cabin in the west end, tray + fixed glass panel with a 700 entry gap at
  the south-east, rain column), `sink` vanity 600 on the north wall (wall-hung
  two-door cabinet, counter, basin, tap, mirror), wall-hung `toilet` with concealed
  cistern on `wing-north` east of the sink (150-deep tiled chase, bowl, seat, flush
  plate; bowl faces south, clear of the door swing). All bought pieces
  (buildable: false); sink and toilet carry 600 front clearance, the shower entry is
  the room walkway. Parts can now carry an `opacity` (shower glass, mirror).
  Fit report clean.
- 2026-08-27 — New piece `hall-bench`: entry bench + coat rack against the north-east
  hall wall (between the entrance and WC doors, clear of both door swings). Bench
  1600 × 400, seat at 450 (28 mm), two open shoe cubbies with a mid shelf at 200
  (floor + shelf = two shoe levels per bay); above it a wall-mounted coat panel
  (1100–2000) with a hook rail at 1650 (5 hooks derived) and a 250-deep hat shelf on
  brackets at 2000. Placed rot 0 at [9196, 6849]; front clearance 600. hardware.js
  learned a hook rule (1 hook per ~280 mm of hook rail). Fit report clean.
- 2026-08-27 — Removed unused sample pieces `wardrobe` (Wardrobe 1200) and `bed`
  (files deleted, unregistered). Double-clicking a piece in the apartment view now
  jumps to its piece page. Rail buttons got instant CSS tooltips (piece name /
  action, flying out left of the rail).
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
