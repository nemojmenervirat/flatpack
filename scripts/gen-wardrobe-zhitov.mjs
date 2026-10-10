// Generates src/data/apartments/gallery/pieces/wardrobe-zhitov-1100.json from
// a handful of dimensions. The JSON stays the source of truth for the app;
// this script is how it was produced, so a size change is a parameter change
// here plus `node scripts/gen-wardrobe-zhitov.mjs`.
//
// Build: two carcasses like the hall wardrobe — a lower drawer carcass on legs
// and an upper carcass stacked on it — plus a full-height end panel on the
// exposed right side, no top filler (the room ceiling is above the top), a plinth
// clipped to the legs, two drawers, two doors, a hanging rail on the left and
// four adjustable shelves on the right. Every fastener is a hardware part.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- parameters (mm)
const W = 1100; // overall width, end panel included
const D = 600; // overall depth, doors included
const H = 2450; // carcass height (drawing)
const CEILING = 2515; // room ceiling (not touched; no top filler)
const T = 18; // board
const HDF = 3; // back
const LEG = 100;
const LOWER_INNER = 314; // drawer compartment height
const TOP_COMP = 400; // compartment under the top
const ADJ_Z = [784, 1072, 1392, 1680]; // adjustable shelves in the right column (on the 32 grid: pin centre = z - 2.5 = 749.5 + 32k)
const SHELF_SETBACK = 27;
const RUNNER = 550;
const BOX_H = 250;
const DRAWER_FRONT_H = 344;
const MAT = 'U156 ST9';
const WHITE = 'W960 SM · Klasična bijela';

// ---- derived
const carcassW = W - T; // end panel outside
const boardD = D - T - HDF; // fronts in front, HDF behind
const hdfY = boardD;
const rightSideX = carcassW - T;
const inner = carcassW - 2 * T;
const col = (inner - T) / 2;
const partX = T + col; // partition
const rightX = partX + T; // right column start
const shelfD = boardD - 3;
const adjD = boardD - SHELF_SETBACK;
const boxD = RUNNER + 5;
const z = {
  bottomLower: LEG,
  sideLower: LEG + T,
  topLower: LEG + T + LOWER_INNER,
  bottomUpper: LEG + T + LOWER_INNER + T,
  sideUpper: LEG + T + LOWER_INNER + 2 * T,
  top: H - T,
  shelfTop: H - T - TOP_COMP - T,
};
const sideUpperH = z.top - z.sideUpper;
const partUpperH = z.shelfTop - z.sideUpper;
const drawerFrontZ = LEG + 3;
const doorZ = drawerFrontZ + DRAWER_FRONT_H + 4;
const doorH = H - 3 - doorZ;
// door widths: 3 reveal at the wall, 4 between, 5 to the end panel, gap centred on the partition
const d1 = partX + T / 2 - 2 - 3;
const d2 = carcassW - 5 - (3 + d1 + 4);
const hingeZ = (() => {
  const n = doorH < 900 ? 2 : doorH < 1600 ? 3 : doorH < 2100 ? 4 : 5;
  return Array.from({ length: n }, (_, i) => doorZ + 100 + ((doorH - 200) * i) / (n - 1));
})();

const parts = [];
const B = (name, pos, size, material = MAT) => parts.push({ name, pos, size, material });
const HW = (name, pos, size, color = '#4a4e55', extra = {}) => parts.push({ name, pos, size, color, metal: true, hardware: true, ...extra });
const confirmat = (pos, axis) => HW('confirmat screw', pos, axis === 'z' ? [7, 7, 50] : [50, 7, 7]);
const staple = (pos, axis) => HW('staple', pos, axis === 'z' ? [2, 2, 20] : [2, 20, 2], '#9aa0a8');
const wood30 = (pos, axis) => HW('wood screw 4x30', pos, axis === 'x' ? [30, 4, 4] : axis === 'y' ? [4, 30, 4] : [4, 4, 30]);
const Y3 = [150, 300, 450];
const spread = (n, from, to) => Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));

// ---- legs: three along the front, three along the back, the middle pair under the partition
const legX = [30, partX + T / 2 - 25, carcassW - 80];
for (const x of legX) for (const y of [50, boardD - 110]) HW('leg', [x, y, 0], [50, 50, LEG], '#1c1c1e');
const legBackY = boardD - 110;

