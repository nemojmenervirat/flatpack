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

- 2026-08-29 — Show/hide pieces toggle: 🪑 button in the sidebar header hides all
  furniture in the apartment view (bare floor plan — pairs well with the m² overlay).
  Fit report still runs; the issues chip stays visible. State persists.
- 2026-08-29 — Area audit script: `node scripts/check-areas.mjs` verifies rooms.json
  with exact rect arithmetic independent of the app — no rect overlaps within/between
  rooms, no room area on walls or door footprints, nothing off the apartment floor,
  all walkable floor claimed by a room (except doorway passages, 0.08 m²), outlines
  close. Prints per-room m² + total; exits 1 on failure. All checks pass (105.87 m²).
- 2026-08-29 — Vestibule merged into Bathroom: there is no vestibule — the 1016×598
  strip at the bathroom entrance is part of the bathroom. rooms.json now lists it as
  the bathroom's second rect: Bathroom 6.6 → 7.2 m², 9 rooms total, apartment total
  unchanged (105.9). The washer/dryer and bath pieces keep their sidebar grouping.
- 2026-08-29 — Room 6 wardrobe niche reassigned from master: the pocket at
  x 11596–12196 / y 1598–3599 is enclosed by the niche walls on three sides and opens
  only into room 6, but the generated polygons had split it 201 mm to room 6 + 399 mm
  to the master (inherited from the floor-material zones) — the orphaned master strip
  rendered as a detached slab with doubled 200.1 labels behind room 6. rooms.json now
  gives room 6 the full 600×2001 niche; room 6 9.5 → 10.3 m², master 18.5 → 17.7,
  total unchanged (105.9). Wardrobe groupings unaffected.
- 2026-08-29 — Overlay rebuilt as true polygon erosion (fixes seam pinholes): the dots
  visible in the living room were 2 cm gaps at internal T-junctions of the old
  core+bridge construction. The slab is now computed as room rects minus a 2 cm band
  along every boundary edge (bands extended past their ends to cover corners) — an
  exact L∞ erosion. padRects and trimOverlaps deleted; result is gap-free and disjoint
  by construction. Verified: 39 boxes, 0 gaps (grid probe), 0 overlaps, 0 wall
  violations.
- 2026-08-29 — rooms.json holds final exact polygons: the walkable shapes (walls, stubs,
  jambs, doorways already carved out) were generated once from the old rects via the
  wall/door subtraction pipeline, coalesced to 1–5 rects per room, and written into
  rooms.json as the source of truth. All runtime subtraction deleted from App.jsx
  (floorWalls, doorFootprints, cutBox/cutAll, netZones — ~70 lines): m² = sum of rect
  areas, outline dims trace the rects, overlay insets them 2 cm. Verified identical to
  before: per-room m², total 105.9, piece grouping, 0 overlay overlaps, 0 wall
  violations. Consequence: wall edits in apartment.json now require matching rect edits
  in rooms.json (nothing recomputes them).
- 2026-08-29 — Outline dims trace the net shape: roomEdges now runs on the room's net
  boxes (rects minus floor-level walls minus door footprints — the same shape the m²
  measures) instead of the raw rects, so notches cut by the kitchen stub, shafts, door
  jambs, and the master niche get their own dimension lines; label threshold lowered
  150 → 40 mm. Living is now 12 labeled lines (stub notch 90/29.6/90 etc.), master 14,
  hall 6 (door notch 90 + jamb jogs). All 10 room outlines verified closed.
- 2026-08-29 — Rooms as standalone polygons: rooms.json now carries its own geometry —
  each room is a union of rects (pos [x,y] mm min corner, size [w,d]) instead of
  references to apartment.json floor names. Room shapes can now differ from
  floor-material zones (e.g. a future kitchen split). All 46 placements still bucket to
  a room, per-room m² and total (105.9) unchanged. Trade-off accepted: moving a wall in
  apartment.json now requires updating rooms.json rects by hand; walls/doors are still
  subtracted from the m² automatically, so a small mismatch shows up in the overlay
  rather than silently inflating areas.
