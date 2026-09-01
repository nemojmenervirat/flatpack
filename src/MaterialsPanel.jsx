import { useMemo, useState } from 'react';
import { materials, materialsMeta, family, fromPrice, thicknesses } from './materials.js';

// Browser for the material registry: every board in the Elgrad price list with
// its real swatch. Read-only, like the rest of the app - picking a material
// tells you the id to put in the piece JSON, it does not write files.

const SECTIONS = [
  ['all', 'all'],
  ['iverica', 'iverica'],
  ['iveral', 'iveral'],
  ['gloss', 'high gloss'],
  ['worktop', 'worktop'],
];

const FAMILIES = [
  ['all', 'all', null],
  ['wood', 'wood', '#c9a184'],
  ['white', 'white', '#f2f1ed'],
  ['beige', 'beige', '#d8c8ac'],
  ['grey', 'grey', '#9a9a98'],
  ['black', 'black', '#2a2c2f'],
  ['red', 'red', '#a4453f'],
  ['yellow', 'yellow', '#cfae4a'],
  ['green', 'green', '#6d8465'],
  ['blue', 'blue', '#5a728c'],
];

const price = (v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v);

function PriceRows({ title, rows, unit }) {
  const entries = Object.entries(rows || {});
  if (!entries.length) return null;
  return (
    <>
      <tr className="mat-sub">
        <th colSpan={2}>
          {title} <span className="muted-inline">{unit}</span>
        </th>
      </tr>
      {entries
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="num">{price(v)}</td>
          </tr>
        ))}
    </>
  );
}

function Detail({ id, m, usedBy, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <aside className="mat-detail">
      <button className="mat-close" onClick={onClose} title="Close">
        ×
      </button>
      {m.swatch ? (
        <img className="mat-hero" src={m.swatch} alt={m.name} />
      ) : (
        <div className="mat-hero mat-noswatch">no swatch</div>
      )}
      <h2>{m.name}</h2>
      <p className="mat-code">
        {m.code}
        {m.texture ? ` ${m.texture}` : ''}
        {m.brand ? ` · ${m.brand}` : ''}
        {m.format ? ` · ${m.format} mm` : ''}
      </p>

      <div className="mat-chipline">
        {m.color && (
          <span className="mat-swatchchip" style={{ background: m.color }} title="sampled mean colour" />
        )}
        <code>{m.color || '—'}</code>
        {m.range && (
          <span className="muted-inline">
            grain {m.range[0]} → {m.range[1]}
          </span>
        )}
      </div>

      <button className="mat-copy" onClick={copy}>
        {copied ? 'copied' : `⧉ "material": "${id}"`}
      </button>

      <table className="mat-prices">
        <tbody>
          <PriceRows title="Panel" rows={m.panel} unit={`mm · ${materialsMeta.units.panel}`} />
          <PriceRows title="Worktop" rows={m.worktop} unit={`width×thk · ${materialsMeta.units.worktop}`} />
          <PriceRows title="Laminate" rows={m.laminate} unit={`mm · ${materialsMeta.units.laminate}`} />
          <PriceRows title="ABS edging" rows={m.tape} unit={`thk/width · ${materialsMeta.units.tape}`} />
        </tbody>
      </table>

      {m.match && m.match !== 'slug' && (
        <p className="mat-warn">
          matched to the product page by decor code, not an exact slug — worth a click through to
          confirm it is the same board
        </p>
      )}
      {!m.color && <p className="mat-warn">no swatch found on elgrad.ba — colour unknown</p>}
      {usedBy.length > 0 && (
        <p className="mat-used">
          used by <b>{usedBy.join(', ')}</b>
        </p>
      )}
      {m.note && <p className="muted-inline">footnote {m.note} in the price list</p>}
      {m.source && (
        <p>
          <a href={m.source} target="_blank" rel="noreferrer">
            elgrad.ba ↗
          </a>
        </p>
      )}
    </aside>
  );
}

export default function MaterialsPanel({ usage = {} }) {
  const [q, setQ] = useState('');
  const [section, setSection] = useState('all');
  const [fam, setFam] = useState('all');
  const [thk, setThk] = useState('all');
  const [sel, setSel] = useState(null);

  const rows = useMemo(
    () =>
      Object.entries(materials).map(([id, m]) => ({
        id,
        m,
        fam: family(m),
        from: fromPrice(m),
        thk: thicknesses(m),
      })),
    []
  );

  const allThk = useMemo(
    () => [...new Set(rows.flatMap((r) => r.thk))].sort((a, b) => a - b),
    [rows]
  );

  const shown = rows.filter((r) => {
    const needle = q.toLowerCase().trim();
    if (needle && !`${r.id} ${r.m.name} ${r.m.brand || ''}`.toLowerCase().includes(needle)) return false;
    if (section !== 'all' && r.m.section !== section) return false;
    if (fam !== 'all' && r.fam !== fam) return false;
    if (thk !== 'all' && !r.thk.includes(+thk)) return false;
    return true;
  });

  return (
    <div className="mat-pane">
      <div className="mat-bar">
        <input
          type="search"
          placeholder={`Search ${rows.length} decors…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          {SECTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={thk} onChange={(e) => setThk(e.target.value)}>
          <option value="all">any thickness</option>
          {allThk.map((t) => (
            <option key={t} value={t}>
              {t} mm
            </option>
          ))}
        </select>
        <div className="mat-fams">
          {FAMILIES.map(([v, l, c]) => (
            <button
              key={v}
              className={fam === v ? 'active' : ''}
              onClick={() => setFam(v)}
              title={l}
              style={c ? { background: c, color: '#16181c' } : undefined}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="muted-inline">{shown.length} shown</span>
      </div>

      <div className="mat-grid">
        {shown.map((r) => (
          <button
            key={r.id}
            className={sel === r.id ? 'mat-card active' : 'mat-card'}
            onClick={() => setSel(r.id)}
          >
            {r.m.swatch ? (
              <img src={r.m.swatch} alt="" loading="lazy" />
            ) : (
              <span className="mat-noswatch" style={{ background: r.m.color || '#33363c' }} />
            )}
            <span className="mat-name">{r.m.name}</span>
            <span className="mat-meta">
              {r.m.code}
              {r.m.texture ? ` ${r.m.texture}` : ''}
              {r.from ? ` · ${price(r.from)} KM` : ''}
            </span>
            {usage[r.id] && <span className="mat-inuse">in use</span>}
          </button>
        ))}
        {!shown.length && <p className="muted-inline">nothing matches that filter.</p>}
      </div>

      <div className="mat-foot muted-inline">
        {materialsMeta.note} Source: {materialsMeta.source}.
      </div>

      {sel && materials[sel] && (
        <Detail id={sel} m={materials[sel]} usedBy={usage[sel] || []} onClose={() => setSel(null)} />
      )}
    </div>
  );
}
