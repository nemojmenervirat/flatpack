import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, Html } from '@react-three/drei';
import { Vector3, MathUtils, CanvasTexture, RepeatWrapping, SRGBColorSpace, Shape, ExtrudeGeometry } from 'three';
import { aabbOf, pieceLocalBBox, walkMove } from './geometry.js';

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

// Floating label at the top center of a data-space box.
// distanceFactor only under a perspective camera: for an orthographic camera
// drei scales Html by camera.zoom * distanceFactor (~576x in the fitted plan
// view — one label glyph covers the whole screen), so the plan view gets
// natural-size labels instead.
function DimLabel({ box, text, name, className = '' }) {
  const ortho = useThree((s) => s.camera.isOrthographicCamera);
  const pos = [
    ((box.min[0] + box.max[0]) / 2) * S,
    box.max[2] * S + 0.03,
    (-(box.min[1] + box.max[1]) / 2) * S,
  ];
  return (
    <Html position={pos} center distanceFactor={ortho ? undefined : 6} zIndexRange={[10, 0]}>
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
        emissive={hovered ? '#4a4638' : '#000000'}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

// A part with "round": r (mm) renders its footprint as a rounded rectangle,
// extruded to the part's height. Render-only sugar: geometry.js still sees
// the part's plain AABB, so fit checks stay conservative.
function LocalRounded({ part, color, hovered, opacity = 1, ...handlers }) {
  const geom = useMemo(() => {
    const [w, d, h] = part.size;
    const r = Math.min(part.round, w / 2, d / 2) * S;
    const W = w * S;
    const D = d * S;
    const s = new Shape();
    s.moveTo(r, 0);
    s.lineTo(W - r, 0);
    s.absarc(W - r, r, r, -Math.PI / 2, 0);
    s.lineTo(W, D - r);
    s.absarc(W - r, D - r, r, 0, Math.PI / 2);
    s.lineTo(r, D);
    s.absarc(r, D - r, r, Math.PI / 2, Math.PI);
    s.lineTo(0, r);
    s.absarc(r, r, r, Math.PI, Math.PI * 1.5);
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
        color={color}
        emissive={hovered ? '#4a4638' : '#000000'}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

// A part box in piece-local coordinates (rendered inside the placement group).
function LocalBox({ part, color, hovered, opacity = 1, ...handlers }) {
  if (part.round) {
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
        color={color}
        emissive={hovered ? '#4a4638' : '#000000'}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
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

// Flat architrave casing around an inner door opening: two legs and a head on
// each wall face. Same leaf-plane coords as doorLeafParts, static (no swing).
const CASING_W = 70;
const CASING_T = 18;
function doorCasingParts(horiz, away, w, h, wall) {
  const boxes = [];
  for (const face of [-wall / 2 - CASING_T, wall / 2]) {
    boxes.push(
      { u: away - CASING_W, du: CASING_W, z: 0, dz: h + CASING_W, y: face },
      { u: away + w, du: CASING_W, z: 0, dz: h + CASING_W, y: face },
      { u: away, du: w, z: h, dz: CASING_W, y: face }
    );
  }
  return boxes.map((b) =>
    horiz
      ? { pos: [b.u, b.y, b.z], size: [b.du, CASING_T, b.dz] }
      : { pos: [b.y, b.u, b.z], size: [CASING_T, b.du, b.dz] }
  );
}

// A clickable door: pivots on a vertical hinge at its outer edge (the edge
// farther from the piece's center) and swings open/closed with damping.
// attachments = parts riding on the door (bins, inner liner) that swing along.
function Door({ part, attachments = [], color, pieceCenterX, hovered }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const hingeLeft = part.pos[0] + part.size[0] / 2 < pieceCenterX;
  const hx = hingeLeft ? part.pos[0] : part.pos[0] + part.size[0];
  const hy = part.pos[1] + part.size[1]; // door's back plane = carcass front
  const target = open ? (hingeLeft ? -1 : 1) * MathUtils.degToRad(90) : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y = MathUtils.damp(ref.current.rotation.y, target, 6, dt);
    }
  });

  const shift = (p) => ({ ...p, pos: [p.pos[0] - hx, p.pos[1] - hy, p.pos[2]] });
  const handlers = {
    onClick: (e) => {
      e.stopPropagation();
      setOpen((o) => !o);
    },
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = 'auto'),
  };
  return (
    <group ref={ref} position={[hx * S, 0, -hy * S]}>
      <LocalBox part={shift(part)} color={color} hovered={hovered} {...handlers} />
      {attachments.map((a, i) => (
        <LocalBox
          key={i}
          part={shift(a)}
          color={a.color || color}
          opacity={a.opacity ?? 1}
          hovered={hovered}
          {...handlers}
        />
      ))}
    </group>
  );
}

// A clickable bottom-hinged flap (dishwasher / oven front): pivots on its
// bottom edge at the carcass front plane and tilts forward to horizontal.
function Flap({ part, color, hovered }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const hy = part.pos[1] + part.size[1]; // back plane = carcass front
  const hz = part.pos[2]; // bottom edge
  const target = open ? MathUtils.degToRad(88) : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.x = MathUtils.damp(ref.current.rotation.x, target, 6, dt);
    }
  });

  const shifted = { ...part, pos: [part.pos[0], part.pos[1] - hy, part.pos[2] - hz] };
  return (
    <group ref={ref} position={[0, hz * S, -hy * S]}>
      <LocalBox
        part={shifted}
        color={color}
        hovered={hovered}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onPointerOver={(e) => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      />
    </group>
  );
}

// A clickable drawer: the front and its box slide out along the front
// direction (local -y, which is three.js +z inside the placement group).
function Drawer({ pullMm, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const target = open ? pullMm * S : 0;

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.position.z = MathUtils.damp(ref.current.position.z, target, 6, dt);
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
// inside the front's x/z span. Returns the members per front index and the
// set of member indices (so the normal render loop skips them).
function drawerGroups(parts) {
  const isFront = (p) => p.name.startsWith('drawer front');
  const frontIdx = parts.map((p, i) => (isFront(p) ? i : -1)).filter((i) => i >= 0);
  const groups = new Map(frontIdx.map((i) => [i, []]));
  const consumed = new Set();
  parts.forEach((p, i) => {
    if (isFront(p) || !p.name.startsWith('drawer')) return;
    const cx = p.pos[0] + p.size[0] / 2;
    const cz = p.pos[2] + p.size[2] / 2;
    const f = frontIdx.find((fi) => {
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

// Pull-out distance: 80% of the box depth (falls back to 400mm front-only).
const drawerPull = (parts, members) =>
  Math.round(0.8 * Math.max(400, ...members.map((i) => parts[i].size[1])));

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
  const casing = opening.style !== 'balcony'
    ? doorCasingParts(horiz, away, w, sz, horiz ? sy : sx)
    : [];
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
  const rot = (((placement.rot || 0) % 360) + 360) % 360;
  const isFlap = (p) => p.name.startsWith('flap');
  const { groups: drawers, consumed } = useMemo(() => drawerGroups(parts), [parts]);
  const { groups: doors, consumed: onDoors } = useMemo(() => doorGroups(parts), [parts]);

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
                color={p.color || piece.color || '#c9a36b'}
                pieceCenterX={centerX}
                hovered={hovered}
              />
            );
          }
          if (isFlap(p)) {
            return (
              <Flap key={i} part={p} color={p.color || piece.color || '#c9a36b'} hovered={hovered} />
            );
          }
          if (drawers.has(i)) {
            return (
              <Drawer key={i} pullMm={drawerPull(parts, drawers.get(i))}>
                {[i, ...drawers.get(i)].map((pi) => (
                  <LocalBox
                    key={pi}
                    part={parts[pi]}
                    color={parts[pi].color || piece.color || '#c9a36b'}
                    opacity={parts[pi].opacity ?? 1}
                    hovered={hovered}
                  />
                ))}
              </Drawer>
            );
          }
          return (
            <LocalBox
              key={i}
              part={p}
              color={p.color || piece.color || '#c9a36b'}
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
const WALK = { eye: 1650, radius: 200, zlo: 100, zhi: 1650, speed: 1400, run: 2800, glide: 2200 };
const ENTRANCE_SPAWN = { pos: [8647, 6950], yaw: Math.PI }; // just inside the front door, facing the hall

function WalkControls({ spawn, boxes, glideRef, dragRef, onExit }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pos = useRef(null); // data-space mm [x, y]
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef({});

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
      look.current.yaw += dx * 0.005;
      look.current.pitch = MathUtils.clamp(look.current.pitch + dy * 0.005, -1.45, 1.45);
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      if (!pos.current) return;
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
  }, [gl, boxes, glideRef, dragRef, onExit]);

  useFrame((_, dtRaw) => {
    if (!pos.current) return;
    const dt = Math.min(dtRaw, 0.05); // clamp frame spikes so we can't tunnel
    const { yaw, pitch } = look.current;
    const fwd = [-Math.sin(yaw), Math.cos(yaw)]; // data-space heading
    const right = [Math.cos(yaw), Math.sin(yaw)];
    const k = keys.current;
    const mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    const my = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
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
      forward.normalize();
      const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
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
}) {
  const openingColor = { door: '#7fd17f', window: '#7fb8ff' };
  const woodTex = useMemo(() => makeWoodTexture(), []);
  const tileTex = useMemo(() => makeTileTexture(), []);
  const walking = walk === 'on';

  // Everything solid at body height blocks walking: walls (lintels sit above
  // the head and drop out), the entrance door opening (a "closed front door"),
  // and every placed furniture part box.
  const walkBoxes = useMemo(() => {
    const atBody = (b) => b.min[2] < WALK.zhi && b.max[2] > WALK.zlo;
    return [
      ...apartment.walls.map((w) => aabbOf(w.pos, w.size)),
      ...(apartment.openings || [])
        .filter((o) => o.style === 'entrance')
        .map((o) => aabbOf(o.pos, o.size)),
      ...report.placed.flatMap((p) => p.partBoxes),
    ].filter(atBody);
  }, [apartment, report]);

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
            color="#a3a09a"
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
      {!walking && cam === 'free' && <ArrowKeyPan />}
      {!walking && cam !== 'free' && <PlanView apartment={apartment} />}
      {walking && (
        <WalkControls
          spawn={walkSpawn}
          boxes={walkBoxes}
          glideRef={glideRef}
          dragRef={dragRef}
          onExit={onWalkExit}
        />
      )}
    </Canvas>
  );
}

// Single-piece view: the piece alone at the origin on a grid, auto-framed.
// highlight = Set of part indices to light up (driven by the parts table);
// onHoverPart reports the hovered part index back so the table can follow.
// Remount (key it by piece id) when the piece changes so the camera reframes.
export function PieceViewer({ piece, highlight, onHoverPart }) {
  const parts = piece.parts?.length
    ? piece.parts
    : [{ name: piece.name, pos: [0, 0, 0], size: piece.size, color: piece.color || '#8a93a6' }];
  const bb = pieceLocalBBox(piece);
  const centerX = (bb.min[0] + bb.max[0]) / 2;
  const isFlap = (p) => p.name.startsWith('flap');
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
      <gridHelper
        args={[Math.ceil(span * 3), Math.ceil(span * 3) * 2, '#3a3e46', '#24272d']}
        position={[c[0], -0.001, c[2]]}
      />

      {parts.map((p, i) => {
        if (consumed.has(i) || onDoors.has(i)) return null; // rendered inside its Drawer/Door
        const lit = hover === i || highlight?.has(i);
        if (drawers.has(i)) {
          return (
            <Drawer key={i} pullMm={drawerPull(parts, drawers.get(i))}>
              {[i, ...drawers.get(i)].map((pi) => (
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
                    color={parts[pi].color || piece.color || '#c9a36b'}
                    opacity={parts[pi].opacity ?? 1}
                    hovered={hover === pi || highlight?.has(pi)}
                  />
                </group>
              ))}
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
                attachments={doors.get(i).map((ai) => parts[ai])}
                color={p.color || piece.color || '#c9a36b'}
                pieceCenterX={centerX}
                hovered={lit}
              />
            ) : isFlap(p) ? (
              <Flap part={p} color={p.color || piece.color || '#c9a36b'} hovered={lit} />
            ) : (
              <LocalBox part={p} color={p.color || piece.color || '#c9a36b'} opacity={p.opacity ?? 1} hovered={lit} />
            )}
          </group>
        );
      })}

      {hoveredPart && (
        <DimLabel
          box={aabbOf(hoveredPart.pos, hoveredPart.size)}
          name={hoveredPart.name}
          text={[...hoveredPart.size].sort((a, b) => b - a).join(' × ')}
          className="piece"
        />
      )}

      <OrbitControls target={c} makeDefault />
    </Canvas>
  );
}
