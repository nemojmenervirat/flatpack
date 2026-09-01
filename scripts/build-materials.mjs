// Build src/data/materials.json: every board material in the Elgrad price
// list, with its real colour sampled from the supplier's own swatch photo.
//
//   node scripts/build-materials.mjs [--offline] [--refresh] [--only=CODE]
//
//   (default)   parse the PDF, resolve each decor on elgrad.ba, download any
//               swatch not cached yet, sample its colour, write the registry
//   --offline   prices only, keep whatever colours/swatches are already there
//   --refresh   re-download and re-sample swatches even if cached
//   --only=U708 restrict the network half to decors whose code matches
//
// Needs poppler's pdftotext (parsing) and macOS sips (image downscaling).
// Swatches land in public/swatches/ at 240px; the registry stores the mean
// colour plus the grain's dark/light bounds, so the viewer can use a flat
// colour that is honestly the average of the real board.

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { inflateSync } from 'zlib';
import { parsePages } from './parse-cjenovnik.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://elgrad.ba';
const SWATCH_DIR = join(root, 'public', 'swatches');
const OUT = join(root, 'src', 'data', 'materials.json');

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const refresh = args.includes('--refresh');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);

// ---------------------------------------------------------------- price list

function findPdf() {
  const dir = join(root, 'inputs');
  const pdfs = readdirSync(dir).filter((f) => /cjenovnik.*\.pdf$/i.test(f)).sort();
  if (!pdfs.length) throw new Error('no cjenovnik PDF in inputs/');
  return join(dir, pdfs[pdfs.length - 1]);
}

// Column labels are the header text as printed, so they carry the group
// heading too ("iverica 2070 mm Debljina 18 mm"). Each maps to one field.
function classify(label) {
  const l = label.replace(/\s+/g, ' ').trim();
  if (/ABS|traka|Laser/i.test(l)) {
    const spec = l
      .replace(/ABS|traka|mm/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\/\s*/g, '/');
    return { kind: 'tape', key: /Laser/i.test(l) ? `laser ${spec.replace(/Laser/i, '').trim()}` : spec };
  }
  if (/Laminati/i.test(l)) {
    const t = l.match(/deb\.?(\d,\d+)/);
    return t ? { kind: 'laminate', key: t[1] } : null;
  }
  const width = l.match(/[šŠ]\s*(\d{3})/);
  if (width) {
    const t = l.match(/(\d{2})\s*mm\s*(?:\d+)?$/);
    return t ? { kind: 'worktop', key: `${width[1]}x${t[1]}` } : null;
  }
  // Postforming worktops are headed "<thickness>/<width>", e.g. 39/600.
  const pf = l.match(/^(\d{2})\/(\d{3,4})$/);
  if (pf) return { kind: 'worktop', key: `${pf[2]}x${pf[1]}` };
  const mm = [...l.matchAll(/(\d{1,2}(?:,\d)?)\s*mm/g)].pop();
  if (mm) return { kind: 'panel', key: mm[1].replace(',', '.') };
  return null;
}

function readPriceList() {
  const pdf = findPdf();
  const xml = join(tmpdir(), 'flatpack-cjenovnik.xml');
  execFileSync('pdftotext', ['-bbox-layout', pdf, xml]);
  const { rows, tables } = parsePages(xml);
  rmSync(xml, { force: true });

  const byId = Object.fromEntries(tables.map((t) => [t.id, t]));
  const decors = new Map();
  let unclassified = 0;

  // A code+texture is not a unique product: "Klasična bijela" and "Klasična
  // bijela P3 VLAGOOTPORNA" are both W960 SM at different prices. Decors that
  // carry variants get the name in their id; everything else stays short.
  const nameKey = (r) => r.name.toLowerCase().replace(/[^a-zžčćšđ0-9]+/g, ' ').trim();
  const variants = new Map();
  for (const r of rows) {
    if (!r.code) continue;
    const base = [r.code, r.texture].filter(Boolean).join(' ');
    const set = variants.get(base) || variants.set(base, new Set()).get(base);
    set.add(nameKey(r));
  }

  for (const r of rows) {
    if (!r.code) continue;
    const base = [r.code, r.texture].filter(Boolean).join(' ');
    const id = variants.get(base).size > 1 ? `${base} · ${r.name}` : base;
    const entry =
      decors.get(id) ||
      decors
        .set(id, {
          code: r.code,
          texture: r.texture || null,
          name: r.name,
          section: r.section,
          format: r.format,
          panel: {},
          worktop: {},
          laminate: {},
          tape: {},
        })
        .get(id);
    // A decor listed on several pages keeps the fullest name.
    if (r.name.length > entry.name.length) entry.name = r.name;
    entry.id = id;
    if (r.note) entry.note = r.note;
    if (r.section === 'worktop') entry.worktopSection = true;

    const cols = byId[r.table].columns;
    r.cells.forEach((v, i) => {
      if (typeof v !== 'number') return;
      const c = classify(cols[i].label);
      if (!c) {
        unclassified++;
        return;
      }
      entry[c.kind][c.key] = v;
    });
    for (const [mm, v] of Object.entries(r.extra || {})) entry.panel[mm] = v;
  }

  for (const e of decors.values()) {
    for (const k of ['panel', 'worktop', 'laminate', 'tape']) {
      if (!Object.keys(e[k]).length) delete e[k];
    }
  }
  return { decors, rows: rows.length, unclassified, pdf: pdf.split('/').pop() };
}

