"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Pointer = { current: { x: number; y: number } };
type Timeline = { current: number };

const BRANCH_COUNT = 84;
const POINTS_PER_BRANCH = 24;
const INTRO_SECONDS = 6.2;

function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function phaseFor(progress: number) {
  if (progress < .08) return 0;
  if (progress < .2) return 1;
  if (progress < .52) return 2;
  if (progress < .7) return 3;
  if (progress < .86) return 4;
  if (progress < .94) return 5;
  return 6;
}

function buildNetwork() {
  const next = random(0x51f15);
  const nodes: THREE.Vector3[] = [];
  const segments: number[] = [];
  for (let branch = 0; branch < BRANCH_COUNT; branch += 1) {
    const angle = (branch / BRANCH_COUNT) * Math.PI * 2 + (next() - .5) * .2;
    let previous = new THREE.Vector3(0, 0, 0);
    for (let index = 0; index < POINTS_PER_BRANCH; index += 1) {
      const distance = index / (POINTS_PER_BRANCH - 1);
      const twist = Math.sin(distance * 5 + branch * .7) * (.15 + distance * .35);
      const radius = distance * (5.2 + next() * 1.4) + (next() - .5) * .12;
      const point = new THREE.Vector3(
        Math.cos(angle + twist) * radius,
        Math.sin(angle + twist) * radius * .62,
        (next() - .5) * .9 + distance * (next() - .5) * 1.5,
      );
      point.y += Math.sin(distance * Math.PI) * (next() - .5) * 1.5;
      nodes.push(point);
      segments.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
      previous = point;
    }
  }
  return { nodes, positions: new Float32Array(segments) };
}

function OriginSpark({ timeline }: { timeline: Timeline }) {
  const spark = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const ignition = clamp((timeline.current - .07) * 14);
    const release = 1 - clamp((timeline.current - .2) * 9);
    const energy = ignition * release;
    if (spark.current) spark.current.scale.setScalar(energy * (1 + Math.sin(clock.elapsedTime * 28) * .18));
    if (light.current) light.current.intensity = energy * 18;
  });
  return <group>
    <pointLight ref={light} color="#d9e7ff" intensity={0} distance={8} />
    <mesh ref={spark}><sphereGeometry args={[.055, 12, 12]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
  </group>;
}

function Network({ timeline, pointer }: { timeline: Timeline; pointer: Pointer }) {
  const group = useRef<THREE.Group>(null);
  const instances = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineBasicMaterial>(null);
  const network = useMemo(buildNetwork, []);
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(network.positions, 3));
    return geometry;
  }, [network.positions]);
  const colors = useMemo(() => new Float32Array(network.nodes.length * 3), [network.nodes.length]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    const mesh = instances.current;
    if (!mesh) return;
    const density = clamp((timeline.current - .19) * 4.2);
    const pulse = Math.sin(timeline.current * 48) * .5 + .5;
    network.nodes.forEach((node, index) => {
      const distance = Math.hypot(node.x / 5.2 - pointer.current.x * .72, node.y / 3.2 - pointer.current.y * .72);
      const near = Math.max(0, 1 - distance * 1.6);
      const brightness = .15 + near * .85 + pulse * .08;
      scale.setScalar((.012 + near * .028) * density);
      matrix.compose(node, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      colors[index * 3] = .24 + brightness * .2;
      colors[index * 3 + 1] = .34 + brightness * .28;
      colors[index * 3 + 2] = .8 + brightness * .2;
    });
    mesh.instanceMatrix.needsUpdate = true;
    const colorAttribute = mesh.geometry.getAttribute("instanceColor") as THREE.InstancedBufferAttribute | undefined;
    if (colorAttribute) colorAttribute.needsUpdate = true;
    if (lines.current) lines.current.opacity = density * .1;
    if (group.current) {
      group.current.rotation.z += delta * .01;
      group.current.rotation.y += delta * .014;
      group.current.position.z = -clamp((timeline.current - .5) * 3) * 3.8;
      group.current.scale.setScalar(.25 + density * .75);
    }
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.current.x * .42, .025);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.current.y * .25, .025);
    camera.lookAt(0, 0, -clamp((timeline.current - .5) * 3) * 2.5);
  });

  return <group ref={group}>
    <lineSegments geometry={lineGeometry}><lineBasicMaterial ref={lines} color="#385bda" transparent opacity={0} blending={THREE.AdditiveBlending} /></lineSegments>
    <instancedMesh ref={instances} args={[undefined, undefined, network.nodes.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]}><instancedBufferAttribute attach="attributes-instanceColor" args={[colors, 3]} /></sphereGeometry>
      <meshBasicMaterial vertexColors transparent opacity={.92} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function Spores({ timeline }: { timeline: Timeline }) {
  const positions = useMemo(() => {
    const next = random(0x7a11);
    const points = new Float32Array(520 * 3);
    for (let index = 0; index < 520; index += 1) {
      points[index * 3] = (next() - .5) * 14;
      points[index * 3 + 1] = (next() - .5) * 8;
      points[index * 3 + 2] = (next() - .5) * 10;
    }
    return points;
  }, []);
  const ref = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * .008;
      ref.current.rotation.x = Math.sin(clock.elapsedTime * .06) * .04;
      ref.current.scale.setScalar(1 + clamp((timeline.current - .16) * 3) * 1.5);
    }
    if (material.current) material.current.opacity = clamp((timeline.current - .19) * 5) * Math.max(.08, 1 - timeline.current * 1.1);
  });
  return <points ref={ref} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial ref={material} color="#9dbdff" size={.025} transparent opacity={0} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} /></points>;
}

