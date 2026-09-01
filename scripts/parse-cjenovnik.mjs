// Parse the Elgrad retail price list PDF into a raw decor table.
//
//   pdftotext -bbox-layout inputs/BiH-cjenovnik-MPC-<date>.pdf cj.xml
//   node scripts/parse-cjenovnik.mjs cj.xml > decors.raw.json
//
// The PDF is an Excel export. `pdftotext -layout` is not usable here: a row
// with blank cells collapses and the remaining numbers slide left, so four
// values land under seven columns. So this works from word coordinates:
//
//  - a page holds one or more sub-tables, each starting at a header line
//    carrying "Naziv" (dekora) - page 5 alone has three, with different
//    thickness columns each;
//  - inside a sub-table, price cells are found by merging every numeric /
//    #N/A word whose x-interval overlaps another's, which gives the columns;
//  - each column takes its label from the header words standing above it.
//
// Output is deliberately raw - column labels as printed, values by column
// index. build-materials.mjs maps them onto canonical fields.

import { readFileSync } from 'fs';

// Board pages only: 1-3 oplemenjena iverica, 4-5 iveral / decor panels,
// 6 high-gloss MDF, 7-8 worktops. 9-10 are laminate and compact sheets,
// 11 raw MDF/HDF (no decor codes), 12 services.
const PAGES = {
  1: { section: 'iverica', format: '2800 x 2070' },
  2: { section: 'iverica', format: '2800 x 2070' },
  3: { section: 'iverica', format: '2800 x 2070' },
  4: { section: 'iveral', format: '2800 x 2070' },
  5: { section: 'iveral', format: '2800 x 2070' },
  6: { section: 'gloss', format: '2800 x 1220' },
  7: { section: 'worktop', format: null },
  8: { section: 'worktop', format: null },
};

const VALUE = /^(\d{1,3}(?:,\d{1,2})?|#N\/A|NA)$/;
const isValue = (t) => VALUE.test(t);
const num = (t) => (/^\d/.test(t) ? Number(t.replace(',', '.')) : null);

const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;

function pageWords(pageXml) {
  const words = [];
  let m;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(pageXml))) {
    const text = m[5]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
    if (!text) continue;
    const [x0, y0, x1, y1] = [+m[1], +m[2], +m[3], +m[4]];
    words.push({ text, x0, x1, y0, y1, xc: (x0 + x1) / 2, yc: (y0 + y1) / 2 });
  }
  return words;
}

// Words sharing a baseline within 3pt are one line.
function toLines(words) {
  const lines = [];
  for (const w of [...words].sort((a, b) => a.yc - b.yc || a.x0 - b.x0)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.yc - w.yc) < 3) {
      last.words.push(w);
      last.yc = (last.yc * (last.words.length - 1) + w.yc) / last.words.length;
    } else {
      lines.push({ yc: w.yc, words: [w] });
    }
  }
  for (const l of lines) {
    l.words.sort((a, b) => a.x0 - b.x0);
    for (const w of l.words) w.line = l;
  }
  return lines;
}

// A number inside a name sits tight against its neighbours ("18,9" then "mm",
// ~2pt apart); a real cell stands alone in its column with far more whitespace
// either side. 8pt separates the two cleanly.
const MARKER = /^[€°*+]+$/; // currency and footnote marks glued to a price
function isolated(w) {
  for (const o of w.line.words) {
    if (o === w || MARKER.test(o.text)) continue;
    if (o.x1 <= w.x0 && w.x0 - o.x1 < 8) return false;
    if (o.x0 >= w.x1 && o.x0 - w.x1 < 8) return false;
  }
  return true;
}

