import { useEffect, useMemo, useState } from 'react';
import Viewer, { PieceViewer } from './Viewer.jsx';
import { fitReport } from './geometry.js';
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
import fridge from './data/fridge.json';

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
  [fridge.id]: fridge,
};

// short codes for the rail buttons; unknown ids fall back to initials
const RAIL_CODES = {
  'wardrobe-hall': 'WH',
  'wardrobe-master-1': 'WM',
  'wardrobe-master-2': 'M2',
  'desk-master': 'DM',
  'bed-90': 'B9',
  'bed-180': 'B18',
  'wardrobe-desk-room5': 'W5',
  'wardrobe-room6': 'W6',
  'hall-bench': 'HB',
  shower: 'SH',
  sink: 'SK',
  toilet: 'WC',
  bathtub: 'BT',
  washer: 'WA',
  dryer: 'DY',
  'water-heater': 'WH2',
  'kitchen-west': 'KW',
  'kitchen-north': 'KN',
  fridge: 'FR',
};
const railCode = (id) =>
  RAIL_CODES[id] ||
  id
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

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

function PiecePanel({ piece, hoverIndex, onHoverRow }) {
  const rows = useMemo(() => partRows(piece), [piece]);
  const hw = useMemo(() => hardwareList(piece), [piece]);
  const bandTotal = rows.reduce((n, r) => n + r.banding.length * r.qty, 0);

  const copyCsv = () =>
    navigator.clipboard.writeText(cutListCsv(cutList({ placements: [{ piece: piece.id }] }, piecesById)));

  return (
    <div className="piece-panel">
      <h1>{piece.name}</h1>
      {!piece.buildable && <p className="muted">bought piece — not part of the cut list</p>}

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
        {piece.buildable && (
          <>
            <p className="muted">edge banding total: {m(bandTotal)}</p>
            <button onClick={copyCsv}>Copy cut list CSV</button>
          </>
        )}
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
  const [highlight, setHighlight] = useState(null); // Set of part indices (table -> 3D)
  const [hoverIndex, setHoverIndex] = useState(null); // part index (3D -> table)

  useEffect(() => lsSet('flatpack.view', view), [view]);
  useEffect(() => lsSet('flatpack.showClearances', showClearances), [showClearances]);

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

        {piece && <PiecePanel piece={piece} hoverIndex={hoverIndex} onHoverRow={setHighlight} />}

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

      <nav className="rail">
        <button
          className={view === 'apartment' ? 'active' : ''}
          data-tip="Whole apartment"
          onClick={() => setView('apartment')}
        >
          🏠
        </button>
        <div className="rail-sep" />
        {Object.values(piecesById).map((p) => (
          <button
            key={p.id}
            className={view === p.id ? 'active' : ''}
            data-tip={p.name}
            onClick={() => setView(p.id)}
          >
            {railCode(p.id)}
          </button>
        ))}
        <div className="rail-sep" />
        <button
          className={showClearances ? 'active' : ''}
          data-tip={`Clearance zones: ${showClearances ? 'on' : 'off'}`}
          onClick={() => setShowClearances((v) => !v)}
        >
          ⛶
        </button>
      </nav>
    </div>
  );
}