// ---- lower carcass
B('bottom lower', [0, 0, z.bottomLower], [carcassW, boardD, T]);
B('side lower', [0, 0, z.sideLower], [T, boardD, LOWER_INNER]);
B('side lower', [rightSideX, 0, z.sideLower], [T, boardD, LOWER_INNER]);
B('partition lower', [partX, 3, z.sideLower], [T, shelfD, LOWER_INNER]);
B('top lower', [0, 0, z.topLower], [carcassW, boardD, T]);
parts.push({ name: 'back HDF lower', pos: [0, hdfY, z.bottomLower], size: [carcassW, HDF, z.bottomUpper - z.bottomLower], color: '#ffffff' });
for (const y of Y3) {
  for (const cx of [T / 2, partX + T / 2, rightSideX + T / 2]) confirmat([cx - 3.5, y - 3.5, z.bottomLower - 2], 'z'); // bottom -> sides + partition, from below, cap 2 proud
}
for (const y of Y3) for (const cx of [T / 2, rightSideX + T / 2]) confirmat([cx - 3.5, y - 3.5, z.topLower + T - 50], 'z'); // top lower -> sides, from above, flush
for (const y of [100, 300, 500]) confirmat([partX + T / 2 - 3.5, y - 3.5, z.topLower + T - 50], 'z'); // top lower -> partition

// ---- upper carcass
B('bottom upper', [0, 0, z.bottomUpper], [carcassW, boardD, T]);
B('side upper', [0, 0, z.sideUpper], [T, boardD, sideUpperH]);
B('side upper', [rightSideX, 0, z.sideUpper], [T, boardD, sideUpperH]);
B('partition upper', [partX, 3, z.sideUpper], [T, shelfD, partUpperH]);
B('shelf top', [T, 3, z.shelfTop], [inner, shelfD, T]);
B('top upper', [0, 0, z.top], [carcassW, boardD, T]);
parts.push({ name: 'back HDF upper', pos: [0, hdfY, z.bottomUpper], size: [carcassW, HDF, H - z.bottomUpper], color: '#ffffff' });
for (const y of Y3) for (const cx of [T / 2, rightSideX + T / 2]) confirmat([cx - 3.5, y - 3.5, z.bottomUpper], 'z'); // bottom upper -> sides, from below, flush
for (const y of [100, 300, 500]) confirmat([partX + T / 2 - 3.5, y - 3.5, z.bottomUpper], 'z'); // bottom upper -> partition
for (const y of Y3) {
  confirmat([0, y - 3.5, z.shelfTop + T / 2 - 3.5], 'x'); // shelf top <- left side, flush
  confirmat([rightSideX + T - 50, y - 3.5, z.shelfTop + T / 2 - 3.5], 'x'); // <- right side, flush
  confirmat([partX + T / 2 - 3.5, y - 3.5, z.shelfTop + T - 50], 'z'); // shelf top -> partition, from above, cap on the shelf
  for (const cx of [T / 2, rightSideX + T / 2]) confirmat([cx - 3.5, y - 3.5, z.top - 32], 'z'); // top -> sides, from above, flush (nothing covers the top, keep it clean)
}
// stacking: four 4x30 down through the upper bottom into the lower top, from inside
for (const x of spread(4, 150, carcassW - 150)) wood30([x - 2, 298, z.bottomUpper - 10], 'z');

// ---- back staples (through the HDF into the rear edges), every ~150
const stapleY = hdfY + HDF - 20;
for (let zz = 200; zz <= 2400; zz += 150) {
  staple([T / 2 - 1, stapleY, zz - 1], 'y');
  staple([rightSideX + T / 2 - 1, stapleY, zz - 1], 'y');
  if (zz <= z.shelfTop - 60) staple([partX + T / 2 - 1, stapleY, zz - 1], 'y');
}
const rowX = spread(7, 100, carcassW - 100);
for (const zz of [z.bottomLower + T / 2, z.topLower + T / 2, z.bottomUpper + T / 2, z.shelfTop + T / 2, z.top + T / 2])
  for (const x of rowX) staple([x - 1, stapleY, zz - 1], 'y');


// ---- plinth clipped to the front legs
B('plinth front', [3, 20, 0], [carcassW - 6, T, LEG]);
for (const x of legX) HW('plinth clip', [x + 10, 38, 20], [30, 12, 50], '#1c1c1e');

// ---- end panel on the exposed right side, screwed from inside through the side
B('end panel', [carcassW, -T, 0], [T, D, H]);
for (const y of [80, 500]) for (const zz of [400, 1300, 2200]) wood30([rightSideX - 2, y - 2, zz - 2], 'x');