// ------------------------------------------------------------------ the site

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const SUFFIX = { iverica: 'oi', iveral: 'oi', gloss: 'oi', worktop: 'krp' };

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'flatpack-materials/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadCatalogue() {
  const brands = Object.fromEntries(
    (await getJson(`${SITE}/wp-json/wp/v2/brand?per_page=100&_fields=id,name`)).map((b) => [
      b.id,
      b.name.replace(/&amp;/g, '&'),
    ])
  );
  const products = [];
  for (let page = 1; ; page++) {
    const batch = await getJson(
      `${SITE}/wp-json/wp/v2/proizvod?per_page=100&page=${page}&_fields=id,slug,title,link,featured_media,brand`
    );
    products.push(...batch);
    if (batch.length < 100) break;
  }
  return { brands, products };
}

// Resolve a decor to its product page. The slug is usually
// <code>-<texture>-<suffix>, but suppliers outside Egger use their own
// wording, so fall back to the code as a token in the slug or title and let
// the decor name break ties.
function resolve(decor, products) {
  const code = norm(decor.code);
  const want = [code, norm(decor.texture), SUFFIX[decor.section]].filter(Boolean).join('-');
  const exact = products.find((p) => p.slug === want);
  if (exact) return { product: exact, match: 'slug' };

  const startsWithCode = (p) => p.slug === code || p.slug.startsWith(`${code}-`);
  const inTitle = (p) => new RegExp(`(^|[^a-z0-9])${code}([^a-z0-9]|$)`, 'i').test(norm(p.title.rendered));
  let cand = products.filter((p) => startsWithCode(p) && p.slug.endsWith(`-${SUFFIX[decor.section]}`));
  let match = 'code+kind';
  if (!cand.length) {
    cand = products.filter((p) => startsWithCode(p) || inTitle(p));
    match = 'code';
  }
  if (!cand.length) return null;
  if (cand.length === 1) return { product: cand[0], match };

  // Several products share the code (a decor sold as panel, worktop, laminate
  // and edging). Score on the words of the decor's own name.
  const words = norm(`${decor.texture} ${decor.name}`).split('-').filter((w) => w.length > 2);
  const score = (p) => {
    const hay = `${norm(p.title.rendered)}-${p.slug}`;
    let s = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    if (p.slug.endsWith(`-${SUFFIX[decor.section]}`)) s += 2;
    return s;
  };
  cand.sort((a, b) => score(b) - score(a));
  return { product: cand[0], match: `${match}+name` };
}

async function mediaUrls(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const list = await getJson(
      `${SITE}/wp-json/wp/v2/media?include=${batch.join(',')}&per_page=100&_fields=id,source_url`
    );
    for (const m of list) out[m.id] = m.source_url;
  }
  return out;
}

// ------------------------------------------------------------------- colours

function readPng(buf) {
  let i = 8;
  let idat = Buffer.alloc(0);
  let w, h, colorType;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      colorType = body[9];
    } else if (type === 'IDAT') idat = Buffer.concat([idat, body]);
    i += 12 + len;
  }
  // 0 grey, 2 RGB, 4 grey+alpha, 6 RGBA. A few supplier swatches are greyscale
  // JPEGs, which sips keeps greyscale on the way to PNG.
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const grey = colorType === 0 || colorType === 4;
  const raw = inflateSync(idat);
  const stride = w * bpp;
  const px = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < stride; x += bpp) {
      px.push(grey ? [line[x], line[x], line[x]] : [line[x], line[x + 1], line[x + 2]]);
    }
    prev = line;
  }
  return px;
}

