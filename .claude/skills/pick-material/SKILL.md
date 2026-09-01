---
name: pick-material
description: Search the real-board registry (src/data/materials.json, Elgrad price list) to pick a material/decor for a piece or part. Use whenever Milan asks to find, choose, compare, or price a board, decor, colour, or worktop — or asks "what materials do we have like X".
---

# pick-material

`src/data/materials.json` is the generated registry of real boards from the Elgrad
price list: ~350 materials across four sections — `iverica` (melamine chipboard,
cheap, mostly Egger/Kronospan), `iveral` (premium decors, e.g. Cleaf), `gloss`
(high-gloss fronts), `worktop` (kitchen worktops, priced per m¹ not m²).
Prices are KM; panel prices are KM/m². **Never hand-edit the file** (rebuilt by
`node scripts/build-materials.mjs`).

## How to search

Run the bundled script from the repo root:

```
node .claude/skills/pick-material/find-material.mjs [terms...] [options]
```

- Terms are diacritic/case-insensitive and match id, code, name, brand, texture.
  Names are mostly Bosnian/Croatian — search both languages when it helps
  (oak = `hrast`, white = `bijela`, grey = `sivi/siva`, walnut = `orah`,
  black = `crna`, beige = `bez`, concrete = `beton`, marble = `mramor`).
- `--section iverica|iveral|gloss|worktop` (repeatable), `--brand egger`,
  `--thickness 18` (only materials available in that panel thickness),
  `--max 40` (max price), `--limit 30`, `--json` for full records.
- `--color '#b08968'` sorts by closeness to the swatch colour (Δ = RGB distance)
  instead of by term relevance — good for "something warm/light/dark like this".
- No arguments → per-section summary with counts and price ranges.

## Picking and applying

1. Search broadly first (term or colour), then narrow with `--section`/`--thickness`.
   Carcass/shelf boards are usually 18mm `iverica`; visible fronts may justify
   `iveral`/`gloss`; worktops only for desk/kitchen tops.
2. Present Milan 2–4 candidates with **id, price, thickness, brand, colour hex** and
   let the price difference be visible. He decides; don't silently pick the premium one.
3. Apply by setting `"material": "<id>"` (the exact quoted id from the script output —
   ids like `"W960 SM · Klasična bijela"` include the `·` separator) on the piece or
   an individual part, replacing any `color`. `partColor()` in `src/materials.js`
   resolves it for the viewer, and the cut list picks up real prices.
4. Sanity-check that the chosen material has a panel entry matching the part
   thickness used in the piece JSON (e.g. 18mm parts need `"panel": {"18": …}`).
