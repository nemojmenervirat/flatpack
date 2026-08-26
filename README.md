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

Roadmap lives in [TASKS.md](TASKS.md).
