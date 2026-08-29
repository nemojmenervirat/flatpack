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
  ['entry', 'Hall'], // oak-th-entry threshold
  ['th-l', 'Loggias'], // ceramic-th-l4 / -l7 thresholds
];
const ROOM_ORDER = [...new Set(ROOM_LABELS.map(([, label]) => label))];

const roomAt = (x, y) => {
  const floor = apartment.floors.find(
    (f) => x >= f.pos[0] && x <= f.pos[0] + f.size[0] && y >= f.pos[1] && y <= f.pos[1] + f.size[1]
  );
  const hit = floor && ROOM_LABELS.find(([key]) => floor.name.includes(key));
  return hit ? hit[1] : 'Elsewhere';
};

// Room areas straight from the apartment's floor rects, in m². Each room keeps
// its rects (for the 3D overlay) and an anchor — the largest rect, where the
// m² label goes.
// The overlay keeps a 2 cm padding to every wall: each floor rect becomes a
// core inset 2 cm on all sides, plus flush "bridge" strips over the exact
// intervals where the floor continues into an abutting rect (thresholds, zone
// seams) — so rooms show no gaps mid-floor but never touch a wall. The m²
// values always use the un-padded rects; padding is presentation only.
const AREA_PAD = 20;
const AREA_EPS = 0.5;

// Walls that stand on the floor (not lintels over openings). Some interior
// walls — stubs, door jambs, shafts, the master niche — sit ON TOP of floor
// rects, so both the area numbers and the overlay must subtract them.
const floorWalls = apartment.walls.filter((w) => w.pos[2] < 50);

// Door thresholds (the floor strips under door openings) don't count as room
// area and don't render in the overlay — a doorway edge pads like a wall edge.
const isThreshold = (f) => f.name.includes('-th-');

// Door openings cut like walls do: their footprint leaves the count and the
// overlay even where the passage floor belongs to a room's own rect (the
// living↔hall doorway sits on the hall's floor rect, not on a threshold).
const doorFootprints = (apartment.openings || [])
  .filter((o) => o.type === 'door')
  .map((o) => [o.pos[0], o.pos[1], o.pos[0] + o.size[0], o.pos[1] + o.size[1]]);
const doorFootprintsPadded = doorFootprints.map((d) => [
  d[0] - AREA_PAD,
  d[1] - AREA_PAD,
  d[2] + AREA_PAD,
  d[3] + AREA_PAD,
]);
const wallRect = (w, pad = 0) => [
  w.pos[0] - pad,
  w.pos[1] - pad,
  w.pos[0] + w.size[0] + pad,
  w.pos[1] + w.size[1] + pad,
];

// rectangle difference: b minus c, as up to 4 rects
const cutBox = (b, c) => {
  const [bx0, by0, bx1, by1] = b;
  const [cx0, cy0, cx1, cy1] = c;
  if (cx0 >= bx1 - AREA_EPS || cx1 <= bx0 + AREA_EPS || cy0 >= by1 - AREA_EPS || cy1 <= by0 + AREA_EPS)
    return [b];
  const out = [];
  if (cy1 < by1 - AREA_EPS) out.push([bx0, cy1, bx1, by1]);
  if (cy0 > by0 + AREA_EPS) out.push([bx0, by0, bx1, cy0]);
  const my0 = Math.max(by0, cy0);
  const my1 = Math.min(by1, cy1);
  if (cx0 > bx0 + AREA_EPS) out.push([bx0, my0, cx0, my1]);
  if (cx1 < bx1 - AREA_EPS) out.push([cx1, my0, bx1, my1]);
  return out;
};

const cutAll = (boxes, cutters) => {
  let out = boxes;
  for (const c of cutters) out = out.flatMap((b) => cutBox(b, c));
  return out;
};

// True walkable area of a floor rect: its rectangle minus any wall standing on
// it (sequential subtraction, so overlapping walls aren't double-counted).
const netAreaM2 = (f) => {
  const whole = [f.pos[0], f.pos[1], f.pos[0] + f.size[0], f.pos[1] + f.size[1]];
  const left = cutAll([whole], [...floorWalls.map((w) => wallRect(w)), ...doorFootprints]);
  return left.reduce((n, b) => n + (b[2] - b[0]) * (b[3] - b[1]), 0) / 1e6;
};