// ---- hanging column: rail between two holders
const railZ = z.shelfTop - 74 - 30;
HW('rail holder', [T, 280, railZ - 5], [10, 40, 40], '#9aa0a8');
HW('rail holder', [partX - 10, 280, railZ - 5], [10, 40, 40], '#9aa0a8');
HW('hanging rail', [T + 10, 285, railZ], [col - 20, 30, 30], '#9aa0a8');

// ---- right column: adjustable shelves on pins, two spare holes above and below each
const blocked = (zc) => hingeZ.some((h) => zc + 2.5 < h + 24 && h - 24 < zc + 2.5 + T);
for (const sz of ADJ_Z) {
  B('shelf column', [rightX, SHELF_SETBACK, sz], [col, adjD, T]);
  for (const y of [50, 550]) {
    HW('shelf pin', [partX + T / 2, y - 2.5, sz - 5], [18, 5, 5], '#9aa0a8');
    HW('shelf pin', [rightSideX - 9, y - 2.5, sz - 5], [18, 5, 5], '#9aa0a8');
  }
  for (const k of [-2, -1, 1, 2]) {
    const zc = sz - 2.5 + 32 * k;
    if (blocked(zc)) continue;
    for (const y of [50, 550]) for (const x0 of [rightX, rightSideX - 1])
      parts.push({ name: 'shelf hole', pos: [x0, y - 2.5, zc - 2.5], size: [1, 5, 5], disc: true, color: '#2b2d31', hardware: true });
  }
}

// ---- drawers: one per column in the lower carcass
const drawer = (x0, fx, fw) => {
  B('drawer front', [fx, -T, drawerFrontZ], [fw, T, DRAWER_FRONT_H]);
  HW('runner 550 cabinet part', [x0, 0, z.sideLower], [6, RUNNER, 35], '#9aa0a6');
  HW('runner 550 cabinet part', [x0 + col - 6, 0, z.sideLower], [6, RUNNER, 35], '#9aa0a6');
  HW('runner 550 drawer part', [x0 + 6, 0, z.sideLower], [7, RUNNER, 20], '#9aa0a6');
  HW('runner 550 drawer part', [x0 + col - 13, 0, z.sideLower], [7, RUNNER, 20], '#9aa0a6');
  const bw = col - 26;
  const sL = x0 + 13;
  const sR = x0 + col - 31;
  parts.push({ name: 'drawer bottom', pos: [sL, 0, z.sideLower], size: [bw, boxD, 6], color: '#d9bf94' });
  B('drawer box side', [sL, 0, z.sideLower + 6], [T, boxD, BOX_H], WHITE);
  B('drawer box side', [sR, 0, z.sideLower + 6], [T, boxD, BOX_H], WHITE);
  B('drawer box front', [sL + T, 0, z.sideLower + 6], [bw - 2 * T, T, BOX_H], WHITE);
  B('drawer box back', [sL + T, boxD - T, z.sideLower + 6], [bw - 2 * T, T, BOX_H], WHITE);
  const zs = [z.sideLower + 6 + 56, z.sideLower + 6 + 176];
  for (const zz of zs) for (const y of [9, boxD - 9]) {
    confirmat([sL, y - 3.5, zz - 3.5], 'x'); // through the left box side, flush
    confirmat([sR + T - 50, y - 3.5, zz - 3.5], 'x'); // through the right box side, flush
  }
  for (const y of spread(4, 60, boxD - 35)) {
    staple([sL + 8, y - 1, z.sideLower], 'z');
    staple([sR + 8, y - 1, z.sideLower], 'z');
  }
  for (const x of spread(3, x0 + 120, x0 + col - 120)) {
    staple([x - 1, 8, z.sideLower], 'z');
    staple([x - 1, boxD - 8, z.sideLower], 'z');
  }
  for (const x of [x0 + 120, x0 + col - 120]) for (const zz of zs) wood30([x - 2, -10, zz - 2], 'y'); // front, from inside the box
};
drawer(T, 3, d1);
drawer(rightX, 3 + d1 + 4, d2);

// ---- doors
B('door', [3, -T, doorZ], [d1, T, doorH]);
B('door', [3 + d1 + 4, -T, doorZ], [d2, T, doorH]);

