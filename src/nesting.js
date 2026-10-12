// Strip nesting of cut parts onto boards, to count what has to be bought: the
// shop sells by the half board (the 2800 x 2070 sheet cut lengthwise into two
// 2800 x 1035), so what matters is how many halves the parts need, not their
// net area. Pure, mm, no rendering.
//
//   nestHalfBoards(parts, { length, width, kerf, trim }) ->
//     { halves, m2, boards: [{ strips: [{ width, used, parts }], widthUsed, halves }], tooBig }
//
// parts: [{ L, W, qty }] cut sizes. Greedy first fit: parts sorted by width then
// length; each goes into the narrowest existing strip (a lane along the board
// length) that is at least as wide and has room left, else it opens a new strip
// of its own width, turned 90° when that is the narrower way to fit. Strips are
// then stacked across boards, widest first. A board whose strips use at most
// half its width counts as one half, else two. Good enough to tell one board
// from two; a real nesting program may do a little better, never worse. Parts
// that fit no orientation land in tooBig.
export function nestHalfBoards(parts, { length = 2800, width = 2070, kerf = 4, trim = 10 } = {}) {
  const BL = length - trim; // usable, the saw trims the factory edges
  const BW = width - trim;
  const halfW = width / 2 - trim / 2;
  const items = [];
  for (const p of parts) for (let i = 0; i < (p.qty ?? 1); i++) items.push([Math.max(p.L, p.W), Math.min(p.L, p.W)]);
  items.sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const strips = [];
  const tooBig = [];
  for (const [L, W] of items) {
    // [along the board, across it]; the turned orientation only when it fits
    const orients = [[L, W], [W, L]].filter(([along, across]) => along <= BL && across <= BW);
    if (!orients.length) {
      tooBig.push([L, W]);
      continue;
    }
    let best = null;
    for (const [along, across] of orients)
      for (const s of strips)
        if (s.width >= across && s.used + kerf + along <= BL && (!best || s.width - across < best.waste))
          best = { strip: s, along, across, waste: s.width - across };
    if (best) {
      best.strip.used += kerf + best.along;
      best.strip.parts.push([best.along, best.across]);
      continue;
    }
    const [along, across] = orients.sort((p, q) => p[1] - q[1])[0];
    strips.push({ width: across, used: along, parts: [[along, across]] });
  }

  strips.sort((a, b) => b.width - a.width);
  const boards = [];
  for (const s of strips) {
    const need = (b) => (b.strips.length ? kerf : 0) + s.width;
    let b = boards.find((b) => b.widthUsed + need(b) <= BW);
    if (!b) {
      b = { strips: [], widthUsed: 0, halves: 0 };
      boards.push(b);
    }
    b.widthUsed += need(b);
    b.strips.push(s);
  }
  for (const b of boards) b.halves = b.widthUsed <= halfW ? 1 : 2;
  const halves = boards.reduce((n, b) => n + b.halves, 0);
  return { halves, m2: (halves * length * width) / 2 / 1e6, boards, tooBig };
}
