import { useEffect, useMemo, useState } from 'react';
import Viewer, { PieceViewer } from './Viewer.jsx';
import { fitReport, pieceLocalBBox, placeBox } from './geometry.js';
import { cutList, cutListCsv } from './cutlist.js';
import { partRows, hardwareList } from './hardware.js';
import apartment from './data/apartment.json';
import scene from './data/scene.json';
import wardrobeHall from './data/wardrobe-hall.json';
import bed90 from './data/bed-90.json';
import bed180 from './data/bed-180.json';
import wardrobeMaster1 from './data/wardrobe-master-1.json';
import wardrobeMaster2 from './data/wardrobe-master-2.json';
import deskMaster from './data/desk-master.json';
import wardrobeDeskRoom5 from './data/wardrobe-desk-room5.json';
import wardrobeRoom6 from './data/wardrobe-room6.json';
import hallBench from './data/hall-bench.json';
import shower from './data/shower.json';
import sink from './data/sink.json';
import toilet from './data/toilet.json';
import bathtub from './data/bathtub.json';
import washer from './data/washer.json';
import dryer from './data/dryer.json';
import waterHeater from './data/water-heater.json';
import kitchenWest from './data/kitchen-west.json';
import kitchenNorth from './data/kitchen-north.json';
import kitchenUpperWest from './data/kitchen-upper-west.json';
import kitchenUpperNorth from './data/kitchen-upper-north.json';
import kitchenUpperFridge from './data/kitchen-upper-fridge.json';
import fridge from './data/fridge.json';
import sofaCorner from './data/sofa-corner.json';
import deskLiving from './data/desk-living.json';
import tvCabinet from './data/tv-cabinet.json';
import tv from './data/tv.json';
import diningTable from './data/dining-table.json';
import diningChair from './data/dining-chair.json';
import acIndoor from './data/ac-indoor.json';
import acOutdoor from './data/ac-outdoor.json';
import deskChair from './data/desk-chair.json';

const piecesById = {
  [wardrobeHall.id]: wardrobeHall,
  [wardrobeMaster1.id]: wardrobeMaster1,
  [wardrobeMaster2.id]: wardrobeMaster2,
  [deskMaster.id]: deskMaster,
  [bed90.id]: bed90,
  [bed180.id]: bed180,
  [wardrobeDeskRoom5.id]: wardrobeDeskRoom5,
  [wardrobeRoom6.id]: wardrobeRoom6,
  [hallBench.id]: hallBench,
  [shower.id]: shower,
  [sink.id]: sink,
  [toilet.id]: toilet,
  [bathtub.id]: bathtub,
  [washer.id]: washer,
  [dryer.id]: dryer,
  [waterHeater.id]: waterHeater,
  [kitchenWest.id]: kitchenWest,
  [kitchenNorth.id]: kitchenNorth,
  [kitchenUpperWest.id]: kitchenUpperWest,
  [kitchenUpperNorth.id]: kitchenUpperNorth,
  [kitchenUpperFridge.id]: kitchenUpperFridge,
  [fridge.id]: fridge,
  [sofaCorner.id]: sofaCorner,
  [deskLiving.id]: deskLiving,
  [tvCabinet.id]: tvCabinet,
  [tv.id]: tv,
  [diningTable.id]: diningTable,
  [diningChair.id]: diningChair,
  [acIndoor.id]: acIndoor,
  [acOutdoor.id]: acOutdoor,
  [deskChair.id]: deskChair,
};

// Sidebar groups: each piece is bucketed by the room its placements sit in,
// derived from the apartment's floor rects — nothing to maintain when new
// furniture is added. A piece placed in several rooms shows up in each.
const ROOM_LABELS = [
  ['living', 'Living room & kitchen'],
  ['hall', 'Hall'],
  ['room5', 'Room 5'],
  ['room6', 'Room 6'],
  ['master', 'Master bedroom'],
  ['bath', 'Bathroom'],
  ['wc', 'WC'],
  ['vestibule', 'Vestibule'],
  ['loggia', 'Loggias'],
];

const roomAt = (x, y) => {
  const floor = apartment.floors.find(
    (f) => x >= f.pos[0] && x <= f.pos[0] + f.size[0] && y >= f.pos[1] && y <= f.pos[1] + f.size[1]
  );
  const hit = floor && ROOM_LABELS.find(([key]) => floor.name.includes(key));
  return hit ? hit[1] : 'Elsewhere';
};