// ---- assembly
const S = (title, parts, note, extra = {}) => ({ title, parts, note, ...extra });
const x0L = T;
const stageL = 'left drawer';
const up = 'upper carcass';
const assembly = [
  S('Lower carcass: bottom', ['bottom lower'], 'Start with the bottom panel of the drawer carcass, front edge forward.', { view: 'above' }),
  S('Legs', ['leg'], 'Screw the six adjustable legs to its underside: three along the front edge, three along the back, the middle pair under the partition line. Wind them fully down to 100 mm (they adjust 100-150, so levelling later only goes up).', { view: 'below' }),
  S('Lower carcass: left side', [{ name: 'side lower', x: 0 }], `Stand the left side (${LOWER_INNER} tall) on the bottom, flush at the front, three confirmats from below through the bottom.`, { view: 'below' }),
  S('Lower carcass: right side', [{ name: 'side lower', x: rightSideX }], 'Same for the right side: three confirmats from below.', { view: 'below' }),
  S('Lower carcass: partition', ['partition lower'], `The short partition ${col} from the left side, three confirmats from below.`, { view: 'below' }),
  S('Lower carcass: top', ['top lower'], 'Lay the full-width top over the sides and the partition and fix it from above: three confirmats into each side and three into the partition, heads flush, the upper carcass will sit on them.', { view: 'above' }),
  S('Lower carcass: back', ['back HDF lower'], 'Square it and staple the lower HDF back over the rear faces of bottom, sides, partition and top.', { view: 'back' }),
  S('Upper carcass: bottom', ['bottom upper'], 'On the bench, start the upper carcass with its bottom panel.', { stage: up, view: 'above' }),
  S('Upper carcass: left side', [{ name: 'side upper', x: 0 }], `Stand the left side (${sideUpperH} tall) on it, three confirmats from below through the bottom, heads flush.`, { stage: up, view: 'below' }),
  S('Upper carcass: right side', [{ name: 'side upper', x: rightSideX }], 'Same for the right side.', { stage: up, view: 'below' }),
  S('Upper carcass: partition', ['partition upper'], `The partition ${col} from the left side, up to where the top shelf will sit, three confirmats from below.`, { stage: up, view: 'below' }),
  S('Upper carcass: top shelf', ['shelf top'], `The full-width shelf ${TOP_COMP} under the top: three confirmats through each side and three down into the partition.`, { stage: up, view: 'above' }),
  S('Upper carcass: top', ['top upper'], 'Lay the top over the sides and fix it from above with three confirmats into each side, heads flush.', { stage: up, view: 'above' }),
  S('Upper carcass: back', ['back HDF upper'], 'Square it and staple the upper HDF back over the rear faces of bottom, sides, partition, top shelf and top.', { stage: up, view: 'back' }),
  S('Stack the upper carcass', [{ name: 'wood screw 4x30', z: z.bottomUpper - 10 }], 'Lift the upper carcass onto the lower one, flush at the front and both sides, and screw it down from inside: four screws through its bottom into the lower top.', { install: up, view: 'front' }),
  S('Plinth', ['plinth front', 'plinth clip'], 'Clip the plinth to the three front legs.', { view: 'front-below' }),
  S('Rail holders', ['rail holder'], 'Screw the two rail holders to the left side and the partition, 74 under the top shelf.', { view: 'front' }),
  S('Hanging rail', ['hanging rail'], 'Drop the rail into the holders.', { view: 'front' }),
  S('Shelf pins', ['shelf pin'], 'Push four pins into the chosen holes for each adjustable shelf.', { view: 'front' }),
  S('Adjustable shelves', ['shelf column'], `Lay the ${ADJ_Z.length} adjustable shelves on their pins.`, { view: 'front' }),
  S('Left drawer: box sides and ends', [{ name: 'drawer box side', x: x0L + 13 }, { name: 'drawer box side', x: x0L + col - 31 }, { name: 'drawer box front', x: x0L + 31 }, { name: 'drawer box back', x: x0L + 31 }], 'On the bench: the two sides stand outside the front and back pieces, two confirmats per corner through the sides, heads flush on the outside so the runners clear them.', { stage: stageL, view: 'above' }),
  S('Left drawer: bottom', [{ name: 'drawer bottom', x: x0L + 13 }], 'Square the box and staple the 6 mm HDF bottom under it.', { stage: stageL, view: 'below' }),
  S('Left drawer: runner, drawer part', [{ name: 'runner 550 drawer part', x: x0L + 6 }, { name: 'runner 550 drawer part', x: x0L + col - 13 }], 'Screw the drawer profile of each runner along the bottom edge of the box sides, wheel at the back, flush with the box front.', { stage: stageL, view: 'front-below' }),
  S('Left drawer: runner, cabinet part', [{ name: 'runner 550 cabinet part', x: x0L }, { name: 'runner 550 cabinet part', x: x0L + col - 6 }], 'In the lower carcass: screw the cabinet profile of each runner to the compartment faces, flat on the bottom panel, wheel at the front, flush with the carcass front.', { view: 'front-above' }),
  S('Left drawer: slide in', [], 'Lift the box, tilt it so the drawer wheels pass over the cabinet wheels, and roll it in. Check it runs freely.', { install: stageL, view: 'front' }),
  S('Left drawer: front', [{ name: 'drawer front', x: 3 }], 'Hold the front against the box, aligned with the doors above (3 at the wall, 4 between, 5 at the end panel), and screw it on from inside the box with four screws.', { view: 'front' }),
  S('Right drawer', [
    { name: 'runner 550 cabinet part', x: rightX }, { name: 'runner 550 cabinet part', x: rightX + col - 6 },
    { name: 'runner 550 drawer part', x: rightX + 6 }, { name: 'runner 550 drawer part', x: rightX + col - 13 },
    { name: 'drawer box side', x: rightX + 13 }, { name: 'drawer box side', x: rightX + col - 31 }, { name: 'drawer box front', x: rightX + 31 }, { name: 'drawer box back', x: rightX + 31 },
    { name: 'drawer bottom', x: rightX + 13 }, { name: 'drawer front', x: 3 + d1 + 4 },
  ], 'Same as the left drawer: build the box on the bench, fit the drawer runner profiles, screw the cabinet profiles into the right compartment, roll the box in and screw the front on from inside.', { view: 'front' }),
  S('Left door', [{ name: 'door', x: 3 }], 'Screw the hinge plates to the left side, press the cups into the door and clip it on. 3 at the wall, 4 to the drawer front below.', { view: 'front' }),
  S('Right door', [{ name: 'door', x: 3 + d1 + 4 }], 'Same on the right side. 4 to the left door, 5 to the end panel.', { view: 'front' }),
  S('Stand up and end panel', ['end panel'], 'Stand the wardrobe in the corner and level it on the legs. Scribe the end panel to the floor if needed, then screw it on from inside the right column through the side, six screws.', { view: 'front' }),
];

