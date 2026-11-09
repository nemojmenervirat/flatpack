import { useEffect, useMemo, useState } from 'react';
import { cutListCsv } from './cutlist.js';
import { materials } from './materials.js';
import { parseLooseParts, planRows, planBoards, labelFor, boardLayout, LOOSE_PIECE } from './cutplan.js';

// Cut plan for the shop: pick pieces of the flat (placed or not), add loose
// parts you only have on paper, and see the one list and how it nests on
// boards. Same rows as the per-piece cut list, same strip nesting as the
// price estimate; the shop will nest it its own way, the drawing is to see
// that it fits. Read-only like the rest of the app; the choices live in
// localStorage per flat.

const lsKey = (id) => `flatpack.cutplan.${id}`;
const load = (id) => {
  try {
    return JSON.parse(localStorage.getItem(lsKey(id))) || {};
  } catch {
    return {};
  }
};

const bandText = (b) => (b.L + b.W === 0 ? '—' : `${b.L} L + ${b.W} W`);

function Board({ group, index }) {
  const [BL, BW] = group.board;
  const board = group.nest.boards[index];
  const rects = boardLayout(board, group.kerf);
  const used = rects.reduce((a, r) => a + (r.w * r.h) / 1e6, 0);
  return (
    <figure className="cut-board">
      <figcaption>
        board {index + 1} of {group.nest.boards.length} · {BL} × {BW} · {board.widthUsed} of {BW} across · {used.toFixed(2)} m² in parts
      </figcaption>
      <svg viewBox={`-10 -10 ${BL + 20} ${BW + 20}`} preserveAspectRatio="xMinYMin meet">
        <rect x="0" y="0" width={BL} height={BW} className="sheet" />
        {rects.map((r, i) => (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} className="part" />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 12} textAnchor="middle">
              {labelFor(group.rows, r.w, r.h)}
            </text>
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 40} textAnchor="middle" className="dim">
              {r.w} × {r.h}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function CutPlanPanel({ apartment }) {
  const { id, scene, piecesById } = apartment;
  const buildable = useMemo(() => Object.values(piecesById).filter((p) => p.buildable && p.parts?.length), [piecesById]);
  const placed = useMemo(() => new Set(scene.placements.map((p) => p.piece)), [scene]);

  const saved = useMemo(() => load(id), [id]);
  const [ids, setIds] = useState(() => saved.ids || []);
  const [loose, setLoose] = useState(() => saved.loose || '');
  const [material, setMaterial] = useState(() => saved.material || 'W960 SM');
  const [thickness, setThickness] = useState(() => saved.thickness || 18);
  const [boardL, setBoardL] = useState(() => saved.boardL || 2800);
  const [boardW, setBoardW] = useState(() => saved.boardW || 2070);
  const [kerf, setKerf] = useState(() => saved.kerf ?? 4);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(id), JSON.stringify({ ids, loose, material, thickness, boardL, boardW, kerf }));
    } catch {
      /* private mode */
    }
  }, [id, ids, loose, material, thickness, boardL, boardW, kerf]);

  const toggle = (pid) => setIds((v) => (v.includes(pid) ? v.filter((x) => x !== pid) : [...v, pid]));
  const { parts: looseParts, bad } = useMemo(() => parseLooseParts(loose), [loose]);
  const rows = useMemo(
    () => planRows(ids.filter((pid) => piecesById[pid]), piecesById, looseParts, { material, thickness: Number(thickness) || 18 }),
    [ids, piecesById, looseParts, material, thickness],
  );
  const groups = useMemo(
    () => planBoards(rows, { length: Number(boardL) || 2800, width: Number(boardW) || 2070, kerf: Number(kerf) || 0 }),
    [rows, boardL, boardW, kerf],
  );
  const copyCsv = () => {
    navigator.clipboard.writeText(cutListCsv(rows));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const decors = useMemo(() => Object.keys(materials).filter((k) => materials[k].panel?.[String(thickness)]), [thickness]);

  return (
    <div className="cut-pane">
      <div className="cut-bar">
        <div className="cut-chips">
          {buildable.map((p) => (
            <button key={p.id} className={ids.includes(p.id) ? 'active' : ''} onClick={() => toggle(p.id)} title={placed.has(p.id) ? p.name : `${p.name} (not placed)`}>
              {p.name}
              {!placed.has(p.id) && <span className="muted-inline"> · unplaced</span>}
            </button>
          ))}
          {!buildable.length && <span className="muted-inline">no buildable pieces in this flat</span>}
        </div>
        <label>
          board
          <input type="number" value={boardL} onChange={(e) => setBoardL(e.target.value)} /> ×
          <input type="number" value={boardW} onChange={(e) => setBoardW(e.target.value)} />
        </label>
        <label>
          kerf <input type="number" value={kerf} onChange={(e) => setKerf(e.target.value)} />
        </label>
        <button className="cut-copy" onClick={copyCsv} disabled={!rows.length} title="Copy the whole list as CSV, the shop's columns">
          {copied ? 'copied' : '⧉ CSV'}
        </button>
      </div>

      <div className="cut-body">
        <section className="cut-loose">
          <h2>Loose parts</h2>
          <div className="cut-loose-row">
            <textarea
              value={loose}
              onChange={(e) => setLoose(e.target.value)}
              placeholder={'one per line, L x W or N x L x W\n564x480\n2x524x480\n3x546x480'}
              spellCheck={false}
              rows={5}
            />
            <div className="cut-loose-opts">
              <label>
                material
                <input list="cut-decors" value={material} onChange={(e) => setMaterial(e.target.value)} />
                <datalist id="cut-decors">
                  {decors.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>
              <label>
                thickness <input type="number" value={thickness} onChange={(e) => setThickness(e.target.value)} /> mm
              </label>
              <p className="muted">
                {looseParts.reduce((a, p) => a + p.qty, 0)} loose parts
                {bad.length > 0 && <span className="cut-bad"> · not understood: {bad.join(', ')}</span>}
              </p>
            </div>
          </div>
        </section>

        {rows.length > 0 && (
          <section>
            <h2>Cut list</h2>
            <table className="cut-table">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Part</th>
                  <th className="num">L</th>
                  <th className="num">W</th>
                  <th className="num">T</th>
                  <th className="num">Qty</th>
                  <th>Material</th>
                  <th>Band</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.piece === LOOSE_PIECE ? 'loose' : ''}>
                    <td>{r.piece}</td>
                    <td>{r.part}</td>
                    <td className="num">{r.length}</td>
                    <td className="num">{r.width}</td>
                    <td className="num">{r.thickness}</td>
                    <td className="num">{r.qty}</td>
                    <td>{r.material || '—'}</td>
                    <td>{bandText(r.banding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">loose parts carry no banding: say which edges when you hand the list in</p>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.key}>
            <h2>
              {g.key} · {g.count} parts · {g.net.toFixed(2)} m² net → {g.nest.count} board{g.nest.count === 1 ? '' : 's'} {g.board[0]} × {g.board[1]}
              {g.nest.tooBig.length > 0 && <span className="cut-bad"> · {g.nest.tooBig.length} too big for the board</span>}
            </h2>
            {g.nest.boards.map((_, i) => (
              <Board key={i} group={g} index={i} />
            ))}
          </section>
        ))}
        {rows.length > 0 && <p className="muted">strip nesting, the same the price estimate uses: parts in lanes along the board, lanes stacked across it. The shop nests tighter; this shows it fits.</p>}
        {!rows.length && <p className="muted">pick pieces above or type loose parts</p>}
      </div>
    </div>
  );
}