export function parsePages(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf8');
  const pages = xml.split(/<page /).slice(1);
  const rows = [];
  const tables = [];

  pages.forEach((pageXml, idx) => {
    const pageNo = idx + 1;
    const meta = PAGES[pageNo];
    if (!meta) return;

    const words = pageWords(pageXml);
    const lines = toLines(words);

    // Each "Naziv (dekora)" line opens a sub-table that runs to the next one.
    const headers = lines.filter((l) => l.words.some((w) => w.text === 'Naziv'));
    if (!headers.length) return;

    let prevBottom = -Infinity;
    headers.forEach((header, hi) => {
      const headerY = Math.max(...header.words.map((w) => w.y1));
      const nextY = headers[hi + 1] ? headers[hi + 1].yc : Infinity;

      const at = (t) =>
        header.words.find((w) => w.text === t) ||
        words.find((w) => w.text === t && Math.abs(w.yc - header.yc) < 12);
      const rbr = at('R.') || at('R. br.');
      const rbrX = rbr ? rbr.x1 + 12 : 60;
      const sifra = at('Šifra');
      const struktura = at('Struktura');
      const sifraX = sifra ? sifra.x0 - 6 : rbrX;
      const strukturaX = struktura ? struktura.x0 - 6 : sifraX + 40;
      // The Šifra column is numeric for some suppliers ("539", "1167"), so
      // nothing left of the name column can be a price.
      const nazivX = struktura ? struktura.x1 + 6 : strukturaX + 40;

      const anchors = lines.filter(
        (l) =>
          l.yc > headerY &&
          l.yc < nextY &&
          /^\d{1,3}$/.test(l.words[0].text) &&
          l.words[0].x0 < rbrX
      );
      if (!anchors.length) return;

      // A row can run over two printed lines with its R. br. centred between
      // them ("Klasična bijela ... / 8 mm 24,50"), so a row is the band of
      // words around its anchor, bounded halfway to the neighbouring anchors.
      const gaps = anchors.slice(1).map((a, i) => a.yc - anchors[i].yc);
      const rowH = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;
      const dataLines = anchors.map((a, i) => {
        const top = i ? (anchors[i - 1].yc + a.yc) / 2 : Math.max(headerY, a.yc - rowH);
        const bottom = i < anchors.length - 1 ? (a.yc + anchors[i + 1].yc) / 2 : Math.min(nextY, a.yc + rowH);
        const words = lines
          .filter((l) => l.yc > top && l.yc <= bottom)
          // Footnotes under a table ("° Za kantiranje dekora ...") sit in the
          // left margin, outside the Šifra column; a wrapped row line never
          // does. Without this they merge into the last row of the table.
          .filter((l) => l === a || l.words[0].x0 >= sifraX)
          .flatMap((l) => l.words)
          .sort((a2, b2) => a2.x0 - b2.x0);
        return { yc: a.yc, top, bottom, words, anchor: a };
      });

      const candidates = (l) =>
        l.words.filter((w) => isValue(w.text) && w.xc > nazivX && isolated(w));

      // Columns: merge cells whose x-intervals overlap. Clustering on centres
      // instead would split a column whenever cell widths differ ("9,90" vs
      // "337,45"), and real columns are separated by more whitespace than any
      // cell is wide.
      const cells = dataLines.flatMap(candidates).sort((a, b) => a.x0 - b.x0);
      const cols = [];
      for (const w of cells) {
        const last = cols[cols.length - 1];
        if (last && w.x0 < last.max) {
          last.max = Math.max(last.max, w.x1);
          last.hits++;
        } else {
          cols.push({ min: w.x0, max: w.x1, hits: 1 });
        }
      }
      // Keep even a column with a single cell: the 8mm variant of Klasična
      // bijela is priced once on the whole page. Stray numbers can't reach
      // here - they are filtered by isolated() and by the name-column bound.
      const valueCols = cols;
      if (!valueCols.length) return;

      // Column label: header words standing over it, read top to bottom. The
      // band stops below the previous sub-table's rows and above this header.
      const bandTop = Math.max(headerY - 60, prevBottom + 3);
      for (const c of valueCols) {
        c.label = words
          .filter(
            (w) => w.yc < headerY + 2 && w.yc > bandTop && w.xc > c.min - 10 && w.xc < c.max + 10
          )
          .sort((a, b) => a.yc - b.yc || a.x0 - b.x0)
          .map((w) => w.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const textEnd = valueCols[0].min - 12;
      const tableId = tables.length;
      let used = 0;

      for (const l of dataLines) {
        const mine = candidates(l);

        // A row printed over two lines can carry a second line that re-labels
        // the columns for one thickness ("8 mm  24,50" under Klasična bijela).
        // Those values belong to that thickness, not to the row's own columns.
        const relabel = [...new Set(l.words.map((w) => w.line))]
          .filter((line) => line !== l.anchor)
          .map((line) => {
            const mm = line.words.findIndex((w) => w.text === 'mm');
            const n = mm > 0 ? line.words[mm - 1].text : null;
            return n && /^\d{1,2}$/.test(n) && line.words[mm - 1].x0 < textEnd
              ? { line, thickness: +n }
              : null;
          })
          .find(Boolean);

        // Text comes from the anchor line. A tall row centres its R. br.
        // between two printed lines, so if the anchor carries no name, read the
        // rest of the band - minus the re-label line, which is not prose.
        const words = (all) =>
          (all ? l.words.filter((w) => !relabel || w.line !== relabel.line) : l.anchor.words);
        const pickFrom = (all, lo, hi) =>
          words(all)
            .filter((w) => w.xc >= lo && w.xc < hi && !mine.includes(w))
            .map((w) => w.text)
            .join(' ')
            .trim();
        const pick = (lo, hi) => pickFrom(false, lo, hi);

        const row = {
          page: pageNo,
          table: tableId,
          section: meta.section,
          format: meta.format,
          nr: +l.words[0].text,
          code: pick(sifraX, strukturaX),
          texture: pick(strukturaX, nazivX),
          name: pick(nazivX, textEnd),
          cells: valueCols.map(() => null),
        };
        if (!row.name) row.name = pickFrom(true, nazivX, textEnd);
        if (!row.name) row.name = pick(strukturaX, textEnd);
        // Footnote markers ("- NOVO °", "Bijela premium *") point at a remark
        // printed under the table; keep the marker, drop it from the name.
        const marks = row.name.match(/[°*^~]+/g);
        if (marks) {
          row.note = marks.join('');
          row.name = row.name.replace(/\s*[°*^~]+\s*/g, ' ').trim();
        }
        // A few rows are named but uncoded ("VICENZA HRAST"); keep them.
        if (!row.code && !row.name) continue;

        valueCols.forEach((c, ci) => {
          const cell = mine.find(
            (w) => w.xc > c.min && w.xc < c.max && (!relabel || w.line !== relabel.line)
          );
          if (!cell) return;
          const v = num(cell.text);
          row.cells[ci] = v !== null ? v : cell.text === 'NA' ? 'na upit' : null;
        });
        if (relabel) {
          const extra = mine.filter((w) => w.line === relabel.line && num(w.text) !== null);
          if (extra.length) row.extra = { [relabel.thickness]: num(extra[0].text) };
        }
        rows.push(row);
        used++;
      }

      prevBottom = dataLines[dataLines.length - 1].bottom;
      if (used) {
        tables.push({
          id: tableId,
          page: pageNo,
          section: meta.section,
          columns: valueCols.map((c) => ({ label: c.label, x: Math.round(c.min) })),
        });
      }
    });
  });

  // Drop columns no surviving row uses (they come from lines rejected for
  // having no decor code) so the column list matches the data.
  for (const t of tables) {
    const mine = rows.filter((r) => r.table === t.id);
    const keep = t.columns.map((_, i) => mine.some((r) => r.cells[i] !== null));
    t.columns = t.columns.filter((_, i) => keep[i]);
    for (const r of mine) r.cells = r.cells.filter((_, i) => keep[i]);
  }

  return { rows, tables };
}

if (process.argv[1] && process.argv[1].endsWith('parse-cjenovnik.mjs')) {
  const parsed = parsePages(process.argv[2]);
  process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
  process.stderr.write(`${parsed.rows.length} rows in ${parsed.tables.length} tables\n`);
  for (const t of parsed.tables) {
    process.stderr.write(
      `  p${t.page} t${t.id} ${t.section}: ${t.columns.length} cols [${t.columns
        .map((c) => c.label || '?')
        .join(' | ')}]\n`
    );
  }
}
