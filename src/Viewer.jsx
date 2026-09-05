import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, Html, Edges } from '@react-three/drei';
import { Vector3, MathUtils, CanvasTexture, RepeatWrapping, SRGBColorSpace, Shape, Path, ExtrudeGeometry } from 'three';
import { aabbOf, pieceLocalBBox, walkMove, walkObstacles, frontFrame } from './geometry.js';
import { TOUR, createTour, tickTour, endTour, resolveTarget, doorGeometry } from './tour.js';
import { partColor } from './materials.js';

// Glow added to a part while it is hovered in the 3D view or in the parts
// table. Warm and bright enough to read on white boards under full light.
const HOVER_EMISSIVE = '#b08a2e';

// Wall paint: RAL 9001 Cream (sRGB approximation of the RAL Classic swatch).
const WALL_PAINT = '#fdf4e3';

// Data space is mm, [x, y, z] with z up.
// Three.js is y-up, meters. Mapping: three.x = x, three.y = z, three.z = -y.
// (z must be NEGATED: three.z = +y flips handedness and mirrors the plan.)
const S = 1 / 1000;

const cm = (mm) => {
  const v = mm / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// Procedural oak plank texture: the canvas covers WOOD_TILE_MM × WOOD_TILE_MM of
// floor, planks 200mm wide with staggered joints, per-plank tone jitter and grain.
// Deterministic PRNG so hot reloads don't reshuffle the floor.
const WOOD_TILE_MM = 2400;
function makeWoodTexture() {
  const px = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const rows = 10; // 10 planks of 240mm across the 2400mm tile
  const rowH = px / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    let x = -rnd() * px * 0.6;
    while (x < px) {
      const len = px * (0.38 + rnd() * 0.45); // 900–2000mm boards
      // warm natural oak with tonal drift ALONG the board, not flat rectangles
      const t0 = 0.92 + rnd() * 0.12;
      const t1 = 0.92 + rnd() * 0.12;
      const tm = (t0 + t1) / 2 + (rnd() - 0.5) * 0.08;
      const oak = (t) => `rgb(${(216 * t) | 0},${(174 * t) | 0},${(126 * t) | 0})`;
      const grad = ctx.createLinearGradient(x, 0, x + len, 0);
      grad.addColorStop(0, oak(t0));
      grad.addColorStop(0.5, oak(tm));
      grad.addColorStop(1, oak(t1));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, len, rowH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, len, rowH);
      ctx.clip();

      // pronounced straight grain along the board
      const streaks = 14 + ((rnd() * 6) | 0);
      for (let k = 0; k < streaks; k++) {
        const gy = y + ((k + 0.5) / streaks) * rowH + (rnd() - 0.5) * 8;
        const heavy = rnd() > 0.75;
        ctx.strokeStyle = `rgba(146,100,58,${heavy ? 0.16 + rnd() * 0.1 : 0.07 + rnd() * 0.07})`;
        ctx.lineWidth = heavy ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + len * 0.33, gy + (rnd() - 0.5) * 9, x + len * 0.66, gy + (rnd() - 0.5) * 9, x + len, gy + (rnd() - 0.5) * 5);
        ctx.stroke();
      }

      // cathedral figures: long nested arcs with real contrast
      const figs = 1 + (rnd() > 0.45 ? 1 : 0);
      for (let f = 0; f < figs; f++) {
        const cx = x + len * (0.25 + rnd() * 0.5);
        const cy = y + rowH * (0.3 + rnd() * 0.4);
        const rings = 5 + ((rnd() * 4) | 0);
        for (let i = 1; i <= rings; i++) {
          ctx.strokeStyle = `rgba(148,100,56,${0.14 + rnd() * 0.12})`;
          ctx.lineWidth = 1.2 + rnd() * 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, i * (len * 0.09), i * (rowH * 0.085), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // occasional knot with a hairline crack
      if (rnd() > 0.65) {
        const kx = x + len * (0.15 + rnd() * 0.7);
        const ky = y + rowH * (0.25 + rnd() * 0.5);
        ctx.fillStyle = 'rgba(96,66,38,0.9)';
        ctx.beginPath();
        ctx.ellipse(kx, ky, 5 + rnd() * 5, 4 + rnd() * 3, rnd(), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,82,46,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 12 + rnd() * 6, 8 + rnd() * 4, rnd(), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(92,62,36,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(kx - 40 - rnd() * 80, ky + (rnd() - 0.5) * 12);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + 40 + rnd() * 80, ky + (rnd() - 0.5) * 12);
        ctx.stroke();
      }
      ctx.restore();

      // butt joint (subtle)
      ctx.fillStyle = 'rgba(140,108,74,0.5)';
      ctx.fillRect(x + len - 1, y, 2, rowH);
      x += len;
    }
    // board edge seam
    ctx.fillStyle = 'rgba(140,108,74,0.45)';
    ctx.fillRect(0, y, px, 1.5);
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Procedural cement/limestone tile texture ("Cement Limestone 59×59"): the
// canvas covers a 4×4 grid of 590mm tiles with 3mm grout joints. Each tile
// gets a per-tile base tone, soft cloudy blotches and faint trowel sweeps
// like honed cement, plus fine speckle. World-aligned in FloorZone, so the
// grid is anchored to apartment coordinates, runs continuously across zones,
// and tiles are cut wherever a zone edge lands.
const CERAMIC_MM = 593; // 590 tile + 3 grout
const CERAMIC_GRID_MM = CERAMIC_MM * 4;
function makeTileTexture() {
  const px = 2048;
  const cell = px / 4;
  const joint = (3 * px) / CERAMIC_GRID_MM; // 3mm in canvas px
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // grout fills the canvas; tiles are drawn inset so joints show between them
  ctx.fillStyle = 'rgb(139,132,120)';
  ctx.fillRect(0, 0, px, px);

  const grey = (t) => `rgb(${(181 * t) | 0},${(174 * t) | 0},${(162 * t) | 0})`;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * cell + joint / 2;
      const y = row * cell + joint / 2;
      const w = cell - joint;
      ctx.fillStyle = grey(0.96 + rnd() * 0.07);
      ctx.fillRect(x, y, w, w);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, w);
      ctx.clip();

      // large soft cloudy patches, lighter and darker
      const blobs = 6 + ((rnd() * 5) | 0);
      for (let b = 0; b < blobs; b++) {
        const bx = x + rnd() * w;
        const by = y + rnd() * w;
        const br = w * (0.18 + rnd() * 0.35);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, rnd() > 0.5 ? `rgba(207,201,191,${0.14 + rnd() * 0.1})` : `rgba(141,134,122,${0.1 + rnd() * 0.08})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, w);
      }

      // faint broad trowel sweeps
      const sweeps = 4 + ((rnd() * 4) | 0);
      for (let s = 0; s < sweeps; s++) {
        ctx.strokeStyle =
          rnd() > 0.45
            ? `rgba(210,204,194,${0.05 + rnd() * 0.06})`
            : `rgba(135,128,116,${0.04 + rnd() * 0.05})`;
        ctx.lineWidth = 8 + rnd() * 22;
        const x0 = x + rnd() * w;
        const y0 = y + rnd() * w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(
          x0 + (rnd() - 0.5) * w, y0 + (rnd() - 0.5) * w,
          x0 + (rnd() - 0.5) * w, y0 + (rnd() - 0.5) * w,
          x + rnd() * w, y + rnd() * w
        );
        ctx.stroke();
      }

      // fine speckle / pits
      const dots = 70 + ((rnd() * 60) | 0);
      for (let d = 0; d < dots; d++) {
        ctx.fillStyle = rnd() > 0.5 ? `rgba(126,119,107,${0.1 + rnd() * 0.2})` : `rgba(214,208,198,${0.1 + rnd() * 0.2})`;
        ctx.fillRect(x + rnd() * w, y + rnd() * w, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }

      // slightly darker rim so joints still read from far away
      ctx.strokeStyle = 'rgba(120,113,101,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, w - 2);
      ctx.restore();
    }
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// One floor zone; texture:"wood" gets the plank map, texture:"tile" the
// 59×59 cement tile map, both scaled to mm and anchored to world coordinates.
// onClick is wired up by walk mode (drop-in / glide targets land on floors).
function FloorZone({ f, wood, tile, onClick }) {
  const box = aabbOf(f.pos, f.size);
  const tex = useMemo(() => {
    const src = f.texture === 'wood' ? wood : f.texture === 'tile' ? tile : null;
    if (!src) return null;
    const mm = f.texture === 'wood' ? WOOD_TILE_MM : CERAMIC_GRID_MM;
    const t = src.clone();
    t.repeat.set(f.size[0] / mm, f.size[1] / mm);
    // world-aligned offset so the pattern runs continuously across zones
    t.offset.set(f.pos[0] / mm, f.pos[1] / mm);
    t.needsUpdate = true;
    return t;
  }, [f, wood, tile]);
  if (!tex) return <Box box={box} color={f.color || '#57534c'} onClick={onClick} />;
  const size = [f.size[0] * S, f.size[2] * S, f.size[1] * S];
  const pos = [
    (f.pos[0] + f.size[0] / 2) * S,
    (f.pos[2] + f.size[2] / 2) * S,
    -(f.pos[1] + f.size[1] / 2) * S,
  ];
  return (
    <mesh position={pos} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={tex} color="#ffffff" />
    </mesh>
  );
}

// Procedural calacatta-style marble wall tile texture: large-format 1200×600
// tiles in a stacked grid with tight light joints. Each tile gets a near-white
// warm ground, soft grey-blue and cream clouds, one dominant horizontal taupe
// vein band with a dark core and branches, and thin gold/grey hairline veins.
// Canvas covers WALLTILE_GRID_MM × WALLTILE_GRID_MM (2 columns × 4 rows).
const WALLTILE_GRID_MM = 2400;
function makeWallTileTexture() {
  const px = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  let seed = 21;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const tw = (1200 * px) / WALLTILE_GRID_MM; // 1024
  const th = (600 * px) / WALLTILE_GRID_MM;
  const joint = (3 * px) / WALLTILE_GRID_MM; // tight 3mm joints

  // grout fills the canvas; tiles are drawn inset
  ctx.fillStyle = 'rgb(224,221,215)';
  ctx.fillRect(0, 0, px, px);

  // a wandering stroked path from (x0,y0) heading roughly +x, jittering in y
  const vein = (x0, y0, len, amp, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    let vx = x0;
    let vy = y0;
    const steps = 6 + ((rnd() * 4) | 0);
    for (let s = 0; s < steps; s++) {
      const nx = vx + len / steps;
      const ny = vy + (rnd() - 0.5) * amp;
      ctx.quadraticCurveTo(vx + len / steps / 2, vy + (rnd() - 0.5) * amp, nx, ny);
      vx = nx;
      vy = ny;
    }
    ctx.stroke();
    return [vx, vy];
  };

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const x = col * tw + joint / 2;
      const y = row * th + joint / 2;
      const w = tw - joint;
      const h = th - joint;
      const t = 0.985 + rnd() * 0.02;
      ctx.fillStyle = `rgb(${(248 * t) | 0},${(245 * t) | 0},${(240 * t) | 0})`;
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

      // soft grey-blue and warm cream clouds
      const blobs = 6 + ((rnd() * 5) | 0);
      for (let b = 0; b < blobs; b++) {
        const bx = x + rnd() * w;
        const by = y + rnd() * h;
        const br = w * (0.1 + rnd() * 0.22);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, rnd() > 0.5 ? `rgba(196,204,212,${0.08 + rnd() * 0.1})` : `rgba(240,228,210,${0.08 + rnd() * 0.1})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }

      // dominant horizontal vein band: soft halo, taupe body, broken dark core
      const vy0 = y + h * (0.35 + rnd() * 0.3);
      ctx.save();
      ctx.filter = 'blur(6px)';
      vein(x - 20, vy0, w + 40, h * 0.22, 26 + rnd() * 14, 'rgba(176,168,156,0.35)');
      ctx.filter = 'none';
      ctx.restore();
      vein(x - 20, vy0 + (rnd() - 0.5) * 12, w + 40, h * 0.18, 5 + rnd() * 4, 'rgba(150,140,126,0.5)');
      // broken core: short dark dashes riding the same band
      const chunks = 4 + ((rnd() * 3) | 0);
      for (let k = 0; k < chunks; k++) {
        const cx0 = x + (k / chunks) * w + rnd() * (w / chunks) * 0.4;
        vein(cx0, vy0 + (rnd() - 0.5) * h * 0.1, w / chunks * (0.4 + rnd() * 0.4), h * 0.08, 2 + rnd() * 2.5, `rgba(122,112,100,${0.4 + rnd() * 0.25})`);
      }
      // branches leaving the band diagonally
      const branches = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < branches; k++) {
        const bx0 = x + rnd() * w;
        vein(bx0, vy0 + (rnd() - 0.5) * h * 0.12, w * (0.15 + rnd() * 0.2), h * (0.25 + rnd() * 0.3), 1.2 + rnd() * 1.6, 'rgba(160,150,136,0.4)');
      }

      // thin gold and grey hairlines wandering across the tile
      const hairs = 5 + ((rnd() * 4) | 0);
      for (let k = 0; k < hairs; k++) {
        const gold = rnd() > 0.45;
        vein(
          x + rnd() * w * 0.6 - 20,
          y + rnd() * h,
          w * (0.3 + rnd() * 0.6),
          h * (0.15 + rnd() * 0.35),
          0.8 + rnd() * 1.2,
          gold ? `rgba(214,182,140,${0.25 + rnd() * 0.2})` : `rgba(184,190,198,${0.2 + rnd() * 0.18})`
        );
      }
      ctx.restore();
    }
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Tiled wainscot strip on a wall face (apartment.json "wallTiles"): a thin box
// carrying the travertine wall tile map on its faces. Repeat follows the
// strip's run length and height; offset anchors the grout grid to world
// coordinates (u from the strip's start along its run, v from its base height).
function WallTileZone({ f, tile }) {
  const tex = useMemo(() => {
    const run = Math.max(f.size[0], f.size[1]);
    const u0 = f.size[0] >= f.size[1] ? f.pos[0] : f.pos[1];
    const t = tile.clone();
    t.repeat.set(run / WALLTILE_GRID_MM, f.size[2] / WALLTILE_GRID_MM);
    t.offset.set(u0 / WALLTILE_GRID_MM, f.pos[2] / WALLTILE_GRID_MM);
    t.needsUpdate = true;
    return t;
  }, [f, tile]);
  const size = [f.size[0] * S, f.size[2] * S, f.size[1] * S];
  const pos = [
    (f.pos[0] + f.size[0] / 2) * S,
    (f.pos[2] + f.size[2] / 2) * S,
    -(f.pos[1] + f.size[1] / 2) * S,
  ];
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={tex} color="#ffffff" />
    </mesh>
  );
}

