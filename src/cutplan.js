// One cut list for the shop out of several pieces plus loose parts you only
// have on paper, nested onto boards per material and thickness. Pure, mm;
// shared by the Cut plan panel and scripts/cut-plan.mjs.

import { cutList } from './cutlist.js';
import { nestHalfBoards } from './nesting.js';

export const LOOSE_PIECE = 'Loose parts (paper)';

// "564x480" -> 1 off; "3x546x480" -> 3 off. Also "3 x 546 x 480", "546*480".
export function parseLoosePart(text) {
  const n = text
    .toLowerCase()
    .split(/[x×*]/)
    .map((s) => Number(s.trim()));
  if (n.length < 2 || n.length > 3 || n.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return n.length === 3 ? { qty: n[0], L: n[1], W: n[2] } : { qty: 1, L: n[0], W: n[1] };
}

// One part per line; blank lines and # comments skipped. Returns the parts
// and the lines that did not parse.
export function parseLooseParts(text) {
  const parts = [];
  const bad = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const p = parseLoosePart(line);
    if (p) parts.push(p);
    else bad.push(line);
  }
  return { parts, bad };
}

// Cut-list rows for loose parts, in the shape cutList() returns. No banding:
// what to band is yours to say.
export function looseRows(parts, { material = '', thickness = 18 } = {}) {
  return parts.map((p) => ({
    piece: LOOSE_PIECE,
    part: 'board',
    length: Math.max(p.L, p.W),
    width: Math.min(p.L, p.W),
    thickness,
    qty: p.qty,
    material,
    banding: { edges: 'none', L: 0, W: 0, tape: null, length: 0 },
  }));
}

// Rows for the named pieces (placed or not) plus the loose parts.
export function planRows(pieceIds, piecesById, loose = [], looseOpts = {}) {
  const rows = cutList({ placements: pieceIds.map((piece) => ({ piece })) }, piecesById);
  return [...rows, ...looseRows(loose, looseOpts)];
}

// Group the rows by material + thickness and nest each group on boards.
export function planBoards(rows, { length = 2800, width = 2070, kerf = 4 } = {}) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.material || '?'} ${r.thickness} mm`;
    if (!groups.has(key)) groups.set(key, { key, material: r.material || '?', thickness: r.thickness, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map((g) => {
    const nest = nestHalfBoards(g.rows.map((r) => ({ L: r.length, W: r.width, qty: r.qty })), { length, width, kerf });
    const net = g.rows.reduce((a, r) => a + (r.length * r.width * r.qty) / 1e6, 0);
    const count = g.rows.reduce((a, r) => a + r.qty, 0);
    return { ...g, nest, net, count, board: [length, width], kerf };
  });
}

// A short label for a nested [along, across] rectangle: the first row with
// those cut dims. "Jar rack - tall jars (2 tiers)" + "side" -> "tall jars side".
export function labelFor(rows, along, across) {
  const [L, W] = [Math.max(along, across), Math.min(along, across)];
  const r = rows.find((r) => r.length === L && r.width === W);
  if (!r) return '?';
  if (r.piece === LOOSE_PIECE) return 'paper';
  const nm = r.piece.includes(' - ') ? r.piece.split(' - ')[1] : r.piece;
  return `${nm.split(' ').slice(0, 2).join(' ')} ${r.part}`;
}

// Where every part lands on a board, for drawing: strips stacked across the
// board, parts along each strip, kerf between.
export function boardLayout(board, kerf) {
  const rects = [];
  let y = 0;
  for (const s of board.strips) {
    let x = 0;
    for (const [along, across] of s.parts) {
      rects.push({ x, y, w: along, h: across });
      x += along + kerf;
    }
    y += s.width + kerf;
  }
  return rects;
}