function CrystalCore({ timeline }: { timeline: Timeline }) {
  const core = useRef<THREE.Group>(null);
  const shards = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Euler(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const directions = useMemo(() => {
    const next = random(0xc7a1);
    return Array.from({ length: 22 }, () => new THREE.Vector3(next() - .5, next() - .5, next() - .5).normalize());
  }, []);

  useFrame(({ clock }) => {
    const reveal = clamp((timeline.current - .56) * 6.5);
    const fracture = clamp((timeline.current - .72) * 8);
    if (core.current) {
      core.current.scale.setScalar(reveal * (1 - fracture) * (.82 + Math.sin(clock.elapsedTime * 2) * .035));
      core.current.rotation.x += .003;
      core.current.rotation.y += .006;
    }
    if (!shards.current) return;
    directions.forEach((direction, index) => {
      const distance = Math.sin(fracture * Math.PI) * (1.4 + index % 4 * .18);
      position.copy(direction).multiplyScalar(distance);
      rotation.set(clock.elapsedTime * direction.x, clock.elapsedTime * direction.y, index);
      quaternion.setFromEuler(rotation);
      scale.setScalar(Math.sin(fracture * Math.PI) * (.08 + index % 3 * .025));
      matrix.compose(position, quaternion, scale);
      shards.current?.setMatrixAt(index, matrix);
    });
    shards.current.instanceMatrix.needsUpdate = true;
  });

  return <group>
    <group ref={core}>
      <pointLight color="#7d6bff" intensity={9} distance={8} />
      <mesh><icosahedronGeometry args={[.95, 2]} /><meshBasicMaterial color="#c1b6ff" transparent opacity={.14} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh><icosahedronGeometry args={[1.02, 1]} /><meshBasicMaterial color="#7b8dff" wireframe transparent opacity={.9} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh scale={.34}><octahedronGeometry args={[1, 2]} /><meshBasicMaterial color="#ffffff" transparent opacity={.9} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    </group>
    <instancedMesh ref={shards} args={[undefined, undefined, directions.length]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#b9c6ff" transparent opacity={.9} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function Scene({ timeline, pointer, scrollProgress, reducedMotion }: { timeline: Timeline; pointer: Pointer; scrollProgress: Timeline; reducedMotion: boolean }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    if (reducedMotion) timeline.current = 1;
    else {
      const autoplay = Math.min(1, timeline.current + delta / INTRO_SECONDS);
      timeline.current = Math.min(1, Math.max(autoplay, scrollProgress.current));
    }
    const travel = clamp((timeline.current - .48) * 3.2);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 8 - travel * 3.1, .035);
  });
  return <>
    <color attach="background" args={["#000000"]} />
    <ambientLight intensity={.08} />
    <OriginSpark timeline={timeline} />
    <Spores timeline={timeline} />
    <Network timeline={timeline} pointer={pointer} />
    <CrystalCore timeline={timeline} />
    <EffectComposer multisampling={0}><Bloom intensity={1.45} luminanceThreshold={.05} luminanceSmoothing={.72} mipmapBlur /></EffectComposer>
  </>;
}