- 2026-08-29 — Rooms moved to data + loggias split: new `src/data/rooms.json` defines
  each room as a name + list of floor-rect names from apartment.json; sidebar groups,
  m² overlay, and outline dims all derive from it (name-matching ROOM_LABELS deleted;
  floors not listed in any room, e.g. thresholds, are simply excluded). Fixed the
  "6.1 m² balcony": the two loggias were one merged 'Loggias' room, so each island
  showed the sum — now Loggia 4 (3.2 m²) and Loggia 7 (3.0 m²) are separate rooms with
  their own labels; total unchanged at 105.9 m². Zone-seam bridges now only connect
  floors of the same room.
- 2026-08-29 — Outline dimensions on the area overlay: each room's zone union is traced
  as a rectilinear polygon (`roomEdges` in App.jsx — rect sides minus same-room seam
  intervals, collinear pieces merged) and every outline line gets its length in cm at
  its midpoint, nudged 240 mm into the room. Living reads as a proper L (699.9 / 560 /
  565.1 / 259.9 / 134.8 / 300.1); edges < 15 cm unlabeled. Verified all 9 room outlines
  close (opposite-direction edge sums match). Replaced the first cut (per-zone
  width/depth labels), which mislabeled merged shapes.
- 2026-08-29 — Door openings cut from areas too: door footprints from
  apartment.json openings now subtract like walls (exact for m², +20 mm pad for the
  overlay) — catches the living↔hall doorway, whose passage floor is part of the hall
  rect rather than a threshold, so the overlay no longer flowed through that door gap.
  Hall 11.6 → 11.4 m², total 106.1 → 105.9 m².
