// The guided walk through Ljilja's boravak: one room, so a short loop. Data-space
// mm ([x, y] on the floor); step kinds and selectors are documented at the top of
// src/tour.js. Waypoints stay in the free floor between the secija, the coffee
// table, the fridge and the slat panel; the room door on the east wall swings
// west into the room, so the start point sits outside its quarter disc.
// Run `node scripts/check-tour.mjs ljilja-boravak` after moving a piece or
// editing this route.

const K = 'Kitchen - sink run, east wall';

export const tour = [
  // ── Door ─────────────────────────────────────────────────────────────
  { at: [4200, 1800], yaw: 135, say: 'Ulaz' },
  { wait: 0.8 },
  { look: { door: 'door' }, dur: 0.7 },
  { open: { door: 'door' } },
  { wait: 1.2 },
  { close: { door: 'door' } },
  { wait: 0.4 },

  // ── TV wall ──────────────────────────────────────────────────────────
  { look: { piece: 'TV 40 - on ormar' }, dur: 0.9, say: 'TV ormar' },
  { wait: 0.6 },
  { open: { piece: 'TV ormar - east wall', kind: 'door' }, stagger: 0.25 },
  { wait: 1.2 },
  { close: 'opened', stagger: 0.15 },
  { wait: 0.3 },

  // ── Secija & coffee table ─────────────────────────────────────────────
  { go: [2400, 2450], face: { piece: 'Secija - SW corner (south + west wall)' }, say: 'Secija' },
  { look: [1000, 700, 600], dur: 1 },
  { wait: 0.8 },
  { look: { piece: 'Coffee table - in the secija corner' }, dur: 0.8 },
  { wait: 0.5 },
  { turn: 360, dur: 6 },

  // ── Eating corner (NW) ───────────────────────────────────────────────
  { go: [1800, 3400], say: 'Sto za jelo' },
  { look: { piece: 'Sto 120x50 - NW corner, west wall', z: 750 }, dur: 1 },
  { wait: 1 },
  { look: { piece: 'Sporet na drva - NW of pilaster', z: 900 }, dur: 0.9, say: 'Sporet na drva' },
  { wait: 0.8 },

  // ── Kitchen nook (NE, behind the slat panel) ─────────────────────────
  { go: [3400, 3650], say: 'Kuhinja' },
  { go: [3750, 3500] },
  { look: [4192, 3750, 500], dur: 0.8, say: 'Sudoper' },
  { open: { piece: K, part: 'door sink' }, stagger: 0.25 },
  { wait: 1.2 },
  { close: 'opened', stagger: 0.15 },
  { look: [4192, 3700, 1900], dur: 0.7 },
  { open: { piece: K, part: 'door lower' }, stagger: 0.2 },
  { wait: 1.4 },
  { close: 'opened', stagger: 0.15 },
  { look: { piece: 'Elektricni sporet - NE corner', z: 900 }, dur: 0.9, say: 'Sporet' },
  { wait: 0.8 },

  // fridge stands in the run south of the sink, under the uppers
  { go: [3850, 3150], say: 'Frizider' },
  { look: [4202, 3063, 900], dur: 0.8 },
  { open: { piece: 'Fridge - in the run, next to the sink', part: 'door fridge' } },
  { wait: 1.5 },
  { close: 'opened' },
  { wait: 0.3 },

  // work cabinet with drawers, back to the slat panel
  { go: [3300, 3750], say: 'Radni pult' },
  { look: [3300, 3295, 850], dur: 0.8 },
  { open: { piece: 'Radni pult - north of the slat panel', kind: 'drawer' }, stagger: 0.2 },
  { wait: 1.2 },
  { close: 'opened', stagger: 0.15 },
  { wait: 0.3 },

  // ── Back to the door, around the slat panel ──────────────────────────
  { go: [3400, 3650] },
  { go: [2500, 3300] },
  { go: [2400, 2450] },
  { go: [4200, 1800], say: 'Ulaz' },
  { look: { yaw: 135, pitch: 0 }, dur: 1 },
  { wait: 0.6 },
];
