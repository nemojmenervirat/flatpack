// Node-side twin of src/apartments.js: list the apartments under
// src/data/apartments and load one the way the app does (its own pieces plus
// the shared catalogue pieces its scene places). Piece files are named by id.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/data');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function listApartments() {
  const root = join(dataDir, 'apartments');
  return readdirSync(root)
    .filter((d) => existsSync(join(root, d, 'apartment.json')))
    .sort();
}

export async function loadApartment(id) {
  const dir = join(dataDir, 'apartments', id);
  const apartment = json(join(dir, 'apartment.json'));
  const rooms = existsSync(join(dir, 'rooms.json')) ? json(join(dir, 'rooms.json')).rooms : [];
  const scene = json(join(dir, 'scene.json'));
  const piecesById = {};
  for (const pid of new Set(scene.placements.map((p) => p.piece))) {
    const local = join(dir, 'pieces', pid + '.json');
    const shared = join(dataDir, 'pieces', pid + '.json');
    if (!existsSync(local) && !existsSync(shared)) throw new Error(`${id}: scene places unknown piece ${pid}`);
    piecesById[pid] = json(existsSync(local) ? local : shared);
  }
  const tourPath = join(dir, 'tour.js');
  const tour = existsSync(tourPath) ? (await import(pathToFileURL(tourPath).href)).tour : null;
  return { id, dir, apartment, rooms, scene, piecesById, tour };
}

// CLI convention: positional args (anything not starting with --) name the
// apartments to check; none means every apartment.
export function apartmentArgs(argv = process.argv.slice(2)) {
  const all = listApartments();
  const ids = argv.filter((a) => !a.startsWith('--'));
  for (const id of ids)
    if (!all.includes(id)) {
      console.error(`unknown apartment "${id}" - have: ${all.join(', ')}`);
      process.exit(2);
    }
  return ids.length ? ids : all;
}