const piece = {
  id: 'wardrobe-zhitov-1100',
  name: `Wardrobe ${W} (zhitov drawing)`,
  comment:
    `From the zhitov.com drawing, resized to ${W} x ${D} x ${H} overall (end panel and doors included; carcass ${carcassW} wide, boards ${boardD} deep + ${HDF} HDF), 18 mm board in U156 ST9. ` +
    `Generated by scripts/gen-wardrobe-zhitov.mjs — change the parameters there and re-run rather than editing coordinates by hand. ` +
    `Two carcasses like the hall wardrobe: a lower drawer carcass (bottom on six 100 mm legs, ${LOWER_INNER} sides and partition, full-width top at ${z.topLower}..${z.topLower + T}, HDF back) and an upper carcass standing on it (bottom at ${z.bottomUpper}..${z.bottomUpper + T}, ${sideUpperH} sides, partition to the top shelf at ${z.shelfTop}, top at ${z.top}..${H}, HDF back), joined by four screws down through the upper bottom. ` +
    `Columns ${col} + 18 + ${col}. Right column: ${ADJ_Z.length} adjustable ${adjD}-deep shelves on 5 mm pins with two spare holes above and below each (32 mm pitch, none where a shelf would hit a hinge plate); left column: hanging rail. ` +
    `Two drawers in the lower carcass: fronts ${DRAWER_FRONT_H} in the door plane (${drawerFrontZ}..${drawerFrontZ + DRAWER_FRONT_H}), boxes ${col - 26} x ${boxD} x ${BOX_H} in white board on 6 mm HDF bottoms, on ${RUNNER} roller runners. Doors ${d1} and ${d2} from ${doorZ} to ${doorZ + doorH} (3 reveal at the wall, 4 between, 5 to the end panel). ` +
    `No top filler (ceiling ${CEILING} stays ${CEILING - H} above the top); full-height end panel ${H} x ${D} on the exposed right side; plinth clipped to the front legs. ` +
    `Fasteners are modelled as hardware parts (not cut): confirmat 7x50 at every fixed carcass joint (caps 2 mm proud where visible, flush where covered), 4x30 wood screws for the stacking, end panel and drawer fronts, staples for the HDF. Hinges (cup, arm, plate) and handles are drawn by the viewer.`,
  buildable: true,
  color: '#ddccba',
  clearance: { front: 600 },
  band: 0.8,
  assembly,
  parts,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'src', 'data', 'apartments', 'gallery', 'pieces', 'wardrobe-zhitov-1100.json');
fs.writeFileSync(out, JSON.stringify(piece, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)}: ${parts.length} parts, ${assembly.length} steps; carcass ${carcassW} x ${boardD + HDF}, columns ${col}, doors ${d1} + ${d2}, legs back row y ${legBackY}`);
