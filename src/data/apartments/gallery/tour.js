// Guided walk through the gallery, eyes on the wardrobe the whole time: in at
// the door already looking at it, over to it (every `go` keeps facing it), then
// standing still in front of it while its fronts are worked one at a time
// (left door, right door, left drawer, right drawer, some closed while others
// stay open), a sidestep to see the end panel, and back to the door still
// watching it. Coordinates are data-space mm; step kinds and selectors are
// documented at the top of src/tour.js.
//
// The two doors (and the two drawer fronts) share a name, so a selector picks
// one by side as seen from the body: `pick: 'left'` / `pick: 'right'`. The
// fronts face south (y 3650) and the leaves swing out to y 3115, so the body
// stands at y 2500. Check with `node scripts/check-tour.mjs gallery` after
// moving the piece.

const W = 'Wardrobe - NW corner';
const SPOT = [800, 2500]; // in front of the wardrobe, centred on it
const FACE = [800, 3650, 1300]; // what the body keeps watching while it walks: the middle of the fronts
const doorL = { piece: W, kind: 'door', pick: 'left' };
const doorR = { piece: W, kind: 'door', pick: 'right' };
const drawerL = { piece: W, kind: 'drawer', pick: 'left' };
const drawerR = { piece: W, kind: 'drawer', pick: 'right' };

export const tour = [
  { at: [4100, 950], yaw: 51, say: 'Gallery' }, // just clear of the door leaf's swing, already facing the wardrobe
  { wait: 0.8 },
  { go: [2600, 2600], face: FACE },
  { go: SPOT, face: FACE, say: 'Wardrobe 1100' },
  { look: [800, 3650, 1300], dur: 0.8 },
  { wait: 0.6 },

  // ── doors, one at a time ──────────────────────────────────────────────
  { look: [520, 3650, 1300], dur: 0.6 },
  { open: doorL, say: 'Left door: hanging rail' },
  { wait: 0.8 },
  { look: [520, 3950, 1850], dur: 0.9 },
  { wait: 1.0 },
  { look: [1059, 3650, 1300], dur: 0.7 },
  { open: doorR, say: 'Right door: adjustable shelves' },
  { wait: 0.8 },
  { look: [1059, 3950, 1250], dur: 0.9 },
  { wait: 1.0 },
  { look: [800, 3950, 2200], dur: 0.8, say: 'Top shelf across both columns' },
  { wait: 1.0 },
  { look: [520, 3650, 1300], dur: 0.7 },
  { close: doorL, say: 'Left door closed, right one still open' },
  { wait: 1.2 },

  // ── drawers, one at a time ────────────────────────────────────────────
  { look: [520, 3650, 300], dur: 0.8 },
  { open: drawerL, say: 'Left drawer' },
  { wait: 1.2 },
  { look: [1059, 3650, 300], dur: 0.7 },
  { open: drawerR, say: 'Right drawer' },
  { wait: 1.2 },
  { look: [1059, 3650, 1300], dur: 0.7 },
  { close: doorR, say: 'Right door closed, drawers open' },
  { wait: 1.0 },
  { look: [800, 3650, 300], dur: 0.7 },
  { wait: 0.6 },
  { close: drawerR, say: 'Right drawer in' },
  { wait: 0.8 },
  { close: drawerL, say: 'Left drawer in' },
  { wait: 0.6 },

  // ── the whole front, closed, and the ceiling gap ──────────────────────
  { look: [800, 3650, 1300], dur: 0.8 },
  { wait: 0.8 },
  { look: [800, 3650, 2460], dur: 0.9, say: 'Top: 20 mm to the ceiling' },
  { wait: 1.0 },

  // ── from the side: the end panel ──────────────────────────────────────
  { go: [2300, 3300], face: FACE, say: 'End panel' },
  { look: [1350, 3950, 1200], dur: 1 },
  { wait: 1 },
  { look: [1350, 3950, 2465], dur: 0.8, say: 'End panel up to the ceiling gap' },
  { wait: 0.8 },

  // ── back to the door ──────────────────────────────────────────────────
  { go: [2600, 2600], face: FACE },
  { go: [4100, 950], face: FACE },
  { look: { piece: W }, dur: 0.8 },
  { wait: 0.8 },
];
