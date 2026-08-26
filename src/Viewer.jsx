import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Vector3, MathUtils } from 'three';
import { aabbOf, pieceLocalBBox } from './geometry.js';

// Data space is mm, [x, y, z] with z up.
// Three.js is y-up, meters. Mapping: three.x = x, three.y = z, three.z = -y.
// (z must be NEGATED: three.z = +y flips handedness and mirrors the plan.)
const S = 1 / 1000;

const cm = (mm) => {
  const v = mm / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

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
