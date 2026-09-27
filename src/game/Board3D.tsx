import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BIG_NODES, BOARD_LINES, GOAL, HOME, NODE_COUNT, NODE_XY, type Piece, type Seat } from "../../supabase/functions/_shared/yut.ts";

export const SEAT_COLOR = ["#d9453b", "#2f6fd6"] as const;
const PIECE_H = 0.62;

type V3 = [number, number, number];

/** 말들의 3D 위치 계산: 판 위(업기 = 위로 쌓기), 대기(HOME), 완주(GOAL) 트레이 */
function layout(pieces: Piece[]): Map<number, V3> {
  const out = new Map<number, V3>();
  const byNode = new Map<number, Piece[]>();
  const tray: Record<string, number> = {};
  for (const p of pieces) {
    if (p.pos === HOME || p.pos === GOAL) {
      const key = `${p.seat}:${p.pos}`;
      const k = (tray[key] = (tray[key] ?? -1) + 1);
      const side = p.seat === 0 ? 1 : -1;
      const x = side * 7.2;
      const zBase = p.pos === HOME ? (p.seat === 0 ? 1.2 : -4.8) : p.seat === 0 ? -4.8 : 1.2;
      out.set(p.id, [x, 0, zBase + k * 1.05]);
    } else {
      const arr = byNode.get(p.pos) ?? [];
      arr.push(p);
      byNode.set(p.pos, arr);
    }
  }
  for (const [node, arr] of byNode) {
    const [x, z] = NODE_XY[node];
    const seats = new Set(arr.map((p) => p.seat));
    const idx: Record<number, number> = {};
    for (const p of arr) {
      const k = (idx[p.seat] = (idx[p.seat] ?? -1) + 1);
      const dx = seats.size > 1 ? (p.seat === 0 ? -0.32 : 0.32) : 0;
      out.set(p.id, [x + dx, 0.08 + k * PIECE_H, z]);
    }
  }
  return out;
}

function PieceMesh({ piece, target, selectable, onClick, onHover, dim }: {
  piece: Piece; target: V3; selectable: boolean; dim: boolean;
  onClick: (id: number) => void; onHover: (id: number | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const last = useRef<string>("");
  const key = target.join(",");
  if (last.current !== key) {
    const cur = ref.current?.position.clone() ?? new THREE.Vector3(...target);
    anim.current = { from: cur, to: new THREE.Vector3(...target), t: 0 };
    last.current = key;
  }
  useFrame((st, dt) => {
    const g = ref.current;
    if (!g) return;
    const a = anim.current;
    if (a && a.t < 1) {
      a.t = Math.min(1, a.t + dt / 0.24);
      const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      g.position.lerpVectors(a.from, a.to, e);
      const dist = a.from.distanceTo(a.to);
      g.position.y += Math.sin(Math.PI * a.t) * Math.min(1.4, 0.35 + dist * 0.25);
    } else if (a) g.position.copy(a.to);
    if (glow.current) glow.current.emissiveIntensity = selectable ? 0.35 + Math.sin(st.clock.elapsedTime * 6) * 0.25 : 0;
  });
  const color = SEAT_COLOR[piece.seat];
  const handlers = selectable ? {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(piece.id); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(piece.id); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ""; },
  } : {};
  return (
    <group ref={ref} position={target} {...handlers}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.25, 0.36, 0.4, 24]} />
        <meshStandardMaterial ref={glow} color={color} emissive={"#ffd54a"} emissiveIntensity={0} roughness={0.45} metalness={0.1} transparent opacity={dim ? 0.55 : 1} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.2, 20, 16]} />
        <meshStandardMaterial color={color} roughness={0.35} transparent opacity={dim ? 0.55 : 1} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.42, 32]} />
        <meshBasicMaterial color="#fff6d8" transparent opacity={selectable ? 0.9 : 0} />
      </mesh>
    </group>
  );
}

