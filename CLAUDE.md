# CLAUDE.md — flatpack

Personal furniture/apartment planner. Furniture and rooms are defined as JSON, rendered
in 3D (react-three-fiber), with computed fit checks and cut lists. See README.md for the
full picture. **Milan doesn't design in 3D — the JSON is the source of truth; the 3D
view is read-only.** When he asks for a new piece or a change, edit the JSON.

## Conventions (do not break these)

- Units: **mm** everywhere.
- Sizes `[width, depth, height]` = `[x, y, z]`, **z up**. Positions = min corner of the box.
- Data space is z-up; three.js is y-up. Conversion happens **only** in `Viewer.jsx`
  (`three.x = x, three.y = z, three.z = y`). Never leak three.js coordinates into
  data or geometry code.
- Rotations: only 0/90/180/270 around vertical, CCW from above, pivot at local origin.
  All boxes stay axis-aligned; all placement math is AABB min/max arithmetic in
  `geometry.js`. Don't introduce arbitrary angles without a plan.
- Piece "front" (doors/drawer fronts) faces **−y** locally. Fronts sit at negative y
  (they overlay the carcass).
- Part thickness = smallest dimension; the other two are the cut size (`cutlist.js`).

## Files

- `src/geometry.js` — AABB math, placement, clearances, fit report. Pure functions, no three.js.
- `src/cutlist.js` — cut list derivation + CSV export. Pure functions.
- `src/Viewer.jsx` — the only file that knows three.js exists.
- `src/App.jsx` — layout, panels.
- `src/data/` — apartment, pieces, scene. New furniture = new JSON file here,
  registered in `piecesById` in App.jsx.

## Rules

- Plain JavaScript, not TypeScript. Keep dependencies minimal (react, three, fiber, drei —
  nothing heavy without asking).
- Keep `geometry.js` and `cutlist.js` pure (no rendering, no DOM) — they should stay
  trivially testable.
- Planned work goes in **TASKS.md**. When asked to add a feature, check TASKS.md first;
  when finishing one, move it to Done with the date.
- Never `git commit` or `git push` unless explicitly told to.
- When generating a new piece JSON: parts must not overlap the carcass geometry
  incorrectly, fronts at negative y, include a sensible `clearance`, and verify the
  cut list numbers add up against the outer size.
