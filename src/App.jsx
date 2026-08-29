import { useEffect, useMemo, useState } from 'react';
import Viewer, { PieceViewer } from './Viewer.jsx';
import { fitReport, pieceLocalBBox, placeBox } from './geometry.js';
import { cutList, cutListCsv } from './cutlist.js';
import { partRows, hardwareList } from './hardware.js';
import apartment from './data/apartment.json';
import rooms from './data/rooms.json';
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
import sinkWc from './data/sink-wc.json';
import toilet from './data/toilet.json';
import toilet80 from './data/toilet-80.json';
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
  [sinkWc.id]: sinkWc,
  [toilet.id]: toilet,
  [toilet80.id]: toilet80,
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

// Rooms are final exact polygons: data/rooms.json defines each room as a
// union of axis-aligned rects (pos = min corner [x, y] mm, size = [w, d])
// with walls, stubs and door passages already carved out. Nothing is
// subtracted at runtime — the sidebar groups, m² labels, overlay shapes, and
// outline dimensions all read these rects as-is.
const roomDefs = rooms.rooms.map((r) => ({
  name: r.name,
  zones: r.rects.map((rc, i) => ({ name: `${r.name} zone ${i + 1}`, pos: rc.pos, size: rc.size })),
}));
const ROOM_ORDER = roomDefs.map((r) => r.name);

const roomAt = (x, y) => {
  const room = roomDefs.find((r) =>
    r.zones.some(
      (z) => x >= z.pos[0] && x <= z.pos[0] + z.size[0] && y >= z.pos[1] && y <= z.pos[1] + z.size[1]
    )
  );
  return room ? room.name : 'Elsewhere';
};

// The 3D overlay is the room polygon eroded 2 cm: a band along every boundary
// edge (extended past its ends to cover corners) is subtracted from the room
// rects, so the slab keeps an exact 2 cm gap to walls with no seam pinholes.
// The m² values use the un-padded rects — padding is presentation only.
const AREA_PAD = 20;
const AREA_EPS = 0.5;

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

// A boundary edge as its exclusion band: PAD deep toward the room interior,
// extended PAD past both ends so corner squares are covered too.
const edgeBand = (e) => {
  const lo = e.from - AREA_PAD;
  const hi = e.to + AREA_PAD;
  if (e.axis === 'v')
    return e.inward === 1 ? [e.coord, lo, e.coord + AREA_PAD, hi] : [e.coord - AREA_PAD, lo, e.coord, hi];
  return e.inward === 1 ? [lo, e.coord, hi, e.coord + AREA_PAD] : [lo, e.coord - AREA_PAD, hi, e.coord];
};

// Outline edges of a set of non-overlapping rects (the room's NET shape, so
// notches cut by stub walls, shafts, and doorways are part of the boundary):
// for every rect side, subtract the intervals where another rect of the set
// continues (interior seams), then merge collinear touching pieces into
// single lines. Each line gets one length label on the overlay.
const roomEdges = (zones) => {
  const segs = [];
  for (const f of zones) {
    const [x0, y0] = f.pos;
    const [x1, y1] = [x0 + f.size[0], y0 + f.size[1]];
    const sides = [
      { axis: 'v', coord: x0, from: y0, to: y1, inward: 1 }, // west
      { axis: 'v', coord: x1, from: y0, to: y1, inward: -1 }, // east
      { axis: 'h', coord: y0, from: x0, to: x1, inward: 1 }, // south
      { axis: 'h', coord: y1, from: x0, to: x1, inward: -1 }, // north
    ];
    for (const s of sides) {
      let pieces = [[s.from, s.to]];
      for (const g of zones) {
        if (g === f) continue;
        const [gx0, gy0] = g.pos;
        const [gx1, gy1] = [gx0 + g.size[0], gy0 + g.size[1]];
        const touches =
          s.axis === 'v'
            ? Math.abs((s.inward === 1 ? gx1 : gx0) - s.coord) < AREA_EPS
            : Math.abs((s.inward === 1 ? gy1 : gy0) - s.coord) < AREA_EPS;
        if (!touches) continue;
        const c0 = s.axis === 'v' ? gy0 : gx0;
        const c1 = s.axis === 'v' ? gy1 : gx1;
        pieces = pieces.flatMap(([a, b]) => {
          const i0 = Math.max(a, c0);
          const i1 = Math.min(b, c1);
          if (i1 - i0 <= AREA_EPS) return [[a, b]];
          const rest = [];
          if (i0 - a > AREA_EPS) rest.push([a, i0]);
          if (b - i1 > AREA_EPS) rest.push([i1, b]);
          return rest;
        });
      }
      for (const [a, b] of pieces) segs.push({ axis: s.axis, coord: s.coord, from: a, to: b, inward: s.inward });
    }
  }
  const byLine = new Map();
  for (const s of segs) {
    const key = `${s.axis}|${s.coord}|${s.inward}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(s);
  }
  const edges = [];
  for (const list of byLine.values()) {
    list.sort((a, b) => a.from - b.from);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      if (s.from - cur.to < AREA_EPS) cur.to = Math.max(cur.to, s.to);
      else {
        edges.push(cur);
        cur = { ...s };
      }
    }
    edges.push(cur);
  }
  return edges;
};

const roomAreas = (() => {
  const rows = roomDefs
    .filter((r) => r.zones.length > 0)
    .map(({ name, zones }) => {
      const edges = roomEdges(zones);
      const eroded = cutAll(
        zones.map((z) => [z.pos[0], z.pos[1], z.pos[0] + z.size[0], z.pos[1] + z.size[1]]),
        edges.map(edgeBand)
      );
      return {
        label: name,
        m2: zones.reduce((n, z) => n + z.size[0] * z.size[1], 0) / 1e6,
        rects: eroded.map((b, i) => ({
          name: `${name}#${i}`,
          pos: [b[0], b[1]],
          size: [b[2] - b[0], b[3] - b[1]],
        })),
        // label everything except micro-slivers
        edges: edges.filter((e) => e.to - e.from > 40),
        anchor: zones.reduce((a, b) => (a.size[0] * a.size[1] >= b.size[0] * b.size[1] ? a : b)),
      };
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