// Floating label at the top center of a data-space box.
// No distanceFactor: the label keeps its natural CSS size at any zoom, under
// both cameras (with distanceFactor it scales with camera distance/zoom —
// huge when zoomed in, and ~576x under the fitted orthographic plan view).
function DimLabel({ box, text, name, className = '' }) {
  const pos = [
    ((box.min[0] + box.max[0]) / 2) * S,
    box.max[2] * S + 0.03,
    (-(box.min[1] + box.max[1]) / 2) * S,
  ];
  return (
    <Html position={pos} center zIndexRange={[10, 0]}>
      <div className={`dim ${className}`}>
        {name && <div className="dim-name">{name}</div>}
        {text}
      </div>
    </Html>
  );
}

function Box({ box, color = '#c9a36b', opacity = 1, hovered = false, ...handlers }) {
  const size = [
    (box.max[0] - box.min[0]) * S,
    (box.max[2] - box.min[2]) * S,
    (box.max[1] - box.min[1]) * S,
  ];
  const pos = [
    ((box.min[0] + box.max[0]) / 2) * S,
    ((box.min[2] + box.max[2]) / 2) * S,
    (-(box.min[1] + box.max[1]) / 2) * S,
  ];
  return (
    <mesh position={pos} {...handlers}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={hovered ? HOVER_EMISSIVE : '#000000'}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

// Fabric textures for parts flagged "fabric": true|"weave"|"quilt". Near-white
// maps so the part's color tints them; noise-like, so the differing UV scales
// of box faces and extruded shapes don't show. "weave" is a subtle cloth
// grain; "quilt" adds a tufted square grid (velvet waffle stitching).
// Created lazily once per kind.
const fabricTexCache = {};
function getFabricTexture(kind) {
  const k = kind === 'quilt' ? 'quilt' : 'weave';
  if (fabricTexCache[k]) return fabricTexCache[k];
  const px = k === 'quilt' ? 512 : 256;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  let seed = 5;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = 'rgb(247,245,242)';
  ctx.fillRect(0, 0, px, px);
  for (let y = 0; y < px; y += 3) {
    ctx.fillStyle = `rgba(118,110,100,${0.05 + rnd() * 0.06})`;
    ctx.fillRect(0, y, px, 1.5);
  }
  for (let x = 0; x < px; x += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.07 + rnd() * 0.07})`;
    ctx.fillRect(x, 0, 1.5, px);
  }
  for (let d = 0; d < 900; d++) {
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.1 + rnd() * 0.12})` : `rgba(120,112,102,${0.06 + rnd() * 0.08})`;
    ctx.fillRect(rnd() * px, rnd() * px, 1 + rnd(), 1 + rnd());
  }
  if (k === 'quilt') {
    // tufted velvet: faint puffed cells, whisper-thin seams, and a small
    // dimple at every stitch point — kept low-contrast so it reads as
    // upholstery, not a tile grid.
    const cells = 4;
    const cw = px / cells;
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const x = col * cw;
        const y = row * cw;
        const g = ctx.createRadialGradient(x + cw / 2, y + cw / 2, cw * 0.1, x + cw / 2, y + cw / 2, cw * 0.72);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(0.7, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(88,80,70,0.07)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cw, cw);
      }
    }
    ctx.strokeStyle = 'rgba(84,76,66,0.09)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cw);
      ctx.lineTo(px, i * cw);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * cw, 0);
      ctx.lineTo(i * cw, px);
      ctx.stroke();
    }
    for (let row = 0; row <= cells; row++) {
      for (let col = 0; col <= cells; col++) {
        const x = col * cw; // 0 and px halves tile together across the repeat seam
        const y = row * cw;
        const r = cw * 0.09;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(70,63,54,0.28)');
        g.addColorStop(0.6, 'rgba(70,63,54,0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(k === 'quilt' ? 1.5 : 3, k === 'quilt' ? 1.5 : 3);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  fabricTexCache[k] = tex;
  return tex;
}

// A rounded rectangle in the extrude plane (x = width, y = depth, already
// scaled, offset by ox/oy). r is one radius or four, in plan order
// (minX,minY) -> (maxX,minY) -> (maxX,maxY) -> (minX,maxY). Ctor is Shape for
// an outline, Path for a hole.
function roundedRect(Ctor, ox, oy, W, D, r) {
  const [a, b, c, d] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) =>
    Math.max(0, Math.min(v, W / 2, D / 2))
  );
  const s = new Ctor();
  s.moveTo(ox + a, oy);
  s.lineTo(ox + W - b, oy);
  if (b) s.absarc(ox + W - b, oy + b, b, -Math.PI / 2, 0);
  s.lineTo(ox + W, oy + D - c);
  if (c) s.absarc(ox + W - c, oy + D - c, c, 0, Math.PI / 2);
  s.lineTo(ox + d, oy + D);
  if (d) s.absarc(ox + d, oy + D - d, d, Math.PI / 2, Math.PI);
  s.lineTo(ox, oy + a);
  if (a) s.absarc(ox + a, oy + a, a, Math.PI, Math.PI * 1.5);
  return s;
}

