import { useMemo, useState } from 'react';
import Viewer from './Viewer.jsx';
import { fitReport } from './geometry.js';
import { cutList, cutListCsv } from './cutlist.js';
import apartment from './data/apartment.json';
import scene from './data/scene.json';
import wardrobe from './data/wardrobe.json';
import wardrobeHall from './data/wardrobe-hall.json';
import bed from './data/bed.json';
import bed90 from './data/bed-90.json';
import bed180 from './data/bed-180.json';
import wardrobeMaster1 from './data/wardrobe-master-1.json';
import wardrobeDeskRoom5 from './data/wardrobe-desk-room5.json';
import wardrobeRoom6 from './data/wardrobe-room6.json';

const piecesById = {
  [wardrobe.id]: wardrobe,
  [wardrobeHall.id]: wardrobeHall,
  [wardrobeMaster1.id]: wardrobeMaster1,
  [wardrobeDeskRoom5.id]: wardrobeDeskRoom5,
  [wardrobeRoom6.id]: wardrobeRoom6,
  [bed.id]: bed,
  [bed90.id]: bed90,
  [bed180.id]: bed180,
};

export default function App() {
  const [showClearances, setShowClearances] = useState(true);

  const report = useMemo(() => fitReport(scene, piecesById, apartment), []);
  const rows = useMemo(() => cutList(scene, piecesById), []);

  const copyCsv = () => navigator.clipboard.writeText(cutListCsv(rows));

  return (
    <div className="app">
      <div className="canvas-pane">
        <Viewer apartment={apartment} report={report} showClearances={showClearances} />
      </div>

      <div className="side-pane">
        <h1>flatpack</h1>

        <section>
          <h2>Fit report</h2>
          {report.issues.length === 0 && <p className="ok">Everything fits.</p>}
          <ul className="issues">
            {report.issues.map((issue, i) => (
              <li key={i} className={issue.level}>
                {issue.level === 'collision' ? '✕' : '⚠'} {issue.text}
              </li>
            ))}
          </ul>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showClearances}
              onChange={(e) => setShowClearances(e.target.checked)}
            />
            show clearance zones
          </label>
        </section>

        <section>
          <h2>Cut list</h2>
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Cut (mm)</th>
                <th>Thk</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.part}</td>
                  <td>
                    {r.length} × {r.width}
                  </td>
                  <td>{r.thickness}</td>
                  <td>{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={copyCsv}>Copy as CSV (for cutlistoptimizer.com)</button>
        </section>

        <section>
          <h2>Pieces</h2>
          <ul className="pieces">
            {report.placed.map((p) => (
              <li key={p.id}>
                {p.name} — {Math.round(p.bbox.max[0] - p.bbox.min[0])} ×{' '}
                {Math.round(p.bbox.max[1] - p.bbox.min[1])} ×{' '}
                {Math.round(p.bbox.max[2] - p.bbox.min[2])} mm
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