function IntelligenceMark() {
  return <svg className="cinematic-mark" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M24 24v42c0 27 16 42 36 42s36-15 36-42V24" />
    <path d="M60 16v76" />
    <circle cx="24" cy="24" r="3" /><circle cx="60" cy="16" r="3" /><circle cx="96" cy="24" r="3" /><circle cx="60" cy="92" r="3" />
  </svg>;
}

function UIOSWordmark() {
  return <div className="cinematic-wordmark" aria-label="UIOS">
    <span aria-hidden="true">U</span><span aria-hidden="true">I</span><i aria-hidden="true" /><span aria-hidden="true">S</span>
  </div>;
}

export function CinematicFabric() {
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const timeline = useRef(0);
  const scrollProgress = useRef(0);
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const updateScrollProgress = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress.current = THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
      root.current?.classList.toggle("cinematic-scrolled", window.scrollY > window.innerHeight * .35);
    };
    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    const replay = () => { timeline.current = 0; scrollProgress.current = 0; root.current?.classList.remove("cinematic-scrolled"); setPhase(0); };
    window.addEventListener("uios:replay-vision", replay);
    const timer = window.setInterval(() => setPhase(phaseFor(timeline.current)), 80);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("uios:replay-vision", replay);
    };
  }, []);

  useEffect(() => {
    if (phase >= 6) window.dispatchEvent(new CustomEvent("uios:cinematic-complete"));
  }, [phase]);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: -((event.clientY - rect.top) / rect.height * 2 - 1) };
  }

  function explore(capability?: "router" | "aegis" | "memory") {
    if (capability) window.dispatchEvent(new CustomEvent("uios:select-capability", { detail: capability }));
    document.getElementById("capabilities")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }

  const caption = ["", "one signal", "the network awakens", "entering the intelligence", "the core opens", "intelligence becomes form", ""][phase];

  return <div ref={root} className={`cinematic-experience cinematic-phase-${phase}`} onPointerMove={move}>
    <div className="cinematic-visual" role="img" aria-label="The UIOS intelligence network awakens, travels into a crystal core, and forms the UIOS symbol">
      <Canvas dpr={[1, 1.75]} frameloop={motionPaused || reducedMotion ? "demand" : "always"} camera={{ position: [0, 0, 8], fov: 48 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <Suspense fallback={null}><Scene timeline={timeline} pointer={pointer} scrollProgress={scrollProgress} reducedMotion={reducedMotion} /></Suspense>
      </Canvas>
      <div className="cinematic-vignette" />
      <div className="cinematic-flare" />
    </div>
    <div className="cinematic-copy" aria-live="polite">
      <div className="cinematic-reveal">
        <IntelligenceMark />
        <UIOSWordmark />
        <div className="cinematic-subtitle">THE FABRIC OF INTELLIGENCE</div>
        <div className="cinematic-tagline">The intelligence layer connecting everything.</div>
      </div>
    </div>
    <div className="cinematic-interface" aria-label="Explore the UIOS fabric">
      <button className="cinematic-hotspot cinematic-hotspot-router" type="button" onClick={() => explore("router")}><i aria-hidden="true">↗</i><span>Universal Router</span></button>
      <button className="cinematic-hotspot cinematic-hotspot-aegis" type="button" onClick={() => explore("aegis")}><i aria-hidden="true">◇</i><span>Aegis Security</span></button>
      <button className="cinematic-hotspot cinematic-hotspot-memory" type="button" onClick={() => explore("memory")}><i aria-hidden="true">◎</i><span>Shared Memory</span></button>
      <button className="cinematic-explore" type="button" onClick={() => explore()}>Explore UIOS <span aria-hidden="true">→</span></button>
      <button className="cinematic-motion" type="button" aria-pressed={motionPaused} onClick={() => setMotionPaused((paused) => !paused)}><span aria-hidden="true">{motionPaused ? "▶" : "Ⅱ"}</span><b>{motionPaused ? "Resume motion" : "Pause motion"}</b></button>
      <button className="cinematic-scroll" type="button" onClick={() => explore()}><span aria-hidden="true">⌄</span>Scroll to explore</button>
    </div>
    <div className="cinematic-caption">{caption}</div>
  </div>;
}