// Outline of a rectangle W x D (mm) minus one or more edge notches
// [x0, y0, x1, y1] (part-local mm): the notches split the rectangle into a
// grid of cells, the cells inside a notch are dropped, and the boundary of
// what is left is traced (cell edges shared by two kept cells cancel out).
// Returns a three.js Shape scaled by S. Notches must reach an edge - an
// interior rectangle is a "cutout", not a notch.
function notchedOutline(W, D, notches) {
  const uniq = (vals, max) => [...new Set(vals.filter((v) => v > 0 && v < max))].concat([0, max]).sort((a, b) => a - b);
  const xs = uniq(notches.flatMap((n) => [n[0], n[2]]), W);
  const ys = uniq(notches.flatMap((n) => [n[1], n[3]]), D);
  const inNotch = (cx, cy) => notches.some(([x0, y0, x1, y1]) => cx > x0 && cx < x1 && cy > y0 && cy < y1);
  const edges = new Map(); // undirected key -> directed [from, to]
  const addEdge = (p, q) => {
    const k = [p, q].map((v) => v.join(',')).sort().join('|');
    if (edges.has(k)) edges.delete(k); // shared by two kept cells: interior
    else edges.set(k, [p, q]);
  };
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      if (inNotch((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      addEdge([x0, y0], [x1, y0]);
      addEdge([x1, y0], [x1, y1]);
      addEdge([x1, y1], [x0, y1]);
      addEdge([x0, y1], [x0, y0]);
    }
  const byStart = new Map([...edges.values()].map(([p, q]) => [p.join(','), q]));
  const first = edges.values().next().value;
  const s = new Shape();
  if (!first) return s;
  let p = first[0];
  s.moveTo(p[0] * S, p[1] * S);
  for (let n = 0; n < byStart.size; n++) {
    const q = byStart.get(p.join(','));
    if (!q || (q[0] === first[0][0] && q[1] === first[0][1])) break;
    s.lineTo(q[0] * S, q[1] * S);
    p = q;
  }
  return s;
}

// A part with "round", "cutout" and/or "notch" renders its footprint as a
// rounded / notched rectangle, extruded to the part's height. notch: [x0, y0,
// x1, y1] (or a list of them) in PIECE-local mm, like cutout, removes that
// rectangle from the part's edge - an L-shaped worktop is still one cut part.
// round is ignored when a notch is present. round: r (mm) rounds all four
// corners; round: [r0, r1, r2, r3] gives each corner its own radius, in plan
// order (minX,minY) -> (maxX,minY) -> (maxX,maxY) -> (minX,maxY).
// cutout: [x0, y0, x1, y1] punches a rectangular hole straight through, in
// PIECE-local mm (not part-local) so a sink/hob opening is authored in the
// same numbers as the thing that drops into it; "cutoutRound" rounds its
// corners. Render-only sugar: geometry.js still sees the part's plain AABB,
// so fit checks stay conservative.
function LocalRounded({ part, color, hovered, opacity = 1, ...handlers }) {
  const geom = useMemo(() => {
    const [w, d, h] = part.size;
    // round is one radius or four — scale each, never the array itself (NaN).
    const r = part.round ?? 0;
    const rS = Array.isArray(r) ? r.map((v) => v * S) : r * S;
    const notches = part.notch ? (Array.isArray(part.notch[0]) ? part.notch : [part.notch]) : null;
    const s = notches
      ? notchedOutline(w, d, notches.map(([x0, y0, x1, y1]) => [x0 - part.pos[0], y0 - part.pos[1], x1 - part.pos[0], y1 - part.pos[1]]))
      : roundedRect(Shape, 0, 0, w * S, d * S, rS);
    if (part.cutout) {
      const [cx0, cy0, cx1, cy1] = part.cutout;
      s.holes.push(
        roundedRect(
          Path,
          (cx0 - part.pos[0]) * S,
          (cy0 - part.pos[1]) * S,
          (cx1 - cx0) * S,
          (cy1 - cy0) * S,
          Array.isArray(part.cutoutRound)
            ? part.cutoutRound.map((v) => v * S)
            : (part.cutoutRound ?? 0) * S
        )
      );
    }
    const g = new ExtrudeGeometry(s, { depth: h * S, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); // shape plane (x,y) -> plan (x,-z), extrusion -> up
    return g;
  }, [part]);
  return (
    <mesh
      position={[part.pos[0] * S, part.pos[2] * S, -part.pos[1] * S]}
      geometry={geom}
      {...handlers}
    >
      <meshStandardMaterial
        map={part.fabric ? getFabricTexture(part.fabric) : null}
        color={color}
        emissive={hovered ? HOVER_EMISSIVE : '#000000'}
        metalness={part.metal ? 0.5 : 0}
        roughness={part.metal ? 0.28 : 1}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

// A part with "disc": true renders as a cylinder lying along local y (the
// front/back axis) — a porthole or dial face. Radius comes from the x/z
// footprint, length from the y size. Render-only sugar like "round":
// geometry.js still sees the plain AABB.
function LocalDisc({ part, color, hovered, opacity = 1, ...handlers }) {
  const [sx, sy, sz] = part.size;
  const r = (Math.min(sx, sz) / 2) * S;
  const pos = [
    (part.pos[0] + sx / 2) * S,
    (part.pos[2] + sz / 2) * S,
    -(part.pos[1] + sy / 2) * S,
  ];
  return (
    <mesh position={pos} rotation={[Math.PI / 2, 0, 0]} {...handlers}>
      <cylinderGeometry args={[r, r, sy * S, 48]} />
      <meshStandardMaterial
        color={color}
        emissive={hovered ? HOVER_EMISSIVE : '#000000'}
        metalness={part.metal ? 0.5 : 0}
        roughness={part.metal ? 0.28 : 1}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

// Whether part boxes draw their faint black edge outlines. On by default (the
// single-piece view reads better with them); the apartment view turns them off
// because at that scale the lines pile up and make every piece look busy.
const EdgesContext = createContext(true);

// Registry of everything that opens (doors, drawers, flaps, pull-outs, room
// doors) so the scripted tour can drive them: a Map of key -> record
// { key, kind, piece, pieceId, part, center:[x,y,z] mm, setOpen }. Null in
// the single-piece viewer, where nothing registers.
const OpenablesContext = createContext(null);
function useOpenable(meta, setOpen) {
  const reg = useContext(OpenablesContext);
  useEffect(() => {
    if (!reg || !meta) return undefined;
    reg.set(meta.key, { ...meta, setOpen });
    return () => reg.delete(meta.key);
  }, [reg, meta, setOpen]);
}

// An adjustable plastic furniture leg (the FE.9020 "nogice" in the hardware
// catalogue): round mounting plate, socket, column and the knurled adjuster
// foot, stacked inside the part's box. Any hardware part named leg* gets this.
function Leg({ part, color, hovered, ...handlers }) {
  const [sx, sy, h] = part.size;
  const cx = (part.pos[0] + sx / 2) * S;
  const cz = -(part.pos[1] + sy / 2) * S;
  const z0 = part.pos[2];
  const rMax = Math.min(sx, sy) / 2;
  const segs = [
    { r: rMax, z: h - 4, dz: 4 }, // mounting plate
    { r: Math.min(18, rMax), z: h - 24, dz: 20 }, // socket
    { r: Math.min(13, rMax), z: 14, dz: Math.max(h - 38, 1) }, // column
    { r: Math.min(23, rMax), z: 0, dz: 14 }, // adjuster foot
  ];
  return (
    <group {...handlers}>
      {segs.map((sg, i) => (
        <mesh key={i} position={[cx, (z0 + sg.z + sg.dz / 2) * S, cz]}>
          <cylinderGeometry args={[sg.r * S, sg.r * S, sg.dz * S, 32]} />
          <meshStandardMaterial color={color} emissive={hovered ? HOVER_EMISSIVE : '#000000'} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// A part box in piece-local coordinates (rendered inside the placement group).
function LocalBox({ part, color, hovered, opacity = 1, ...handlers }) {
  const showEdges = useContext(EdgesContext);
  if (part.hardware && part.name.startsWith('leg')) {
    return <Leg part={part} color={color} hovered={hovered} {...handlers} />;
  }
  if (part.disc) {
    return <LocalDisc part={part} color={color} hovered={hovered} opacity={opacity} {...handlers} />;
  }
  if (part.round || part.cutout || part.notch) {
    return <LocalRounded part={part} color={color} hovered={hovered} opacity={opacity} {...handlers} />;
  }
  const size = [part.size[0] * S, part.size[2] * S, part.size[1] * S];
  const pos = [
    (part.pos[0] + part.size[0] / 2) * S,
    (part.pos[2] + part.size[2] / 2) * S,
    -(part.pos[1] + part.size[1] / 2) * S,
  ];
  return (
    <mesh position={pos} {...handlers}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        map={part.fabric ? getFabricTexture(part.fabric) : null}
        color={color}
        emissive={hovered ? HOVER_EMISSIVE : '#000000'}
        metalness={part.metal ? 0.5 : 0}
        roughness={part.metal ? 0.28 : 1}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
      {showEdges && opacity === 1 && !part.fabric && (
        <Edges>
          <lineBasicMaterial color="#000000" transparent opacity={0.22} />
        </Edges>
      )}
    </mesh>
  );
}

// Door leaf layouts per style, in "leaf plane" coordinates:
// u = along the width (0 at the hinge), z = up, t = leaf thickness.
const DOOR_WHITE = '#f2f1ed';
const DOOR_GLASS = '#bcd8ee';
const DOOR_METAL = '#9aa0a8';

// Hinges + lever handle + key rosette shared by the white hinged-door styles.
function doorHardware(w) {
  const parts = [];
  for (const z of [250, 1005, 1760]) {
    parts.push({ u: 0, du: 12, z, dz: 90, t: 56, color: DOOR_METAL }); // hinge knuckle
  }
  parts.push(
    { u: w - 190, du: 130, z: 1030, dz: 24, t: 116, color: DOOR_METAL }, // lever bar, both faces
    { u: w - 92, du: 34, z: 955, dz: 44, t: 104, color: DOOR_METAL } // key rosette
  );
  return parts;
}

function doorLeafParts(style, w, h) {
  switch (style) {
    case 'entrance': {
      // security door: walnut slab, lever handle, two locks, peephole
      const metal = DOOR_METAL;
      return [
        { u: 0, du: w, z: 0, dz: h, t: 54, color: '#7d5a3e' },
        { u: w - 190, du: 130, z: 1030, dz: 24, t: 130, color: metal }, // lever bar
        { u: w - 90, du: 44, z: 935, dz: 44, t: 120, color: metal }, // lower cylinder
        { u: w - 86, du: 36, z: 1125, dz: 54, t: 118, color: metal }, // upper lock plate
        { u: w / 2 - 12, du: 24, z: 1500, dz: 24, t: 60, color: '#3a3d42' }, // peephole
      ];
    }
    case 'balcony': {
      // white PVC glass door: full-height glass, vertical window handle
      const f = 90;
      const pvc = '#e6e7e9';
      return [
        { u: 0, du: f, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: w - f, du: f, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: 0, dz: 120, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: h - 120, dz: 120, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: 120, dz: h - 240, t: 12, color: DOOR_GLASS, opacity: 0.35 },
        { u: w - f / 2 - 16, du: 32, z: 970, dz: 170, t: 96, color: pvc }, // vertical handle on latch stile
        { u: 0, du: 12, z: 150, dz: 90, t: 56, color: '#cfd2d6' }, // hinge caps top + bottom
        { u: 0, du: 12, z: h - 240, dz: 90, t: 56, color: '#cfd2d6' },
      ];
    }
    case 'living': {
      // like the inner door, but with a glass panel in the middle
      const s = 140, bottom = 350, top = 250;
      return [
        { u: 0, du: s, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: w - s, du: s, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: 0, dz: bottom, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: h - top, dz: top, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: bottom, dz: h - bottom - top, t: 12, color: DOOR_GLASS, opacity: 0.4 },
        ...doorHardware(w),
      ];
    }
    default:
      // 'inner' — simple white slab with hinges and a lever handle
      return [{ u: 0, du: w, z: 0, dz: h, t: 40, color: '#e8e6e1' }, ...doorHardware(w)];
  }
}

// PVC window in "leaf plane" coordinates (u along the width, z up, t = depth,
// centered in the wall). Openings ≤ WIN_SINGLE_MAX wide get one sash (handle on
// the latch stile); wider ones get two sashes split by a center mullion, with
// both handles beside it. Static — windows don't open.
const WIN_SINGLE_MAX = 1201; // nominal 120cm cutoff; loggia7/bath are 1201 and single in reality
const WIN_FRAME = 70; // outer frame profile
const WIN_SASH = 80; // sash frame profile
const WIN_MULLION = 90;
const WIN_PVC = '#e3e4e6';
const WIN_SASH_PVC = '#f4f4f2';

function windowParts(w, h) {
  const F = WIN_FRAME;
  const parts = [
    { u: 0, du: F, z: 0, dz: h, t: 84, color: WIN_PVC },
    { u: w - F, du: F, z: 0, dz: h, t: 84, color: WIN_PVC },
    { u: F, du: w - 2 * F, z: 0, dz: F, t: 84, color: WIN_PVC },
    { u: F, du: w - 2 * F, z: h - F, dz: F, t: 84, color: WIN_PVC },
  ];
  // one sash spanning [u0, u0+sw] inside the outer frame; handleU = handle center
  const sash = (u0, sw, handleU) => {
    const Sf = WIN_SASH;
    parts.push(
      { u: u0, du: Sf, z: F, dz: h - 2 * F, t: 96, color: WIN_SASH_PVC },
      { u: u0 + sw - Sf, du: Sf, z: F, dz: h - 2 * F, t: 96, color: WIN_SASH_PVC },
      { u: u0 + Sf, du: sw - 2 * Sf, z: F, dz: Sf, t: 96, color: WIN_SASH_PVC },
      { u: u0 + Sf, du: sw - 2 * Sf, z: h - F - Sf, dz: Sf, t: 96, color: WIN_SASH_PVC },
      { u: u0 + Sf, du: sw - 2 * Sf, z: F + Sf, dz: h - 2 * F - 2 * Sf, t: 20, color: DOOR_GLASS, opacity: 0.35 },
      { u: handleU - 16, du: 32, z: h / 2 - 85, dz: 170, t: 120, color: '#d8dadc' }
    );
  };
  if (w <= WIN_SINGLE_MAX) {
    sash(F, w - 2 * F, F + WIN_SASH / 2); // handle on the left stile
  } else {
    const sw = (w - 2 * F - WIN_MULLION) / 2;
    parts.push({ u: F + sw, du: WIN_MULLION, z: F, dz: h - 2 * F, t: 84, color: WIN_PVC });
    sash(F, sw, F + sw - WIN_SASH / 2); // handles flank the mullion
    sash(F + sw + WIN_MULLION, sw, F + sw + WIN_MULLION + WIN_SASH / 2);
  }
  return parts;
}

// A window opening: frame + sash(es) + glass, centered in the wall thickness.
function RoomWindow({ opening, hovered, onPointerOver, onPointerOut }) {
  const [sx, sy, sz] = opening.size;
  const horiz = sx >= sy;
  const w = horiz ? sx : sy;
  const parts = windowParts(w, sz);
  const ox = horiz ? opening.pos[0] : opening.pos[0] + sx / 2;
  const oy = horiz ? opening.pos[1] + sy / 2 : opening.pos[1];
  return (
    <group
      position={[ox * S, opening.pos[2] * S, -oy * S]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {parts.map((p, i) => (
        <LocalBox
          key={i}
          part={
            horiz
              ? { pos: [p.u, -p.t / 2, p.z], size: [p.du, p.t, p.dz] }
              : { pos: [-p.t / 2, p.u, p.z], size: [p.t, p.du, p.dz] }
          }
          color={p.color}
          opacity={p.opacity ?? 1}
          hovered={hovered}
        />
      ))}
    </group>
  );
}

// Frame around a door opening: a liner covering the reveal (the raw wall edge
// inside the opening, visible when the leaf is open) plus, for architrave
// styles, flat casing legs and a head on each wall face. Same leaf-plane
// coords as doorLeafParts, static (no swing).
const CASING_W = 70;
const CASING_T = 18;
const LINER_T = 20;
function doorCasingParts(horiz, away, w, h, wall, architrave = true) {
  const boxes = [];
  if (architrave) {
    for (const face of [-wall / 2 - CASING_T, wall / 2]) {
      boxes.push(
        { u: away - CASING_W, du: CASING_W, z: 0, dz: h + CASING_W, y: face },
        { u: away + w, du: CASING_W, z: 0, dz: h + CASING_W, y: face },
        { u: away, du: w, z: h, dz: CASING_W, y: face }
      );
    }
  }
  // reveal liner: two legs and a head lining the opening, full wall depth
  boxes.push(
    { u: away, du: LINER_T, z: 0, dz: h, y: -wall / 2, dy: wall },
    { u: away + w - LINER_T, du: LINER_T, z: 0, dz: h, y: -wall / 2, dy: wall },
    { u: away + LINER_T, du: w - 2 * LINER_T, z: h - LINER_T, dz: LINER_T, y: -wall / 2, dy: wall }
  );
  return boxes.map((b) =>
    horiz
      ? { pos: [b.u, b.y, b.z], size: [b.du, b.dy ?? CASING_T, b.dz] }
      : { pos: [b.y, b.u, b.z], size: [b.dy ?? CASING_T, b.du, b.dz] }
  );
}

// A clickable door: pivots on a vertical hinge at its outer edge (the edge
// farther from the piece's center) and swings open/closed with damping.
// A clickable hinged door leaf. Fronts face local -y by default; a side-facing
// leaf ("face": "+x" etc.) is built in its canonical frame (frontFrame: facing
// -y, width along x, origin at the left end of the back plane) and the outer
// group turns the whole thing into place. attachments = parts riding on the
// door (bins, inner liner) that swing along.
function Door({ part, attachments = [], color, bbox, hovered, openable }) {
  const [open, setOpen] = useState(false);
  useOpenable(openable, setOpen);
  const ref = useRef();
  const f = useMemo(() => frontFrame(part, bbox), [part, bbox]);
  const { w, t, h, z0, hingeLeft, alpha, origin } = f;
  const hx = hingeLeft ? 0 : w; // hinge edge in the canonical frame (back plane is y = 0)
  const target = open ? (hingeLeft ? -1 : 1) * MathUtils.degToRad(90) : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y = MathUtils.damp(ref.current.rotation.y, target, 6, dt);
    }
  });

  // Canonical leaf and riders, shifted so the hinge edge sits at the origin.
  const leaf = { ...part, pos: [-hx, -t, z0], size: [w, t, h] };
  const riders = attachments.map((a) => {
    const lb = f.toLocal(aabbOf(a.pos, a.size));
    return {
      ...a,
      pos: [lb.min[0] - hx, lb.min[1], lb.min[2]],
      size: [lb.max[0] - lb.min[0], lb.max[1] - lb.min[1], lb.max[2] - lb.min[2]],
    };
  });
  const handlers = {
    onClick: (e) => {
      e.stopPropagation();
      setOpen((o) => !o);
    },
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  };

  // Vertical bar handle on the free edge, at grab height: ~1050mm from the
  // floor where the leaf allows, else clamped toward the reachable edge (base
  // doors get it near their top, wall/upper doors near their bottom).
  const handle = useMemo(() => {
    const zTop = z0 + h;
    const zc = h < 320 ? z0 + h / 2 : Math.min(Math.max(1050, z0 + 120), zTop - 120);
    const len = Math.min(160, h - 60);
    return {
      name: 'handle',
      pos: [hingeLeft ? w - 47 : -w + 35, -(t + 30), zc - len / 2],
      size: [12, 30, len],
      metal: true,
    };
  }, [w, t, h, z0, hingeLeft]);

  // Euro hinges on the hinge edge: cup + arm as one metal block on the door's
  // inner face (protrudes into the carcass when closed, swings with the leaf).
  // Count scales with leaf height; centers 100mm in from top and bottom.
  const hinges = useMemo(() => {
    const n = h < 900 ? 2 : h < 1600 ? 3 : h < 2100 ? 4 : 5;
    return Array.from({ length: n }, (_, i) => {
      const zc = n === 1 ? h / 2 : 100 + ((h - 200) * i) / (n - 1);
      return {
        name: 'hinge',
        pos: [hingeLeft ? 4 : -59, 0, z0 + zc - 25],
        size: [55, 14, 50],
        metal: true,
      };
    });
  }, [h, z0, hingeLeft]);

  return (
    <group position={[origin[0] * S, 0, -origin[1] * S]} rotation={[0, MathUtils.degToRad(alpha), 0]}>
      <group ref={ref} position={[hx * S, 0, 0]}>
        <LocalBox part={leaf} color={color} hovered={hovered} {...handlers} />
        {hinges.map((hp, i) => (
          <LocalBox key={`h${i}`} part={hp} color="#9aa0a8" hovered={hovered} {...handlers} />
        ))}
        <LocalBox part={handle} color="#9aa0a8" hovered={hovered} {...handlers} />
        {riders.map((a, i) => (
          <LocalBox
            key={i}
            part={a}
            color={a.color || color}
            opacity={a.opacity ?? 1}
            hovered={hovered}
            {...handlers}
          />
        ))}
      </group>
    </group>
  );
}

// A clickable bottom-hinged flap (dishwasher / oven front): pivots on its
// bottom edge at the carcass front plane and tilts forward to horizontal.
// Same canonical-frame treatment as Door, so a side-facing flap works too.
function Flap({ part, color, hovered, openable }) {
  const [open, setOpen] = useState(false);
  useOpenable(openable, setOpen);
  const ref = useRef();
  const f = useMemo(() => frontFrame(part), [part]);
  const { w, t, h, z0, alpha, origin } = f;
  const target = open ? MathUtils.degToRad(88) : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.x = MathUtils.damp(ref.current.rotation.x, target, 6, dt);
    }
  });

  const shifted = { ...part, pos: [0, -t, 0], size: [w, t, h] };
  // bar handle along the top edge: a furniture bar on a panel flap (dishwasher),
  // an almost full-width oven-style bar on an appliance flap
  const len = part.appliance ? w - 60 : Math.min(160, w - 60);
  const handle = { name: 'handle', pos: [w / 2 - len / 2, -(t + 30), h - 56], size: [len, 30, 12], metal: true };
  const handlers = {
    onClick: (e) => {
      e.stopPropagation();
      setOpen((o) => !o);
    },
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  };
  return (
    <group position={[origin[0] * S, 0, -origin[1] * S]} rotation={[0, MathUtils.degToRad(alpha), 0]}>
      <group ref={ref} position={[0, z0 * S, 0]}>
        <LocalBox part={shifted} color={color} hovered={hovered} {...handlers} />
        <LocalBox part={handle} color="#9aa0a8" hovered={hovered} {...handlers} />
      </group>
    </group>
  );
}

// Drawer fronts face -y by default; like doors, a front in a combined piece
// whose run faces another way sets "face". FACE_DIR is the pull direction in
// data space (x, y); DRAWER_AXES picks the axis along the front's width and
// the axis along the pull.
const FACE_DIR = { '-y': [0, -1], '+x': [1, 0], '+y': [0, 1], '-x': [-1, 0] };
const drawerFace = (p) => (FACE_DIR[p.face] ? p.face : '-y');
const drawerAxes = (face) => (face === '+x' || face === '-x' ? { w: 1, pull: 0 } : { w: 0, pull: 1 });

// Horizontal bar handle on a drawer front: centred, 50 mm under the top edge
// (centred on fronts under 120 high), protruding 30 mm along the front's
// face. Piece-local box, drawn by the viewer like door handles - not a part.
function barHandle(front) {
  const face = drawerFace(front);
  const { w, pull } = drawerAxes(face);
  const dir = FACE_DIR[face][pull];
  const len = Math.min(160, front.size[w] - 60);
  const h = front.size[2];
  const pos = [0, 0, front.pos[2] + (h < 120 ? h / 2 : h - 50) - 6];
  const size = [0, 0, 12];
  pos[w] = front.pos[w] + front.size[w] / 2 - len / 2;
  size[w] = len;
  pos[pull] = dir > 0 ? front.pos[pull] + front.size[pull] : front.pos[pull] - 30;
  size[pull] = 30;
  return { name: 'handle', pos, size, metal: true };
}

// A clickable drawer: the front and its box slide out along the front
// direction (data-space FACE_DIR, converted to three.js: x -> x, y -> -z).
function Drawer({ pullMm, face = '-y', openable, children }) {
  const [open, setOpen] = useState(false);
  useOpenable(openable, setOpen);
  const ref = useRef();
  const t = useRef(0);
  const target = open ? pullMm * S : 0;
  const [dx, dy] = FACE_DIR[face] ?? FACE_DIR['-y'];

  useFrame((_, dt) => {
    if (ref.current) {
      t.current = MathUtils.damp(t.current, target, 6, dt);
      ref.current.position.set(dx * t.current, 0, -dy * t.current);
    }
  });

  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {children}
    </group>
  );
}

// Group drawer parts for animation: each 'drawer front' takes along the box
// parts (drawer bottom / box sides / box front / box back) whose center falls
// inside the front's width/height span and lies behind it (on the carcass
// side of the front, per its face). Returns the members per front index and
// the set of member indices (so the normal render loop skips them).
function drawerGroups(parts) {
  const isFront = (p) => p.name.startsWith('drawer front');
  const frontIdx = parts.map((p, i) => (isFront(p) ? i : -1)).filter((i) => i >= 0);
  const groups = new Map(frontIdx.map((i) => [i, []]));
  const consumed = new Set();
  parts.forEach((p, i) => {
    if (isFront(p) || !p.name.startsWith('drawer')) return;
    const c = [0, 1, 2].map((a) => p.pos[a] + p.size[a] / 2);
    const f = frontIdx.find((fi) => {
      const fp = parts[fi];
      const face = drawerFace(fp);
      const { w, pull } = drawerAxes(face);
      const inWidth = c[w] > fp.pos[w] && c[w] < fp.pos[w] + fp.size[w];
      const inHeight = c[2] > fp.pos[2] && c[2] < fp.pos[2] + fp.size[2];
      const dir = FACE_DIR[face][pull];
      const behind = dir > 0 ? c[pull] < fp.pos[pull] : c[pull] > fp.pos[pull] + fp.size[pull];
      return inWidth && inHeight && behind;
    });
    if (f !== undefined) {
      groups.get(f).push(i);
      consumed.add(i);
    }
  });
  return { groups, consumed };
}

// Pull-out distance: 80% of the box depth along the front's pull axis (falls
// back to 400mm front-only).
const drawerPull = (parts, front, members) => {
  const { pull } = drawerAxes(drawerFace(front));
  return Math.round(0.8 * Math.max(400, ...members.map((i) => parts[i].size[pull])));
};

// Group door-mounted parts for animation, mirroring drawerGroups: parts named
// 'door bin *' (bins, inner door liners) attach to the door leaf (any other
// part named 'door*') whose x/z span contains their center, and swing with it.
function doorGroups(parts) {
  const isBin = (p) => p.name.startsWith('door bin');
  const isLeaf = (p) => p.name.startsWith('door') && !isBin(p);
  const leafIdx = parts.map((p, i) => (isLeaf(p) ? i : -1)).filter((i) => i >= 0);
  const groups = new Map(leafIdx.map((i) => [i, []]));
  const consumed = new Set();
  parts.forEach((p, i) => {
    if (!isBin(p)) return;
    const cx = p.pos[0] + p.size[0] / 2;
    const cz = p.pos[2] + p.size[2] / 2;
    const f = leafIdx.find((fi) => {
      const fp = parts[fi];
      return cx > fp.pos[0] && cx < fp.pos[0] + fp.size[0] && cz > fp.pos[2] && cz < fp.pos[2] + fp.size[2];
    });
    if (f !== undefined) {
      groups.get(f).push(i);
      consumed.add(i);
    }
  });
  return { groups, consumed };
}

// A room door: the opening renders as a 40mm leaf that swings on its hinge.
// opening.hinge ('min'/'max') picks the pivot end, opening.swing (+1 CCW / -1 CW
// seen from above) picks the direction, both authored in apartment.json.
function RoomDoor({ opening, hovered, onPointerOver, onPointerOut }) {
  const [open, setOpen] = useState(false);
  const meta = useMemo(
    () => ({
      key: `opening:${opening.name}`,
      kind: 'roomdoor',
      piece: '',
      pieceId: '',
      part: opening.name,
      center: [0, 1, 2].map((a) => opening.pos[a] + opening.size[a] / 2),
    }),
    [opening]
  );
  useOpenable(meta, setOpen);
  const ref = useRef();
  const [sx, sy, sz] = opening.size;
  const horiz = sx >= sy;
  const w = horiz ? sx : sy;
  const hinge = opening.hinge || 'min';
  const swing = opening.swing || -1;
  const hx = horiz
    ? (hinge === 'max' ? opening.pos[0] + sx : opening.pos[0])
    : opening.pos[0] + sx / 2;
  const hy = horiz
    ? opening.pos[1] + sy / 2
    : (hinge === 'max' ? opening.pos[1] + sy : opening.pos[1]);
  const away = hinge === 'max' ? -w : 0;
  const target = open ? swing * MathUtils.degToRad(90) : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y = MathUtils.damp(ref.current.rotation.y, target, 6, dt);
    }
  });

  const leafParts = doorLeafParts(opening.style, w, sz);
  const entrance = opening.style === 'entrance';
  const casing = doorCasingParts(
    horiz, away, w, sz, horiz ? sy : sx,
    opening.style !== 'balcony' // balcony: PVC liner only, no architraves
  );
  const casingColor = entrance ? '#4b4e54' : DOOR_WHITE; // steel frame vs white architrave
  return (
    <group position={[hx * S, opening.pos[2] * S, -hy * S]}>
      {casing.map((p, i) => (
        <LocalBox key={i} part={p} color={casingColor} hovered={hovered} />
      ))}
      <group
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onPointerOver={(e) => {
          document.body.style.cursor = 'pointer';
          onPointerOver?.(e);
        }}
        onPointerOut={(e) => {
          document.body.style.cursor = 'auto';
          onPointerOut?.(e);
        }}
      >
        {leafParts.map((p, i) => {
          // leaf-plane u has 0 at the hinge; with hinge='max' the leaf extends
          // in -u from the pivot, so mirror u to keep hardware on the right edge
          const u = hinge === 'max' ? w - p.u - p.du : p.u;
          return (
          <LocalBox
            key={i}
            part={
              horiz
                ? { pos: [away + u, -p.t / 2, p.z], size: [p.du, p.t, p.dz] }
                : { pos: [-p.t / 2, away + u, p.z], size: [p.t, p.du, p.dz] }
            }
            color={p.color}
            opacity={p.opacity ?? 1}
            hovered={hovered}
          />
          );
        })}
      </group>
    </group>
  );
}

function Placement({ entry, collided, showClearances, hovered, onPointerOver, onPointerOut, onDoubleClick }) {
  const { piece, placement } = entry;
  const parts = piece.parts?.length
    ? piece.parts
    : [{ name: piece.name, pos: [0, 0, 0], size: piece.size, color: piece.color || '#8a93a6' }];
  const bb = pieceLocalBBox(piece);
  const centerX = (bb.min[0] + bb.max[0]) / 2;
  // Exploded view: each part slides away from the piece center (mm, data space),
  // proportional to the slider. z explodes from the bottom so nothing sinks below
  // the grid. At 0 every offset is 0.
  const centerY = (bb.min[1] + bb.max[1]) / 2;
  const explodeOffset = (p) => {
    const k = explode * 1.2;
    return [
      (p.pos[0] + p.size[0] / 2 - centerX) * k,
      (p.pos[1] + p.size[1] / 2 - centerY) * k,
      (p.pos[2] + p.size[2] / 2 - bb.min[2]) * k,
    ];
  };
  const rot = (((placement.rot || 0) % 360) + 360) % 360;
  const isFlap = (p) => p.name.startsWith('flap');
  const isPullout = (p) => p.name.startsWith('pullout');
  const { groups: drawers, consumed } = useMemo(() => drawerGroups(parts), [parts]);
  const { groups: doors, consumed: onDoors } = useMemo(() => doorGroups(parts), [parts]);
  // tour registry records for the animated fronts, keyed by placement + part index
  const openMeta = useMemo(
    () =>
      parts.map((p, i) => {
        const kind = doors.has(i) ? 'door' : isFlap(p) ? 'flap' : drawers.has(i) ? 'drawer' : isPullout(p) ? 'pullout' : null;
        if (!kind) return null;
        const b = entry.partBoxes[i];
        return {
          key: `${entry.id}:${i}`,
          kind,
          piece: entry.name,
          pieceId: piece.id,
          part: p.name,
          center: [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2),
        };
      }),
    [parts, entry, piece, doors, drawers] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <group>
      {/* clearances stay outside the hover group so empty air doesn't trigger the label */}
      <group
        position={[placement.pos[0] * S, placement.pos[2] * S, -placement.pos[1] * S]}
        rotation={[0, MathUtils.degToRad(rot), 0]}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
      >
        {parts.map((p, i) => {
          if (consumed.has(i) || onDoors.has(i)) return null; // rendered inside its Drawer/Door
          if (doors.has(i)) {
            return (
              <Door
                key={i}
                part={p}
                attachments={doors.get(i).map((ai) => parts[ai])}
                color={partColor(p, piece)}
                bbox={bb}
                hovered={hovered}
                openable={openMeta[i]}
              />
            );
          }
          if (isFlap(p)) {
            return (
              <Flap key={i} part={p} color={partColor(p, piece)} hovered={hovered} openable={openMeta[i]} />
            );
          }
          if (drawers.has(i)) {
            return (
              <Drawer key={i} face={drawerFace(p)} pullMm={drawerPull(parts, p, drawers.get(i))} openable={openMeta[i]}>
                {[i, ...drawers.get(i)].map((pi) => (
                  <LocalBox
                    key={pi}
                    part={parts[pi]}
                    color={partColor(parts[pi], piece)}
                    opacity={parts[pi].opacity ?? 1}
                    hovered={hovered}
                  />
                ))}
                <LocalBox part={barHandle(p)} color="#9aa0a8" hovered={hovered} />
              </Drawer>
            );
          }
          if (isPullout(p)) {
            return (
              <Drawer key={i} face={drawerFace(p)} pullMm={Math.round(0.8 * p.size[drawerAxes(drawerFace(p)).pull])} openable={openMeta[i]}>
                <LocalBox part={p} color={partColor(p, piece)} opacity={p.opacity ?? 1} hovered={hovered} />
              </Drawer>
            );
          }
          return (
            <LocalBox
              key={i}
              part={p}
              color={partColor(p, piece)}
              opacity={p.opacity ?? 1}
              hovered={hovered}
            />
          );
        })}
      </group>
      {collided && <Box box={entry.bbox} color="#ff3b30" opacity={0.35} />}
      {showClearances &&
        entry.clearances.map((c, i) => (
          <Box key={`c${i}`} box={c.box} color="#ffcc00" opacity={0.15} />
        ))}
    </group>
  );
}

// ── First-person walk mode ──────────────────────────────────────────────
// Trackpad-friendly: drag to look around (grab-the-world), click a floor
// point to glide there, WASD/arrows to walk (Shift runs), two-finger scroll
// moves along the view direction, Esc exits. The body is a 200mm-radius
// circle at fixed eye height; walkMove (geometry.js) slides it along walls
// and furniture, so doorways work and nothing solid can be crossed.
//
// With a `tour` script (src/data/tour.js) the runner in src/tour.js drives the
// body instead: it walks the route, opens and closes fronts through the
// openables registry and posts captions. Any manual input (drag, wheel, keys,
// floor click) hands control back; onTourEnd tells the app.
const WALK = { eye: 1650, radius: 200, zlo: 100, zhi: 1650, speed: 1400, run: 2800, glide: 2200 };
const ENTRANCE_SPAWN = { pos: [8647, 6950], yaw: Math.PI }; // just inside the front door, facing the hall

function WalkControls({ spawn, boxes, glideRef, dragRef, onExit, tour, onTourEnd, openables, doors, resolve, onCaption }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pos = useRef(null); // data-space mm [x, y]
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef({});
  const tourRef = useRef(null); // { state, ctx } while a tour runs
  const stopTour = () => {
    if (!tourRef.current) return;
    tourRef.current = null;
    onTourEnd?.();
  };

  // Start the scripted tour when a script arrives; ending it (script cleared,
  // walk exited) closes everything the tour opened.
  useEffect(() => {
    if (!tour || !openables) return undefined;
    const ctx = {
      body: { pos: [...(pos.current || ENTRANCE_SPAWN.pos)], yaw: look.current.yaw, pitch: look.current.pitch },
      eye: WALK.eye,
      move: (p, d) => walkMove(p, d, boxes, TOUR.radius),
      openables: () => [...openables.values()],
      doors,
      setOpen: (r, v) => r.setOpen(v),
      resolve,
      say: (t) => onCaption?.(t),
      warn: (m) => console.warn(m),
    };
    const state = createTour(tour, { loop: true });
    tourRef.current = { state, ctx };
    return () => {
      endTour(state, ctx);
      tourRef.current = null;
      onCaption?.(null);
    };
  }, [tour, boxes, openables, doors, resolve, onCaption]);

  // Enter at the spawn point; put the orbit camera back exactly as it was.
  useEffect(() => {
    const saved = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera.fov,
      order: camera.rotation.order,
    };
    const s = spawn || ENTRANCE_SPAWN;
    pos.current = [...s.pos];
    look.current = { yaw: s.yaw ?? Math.PI, pitch: 0 };
    camera.rotation.order = 'YXZ';
    camera.fov = 65;
    camera.updateProjectionMatrix();
    return () => {
      camera.rotation.order = saved.order;
      camera.fov = saved.fov;
      camera.position.copy(saved.pos);
      camera.quaternion.copy(saved.quat);
      camera.updateProjectionMatrix();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = gl.domElement;
    let drag = null;
    const down = (e) => {
      drag = [e.clientX, e.clientY];
      dragRef.current = 0;
    };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag[0];
      const dy = e.clientY - drag[1];
      drag = [e.clientX, e.clientY];
      dragRef.current += Math.abs(dx) + Math.abs(dy);
      if (dragRef.current > 4) stopTour();
      look.current.yaw += dx * 0.005;
      look.current.pitch = MathUtils.clamp(look.current.pitch + dy * 0.005, -1.45, 1.45);
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      if (!pos.current) return;
      stopTour();
      glideRef.current = null;
      const { yaw } = look.current;
      const d = MathUtils.clamp(-e.deltaY * 4, -250, 250);
      pos.current = walkMove(pos.current, [-Math.sin(yaw) * d, Math.cos(yaw) * d], boxes, WALK.radius);
    };
    const keydown = (e) => {
      if (e.key === 'Escape') return onExit();
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      keys.current[e.key.toLowerCase()] = true;
    };
    const keyup = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [gl, boxes, glideRef, dragRef, onExit]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dtRaw) => {
    if (!pos.current) return;
    const dt = Math.min(dtRaw, 0.05); // clamp frame spikes so we can't tunnel
    const k = keys.current;
    const mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    const my = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
    if (tourRef.current && (mx || my || glideRef.current)) stopTour(); // the user takes over
    if (tourRef.current) {
      const { state, ctx } = tourRef.current;
      const running = tickTour(state, ctx, dt);
      pos.current = ctx.body.pos;
      look.current.yaw = ctx.body.yaw;
      look.current.pitch = ctx.body.pitch;
      if (!running) stopTour();
      camera.position.set(pos.current[0] * S, WALK.eye * S, -pos.current[1] * S);
      camera.rotation.set(look.current.pitch, look.current.yaw, 0);
      return;
    }
    const { yaw, pitch } = look.current;
    const fwd = [-Math.sin(yaw), Math.cos(yaw)]; // data-space heading
    const right = [Math.cos(yaw), Math.sin(yaw)];
    if (mx || my) {
      glideRef.current = null; // keys override an active glide
      const sp = ((k.shift ? WALK.run : WALK.speed) * dt) / Math.hypot(mx, my);
      pos.current = walkMove(
        pos.current,
        [(fwd[0] * my + right[0] * mx) * sp, (fwd[1] * my + right[1] * mx) * sp],
        boxes,
        WALK.radius
      );
    } else if (glideRef.current) {
      const dx = glideRef.current[0] - pos.current[0];
      const dy = glideRef.current[1] - pos.current[1];
      const dist = Math.hypot(dx, dy);
      const step = Math.min(dist, WALK.glide * dt);
      const before = pos.current;
      pos.current = walkMove(before, [(dx / dist) * step, (dy / dist) * step], boxes, WALK.radius);
      const moved = Math.hypot(pos.current[0] - before[0], pos.current[1] - before[1]);
      if (dist < 60 || moved < step * 0.25) glideRef.current = null; // arrived or stuck
    }
    camera.position.set(pos.current[0] * S, WALK.eye * S, -pos.current[1] * S);
    camera.rotation.set(pitch, yaw, 0);
  });

  return null;
}

// ── Floor-plan camera ───────────────────────────────────────────────────
// Orthographic top-down view, north (data +y) up on screen, auto-fit to the
// apartment floor with a small margin. Rotation is locked (pan/zoom stay
// live) so it remains a true plan; drei's makeDefault restore hands back the
// orbit camera untouched on exit.
const CAM_MARGIN = 1.08;
const CAM_DIST = 30; // camera height (m) — anywhere above the geometry

function PlanView({ apartment }) {
  const size = useThree((s) => s.size);
  const view = useMemo(() => {
    const f = apartment.floor;
    const [w, d] = [f.size[0] * S, f.size[1] * S];
    const cx = f.pos[0] * S + w / 2;
    const cz = -(f.pos[1] * S + d / 2); // three.z of the apartment center (z = -y)
    return { pos: [cx, CAM_DIST, cz], target: [cx, 0, cz], fit: [w, d] };
  }, [apartment]);
  const zoom = useMemo(
    () => Math.min(size.width / view.fit[0], size.height / view.fit[1]) / CAM_MARGIN,
    [size, view]
  );
  return (
    <>
      <OrthographicCamera
        makeDefault
        position={view.pos}
        up={[0, 0, -1]}
        zoom={zoom}
        near={0.1}
        far={100}
      />
      <OrbitControls makeDefault target={view.target} enableRotate={false} />
    </>
  );
}

// Arrow keys glide the view over the ground plane, relative to where the
// camera is looking. Shift = 4x step. Listens on window so the canvas
// doesn't need focus.
function ArrowKeyPan() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    if (!controls) return;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      let dx = 0;
      let dz = 0;
      if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp') dz = 1;
      else if (e.key === 'ArrowDown') dz = -1;
      else return;
      e.preventDefault();

      const step = e.shiftKey ? 1.0 : 0.25; // meters
      const forward = new Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) {
        // looking straight down (plan view): pan in screen directions instead
        forward.setFromMatrixColumn(camera.matrix, 1); // camera-local up
        forward.y = 0;
      }
      forward.normalize();
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0); // camera-local right
      right.y = 0;
      right.normalize();
      const offset = right.multiplyScalar(dx * step).add(forward.multiplyScalar(dz * step));
      camera.position.add(offset);
      controls.target.add(offset);
      controls.update();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera, controls]);

  return null;
}

