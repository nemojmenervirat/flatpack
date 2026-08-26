import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { aabbOf, placeBox } from './geometry.js';

// Data space is mm, [x, y, z] with z up.
// Three.js is y-up, meters. Mapping: three.x = x, three.y = z, three.z = y.
const S = 1 / 1000;

function Box({ box, color = '#c9a36b', opacity = 1 }) {
  const size = [
    (box.max[0] - box.min[0]) * S,
    (box.max[2] - box.min[2]) * S,
    (box.max[1] - box.min[1]) * S,
  ];
  const pos = [
    ((box.min[0] + box.max[0]) / 2) * S,
    ((box.min[2] + box.max[2]) / 2) * S,
    ((box.min[1] + box.max[1]) / 2) * S,
  ];
  return (
    <mesh position={pos} castShadow={opacity === 1} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

function Placement({ entry, collided, showClearances }) {
  const { piece, placement } = entry;
  const boxes = piece.parts?.length
    ? piece.parts.map((p) => ({
        box: placeBox(aabbOf(p.pos, p.size), placement),
        color: p.color || piece.color || '#c9a36b',
      }))
    : [{ box: entry.bbox, color: piece.color || '#8a93a6' }];

  return (
    <group>
      {boxes.map((b, i) => (
        <Box key={i} box={b.box} color={b.color} />
      ))}
      {collided && <Box box={entry.bbox} color="#ff3b30" opacity={0.35} />}
      {showClearances &&
        entry.clearances.map((c, i) => (
          <Box key={`c${i}`} box={c.box} color="#ffcc00" opacity={0.15} />
        ))}
    </group>
  );
}

export default function Viewer({ apartment, report, showClearances }) {
  const openingColor = { door: '#7fd17f', window: '#7fb8ff' };
  return (
    <Canvas
      shadows
      camera={{ position: [6.5, 5, 7.5], fov: 45 }}
      style={{ background: '#16181c' }}
    >
      <color attach="background" args={['#16181c']} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      {apartment.floor && (
        <Box box={aabbOf(apartment.floor.pos, apartment.floor.size)} color="#57534c" />
      )}
      {apartment.walls.map((w) => (
        <Box key={w.name} box={aabbOf(w.pos, w.size)} color="#a3a09a" />
      ))}
      {(apartment.openings || []).map((o) => (
        <Box
          key={o.name}
          box={aabbOf(o.pos, o.size)}
          color={openingColor[o.type] || '#cccccc'}
          opacity={0.3}
        />
      ))}

      {report.placed.map((entry) => (
        <Placement
          key={entry.id}
          entry={entry}
          collided={report.collidedIds.has(entry.id)}
          showClearances={showClearances}
        />
      ))}

      <OrbitControls target={[2, 1, 1.75]} makeDefault />
    </Canvas>
  );
}