const pieceGroups = (() => {
  const byRoom = new Map();
  for (const pl of scene.placements) {
    const piece = piecesById[pl.piece];
    if (!piece) continue;
    const bb = placeBox(pieceLocalBBox(piece), pl);
    const room = roomAt((bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2);
    const counts = byRoom.get(room) || new Map();
    counts.set(pl.piece, (counts.get(pl.piece) || 0) + 1);
    byRoom.set(room, counts);
  }
  for (const id of Object.keys(piecesById))
    if (![...byRoom.values()].some((c) => c.has(id))) {
      const counts = byRoom.get('Unplaced') || new Map();
      counts.set(id, 0);
      byRoom.set('Unplaced', counts);
    }
  return [...ROOM_LABELS.map(([, label]) => label), 'Elsewhere', 'Unplaced']
    .filter((label) => byRoom.has(label))
    .map((label) => ({
      label,
      items: [...byRoom.get(label)]
        .map(([id, count]) => ({ id, count, name: piecesById[id].name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
})();

// view + toggles survive a refresh
const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — the app just won't remember */
  }
};

const m = (mm) => (mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm} mm`);

const bandingText = (b) =>
  b.edges === 'none' ? '—' : b.edges === 'all' ? `all 4 edges, ${m(b.length)}` : `front edge, ${m(b.length)}`;

// Bought pieces aren't cut from boards — the parts only model how the thing
// looks. All that matters for shopping is the outer size and where it goes.
function BoughtPanel({ piece }) {
  const bb = pieceLocalBBox(piece);
  const [w, d, h] = [0, 1, 2].map((i) => bb.max[i] - bb.min[i]);
  const placed = scene.placements.filter((pl) => pl.piece === piece.id).length;
  return (
    <div className="piece-panel">
      <h1>{piece.name}</h1>
      <p className="muted">bought as-is — nothing to cut or build</p>
      <section>
        <h2>Overall size</h2>
        <p className="size-line">
          {w} × {d} × {h} mm <span className="muted-inline">(width × depth × height)</span>
        </p>
      </section>
      <section>
        <h2>In the plan</h2>
        <p className="size-line">placed {placed}×</p>
      </section>
    </div>
  );
}

function PiecePanel({ piece, hoverIndex, onHoverRow }) {
  const rows = useMemo(() => partRows(piece), [piece]);
  const hw = useMemo(() => hardwareList(piece), [piece]);
  const bandTotal = rows.reduce((n, r) => n + r.banding.length * r.qty, 0);

  const copyCsv = () =>
    navigator.clipboard.writeText(cutListCsv(cutList({ placements: [{ piece: piece.id }] }, piecesById)));

  return (
    <div className="piece-panel">
      <h1>{piece.name}</h1>

      <section>
        <h2>Parts</h2>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Cut (mm)</th>
              <th>Thk</th>
              <th>Qty</th>
              <th>Edge band</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={hoverIndex != null && r.indices.includes(hoverIndex) ? 'hot' : ''}
                onMouseEnter={() => onHoverRow(new Set(r.indices))}
                onMouseLeave={() => onHoverRow(null)}
              >
                <td>{r.name}</td>
                <td>
                  {r.length} × {r.width}
                </td>
                <td>{r.thickness}</td>
                <td>{r.qty}</td>
                <td>{bandingText(r.banding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">edge banding total: {m(bandTotal)}</p>
        <button onClick={copyCsv}>Copy cut list CSV</button>
      </section>

      {(hw.hingesTotal > 0 || hw.drawers > 0 || hw.shelves > 0 || hw.rails.length > 0 || hw.hooks > 0) && (
        <section>
          <h2>Hardware</h2>
          <ul className="hardware">
            {hw.hinges.map((g, i) => (
              <li key={`h${i}`}>
                {g.doors * g.perDoor} × hinge — {g.doors} door{g.doors > 1 ? 's' : ''} {g.doorW}×{g.doorH},{' '}
                {g.perDoor} each, hinge {g.side}
              </li>
            ))}
            {hw.hingesTotal > 0 && <li className="muted">hinges total: {hw.hingesTotal}</li>}
            {hw.drawers > 0 && (
              <li>
                {hw.drawers} × drawer slide pair{hw.drawers > 1 ? 's' : ''}
                {hw.slideBoxDepth ? ` (box depth ${hw.slideBoxDepth})` : ''}
              </li>
            )}
            {hw.shelves > 0 && (
              <li>
                {hw.shelfPins} × shelf support ({hw.shelves} shelves × 4)
              </li>
            )}
            {hw.rails.map((r, i) => (
              <li key={`r${i}`}>1 × hanging rail, {r.length} mm</li>
            ))}
            {hw.hooks > 0 && <li>{hw.hooks} × coat hook</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(() => lsGet('flatpack.view', 'apartment'));
  const [showClearances, setShowClearances] = useState(() => lsGet('flatpack.showClearances', true));
  const [sideOpen, setSideOpen] = useState(() => lsGet('flatpack.sideOpen', true));
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(null); // Set of part indices (table -> 3D)
  const [hoverIndex, setHoverIndex] = useState(null); // part index (3D -> table)

  useEffect(() => lsSet('flatpack.view', view), [view]);
  useEffect(() => lsSet('flatpack.showClearances', showClearances), [showClearances]);
  useEffect(() => lsSet('flatpack.sideOpen', sideOpen), [sideOpen]);

  const report = useMemo(() => fitReport(scene, piecesById, apartment), []);

  const piece = view !== 'apartment' ? piecesById[view] : null;
  useEffect(() => {
    if (view !== 'apartment' && !piecesById[view]) setView('apartment'); // stale localStorage
  }, [view]);

  const copyAllCsv = () => navigator.clipboard.writeText(cutListCsv(cutList(scene, piecesById)));

  return (
    <div className="app">
      <div className="canvas-pane">
        {piece ? (
          <PieceViewer key={piece.id} piece={piece} highlight={highlight} onHoverPart={setHoverIndex} />
        ) : (
          <Viewer
            apartment={apartment}
            report={report}
            showClearances={showClearances}
            onSelectPiece={setView}
          />
        )}

        {piece &&
          (piece.buildable ? (
            <PiecePanel piece={piece} hoverIndex={hoverIndex} onHoverRow={setHighlight} />
          ) : (
            <BoughtPanel piece={piece} />
          ))}

        {!piece && report.issues.length > 0 && (
          <div className="issues-chip">
            <ul className="issues">
              {report.issues.map((issue, i) => (
                <li key={i} className={issue.level}>
                  {issue.level === 'collision' ? '✕' : '⚠'} {issue.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!piece && (
          <button className="csv-chip" onClick={copyAllCsv} title="Copy the full cut list as CSV">
            ⧉ cut list
          </button>
        )}
      </div>

      <nav className={sideOpen ? 'side' : 'side collapsed'}>
        <div className="side-head">
          <button data-tip={sideOpen ? 'Collapse' : 'Pieces'} onClick={() => setSideOpen((v) => !v)}>
            {sideOpen ? '»' : '«'}
          </button>
          <button
            className={view === 'apartment' ? 'active' : ''}
            data-tip="Whole apartment"
            onClick={() => setView('apartment')}
          >
            🏠
          </button>
          <button
            className={showClearances ? 'active' : ''}
            data-tip={`Clearance zones: ${showClearances ? 'on' : 'off'}`}
            onClick={() => setShowClearances((v) => !v)}
          >
            ⛶
          </button>
        </div>
        {sideOpen && (
          <>
            <input
              className="side-filter"
              type="search"
              placeholder="Filter pieces…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="side-list">
              {pieceGroups
                .map((g) => ({
                  ...g,
                  items: g.items.filter((it) => it.name.toLowerCase().includes(filter.toLowerCase().trim())),
                }))
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.label}>
                    <h3>{g.label}</h3>
                    {g.items.map((it) => (
                      <button
                        key={it.id}
                        className={view === it.id ? 'piece-btn active' : 'piece-btn'}
                        title={it.name}
                        onClick={() => setView(it.id)}
                      >
                        <span className="nm">{it.name}</span>
                        {it.count > 1 && <span className="ct">×{it.count}</span>}
                        {!piecesById[it.id].buildable && <span className="tag">bought</span>}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}
      </nav>
    </div>
  );
}
