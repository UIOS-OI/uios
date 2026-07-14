"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type NodeId = "core" | "router" | "aegis" | "memory" | "openai" | "anthropic" | "gemini" | "mistral";
type UniverseNode = {
  id: NodeId;
  title: string;
  shortTitle: string;
  category: string;
  description: string;
  color: string;
  position: readonly [number, number, number];
  radius: number;
  kind: "core" | "zone" | "provider";
};

const NODES: readonly UniverseNode[] = [
  { id: "core", title: "Intelligence Core", shortTitle: "UIOS CORE", category: "SYSTEM CENTER", description: "The living center of the intelligence universe. Every route, memory, and policy boundary converges here.", color: "#9b6cff", position: [0, 0, 0], radius: 1.05, kind: "core" },
  { id: "router", title: "Universal Router", shortTitle: "ROUTER", category: "ROUTER ZONE", description: "Intent moves through this zone toward the right model, agent, tool, or workflow.", color: "#3c9dff", position: [0, 10, -13], radius: .62, kind: "zone" },
  { id: "aegis", title: "Aegis Security", shortTitle: "AEGIS", category: "SECURITY ZONE", description: "The policy boundary surrounding every intelligence path, approval, and protected action.", color: "#25c8ff", position: [-13, -3.6, -9], radius: .66, kind: "zone" },
  { id: "memory", title: "Shared Memory", shortTitle: "MEMORY", category: "MEMORY ZONE", description: "A connected context field that keeps intelligence coherent across models, agents, and workflows.", color: "#a855f7", position: [13.5, -3.1, -10], radius: .66, kind: "zone" },
  { id: "openai", title: "OpenAI", shortTitle: "OPENAI", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#38bdf8", position: [-8.6, 3.5, 1.2], radius: .31, kind: "provider" },
  { id: "anthropic", title: "Anthropic", shortTitle: "ANTHROPIC", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#8b5cf6", position: [8.9, 4, .4], radius: .31, kind: "provider" },
  { id: "gemini", title: "Google Gemini", shortTitle: "GEMINI", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#60a5fa", position: [-6.4, -7.6, -2.2], radius: .31, kind: "provider" },
  { id: "mistral", title: "Mistral AI", shortTitle: "MISTRAL", category: "AI PROVIDER NODE", description: "A provider connection point within the wider UIOS routing universe.", color: "#c084fc", position: [7.2, -7, -3.4], radius: .31, kind: "provider" },
];

const INTRO_SPARKS = [
  [10, 18, 0], [23, 72, .34], [35, 28, .72], [46, 82, .18], [58, 16, .92], [71, 68, .48], [84, 31, 1.1], [91, 78, .62],
  [16, 48, 1.28], [29, 9, .56], [41, 58, 1.44], [55, 38, .82], [66, 88, .24], [77, 47, 1.36], [88, 12, .4], [5, 86, 1.02],
] as const;

const NODE_MAP = new Map(NODES.map((node) => [node.id, node]));
const CONNECTIONS: readonly [NodeId, NodeId][] = [
  ["core", "router"], ["core", "aegis"], ["core", "memory"],
  ["core", "openai"], ["core", "anthropic"], ["core", "gemini"], ["core", "mistral"],
  ["router", "openai"], ["router", "anthropic"], ["router", "gemini"], ["router", "mistral"],
  ["aegis", "router"], ["memory", "router"],
];

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function SpriteLabel({ text, color, y, prominent = false }: { text: string; color: string; y: number; prominent?: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const left = 38;
    const top = 24;
    const width = canvas.width - left * 2;
    const height = canvas.height - top * 2;
    const radius = 34;
    context.beginPath();
    context.moveTo(left + radius, top);
    context.lineTo(left + width - radius, top);
    context.quadraticCurveTo(left + width, top, left + width, top + radius);
    context.lineTo(left + width, top + height - radius);
    context.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
    context.lineTo(left + radius, top + height);
    context.quadraticCurveTo(left, top + height, left, top + height - radius);
    context.lineTo(left, top + radius);
    context.quadraticCurveTo(left, top, left + radius, top);
    context.closePath();
    context.fillStyle = "rgba(2, 7, 22, .88)";
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = prominent ? 4 : 3;
    context.globalAlpha = .88;
    context.stroke();
    context.globalAlpha = 1;
    context.font = `${prominent ? 700 : 650} ${prominent ? 42 : 36}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.letterSpacing = prominent ? "7px" : "6px";
    context.shadowColor = color;
    context.shadowBlur = 24;
    context.fillStyle = "#f4f6ff";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    setTexture(nextTexture);
    return () => nextTexture.dispose();
  }, [color, prominent, text]);

  if (!texture) return null;
  return <sprite position={[0, y, 0]} scale={prominent ? [3.6, .75, 1] : [3, .63, 1]}>
    <spriteMaterial map={texture} transparent depthWrite={false} opacity={.97} />
  </sprite>;
}

function StarField({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(0x51f15);
    const points = new Float32Array(1300 * 3);
    for (let index = 0; index < 1300; index += 1) {
      const radius = 12 + random() * 34;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[index * 3 + 1] = radius * Math.cos(phi) * .7;
      points[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return points;
  }, []);

  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * .0024;
  });

  return <points ref={ref} frustumCulled={false}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color="#8fa6ff" size={.055} sizeAttenuation transparent opacity={.68} depthWrite={false} />
  </points>;
}

function ZoneSporeField({ node, reducedMotion }: { node: UniverseNode; reducedMotion: boolean }) {
  const field = useRef<THREE.Group>(null);
  const positions = useMemo(() => {
    const seed = 0x94f11 + NODES.findIndex((item) => item.id === node.id) * 741;
    const random = seededRandom(seed);
    const points = new Float32Array(120 * 3);
    for (let index = 0; index < 120; index += 1) {
      const radius = 1.25 + Math.pow(random(), .7) * 2.35;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      points[index * 3] = radius * Math.sin(phi) * Math.cos(theta) * (1 + (random() - .5) * .22);
      points[index * 3 + 1] = radius * Math.cos(phi) * (.78 + random() * .18);
      points[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) * (.84 + random() * .28);
    }
    return points;
  }, [node.id]);

  useFrame(({ clock }, delta) => {
    if (!field.current || reducedMotion) return;
    field.current.rotation.y += delta * .025;
    field.current.rotation.z = Math.sin(clock.elapsedTime * .13 + node.position[0]) * .08;
  });

  return <group ref={field}>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={node.color} size={.045} sizeAttenuation transparent opacity={.56} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
    <mesh scale={[2.4, 2.02, 2.22]} rotation={[.2, .35, -.1]}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial color={node.color} wireframe transparent opacity={.055} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <mesh scale={[3.05, 2.58, 2.82]} rotation={[-.12, -.28, .2]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color={node.color} wireframe transparent opacity={.025} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  </group>;
}

function CoreNode({ active, reducedMotion, onSelect }: { active: boolean; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  const shell = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const node = NODE_MAP.get("core")!;

  useFrame(({ clock }, delta) => {
    if (shell.current) {
      shell.current.rotation.y += reducedMotion ? 0 : delta * .11;
      shell.current.rotation.x = Math.sin(clock.elapsedTime * .25) * .14;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 1.7) * .035;
      shell.current.scale.setScalar(pulse * (hovered ? 1.08 : 1));
    }
    if (rings.current && !reducedMotion) rings.current.rotation.z -= delta * .07;
  });

  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect("core"); };
  return <group position={node.position}>
    <group ref={shell} onClick={select} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerLeave={() => { setHovered(false); document.body.style.cursor = ""; }}>
      <pointLight color={node.color} intensity={active ? 12 : 8} distance={14} decay={2} />
      <mesh><icosahedronGeometry args={[1.05, 3]} /><meshPhysicalMaterial color="#2d236f" emissive={node.color} emissiveIntensity={active ? 1.55 : 1.15} roughness={.14} metalness={.18} transparent opacity={.9} /></mesh>
      <mesh scale={.72}><octahedronGeometry args={[1, 2]} /><meshBasicMaterial color="#d7d2ff" transparent opacity={.46} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh scale={1.16}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color={node.color} wireframe transparent opacity={.6} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    </group>
    <group ref={rings}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.72, .012, 6, 100]} /><meshBasicMaterial color="#7d8eff" transparent opacity={.52} blending={THREE.AdditiveBlending} /></mesh>
      <mesh rotation={[1.15, .3, .5]}><torusGeometry args={[2.12, .008, 6, 100]} /><meshBasicMaterial color="#745cff" transparent opacity={.28} blending={THREE.AdditiveBlending} /></mesh>
    </group>
    <SpriteLabel text={node.shortTitle} color={node.color} y={-1.72} prominent />
  </group>;
}

function IntelligenceNode({ node, active, reducedMotion, onSelect }: { node: UniverseNode; active: boolean; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => NODES.findIndex((item) => item.id === node.id) * .73, [node.id]);

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    if (!reducedMotion) ref.current.rotation.y += delta * (node.kind === "zone" ? .12 : .18);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 1.5 + phase) * .055;
    ref.current.scale.setScalar(pulse * (hovered || active ? 1.14 : 1));
  });

  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(node.id); };
  return <group position={node.position}>
    {node.kind === "zone" ? <ZoneSporeField node={node} reducedMotion={reducedMotion} /> : null}
    <group ref={ref} onClick={select} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerLeave={() => { setHovered(false); document.body.style.cursor = ""; }}>
      <pointLight color={node.color} intensity={active ? 5 : 2.4} distance={node.kind === "zone" ? 8 : 4.5} />
      <mesh>
        <sphereGeometry args={[node.radius, 28, 28]} />
        <meshPhysicalMaterial color="#10162d" emissive={node.color} emissiveIntensity={active ? 1.9 : hovered ? 1.55 : 1.08} roughness={.2} metalness={.35} transparent opacity={.92} />
      </mesh>
      <mesh scale={1.25}><icosahedronGeometry args={[node.radius, 1]} /><meshBasicMaterial color={node.color} wireframe transparent opacity={active ? .9 : .48} blending={THREE.AdditiveBlending} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[node.radius * 1.72, .012, 6, 64]} /><meshBasicMaterial color={node.color} transparent opacity={.7} blending={THREE.AdditiveBlending} /></mesh>
    </group>
    <SpriteLabel text={node.shortTitle} color={node.color} y={node.kind === "zone" ? -1.42 : -.86} prominent={node.kind === "zone"} />
  </group>;
}

function LivingNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  const blueLines = useRef<THREE.LineBasicMaterial>(null);
  const purpleLines = useRef<THREE.LineBasicMaterial>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const web = useMemo(() => {
    const blueSegments: number[] = [];
    const purpleSegments: number[] = [];
    const curves: THREE.CatmullRomCurve3[] = [];
    CONNECTIONS.forEach(([fromId, toId], edgeIndex) => {
      const from = new THREE.Vector3(...NODE_MAP.get(fromId)!.position);
      const to = new THREE.Vector3(...NODE_MAP.get(toId)!.position);
      const direction = to.clone().sub(from);
      const side = new THREE.Vector3(-direction.y, direction.x, direction.z * .18).normalize();
      const lift = new THREE.Vector3(0, .35 + edgeIndex % 3 * .16, .45 * (edgeIndex % 2 ? 1 : -1));
      const controlOne = from.clone().lerp(to, .32).add(side.clone().multiplyScalar(.42 + edgeIndex % 4 * .08)).add(lift);
      const controlTwo = from.clone().lerp(to, .68).add(side.clone().multiplyScalar(-.38 - edgeIndex % 3 * .09)).sub(lift.clone().multiplyScalar(.45));
      const curve = new THREE.CatmullRomCurve3([from, controlOne, controlTwo, to], false, "centripetal");
      curves.push(curve);
      const target = edgeIndex % 2 === 0 ? blueSegments : purpleSegments;

      for (let filament = -1; filament <= 1; filament += 1) {
        let previous: THREE.Vector3 | null = null;
        for (let step = 0; step <= 18; step += 1) {
          const progress = step / 18;
          const point = curve.getPoint(progress);
          point.add(side.clone().multiplyScalar(filament * .1 * Math.sin(progress * Math.PI)));
          point.z += Math.sin(progress * Math.PI * 3 + filament) * .035;
          if (previous) target.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
          previous = point;
        }
      }

      for (const step of [4, 7, 10, 13, 16]) {
        const progress = step / 18;
        const center = curve.getPoint(progress);
        const spread = .1 * Math.sin(progress * Math.PI);
        const leftPoint = center.clone().add(side.clone().multiplyScalar(-spread));
        const rightPoint = center.clone().add(side.clone().multiplyScalar(spread));
        leftPoint.z += Math.sin(progress * Math.PI * 3 - 1) * .035;
        rightPoint.z += Math.sin(progress * Math.PI * 3 + 1) * .035;
        target.push(leftPoint.x, leftPoint.y, leftPoint.z, rightPoint.x, rightPoint.y, rightPoint.z);
      }

      for (const progress of [.3, .58, .78]) {
        const root = curve.getPoint(progress);
        const branchDirection = edgeIndex % 2 ? -1 : 1;
        const tip = root.clone().add(side.clone().multiplyScalar(branchDirection * (.34 + progress * .28))).add(new THREE.Vector3(0, .12 + progress * .1, .08));
        const mid = root.clone().lerp(tip, .58).add(new THREE.Vector3(0, .08, branchDirection * .06));
        const branch = new THREE.CatmullRomCurve3([root, mid, tip], false, "centripetal");
        let previous = branch.getPoint(0);
        for (let branchStep = 1; branchStep <= 8; branchStep += 1) {
          const point = branch.getPoint(branchStep / 8);
          target.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
          previous = point;
        }
      }
    });
    const makeGeometry = (segments: number[]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
      return geometry;
    };
    return { blueGeometry: makeGeometry(blueSegments), purpleGeometry: makeGeometry(purpleSegments), curves };
  }, []);
  const pulseColors = useMemo(() => {
    const colors = new Float32Array(web.curves.length * 3 * 3);
    web.curves.forEach((_, edgeIndex) => {
      const color = new THREE.Color(edgeIndex % 2 === 0 ? "#39c6ff" : "#b866ff");
      for (let pulseIndex = 0; pulseIndex < 3; pulseIndex += 1) color.toArray(colors, (edgeIndex * 3 + pulseIndex) * 3);
    });
    return colors;
  }, [web.curves]);

  useEffect(() => () => { web.blueGeometry.dispose(); web.purpleGeometry.dispose(); }, [web]);
  useFrame(({ clock }) => {
    const energy = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.45);
    if (blueLines.current) blueLines.current.opacity = .44 + energy * .13;
    if (purpleLines.current) purpleLines.current.opacity = .4 - energy * .11;
    const pulseMesh = pulses.current;
    if (!pulseMesh) return;
    web.curves.forEach((curve, edgeIndex) => {
      for (let pulseIndex = 0; pulseIndex < 3; pulseIndex += 1) {
        const instanceIndex = edgeIndex * 3 + pulseIndex;
        const progress = reducedMotion ? .5 : (clock.elapsedTime * (.11 + edgeIndex % 3 * .016) + pulseIndex / 3 + edgeIndex * .091) % 1;
        position.copy(curve.getPointAt(progress));
        scale.setScalar(.045 + Math.sin(progress * Math.PI) * .055);
        matrix.compose(position, quaternion, scale);
        pulseMesh.setMatrixAt(instanceIndex, matrix);
      }
    });
    pulseMesh.instanceMatrix.needsUpdate = true;
  });

  return <group>
    <lineSegments geometry={web.blueGeometry}><lineBasicMaterial ref={blueLines} color="#38cfff" transparent opacity={.44} blending={THREE.AdditiveBlending} toneMapped={false} /></lineSegments>
    <lineSegments geometry={web.purpleGeometry}><lineBasicMaterial ref={purpleLines} color="#b55cff" transparent opacity={.4} blending={THREE.AdditiveBlending} toneMapped={false} /></lineSegments>
    <instancedMesh ref={pulses} args={[undefined, undefined, web.curves.length * 3]} frustumCulled={false}>
      <sphereGeometry args={[1, 7, 7]}><instancedBufferAttribute attach="attributes-instanceColor" args={[pulseColors, 3]} /></sphereGeometry>
      <meshBasicMaterial vertexColors transparent opacity={.95} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function CameraRig({ selected, focusVersion, reducedMotion }: { selected: NodeId; focusVersion: number; reducedMotion: boolean }) {
  const { camera, gl } = useThree();
  const controls = useRef<ThreeOrbitControls | null>(null);
  const transition = useRef({ active: false, startedAt: 0, duration: 1, fromPosition: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPosition: new THREE.Vector3(), toTarget: new THREE.Vector3() });

  useEffect(() => {
    const nextControls = new ThreeOrbitControls(camera, gl.domElement);
    nextControls.enableDamping = true;
    nextControls.dampingFactor = .055;
    nextControls.enablePan = true;
    nextControls.minDistance = 3.2;
    nextControls.maxDistance = 48;
    nextControls.minPolarAngle = .16;
    nextControls.maxPolarAngle = Math.PI * .84;
    nextControls.target.set(0, 0, 0);
    controls.current = nextControls;
    const interrupt = () => { transition.current.active = false; nextControls.enabled = true; };
    gl.domElement.addEventListener("pointerdown", interrupt);
    gl.domElement.addEventListener("wheel", interrupt, { passive: true });
    return () => {
      gl.domElement.removeEventListener("pointerdown", interrupt);
      gl.domElement.removeEventListener("wheel", interrupt);
      nextControls.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const currentControls = controls.current;
    const node = NODE_MAP.get(selected);
    if (!currentControls || !node) return;
    const target = new THREE.Vector3(...node.position);
    const direction = target.clone();
    if (direction.lengthSq() < .01) direction.set(.35, .2, 1);
    direction.normalize();
    const distance = node.kind === "core" ? 13.5 : node.kind === "zone" ? 5.2 : 3.4;
    const destination = target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, node.kind === "provider" ? .65 : 1.35, node.kind === "core" ? 0 : 1.5));
    transition.current = {
      active: true,
      startedAt: 0,
      duration: reducedMotion ? .01 : selected === "core" && focusVersion === 0 ? 7.2 : 1.65,
      fromPosition: camera.position.clone(),
      fromTarget: currentControls.target.clone(),
      toPosition: destination,
      toTarget: target,
    };
    currentControls.enabled = false;
  }, [camera, focusVersion, reducedMotion, selected]);

  useFrame(({ clock }) => {
    const currentControls = controls.current;
    if (!currentControls) return;
    const move = transition.current;
    if (move.active) {
      if (move.startedAt === 0) move.startedAt = clock.elapsedTime;
      const raw = Math.min(1, Math.max(0, (clock.elapsedTime - move.startedAt) / move.duration));
      const eased = raw < .5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      camera.position.lerpVectors(move.fromPosition, move.toPosition, eased);
      currentControls.target.lerpVectors(move.fromTarget, move.toTarget, eased);
      if (raw >= 1) { move.active = false; currentControls.enabled = true; }
    }
    currentControls.update();
  });

  return null;
}

function UniverseScene({ selected, focusVersion, reducedMotion, onSelect }: { selected: NodeId; focusVersion: number; reducedMotion: boolean; onSelect: (id: NodeId) => void }) {
  return <>
    <color attach="background" args={["#010207"]} />
    <fog attach="fog" args={["#010207", 18, 72]} />
    <ambientLight intensity={.1} />
    <directionalLight color="#7896ff" intensity={.42} position={[4, 8, 8]} />
    <StarField reducedMotion={reducedMotion} />
    <LivingNetwork reducedMotion={reducedMotion} />
    <CoreNode active={selected === "core"} reducedMotion={reducedMotion} onSelect={onSelect} />
    {NODES.filter((node) => node.id !== "core").map((node) => <IntelligenceNode key={node.id} node={node} active={selected === node.id} reducedMotion={reducedMotion} onSelect={onSelect} />)}
    <CameraRig selected={selected} focusVersion={focusVersion} reducedMotion={reducedMotion} />
    <EffectComposer multisampling={0}><Bloom intensity={1.02} luminanceThreshold={.24} luminanceSmoothing={.72} mipmapBlur /></EffectComposer>
  </>;
}

export function IntelligenceUniverse() {
  const [selected, setSelected] = useState<NodeId>("core");
  const [focusVersion, setFocusVersion] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const hudLockUntil = useRef(0);
  const node = NODE_MAP.get(selected)!;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    const timer = window.setTimeout(() => setReady(true), motion.matches ? 0 : 7800);
    return () => { window.clearTimeout(timer); motion.removeEventListener("change", updateMotion); document.body.style.cursor = ""; };
  }, []);

  const selectNode = useCallback((id: NodeId) => {
    document.body.style.cursor = "";
    setSelected(id);
    setFocusVersion((version) => version + 1);
  }, []);

  const selectSpatialNode = useCallback((id: NodeId) => {
    if (performance.now() < hudLockUntil.current) return;
    selectNode(id);
  }, [selectNode]);

  const navigateNode = useCallback((id: NodeId) => {
    hudLockUntil.current = performance.now() + 600;
    selectNode(id);
  }, [selectNode]);

  return <section className={`intelligence-universe${ready ? " universe-ready" : ""}`} aria-label="Interactive UIOS intelligence universe">
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 8, 40], fov: 48, near: .1, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Suspense fallback={null}><UniverseScene selected={selected} focusVersion={focusVersion} reducedMotion={reducedMotion} onSelect={selectSpatialNode} /></Suspense>
    </Canvas>

    <header className="universe-header" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="universe-brand" onClick={() => navigateNode("core")} aria-label="Return to the UIOS Intelligence Core"><span>UI</span><i />S<small>INTELLIGENCE UNIVERSE</small></button>
      <div className="universe-coordinates"><i /> LIVE FABRIC <span>WORLD 003</span></div>
      <button type="button" className="universe-reset" onClick={() => navigateNode("core")}>RESET VIEW <span>⌖</span></button>
    </header>

    <nav className="universe-index" aria-label="Intelligence universe locations" onPointerDown={(event) => event.stopPropagation()}>
      <span className="universe-index-title">EXPLORE ZONES</span>
      {NODES.map((item, index) => <button type="button" className={selected === item.id ? "active" : ""} aria-pressed={selected === item.id} onClick={() => navigateNode(item.id)} key={item.id}><span>{String(index + 1).padStart(2, "0")}</span>{item.shortTitle}</button>)}
    </nav>

    <div className="universe-readout" aria-live="polite">
      <span className="universe-readout-category"><i style={{ background: node.color, boxShadow: `0 0 14px ${node.color}` }} />{node.category}</span>
      <h1>{node.title}</h1>
      <p>{node.description}</p>
      <small>SELECT A NODE TO TRAVEL</small>
    </div>

    <div className="universe-controls" aria-label="Camera controls"><span>DRAG</span> ORBIT <i /> <span>SCROLL</span> ZOOM <i /> <span>CLICK</span> DISCOVER</div>
    <div className="universe-reticle" aria-hidden="true"><i /><i /></div>
    <div className="universe-intro" aria-hidden="true">
      <div className="intro-depth-sparks">
        {INTRO_SPARKS.map(([x, y, delay], index) => <i key={`${x}-${y}`} style={{ "--spark-x": `${x}%`, "--spark-y": `${y}%`, "--spark-delay": `${delay}s`, "--spark-color": index % 3 === 0 ? "#b55cff" : "#42d7ff" } as CSSProperties} />)}
      </div>
      <svg className="intro-network" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <g className="intro-network-blue">
          <path pathLength="1" d="M500 304 C438 286 392 238 322 198 S189 143 72 168" />
          <path pathLength="1" d="M500 304 C442 330 365 352 302 421 S165 505 42 480" />
          <path pathLength="1" d="M500 304 C472 247 464 177 416 112 S356 39 318 8" />
        </g>
        <g className="intro-network-violet">
          <path pathLength="1" d="M500 304 C568 272 619 221 689 190 S830 151 958 92" />
          <path pathLength="1" d="M500 304 C558 350 616 374 696 432 S835 516 986 486" />
          <path pathLength="1" d="M500 304 C536 238 558 172 616 100 S692 35 742 4" />
        </g>
      </svg>
      <div className="intro-ignition"><i /><b /></div>
      <div className="intro-crystal">
        <i /><i /><i /><i /><i /><i />
      </div>
      <div className="intro-wordmark">
        <div className="intro-logo-mark"><span>UI</span><i /><span>S</span></div>
        <strong>THE FABRIC OF INTELLIGENCE</strong>
        <small>INTELLIGENCE IS WAKING</small>
      </div>
    </div>
  </section>;
}