export default function Viewer({
  apartment,
  report,
  showClearances,
  showAreas,
  showPieces = true,
  areas,
  onSelectPiece,
  cam = 'free', // 'free' orbit | 'plan' top-down
  walk = 'off', // 'off' | 'arm' (click floor to drop in) | 'on' (walking)
  walkSpawn = null,
  onWalkEnter,
  onWalkExit,
  tour = null, // scripted tour steps (src/data/tour.js) to play while walking, or null
  onTourEnd,
  onTourCaption,
}) {
  const openingColor = { door: '#7fd17f', window: '#7fb8ff' };
  const woodTex = useMemo(() => makeWoodTexture(), []);
  const tileTex = useMemo(() => makeTileTexture(), []);
  const wallTileTex = useMemo(() => makeWallTileTexture(), []);
  const walking = walk === 'on';

  // Everything solid at body height blocks walking: walls (lintels sit above
  // the head and drop out), the entrance door opening (a "closed front door"),
  // and every placed furniture part box.
  const walkBoxes = useMemo(() => walkObstacles(apartment, report.placed, WALK.zlo, WALK.zhi), [apartment, report]);

  // Everything that opens registers here (see OpenablesContext) so the tour
  // can drive it; look targets by piece label / opening name resolve here too.
  const openables = useMemo(() => new Map(), []);
  const tourDoors = useMemo(
    () => (apartment.openings || []).filter((o) => o.type === 'door').map(doorGeometry),
    [apartment]
  );
  const resolveTourTarget = useMemo(
    () => (t) => resolveTarget(t, { placed: report.placed, openings: apartment.openings || [], eye: WALK.eye }),
    [report, apartment]
  );

  const glideRef = useRef(null); // data-space [x, y] glide target, or null
  const dragRef = useRef(0); // pointer travel since last pointerdown (px)

  // In arm mode OrbitControls still owns the pointer; track drag distance so
  // an orbit gesture that ends over a floor doesn't count as a drop-in click.
  useEffect(() => {
    if (walk !== 'arm') return;
    let last = null;
    const down = (e) => {
      last = [e.clientX, e.clientY];
      dragRef.current = 0;
    };
    const move = (e) => {
      if (!last) return;
      dragRef.current += Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    };
    const up = () => {
      last = null;
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [walk]);

  const onFloorClick = (e) => {
    if (walk === 'off' || dragRef.current > 8) return;
    e.stopPropagation();
    const pt = [e.point.x / S, -e.point.z / S];
    if (walk === 'arm') {
      // drop in facing the way the orbit camera was looking
      const dir = new Vector3();
      e.camera.getWorldDirection(dir);
      onWalkEnter?.({ pos: pt, yaw: Math.atan2(-dir.x, -dir.z) });
    } else {
      glideRef.current = pt;
    }
  };

  // hover = { key, box, text, className } for the item under the pointer
  const [hover, setHover] = useState(null);
  const over = (info) => (e) => {
    if (walking) return; // no dimension labels in first person
    e.stopPropagation();
    setHover(info);
  };
  const out = (key) => () => setHover((h) => (h && h.key === key ? null : h));
  useEffect(() => {
    if (walking) setHover(null);
  }, [walking]);

  return (
    <Canvas
      camera={{ position: [7.5, 11, 14], fov: 45, near: 0.05 }}
      style={{ background: '#16181c' }}
    >
      <EdgesContext.Provider value={false}>
      <OpenablesContext.Provider value={openables}>
      <color attach="background" args={['#16181c']} />
      <ambientLight intensity={walking ? 0.95 : 0.7} />
      <directionalLight
        position={[10, 14, 2]}
        intensity={1.4}
      />

      {apartment.floor && (
        <Box box={aabbOf(apartment.floor.pos, apartment.floor.size)} color="#57534c" />
      )}
      {(apartment.floors || []).map((f) => (
        <FloorZone
          key={f.name}
          f={f}
          wood={woodTex}
          tile={tileTex}
          onClick={walk !== 'off' ? onFloorClick : undefined}
        />
      ))}
      {(apartment.wallTiles || []).map((f) => (
        <WallTileZone key={f.name} f={f} tile={wallTileTex} />
      ))}
      {/* walking only: a ceiling slab so looking up doesn't show the void */}
      {walking && apartment.floor && (
        <Box
          box={aabbOf(
            [apartment.floor.pos[0], apartment.floor.pos[1], apartment.height || 2600],
            [apartment.floor.size[0], apartment.floor.size[1], 40]
          )}
          color="#26282d"
          raycast={() => null}
        />
      )}
      {/* room-area overlay: a plan layer floating above the wall tops, so no
          wall or furniture ever hides it */}
      {showAreas &&
        (areas || []).map((room) => {
          const zTop = (apartment.height || 2600) + 150;
          return (
            <group key={room.label}>
              {room.rects.map((f) => (
                <Box
                  key={f.name}
                  box={aabbOf([f.pos[0], f.pos[1], zTop], [f.size[0], f.size[1], 4])}
                  color="#0b0d10"
                  raycast={() => null}
                />
              ))}
              <DimLabel
                box={aabbOf([room.anchor.pos[0], room.anchor.pos[1], zTop], [room.anchor.size[0], room.anchor.size[1], 4])}
                text={`${room.m2.toFixed(1)} m²`}
                name={room.label}
                className="area"
              />
              {(room.edges || []).map((e, i) => {
                const mid = (e.from + e.to) / 2;
                const off = e.coord + e.inward * 240;
                const [x, y] = e.axis === 'v' ? [off, mid] : [mid, off];
                return (
                  <DimLabel
                    key={`${room.label}-e${i}`}
                    box={aabbOf([x, y, zTop], [1, 1, 4])}
                    text={cm(e.to - e.from)}
                    className="area-side"
                  />
                );
              })}
            </group>
          );
        })}
      {apartment.walls.map((w) => {
        const box = aabbOf(w.pos, w.size);
        const info = {
          key: `w-${w.name}`,
          box,
          name: w.name,
          text: cm(Math.max(w.size[0], w.size[1])),
          className: '',
        };
        return (
          <Box
            key={w.name}
            box={box}
            color={WALL_PAINT}
            hovered={hover?.key === info.key}
            onPointerOver={over(info)}
            onPointerOut={out(info.key)}
          />
        );
      })}
      {(apartment.openings || []).map((o) => {
        const box = aabbOf(o.pos, o.size);
        const info = {
          key: `o-${o.name}`,
          box,
          name: o.name,
          text: cm(Math.max(o.size[0], o.size[1])),
          className: o.type,
        };
        if (o.type === 'door') {
          return (
            <RoomDoor
              key={o.name}
              opening={o}
              hovered={hover?.key === info.key}
              onPointerOver={over(info)}
              onPointerOut={out(info.key)}
            />
          );
        }
        if (o.type === 'window') {
          return (
            <RoomWindow
              key={o.name}
              opening={o}
              hovered={hover?.key === info.key}
              onPointerOver={over(info)}
              onPointerOut={out(info.key)}
            />
          );
        }
        return (
          <Box
            key={o.name}
            box={box}
            color={openingColor[o.type] || '#cccccc'}
            opacity={0.3}
            onPointerOver={over(info)}
            onPointerOut={out(info.key)}
          />
        );
      })}

      {showPieces &&
        report.placed.map((entry) => {
        const b = entry.bbox;
        const info = {
          key: `p-${entry.id}`,
          box: b,
          name: entry.name,
          text: `${cm(b.max[0] - b.min[0])} × ${cm(b.max[1] - b.min[1])} × ${cm(b.max[2] - b.min[2])}`,
          className: 'piece',
        };
        return (
          <Placement
            key={entry.id}
            entry={entry}
            collided={report.collidedIds.has(entry.id)}
            showClearances={showClearances}
            hovered={hover?.key === info.key}
            onPointerOver={over(info)}
            onPointerOut={out(info.key)}
            onDoubleClick={(e) => {
              if (walking) return; // double-click select would yank us out of the walk
              e.stopPropagation();
              onSelectPiece?.(entry.piece.id);
            }}
          />
        );
      })}

      {hover && !walking && (
        <DimLabel box={hover.box} text={hover.text} name={hover.name} className={hover.className} />
      )}

      {!walking && cam === 'free' && <OrbitControls target={[7.5, 0.5, -4.6]} makeDefault />}
      {!walking && cam !== 'free' && <PlanView apartment={apartment} />}
      {!walking && <ArrowKeyPan />}
      {walking && (
        <WalkControls
          spawn={walkSpawn}
          boxes={walkBoxes}
          glideRef={glideRef}
          dragRef={dragRef}
          onExit={onWalkExit}
          tour={tour}
          onTourEnd={onTourEnd}
          openables={openables}
          doors={tourDoors}
          resolve={resolveTourTarget}
          onCaption={onTourCaption}
        />
      )}
      </OpenablesContext.Provider>
      </EdgesContext.Provider>
    </Canvas>
  );
}

// Single-piece view: the piece alone at the origin on a grid, auto-framed.
// highlight = Set of part indices to light up (driven by the parts table);
// onHoverPart reports the hovered part index back so the table can follow.
// Remount (key it by piece id) when the piece changes so the camera reframes.
export function PieceViewer({ piece, highlight, onHoverPart, explode = 0, hideAppliances = false }) {
  const parts = piece.parts?.length
    ? piece.parts
    : [{ name: piece.name, pos: [0, 0, 0], size: piece.size, color: piece.color || '#8a93a6' }];
  const bb = pieceLocalBBox(piece);
  const centerX = (bb.min[0] + bb.max[0]) / 2;
  // Exploded view: each part slides away from the piece center (mm, data space),
  // proportional to the slider. z explodes from the bottom so nothing sinks below
  // the grid. At 0 every offset is 0.
  const centerY = (bb.min[1] + bb.max[1]) / 2;
  const explodeOffset = (p) => {
    const k = explode * 1.2;
    return [
      (p.pos[0] + p.size[0] / 2 - centerX) * k,
      (p.pos[1] + p.size[1] / 2 - centerY) * k,
      (p.pos[2] + p.size[2] / 2 - bb.min[2]) * k,
    ];
  };
  const isFlap = (p) => p.name.startsWith('flap');
  const isPullout = (p) => p.name.startsWith('pullout');
  // "Hide appliances" strips parts flagged appliance (oven, sink, hob...) so the
  // carcass they drop into can be inspected. Indices stay those of piece.parts
  // so table hover/highlight keep lining up.
  const hidden = (p) => hideAppliances && p.appliance;
  const { groups: drawers, consumed } = useMemo(() => drawerGroups(parts), [parts]);
  const { groups: doors, consumed: onDoors } = useMemo(() => doorGroups(parts), [parts]);

  const [hover, setHover] = useState(null); // part index under the pointer
  const setHovered = (i) => {
    setHover(i);
    onHoverPart?.(i);
  };

  // three-space center of the piece and a camera distance from its span
  const c = [
    ((bb.min[0] + bb.max[0]) / 2) * S,
    ((bb.min[2] + bb.max[2]) / 2) * S,
    (-(bb.min[1] + bb.max[1]) / 2) * S,
  ];
  const span = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) * S;
  const cam = [c[0] + span * 0.9, c[1] + span * 0.75, c[2] + span * 1.3];

  const hoveredPart = hover != null ? parts[hover] : null;

  return (
    <Canvas camera={{ position: cam, fov: 45 }} style={{ background: '#16181c' }}>
      <color attach="background" args={['#16181c']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 5]} intensity={1.3} />

      {explode > 0 &&
        parts.map((p, i) => {
          // scattered: every part on its own, no drawer/door grouping or animation
          if (hidden(p)) return null;
          const off = explodeOffset(p);
          return (
            <group
              key={i}
              position={[off[0] * S, off[2] * S, -off[1] * S]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(i);
              }}
              onPointerOut={() => setHovered(null)}
            >
              <LocalBox
                part={p}
                color={partColor(p, piece)}
                opacity={p.opacity ?? 1}
                hovered={hover === i || highlight?.has(i)}
              />
            </group>
          );
        })}

      {explode === 0 &&
        parts.map((p, i) => {
        if (consumed.has(i) || onDoors.has(i)) return null; // rendered inside its Drawer/Door
        if (hidden(p)) return null;
        const lit = hover === i || highlight?.has(i);
        if (drawers.has(i)) {
          return (
            <Drawer key={i} face={drawerFace(p)} pullMm={drawerPull(parts, p, drawers.get(i))}>
              {[i, ...drawers.get(i)].filter((pi) => !hidden(parts[pi])).map((pi) => (
                <group
                  key={pi}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(pi);
                  }}
                  onPointerOut={() => setHovered(null)}
                >
                  <LocalBox
                    part={parts[pi]}
                    color={partColor(parts[pi], piece)}
                    opacity={parts[pi].opacity ?? 1}
                    hovered={hover === pi || highlight?.has(pi)}
                  />
                </group>
              ))}
              <LocalBox part={barHandle(p)} color="#9aa0a8" hovered={hover === i || highlight?.has(i)} />
            </Drawer>
          );
        }
        return (
          <group
            key={i}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(i);
            }}
            onPointerOut={() => setHovered(null)}
          >
            {doors.has(i) ? (
              <Door
                part={p}
                attachments={doors.get(i).map((ai) => parts[ai]).filter((a) => !hidden(a))}
                color={partColor(p, piece)}
                bbox={bb}
                hovered={lit}
              />
            ) : isFlap(p) ? (
              <Flap part={p} color={partColor(p, piece)} hovered={lit} />
            ) : isPullout(p) ? (
              <Drawer face={drawerFace(p)} pullMm={Math.round(0.8 * p.size[drawerAxes(drawerFace(p)).pull])}>
                <LocalBox part={p} color={partColor(p, piece)} opacity={p.opacity ?? 1} hovered={lit} />
              </Drawer>
            ) : (
              <LocalBox part={p} color={partColor(p, piece)} opacity={p.opacity ?? 1} hovered={lit} />
            )}
          </group>
        );
      })}

      {hoveredPart && (
        <DimLabel
          box={aabbOf(
            hoveredPart.pos.map((v, a) => v + explodeOffset(hoveredPart)[a]),
            hoveredPart.size
          )}
          name={hoveredPart.name}
          text={[...hoveredPart.size].sort((a, b) => b - a).join(' × ')}
          className="piece"
        />
      )}

      <OrbitControls target={c} makeDefault />
      <ArrowKeyPan />
    </Canvas>
  );
}