const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// Mean colour of the swatch, plus the bounds the grain swings between. A board
// photo is mostly its own colour, so a plain mean is the honest flat stand-in.
function sample(pngPath) {
  const px = readPng(readFileSync(pngPath));
  const n = px.length;
  const mean = [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / n);
  const lum = [...px].sort(
    (a, b) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2] - (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2])
  );
  return {
    color: hex(mean),
    range: [hex(lum[Math.floor(n * 0.05)]), hex(lum[Math.floor(n * 0.95)])],
  };
}

async function swatchFor(id, url) {
  const file = join(SWATCH_DIR, `${norm(id)}.jpg`);
  const tmp = join(tmpdir(), `flatpack-swatch-${process.pid}`);
  if (refresh || !existsSync(file)) {
    const res = await fetch(url, { headers: { 'user-agent': 'flatpack-materials/1.0' } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    writeFileSync(`${tmp}.src`, Buffer.from(await res.arrayBuffer()));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '240', `${tmp}.src`, '--out', file], {
      stdio: 'ignore',
    });
  }
  execFileSync('sips', ['-s', 'format', 'png', '-z', '24', '24', file, '--out', `${tmp}.png`], {
    stdio: 'ignore',
  });
  const s = sample(`${tmp}.png`);
  rmSync(`${tmp}.png`, { force: true });
  rmSync(`${tmp}.src`, { force: true });
  return { ...s, swatch: `/swatches/${norm(id)}.jpg` };
}

// ---------------------------------------------------------------------- main

const { decors, rows, unclassified, pdf } = readPriceList();
console.log(`price list: ${rows} rows -> ${decors.size} decors (${unclassified} cells unclassified)`);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { materials: {} };
const materials = {};

if (!offline) {
  mkdirSync(SWATCH_DIR, { recursive: true });
  const { brands, products } = await loadCatalogue();
  console.log(`catalogue: ${products.length} products`);

  const hits = [];
  for (const [id, d] of decors) {
    if (only && !id.toLowerCase().includes(only.toLowerCase())) continue;
    const r = resolve(d, products);
    if (r) hits.push({ id, d, ...r });
  }
  const media = await mediaUrls([...new Set(hits.map((h) => h.product.featured_media).filter(Boolean))]);
  console.log(`resolved ${hits.length}/${decors.size} decors, ${Object.keys(media).length} swatches`);

  let done = 0;
  let failed = 0;
  for (const h of hits) {
    const url = media[h.product.featured_media];
    h.d.source = h.product.link;
    h.d.match = h.match;
    if (h.product.brand?.length) h.d.brand = brands[h.product.brand[0]] || null;
    if (!url) continue;
    try {
      await new Promise((r) => setTimeout(r, 120)); // be a polite guest
      Object.assign(h.d, await swatchFor(h.id, url));
      done++;
    } catch (e) {
      failed++;
      console.warn(`  ! ${h.id}: ${e.message}`);
    }
    if (done % 25 === 0 && done) process.stdout.write(`  sampled ${done}...\n`);
  }
  console.log(`sampled ${done} swatches (${failed} failed)`);
}

for (const [id, d] of decors) {
  // Keep colours from an earlier run for decors skipped this time.
  const old = previous.materials?.[id];
  if (!d.color && old?.color) Object.assign(d, { color: old.color, range: old.range, swatch: old.swatch, source: old.source, brand: old.brand, match: old.match });
  materials[id] = d;
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: pdf,
      currency: 'KM',
      units: { panel: 'KM/m²', worktop: 'KM/m¹', laminate: 'KM/m²', tape: 'KM/m¹' },
      note: 'Prices as printed in the Elgrad retail price list. Colours are the mean of the supplier swatch photo, not a colorimetric match.',
      materials,
    },
    null,
    2
  ) + '\n'
);

const withColor = Object.values(materials).filter((m) => m.color).length;
console.log(`wrote ${OUT}: ${Object.keys(materials).length} materials, ${withColor} with a sampled colour`);