const padRects = (f) => {
  const EPS = AREA_EPS;
  const [x0, y0] = f.pos;
  const [x1, y1] = [x0 + f.size[0], y0 + f.size[1]];
  const boxes = [[x0 + AREA_PAD, y0 + AREA_PAD, x1 - AREA_PAD, y1 - AREA_PAD]];
  for (const g of apartment.floors) {
    if (g === f || isThreshold(g)) continue;
    const [gx0, gy0] = g.pos;
    const [gx1, gy1] = [gx0 + g.size[0], gy0 + g.size[1]];
    // shared interval, pulled in by the pad at both ends: keeps the strip 2 cm
    // off the walls flanking the seam and flush with the neighbor's inset core
    const ix0 = Math.max(x0, gx0) + AREA_PAD;
    const ix1 = Math.min(x1, gx1) - AREA_PAD;
    const iy0 = Math.max(y0, gy0) + AREA_PAD;
    const iy1 = Math.min(y1, gy1) - AREA_PAD;
    if (iy1 - iy0 > EPS) {
      if (Math.abs(gx1 - x0) < EPS) boxes.push([x0, iy0, x0 + AREA_PAD, iy1]); // continues west
      if (Math.abs(gx0 - x1) < EPS) boxes.push([x1 - AREA_PAD, iy0, x1, iy1]); // continues east
    }
    if (ix1 - ix0 > EPS) {
      if (Math.abs(gy1 - y0) < EPS) boxes.push([ix0, y0, ix1, y0 + AREA_PAD]); // continues south
      if (Math.abs(gy0 - y1) < EPS) boxes.push([ix0, y1 - AREA_PAD, ix1, y1]); // continues north
    }
  }
  // clear every floor-level wall and door opening by the pad
  return cutAll(boxes, [...floorWalls.map((w) => wallRect(w, AREA_PAD)), ...doorFootprintsPadded]).map(
    (b, i) => ({ name: `${f.name}#${i}`, box: b })
  );
};

// Coplanar overlay slabs must not overlap (z-fighting): where two boxes from
// different floor rects share a padded corner, trim the later one by the
// cheapest cut that removes the overlap. The dark region is unchanged — the
// earlier box still covers what was trimmed.
const trimOverlaps = (rects) => {
  const EPS = 0.5;
  for (let i = 0; i < rects.length; i++)
    for (let k = i + 1; k < rects.length; k++) {
      const a = rects[i].box;
      const b = rects[k].box;
      if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) <= EPS) continue;
      if (Math.min(a[3], b[3]) - Math.max(a[1], b[1]) <= EPS) continue;
      const cuts = [
        [a[2] - b[0], () => (b[0] = a[2])], // push b's west edge east
        [b[2] - a[0], () => (b[2] = a[0])], // pull b's east edge west
        [a[3] - b[1], () => (b[1] = a[3])], // push b's south edge north
        [b[3] - a[1], () => (b[3] = a[1])], // pull b's north edge south
      ].filter(([loss], j) => loss > 0 && (j < 2 ? b[2] - b[0] : b[3] - b[1]) - loss > EPS);
      if (cuts.length) cuts.sort((p, q) => p[0] - q[0])[0][1]();
      else b[2] = b[0]; // b is swallowed by a — collapse it, a already covers it
    }
};

const roomAreas = (() => {
  const byRoom = new Map();
  for (const f of apartment.floors) {
    if (isThreshold(f)) continue;
    const hit = ROOM_LABELS.find(([key]) => f.name.includes(key));
    const label = hit ? hit[1] : 'Elsewhere';
    const entry = byRoom.get(label) || { m2: 0, boxes: [], anchor: f };
    entry.m2 += netAreaM2(f);
    entry.boxes.push(...padRects(f));
    if (f.size[0] * f.size[1] > entry.anchor.size[0] * entry.anchor.size[1]) entry.anchor = f;
    byRoom.set(label, entry);
  }
  trimOverlaps([...byRoom.values()].flatMap((e) => e.boxes));
  const rows = [...ROOM_ORDER, 'Elsewhere']
    .filter((label) => byRoom.has(label))
    .map((label) => {
      const { m2, boxes, anchor } = byRoom.get(label);
      const rects = boxes
        .filter((r) => r.box[2] - r.box[0] > 0.5 && r.box[3] - r.box[1] > 0.5)
        .map((r) => ({ name: r.name, pos: [r.box[0], r.box[1]], size: [r.box[2] - r.box[0], r.box[3] - r.box[1]] }));
      return { label, m2, rects, anchor };
    });
  return { rows, total: rows.reduce((n, r) => n + r.m2, 0) };
})();

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
  return [...ROOM_ORDER, 'Elsewhere', 'Unplaced']
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
  const [showAreas, setShowAreas] = useState(() => lsGet('flatpack.showAreas', false));
  const [showPieces, setShowPieces] = useState(() => lsGet('flatpack.showPieces', true));
  const [sideOpen, setSideOpen] = useState(() => lsGet('flatpack.sideOpen', true));
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(null); // Set of part indices (table -> 3D)
  const [hoverIndex, setHoverIndex] = useState(null); // part index (3D -> table)

  useEffect(() => lsSet('flatpack.view', view), [view]);
  useEffect(() => lsSet('flatpack.showClearances', showClearances), [showClearances]);
  useEffect(() => lsSet('flatpack.showAreas', showAreas), [showAreas]);
  useEffect(() => lsSet('flatpack.showPieces', showPieces), [showPieces]);
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
            showAreas={showAreas}
            showPieces={showPieces}
            areas={roomAreas.rows}
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
        {!piece && showAreas && (
          <div className="total-chip">total {roomAreas.total.toFixed(1)} m²</div>
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
          <button
            className={showAreas ? 'active' : ''}
            data-tip={`Room areas: ${showAreas ? 'on' : 'off'}`}
            onClick={() => setShowAreas((v) => !v)}
          >
            m²
          </button>
          <button
            className={showPieces ? 'active' : ''}
            data-tip={`Pieces: ${showPieces ? 'shown' : 'hidden'}`}
            onClick={() => setShowPieces((v) => !v)}
          >
            🪑
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
