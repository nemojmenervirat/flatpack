// The apartment registry. Every folder under src/data/apartments is one flat,
// named by the folder: apartment.json (walls, openings, floors) and scene.json
// (placements) are required; rooms.json (room polygons for the m² overlay),
// tour.js (the guided walk) and pieces/ (furniture built for this flat only)
// are optional. src/data/pieces is the shared catalogue of bought furniture.
// Nothing is registered by hand — drop the files in and they are picked up.
//
// Each entry carries everything the app needs for one flat, including a piece
// map that merges the flat's own pieces with the catalogue pieces its scene
// places. Piece ids are unique across the whole project (a catalogue piece and
// a local piece may not share an id) so cut-list exports and tour selectors
// never depend on which apartment is open.
const catalogue = Object.values(import.meta.glob('./data/pieces/*.json', { eager: true, import: 'default' }));
const files = import.meta.glob('./data/apartments/*/*.json', { eager: true, import: 'default' });
const tours = import.meta.glob('./data/apartments/*/tour.js', { eager: true, import: 'tour' });
const local = import.meta.glob('./data/apartments/*/pieces/*.json', { eager: true, import: 'default' });

const catalogueById = {};
for (const p of catalogue) {
  if (catalogueById[p.id]) throw new Error(`Duplicate catalogue piece id: ${p.id}`);
  catalogueById[p.id] = p;
}

const folderOf = (path) => path.split('/apartments/')[1].split('/')[0];
const ids = [...new Set(Object.keys(files).map(folderOf))].sort();

export const apartments = ids.map((id) => {
  const base = `./data/apartments/${id}/`;
  const apartment = files[`${base}apartment.json`];
  const scene = files[`${base}scene.json`];
  if (!apartment || !scene) throw new Error(`${id}: an apartment folder needs apartment.json and scene.json`);
  const piecesById = {};
  for (const [path, p] of Object.entries(local)) {
    if (folderOf(path) !== id) continue;
    if (piecesById[p.id]) throw new Error(`${id}: duplicate piece id ${p.id}`);
    if (catalogueById[p.id]) throw new Error(`${id}: piece id ${p.id} clashes with the shared catalogue`);
    piecesById[p.id] = p;
  }
  for (const pl of scene.placements) {
    if (piecesById[pl.piece]) continue;
    if (!catalogueById[pl.piece]) throw new Error(`${id}: scene places unknown piece ${pl.piece}`);
    piecesById[pl.piece] = catalogueById[pl.piece];
  }
  return {
    id,
    name: apartment.name || id,
    apartment,
    rooms: files[`${base}rooms.json`]?.rooms || [],
    scene,
    tour: tours[`${base}tour.js`] || null,
    piecesById,
  };
});

if (apartments.length === 0) throw new Error('No apartments found under src/data/apartments');

export const apartmentById = Object.fromEntries(apartments.map((a) => [a.id, a]));
