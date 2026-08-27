import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Vector3, MathUtils, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { aabbOf, pieceLocalBBox } from './geometry.js';

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

// One floor zone; zones with texture:"wood" get the plank map, scaled to mm.
function FloorZone({ f, wood }) {
  const box = aabbOf(f.pos, f.size);
  const tex = useMemo(() => {
    if (f.texture !== 'wood' || !wood) return null;
    const t = wood.clone();
    t.repeat.set(f.size[0] / WOOD_TILE_MM, f.size[1] / WOOD_TILE_MM);
    // world-aligned offset so the plank pattern runs continuously across zones
    t.offset.set(f.pos[0] / WOOD_TILE_MM, f.pos[1] / WOOD_TILE_MM);
    t.needsUpdate = true;
    return t;
  }, [f, wood]);
  if (!tex) return <Box box={box} color={f.color || '#57534c'} />;
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
function DimLabel({ box, text, name, className = '' }) {
  const pos = [
    ((box.min[0] + box.max[0]) / 2) * S,
    box.max[2] * S + 0.03,
    (-(box.min[1] + box.max[1]) / 2) * S,
  ];
  return (
    <Html position={pos} center distanceFactor={6} zIndexRange={[10, 0]}>
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

// A part box in piece-local coordinates (rendered inside the placement group).
function LocalBox({ part, color, hovered, opacity = 1, ...handlers }) {
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
function doorLeafParts(style, w, h) {
  switch (style) {
    case 'entrance': // strong solid brown door
      return [{ u: 0, du: w, z: 0, dz: h, t: 54, color: '#6b4a2f' }];
    case 'balcony': {
      // glass door with a white border all around
      const f = 90;
      return [
        { u: 0, du: f, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: w - f, du: f, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: 0, dz: 120, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: h - 120, dz: 120, t: 44, color: DOOR_WHITE },
        { u: f, du: w - 2 * f, z: 120, dz: h - 240, t: 12, color: DOOR_GLASS, opacity: 0.35 },
      ];
    }
    case 'living': {
      // white door with a glass panel in the middle
      const s = 140, bottom = 350, top = 250;
      return [
        { u: 0, du: s, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: w - s, du: s, z: 0, dz: h, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: 0, dz: bottom, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: h - top, dz: top, t: 44, color: DOOR_WHITE },
        { u: s, du: w - 2 * s, z: bottom, dz: h - bottom - top, t: 12, color: DOOR_GLASS, opacity: 0.4 },
      ];
    }
    default: // 'inner' — simple white door
      return [{ u: 0, du: w, z: 0, dz: h, t: 40, color: '#e8e6e1' }];
  }
}

// A clickable door: pivots on a vertical hinge at its outer edge (the edge
// farther from the piece's center) and swings open/closed with damping.
function Door({ part, color, pieceCenterX, hovered }) {
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

  const shifted = { ...part, pos: [part.pos[0] - hx, part.pos[1] - hy, part.pos[2]] };
  return (
    <group ref={ref} position={[hx * S, 0, -hy * S]}>
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
  return (
    <group ref={ref} position={[hx * S, opening.pos[2] * S, -hy * S]}>
      <group
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
        {leafParts.map((p, i) => (
          <LocalBox
            key={i}
            part={
              horiz
                ? { pos: [away + p.u, -p.t / 2, p.z], size: [p.du, p.t, p.dz] }
                : { pos: [-p.t / 2, away + p.u, p.z], size: [p.t, p.du, p.dz] }
            }
            color={p.color}
            opacity={p.opacity ?? 1}
            hovered={hovered}
          />
        ))}
      </group>
    </group>
  );
}

function Placement({ entry, collided, showClearances, hovered, onPointerOver, onPointerOut }) {
  const { piece, placement } = entry;
  const parts = piece.parts?.length
    ? piece.parts
    : [{ name: piece.name, pos: [0, 0, 0], size: piece.size, color: piece.color || '#8a93a6' }];
  const bb = pieceLocalBBox(piece);
  const centerX = (bb.min[0] + bb.max[0]) / 2;
  const rot = (((placement.rot || 0) % 360) + 360) % 360;
  const isDoor = (p) => p.name.startsWith('door');

  return (
    <group>
      {/* clearances stay outside the hover group so empty air doesn't trigger the label */}
      <group
        position={[placement.pos[0] * S, placement.pos[2] * S, -placement.pos[1] * S]}
        rotation={[0, MathUtils.degToRad(rot), 0]}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        {parts.map((p, i) =>
          isDoor(p) ? (
            <Door
              key={i}
              part={p}
              color={p.color || piece.color || '#c9a36b'}
              pieceCenterX={centerX}
              hovered={hovered}
            />
          ) : (
            <LocalBox key={i} part={p} color={p.color || piece.color || '#c9a36b'} hovered={hovered} />
          )
        )}
      </group>
      {collided && <Box box={entry.bbox} color="#ff3b30" opacity={0.35} />}
      {showClearances &&
        entry.clearances.map((c, i) => (
          <Box key={`c${i}`} box={c.box} color="#ffcc00" opacity={0.15} />
        ))}
    </group>
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

export default function Viewer({ apartment, report, showClearances }) {
  const openingColor = { door: '#7fd17f', window: '#7fb8ff' };
  const woodTex = useMemo(() => makeWoodTexture(), []);

  // hover = { key, box, text, className } for the item under the pointer
  const [hover, setHover] = useState(null);
  const over = (info) => (e) => {
    e.stopPropagation();
    setHover(info);
  };
  const out = (key) => () => setHover((h) => (h && h.key === key ? null : h));

  return (
    <Canvas
      camera={{ position: [7.5, 11, 14], fov: 45 }}
      style={{ background: '#16181c' }}
    >
      <color attach="background" args={['#16181c']} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[10, 14, 2]}
        intensity={1.4}
      />

      {apartment.floor && (
        <Box box={aabbOf(apartment.floor.pos, apartment.floor.size)} color="#57534c" />
      )}
      {(apartment.floors || []).map((f) => (
        <FloorZone key={f.name} f={f} wood={woodTex} />
      ))}
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

      {report.placed.map((entry) => {
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
          />
        );
      })}

      {hover && (
        <DimLabel box={hover.box} text={hover.text} name={hover.name} className={hover.className} />
      )}

      <OrbitControls target={[7.5, 0.5, -4.6]} makeDefault />
      <ArrowKeyPan />
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
  const isDoor = (p) => p.name.startsWith('door');

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
        const lit = hover === i || highlight?.has(i);
        return (
          <group
            key={i}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(i);
            }}
            onPointerOut={() => setHovered(null)}
          >
            {isDoor(p) ? (
              <Door part={p} color={p.color || piece.color || '#c9a36b'} pieceCenterX={centerX} hovered={lit} />
            ) : (
              <LocalBox part={p} color={p.color || piece.color || '#c9a36b'} hovered={lit} />
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