- 2026-08-29 — Doors excluded from areas: door-threshold floor rects (`*-th-*`) no longer
  count toward room m² or render in the overlay; a doorway edge pads 2 cm like a wall
  edge, so every room is a closed dark shape. Overlay slabs made opaque (#0b0d10) to make
  wall overlap errors visible. Total 107.1 → 106.1 m² (hall 11.6, room5 14.1, room6 9.5,
  master 18.5, bath 6.6, WC 3.6, loggias 6.1). Same-room zone seams (living w/e, nook,
  niche, master-ne) still bridge.
- 2026-08-29 — Area overlay lifted above the walls: the slabs render at wall top + 150 mm
  (apartment height 2600 → z 2750) as a floating plan layer, so no wall or furniture
  occludes them from any angle; labels ride at the same height.
- 2026-08-29 — Area overlay 2 cm wall padding + net-area fix: overlay slabs now keep a
  20 mm gap to every floor-level wall — each floor rect becomes a core inset 20 mm all
  around plus flush bridge strips over seam intervals (shrunk 20 mm at their ends to
  clear door jambs), then all boxes are cut by wall footprints inflated 20 mm
  (`cutBox`/`cutAll` rect-difference in App.jsx). Doing this exposed that some interior
  walls (kitchen stub, jambs, shafts, master niche) stand ON floor rects, so the m²
  numbers had counted wall footprint: areas now subtract floor-level walls —
  total 108.3 → 107.1 m² (living 35.4, hall 11.8, master 18.6, room6 9.6). Verified:
  81 overlay boxes, 0 overlaps, 0 boxes closer than 20 mm to any floor-level wall.
- 2026-08-29 — Room areas as a 3D overlay: "m²" toggle in the sidebar header (next to
  clearances) darkens every room's floor rects in the apartment view and floats a
  "room name + N.N m²" label over each room (anchored at its largest floor rect);
  a chip bottom-left shows the total (108.3 m² incl. loggias — net floor area, walls
  not counted). Areas summed straight from the floor rects in apartment.json using the
  same room labels as the piece groups (added `entry`→Hall and `th-l`→Loggias aliases
  so all 22 floor rects map to a room). Overlay meshes don't intercept hover
  (raycast disabled). Started as a sidebar list, replaced same day with this overlay.
- 2026-08-27 — Bought vs buildable in the UI: bought pieces (`buildable: false`) now get
  their own panel in the piece view — name, overall W × D × H, and how many are placed —
  instead of the meaningless cut table with banding; the cut-list panel (parts, hardware,
  CSV) is buildable-only. Sidebar rows for bought pieces carry a small "bought" tag.
  No data changes: all 31 pieces already had the right flag, and cutlist.js already
  skipped bought ones.
- 2026-08-27 — Piece browser sidebar: replaced the rail of two-letter codes (31 buttons,
  unreadable and growing) with a collapsible 240 px sidebar listing pieces by full name,
  grouped by room. Groups are derived, not maintained: each placement's world bbox center
  is matched against the apartment's floor rects (`roomAt` in App.jsx), so new furniture
  files itself automatically; pieces placed in several rooms appear in each group with a
  ×count. Filter box on top; 🏠 / clearance-toggle / collapse live in the header; state
  persists in localStorage. `RAIL_CODES` and `railCode` deleted.
- 2026-08-27 — Integrated dishwasher + flap fronts: the dishwasher in `kitchen-north`
  got a real furniture front — new buildable part `flap dishwasher` (598 × 714 × 18,
  kitchen front color, in the fronts plane with 4 mm gaps / 3 mm reveals); the dark
  appliance body pulled back behind the fronts plane (y 0, 542 deep). New `Flap`
  component in Viewer.jsx: parts named `flap*` open on click by tilting forward on a
  bottom hinge at the carcass front plane (damped, like doors/drawers) — the oven
  front (`flap oven`) folds down the same way. hardware.js bands flap fronts on all
  four edges. Fit report clean, dishwasher front now in the cut list.

- 2026-08-27 — Desk chairs everywhere + part-level collisions: new bought piece
  `desk-chair` (500 × 500 office chair: base, stem, seat at 440, backrest to 1000)
  placed 5× — two at the living desk ([700, 500] and [1500, 500]), one each at the
  room-5 desk ([7150, 500]), room-6 desk ([10750, 1848]) and master desk
  ([12700, 500]), all rot 0, tucked ~350 under their desk tops. To allow chairs
  inside the L-pieces' knee notches, `fitReport` now confirms every bbox hit at part
  level (piece-vs-piece, piece-vs-wall, clearance-vs-piece) — the bbox stays as
  broad phase; the old "chair in the knee space reports a false collision" wart is
  gone (skill doc updated; note: notches no longer self-reserve against placements).
  `desk-living` dropped its `back: 800` clearance — the chairs occupy that zone now.
  Fit report clean.

- 2026-08-27 — New piece `kitchen-upper-fridge`: cabinet over the fridges, 1304 × 600
  × 700 (z 1900–2600), rot 0 at [4494, 6667] — spans the fridge zone from the counter
  end to `shaft-hall-1`, 50 mm ventilation gap above the 1850 fridges, top aligned
  with the other uppers. 600 deep (base-run depth, ~flush with fridge fronts) unlike
  the 350 wall uppers; two 625 bays with a shelf each behind two 647 doors.
  Fit report clean.

- 2026-08-27 — Split AC on `room6-master-s` (reused pieces): `ac-indoor` rot 90 at
  [12027, 450, 2250] on the master-side face (x 11797, y 450–1350) — clears the
  desk-master shelf unit below it (2000 top vs 2250 bottom); `ac-outdoor` rot 270 at
  [11296, 1100, 1850] on the loggia-7 side of the same wall, top at 2400 (200 below
  the ceiling), matching the loggia-4 mount. Fit report clean.

- 2026-08-27 — Split AC on `living-room5`: new bought pieces `ac-indoor` (900 × 230 ×
  300 wall unit + vent flap, rot 270 at [5568, 2800, 2250] — high on the living-room
  face of the wall above the sofa chaise, top 50 under the ceiling) and `ac-outdoor`
  (800 × 300 × 550 body + fan grille + wall brackets, rot 270 at [5498, 1100, 1850] —
  on the loggia-4 side of the same wall, the only outdoor-mountable face of it,
  bracket-hung high with its top at 2400, 200 below the 2600 ceiling). Refrigerant
  run goes straight through the wall between them. Fit report clean.

- 2026-08-27 — Dining set: new bought pieces `dining-table` (2000 × 900 × 750, top on
  four 80 legs, rot 0 at [1500, 4650] — long axis east-west between the kitchen and
  the sofa) and `dining-chair` (450 × 450, seat 450, backrest to 930) placed 6× —
  three on the north edge (rot 0, facing the table) at x 1775/2275/2775, three on the
  south edge (rot 180) at x 2225/2725/3225, all touching the table edge. Originally
  at table y 5150–6050, then moved 500 south total on request: north-chair backs now
  end 649 from the kitchen counter front; the set sits west of the sofa (x ≤ 3500 vs
  sofa from 3798) so the south side is open floor. Table overlaps the kitchen west
  leg's front-clearance y-range but starts 102 east of it. Fit report clean.

- 2026-08-27 — TV corner: new piece `tv-cabinet` (1800 × 400 × 450 low media unit,
  rot 90 at [580, 2198] — back on the `west` wall at y 2198–3998, centered opposite
  the sofa's long run, two 895 doors facing east, front clearance 600) and new bought
  piece `tv` (55", 1230 panel + screen + feet, rot 90 at [450, 2483, 450] — standing
  on the cabinet top, feet verified to land on the top board). Cabinet sits clear of
  the desk's chair zone (ends y 850–1650) and the kitchen west leg (starts y 5149);
  viewing distance to the sofa front ≈ 4.2 m. Fit report clean.

- 2026-08-27 — New piece `desk-living`: work desk 2302 × 600 × 750 under the south
  living window (`window-living`, sill 900 > desk 750), rot 0 at [198, 250] — runs
  wall-to-wall from the `west` wall face to x 2500. Right end capped at 2500 so the
  loggia-4 balcony door (801 leaf, hinge at [3199, 399], swings west into the room)
  stays clear of the desk — swing arcs aren't fit-checked yet, verified by hand.
  28 mm top on two end panels + back apron (desk-master pattern). Clearance authored
  as `back: 800` — at rot 0 the knee side faces world +y, which is the piece-local
  back side. Started 1600 wide centered on the window, extended to the west wall
  same day. Fit report clean.

- 2026-08-27 — New bought piece `sofa-corner`: L-shaped sofa 3000 × 2000 × 800 in the
  living room's SE corner, rot 0 at [3798, 1598] — long run (3000) back against
  `living-room5` (y 1598–4598, 800 clear of the living-door swing at 5399), short run
  (2000) back under the loggia-4 window (`parapet-loggia4` / `loggia4-north-*`, back
  800 < sill 900, fully wall-backed x 3798–5798). Feet + bases, backs, one west
  armrest, seat and back cushions. Note: "under the window" resolved to the loggia-4
  window — the south `window-living` doesn't meet `living-room5` (the loggia sits
  between), so an L touching both is impossible. Started as 2400 × 2400, resized to
  300 × 200 cm same day. No clearance — the L-notch self-reserves the lounge space.
  Fit clean.

- 2026-08-27 — Kitchen uppers: two wall-cabinet pieces above the base L.
  `kitchen-upper-north` (4000 × 350 × 1150, z 1450–2600 to the ceiling, rot 0 at
  [494, 6917]): partitions aligned with the base run below; two-tier doors split at
  2150 (594 over the corner, 5 × 516 over the right half); open shelf bay over the
  sink (three display levels, no fronts); every bay gets shelves at 1800 and 2146.
  `kitchen-upper-west` (1500 × 350, carcass z 1600–2600, rot 90 at [530, 5149]):
  mounted 150 higher for the hood — 480-deep hood visor (appliance part) at z 1560
  over the cooktop (654 above the hob), hood bay + two-door bay above, front
  clearance 600. North uppers carry no clearance (same corner reason as the base).
  Uppers depth 350 = 332 carcass + 18 fronts; no cabinets above the freestanding
  fridges. Fit report clean, cut list verified.

- 2026-08-27 — Clickable drawers in the viewer: parts named `drawer front` slide out
  on click with the same damped animation as doors (new `Drawer` group in Viewer.jsx,
  translation along local −y, pull = 80% of box depth). The front takes its box parts
  (`drawer bottom` / `drawer box *`) along — grouped spatially by whose front x/z span
  contains the box part's center, no authoring change needed. Works in both the
  apartment view and the single-piece view (hover/table cross-highlight preserved).

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
