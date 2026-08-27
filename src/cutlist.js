// Derive a cut list from the scene: every part of every buildable piece,
// grouped by identical name + cut size + thickness.
// A part's thickness is its smallest dimension; the other two are the cut size.

export function cutList(scene, piecesById) {
  const rows = new Map();
  for (const pl of scene.placements) {
    const piece = piecesById[pl.piece];
    if (!piece?.buildable || !piece.parts) continue;
    for (const p of piece.parts) {
      if (p.appliance) continue; // bought appliances inside a buildable piece

      const dims = [...p.size].sort((a, b) => b - a); // [L, W, T]
      const key = `${piece.id}|${p.name}|${dims.join('x')}`;
      const row = rows.get(key) || {
        piece: piece.name,
        part: p.name,
        length: dims[0],
        width: dims[1],
        thickness: dims[2],
        qty: 0,
      };
      row.qty += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.thickness - a.thickness || b.length - a.length || b.width - a.width
  );
}

// CSV in the format cutlistoptimizer.com accepts (Length,Width,Qty,Label).
export function cutListCsv(rows) {
  const lines = ['Length,Width,Qty,Label'];
  for (const r of rows) {
    lines.push(`${r.length},${r.width},${r.qty},"${r.piece} - ${r.part} (${r.thickness}mm)"`);
  }
  return lines.join('\n');
}
