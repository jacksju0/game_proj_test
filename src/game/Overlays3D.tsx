import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ---------- 공용: 캔버스 텍스처 ----------
function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- 윷가락 ----------
const STICK_LEN = 2.6;
const STICK_R = 0.24;

/** 단면이 D 모양인 윷가락: 둥근 등(y+) / 평평한 배(y-) */
function useStickGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-STICK_R, 0);
    s.lineTo(STICK_R, 0);
    s.absarc(0, 0, STICK_R, 0, Math.PI, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: STICK_LEN, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, -STICK_R * 0.35, -STICK_LEN / 2);
    return g;
  }, []);
}

function Stick({ index, flat, geo }: { index: number; flat: boolean; geo: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const faceTex = useMemo(() => canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#f6e6c2"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#5b3616"; ctx.lineWidth = 10;
    for (let i = 0; i < 3; i++) {
      const cy = h * (0.25 + i * 0.25);
      ctx.beginPath(); ctx.moveTo(w * 0.28, cy - 16); ctx.lineTo(w * 0.72, cy + 16);
      ctx.moveTo(w * 0.72, cy - 16); ctx.lineTo(w * 0.28, cy + 16); ctx.stroke();
    }
    if (index === 0) { // 빽도 표시
      ctx.fillStyle = "#c62828"; ctx.beginPath(); ctx.arc(w / 2, h * 0.08, 18, 0, Math.PI * 2); ctx.fill();
    }
  }, 64, 256), [index]);
  // 무작위 비행 파라미터 (가락마다 고정)
  const rnd = useMemo(() => ({
    spins: 2 + Math.floor(Math.random() * 3),
    yaw0: (Math.random() - 0.5) * 2, yaw1: (Math.random() - 0.5) * 0.5,
    peak: 3.2 + Math.random() * 1.2, x0: (Math.random() - 0.5) * 1.2,
  }), []);
  const xEnd = -1.5 + index * 1.0;
  const DURATION = 1.15;
  useFrame((st) => {
    const g = ref.current;
    if (!g) return;
    if (start.current === null) start.current = st.clock.elapsedTime;
    const t = Math.min(1, (st.clock.elapsedTime - start.current) / DURATION);
    const e = 1 - Math.pow(1 - t, 3);
    g.position.x = THREE.MathUtils.lerp(rnd.x0, xEnd, e);
    g.position.y = 4 * rnd.peak * t * (1 - t) + 0.15 + (t >= 1 ? 0 : Math.max(0, Math.sin(t * Math.PI * 3) * 0.05));
    g.position.z = THREE.MathUtils.lerp(0.6, 0, e);
    const finalRoll = flat ? Math.PI : 0; // 배가 위면 180° 뒤집힘
    g.rotation.z = THREE.MathUtils.lerp(0, rnd.spins * Math.PI * 2 + finalRoll, e);
    g.rotation.y = THREE.MathUtils.lerp(rnd.yaw0, rnd.yaw1, e);
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color="#b9793d" roughness={0.55} />
      </mesh>
      {/* 배(평평한 면) */}
      <mesh position={[0, -STICK_R * 0.35 - 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STICK_R * 2 + 0.04, STICK_LEN + 0.06]} />
        <meshStandardMaterial map={faceTex} roughness={0.8} />
      </mesh>
    </group>
  );
}

function SticksScene({ sticks }: { sticks: boolean[] }) {
  const geo = useStickGeometry();
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 8, 5]} intensity={1.4} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.05, 0]}>
        <circleGeometry args={[3.6, 48]} />
        <meshStandardMaterial color="#7d1f1f" roughness={1} />
      </mesh>
      {sticks.map((f, i) => <Stick key={i} index={i} flat={f} geo={geo} />)}
    </>
  );
}

export function YutThrowOverlay({ sticks, label, sub }: { sticks: boolean[]; label: string | null; sub?: string }) {
  return (
    <div className="overlay">
      <div className="overlay-canvas">
        <Canvas shadows camera={{ position: [0, 6.5, 4.2], fov: 45 }} gl={{ alpha: true }}>
          <SticksScene sticks={sticks} />
        </Canvas>
      </div>
      {sub && <div className="overlay-sub">{sub}</div>}
      {label && <div className="overlay-result pop">{label}</div>}
    </div>
  );
}

// ---------- 동전 ----------
function Coin({ face }: { face: "앞" | "뒤" }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const mats = useMemo(() => {
    const faceTex = (txt: string, bg: string) => canvasTexture((ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, "#fff1b8"); g.addColorStop(1, bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8a5a00"; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#6b3f00"; ctx.font = "900 120px 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(txt, w / 2, h / 2 + 6);
    });
    return [
      new THREE.MeshStandardMaterial({ color: "#c9982e", metalness: 0.7, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: faceTex("앞", "#e0b43c"), metalness: 0.4, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: faceTex("뒤", "#c9982e"), metalness: 0.4, roughness: 0.35 }),
    ];
  }, []);
  useFrame((st) => {
    const g = ref.current;
    if (!g) return;
    if (start.current === null) start.current = st.clock.elapsedTime;
    const t = Math.min(1, (st.clock.elapsedTime - start.current) / 1.9);
    const e = 1 - Math.pow(1 - t, 3);
    g.position.y = 4.2 * 4 * t * (1 - t) * 0.8;
    g.rotation.x = (6 * Math.PI * 2 + (face === "앞" ? 0 : Math.PI)) * e;
  });
  return (
    <group ref={ref}>
      <mesh material={mats} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 0.14, 48]} />
      </mesh>
    </group>
  );
}

export function CoinOverlay({ face, text, showResult }: { face: "앞" | "뒤"; text: string; showResult: boolean }) {
  return (
    <div className="overlay">
      <div className="overlay-sub">🪙 동전 던지기 — 나온 면의 주인이 먼저 시작합니다</div>
      <div className="overlay-canvas">
        <Canvas shadows camera={{ position: [0, 5, 3.2], fov: 45 }} gl={{ alpha: true }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 8, 4]} intensity={1.5} castShadow />
          <Coin face={face} />
        </Canvas>
      </div>
      {showResult && <div className="overlay-result pop">{text}</div>}
    </div>
  );
}