function DestMarker({ node }: { node: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((st) => { if (ref.current) ref.current.scale.setScalar(1 + Math.sin(st.clock.elapsedTime * 5) * 0.12); });
  const [x, z] = node === GOAL ? [NODE_XY[0][0] + 1.2, NODE_XY[0][1] + 1.2] : NODE_XY[node];
  return (
    <group position={[x, 0.09, z]}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.68, 40]} />
        <meshBasicMaterial color="#ffcc33" />
      </mesh>
      {node === GOAL && <Html center position={[0, 0.6, 0]}><div className="board-tag goal">완주!</div></Html>}
    </group>
  );
}

function Board() {
  const lines = useMemo(() => BOARD_LINES.map(([a, b]) => [
    [NODE_XY[a][0], 0.03, NODE_XY[a][1]] as V3, [NODE_XY[b][0], 0.03, NODE_XY[b][1]] as V3,
  ]), []);
  return (
    <group>
      {/* 나무 판 */}
      <mesh receiveShadow position={[0, -0.3, 0]}>
        <boxGeometry args={[12.6, 0.6, 12.6]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.8} />
      </mesh>
      {/* 한지 */}
      <mesh receiveShadow position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11.6, 11.6]} />
        <meshStandardMaterial color="#f1e2c0" roughness={0.95} />
      </mesh>
      {lines.map((pts, i) => <Line key={i} points={pts} color="#6b4424" lineWidth={2.2} />)}
      {Array.from({ length: NODE_COUNT }, (_, n) => {
        const [x, z] = NODE_XY[n];
        const big = BIG_NODES.has(n);
        return (
          <mesh key={n} position={[x, 0.04, z]} receiveShadow>
            <cylinderGeometry args={[big ? 0.46 : 0.3, big ? 0.46 : 0.3, 0.07, 32]} />
            <meshStandardMaterial color={n === 0 ? "#b3261e" : big ? "#5a3a1e" : "#7a5230"} roughness={0.6} />
          </mesh>
        );
      })}
      <Html center position={[NODE_XY[0][0] + 0.9, 0.1, NODE_XY[0][1] + 0.9]}><div className="board-tag">출발 / 도착</div></Html>
      {/* 트레이 바닥 */}
      {([0, 1] as Seat[]).map((s) => {
        const x = s === 0 ? 7.2 : -7.2;
        return (
          <group key={s}>
            {[{ z: s === 0 ? 2.8 : -3.2, label: "대기" }, { z: s === 0 ? -3.2 : 2.8, label: "완주" }].map((t) => (
              <group key={t.label}>
                <mesh position={[x, -0.02, t.z]} receiveShadow>
                  <boxGeometry args={[1.3, 0.1, 4.6]} />
                  <meshStandardMaterial color={s === 0 ? "#f2c9c3" : "#c6d6f2"} roughness={0.9} />
                </mesh>
                <Html center position={[x, 0.05, t.z + (t.z > 0 ? 2.75 : -2.75)]}><div className="board-tag small">{t.label}</div></Html>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export function Board3D({ pieces, selectable, onPieceClick, destOf }: {
  pieces: Piece[];
  selectable: Set<number>;
  onPieceClick: (id: number) => void;
  destOf: (id: number) => number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pos = useMemo(() => layout(pieces), [pieces]);
  const dest = hover !== null && selectable.has(hover) ? destOf(hover) : null;
  return (
    <Canvas shadows camera={{ position: [0, 15.5, 11.5], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#2b1d14"]} />
      <fog attach="fog" args={["#2b1d14", 26, 44]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 14, 8]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[-8, 6, -6]} intensity={0.4} color="#ffcf8a" />
      <Board />
      {pieces.map((p) => (
        <PieceMesh key={p.id} piece={p} target={pos.get(p.id)!} selectable={selectable.has(p.id)}
          dim={p.pos === GOAL} onClick={onPieceClick} onHover={setHover} />
      ))}
      {dest !== null && <DestMarker node={dest} />}
      <OrbitControls enablePan={false} minDistance={10} maxDistance={24} maxPolarAngle={Math.PI / 2.4} target={[0, 0, 0.6]} />
    </Canvas>
  );
}
