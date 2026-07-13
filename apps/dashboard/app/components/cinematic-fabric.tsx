"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { motion } from "framer-motion";
import gsap from "gsap";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Pointer = { current: { x: number; y: number } };
type Timeline = { current: number };

const BRANCH_COUNT = 84;
const POINTS_PER_BRANCH = 24;

function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
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

function Network({ timeline, pointer }: { timeline: Timeline; pointer: Pointer }) {
  const group = useRef<THREE.Group>(null);
  const instances = useRef<THREE.InstancedMesh>(null);
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(buildNetwork().positions, 3));
    return geometry;
  }, []);
  const nodes = useMemo(() => buildNetwork().nodes, []);
  const colors = useMemo(() => new Float32Array(nodes.length * 3), [nodes.length]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    const mesh = instances.current;
    if (!mesh) return;
    const density = Math.min(1, Math.max(0, (timeline.current - .18) * 2.2));
    const pulse = Math.sin(timeline.current * 44) * .5 + .5;
    nodes.forEach((node, index) => {
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
    mesh.geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colors, 3));
    if (group.current) {
      group.current.rotation.z += delta * .008;
      group.current.rotation.y += delta * .012;
      group.current.position.z = -Math.max(0, timeline.current - .45) * 3.4;
    }
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.current.x * .42, .025);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.current.y * .25, .025);
    camera.lookAt(0, 0, -Math.max(0, timeline.current - .55) * 2.2);
  });

  return <group ref={group}>
    <lineSegments geometry={lineGeometry}><lineBasicMaterial color="#385bda" transparent opacity={.08} blending={THREE.AdditiveBlending} /></lineSegments>
    <instancedMesh ref={instances} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshBasicMaterial vertexColors transparent opacity={.92} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function Spores({ timeline }: { timeline: Timeline }) {
  const points = useMemo(() => {
    const next = random(0x7a11); const positions = new Float32Array(520 * 3);
    for (let index = 0; index < 520; index += 1) { positions[index * 3] = (next() - .5) * 14; positions[index * 3 + 1] = (next() - .5) * 8; positions[index * 3 + 2] = (next() - .5) * 10; }
    return positions;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => { if (ref.current) { ref.current.rotation.y = clock.elapsedTime * .008; ref.current.rotation.x = Math.sin(clock.elapsedTime * .06) * .04; ref.current.scale.setScalar(1 + Math.min(timeline.current, .45) * 1.5); } });
  return <points ref={ref} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[points, 3]} /></bufferGeometry><pointsMaterial color="#9dbdff" size={.025} transparent opacity={Math.max(.08, 1 - timeline.current * 1.8)} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} /></points>;
}

function CrystalCore({ timeline }: { timeline: Timeline }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (!group.current) return; const reveal = Math.max(0, Math.min(1, (timeline.current - .62) * 3)); group.current.scale.setScalar(reveal * (.82 + Math.sin(clock.elapsedTime * 1.5) * .035)); group.current.rotation.x += .002; group.current.rotation.y += .004; });
  return <group ref={group}>
    <pointLight color="#7d6bff" intensity={7} distance={7} />
    <mesh><icosahedronGeometry args={[.95, 2]} /><meshBasicMaterial color="#c1b6ff" transparent opacity={.12} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    <mesh><icosahedronGeometry args={[1.02, 1]} /><meshBasicMaterial color="#7b8dff" wireframe transparent opacity={.8} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    <mesh scale={.34}><octahedronGeometry args={[1, 2]} /><meshBasicMaterial color="#ffffff" transparent opacity={.85} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
  </group>;
}

function Scene({ timeline, pointer, scrollProgress, reducedMotion }: { timeline: Timeline; pointer: Pointer; scrollProgress: Timeline; reducedMotion: boolean }) {
  const { camera } = useThree();
  useFrame(({ clock }, delta) => {
    if (reducedMotion) timeline.current = 1;
    else {
      // The cinematic can begin on its own, while scroll always provides a
      // deterministic path deeper into the fabric for visitors who explore.
      const autoplay = Math.min(1, timeline.current + delta / 18);
      timeline.current = Math.min(1, Math.max(autoplay, scrollProgress.current));
    }
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 8 - Math.max(0, timeline.current - .45) * 2.4, .02);
    void clock;
  });
  return <>
    <color attach="background" args={["#010208"]} />
    <ambientLight intensity={.12} />
    <Spores timeline={timeline} />
    <Network timeline={timeline} pointer={pointer} />
    <CrystalCore timeline={timeline} />
    <EffectComposer multisampling={0}><Bloom intensity={1.25} luminanceThreshold={.08} luminanceSmoothing={.72} mipmapBlur /></EffectComposer>
  </>;
}

export function CinematicFabric() {
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const timeline = useRef(0);
  const scrollProgress = useRef(0);
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (root.current) gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 2.4, ease: "power2.out" });
    const updateScrollProgress = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress.current = THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
    };
    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    const replay = () => { timeline.current = 0; scrollProgress.current = 0; };
    window.addEventListener("uios:replay-vision", replay);
    const timer = window.setInterval(() => setPhase(Math.min(5, Math.floor(timeline.current * 6))), 120);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("uios:replay-vision", replay);
    };
  }, []);

  useEffect(() => {
    if (phase >= 5) window.dispatchEvent(new CustomEvent("uios:cinematic-complete"));
  }, [phase]);

  function move(event: React.PointerEvent<HTMLDivElement>) { const rect = event.currentTarget.getBoundingClientRect(); pointer.current = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: -((event.clientY - rect.top) / rect.height * 2 - 1) }; }

  return <div ref={root} className="cinematic-experience" onPointerMove={move} role="img" aria-label="The Fabric of Intelligence: an interactive mycelium network forming around a living crystal core">
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 48 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Suspense fallback={null}><Scene timeline={timeline} pointer={pointer} scrollProgress={scrollProgress} reducedMotion={reducedMotion} /></Suspense>
    </Canvas>
    <div className="cinematic-vignette" />
    <div className="cinematic-copy" aria-live="polite">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: phase >= 4 ? 1 : 0 }} transition={{ duration: 2.2 }}>
        <div className="cinematic-wordmark">UIOS</div>
        <div className="cinematic-subtitle">THE FABRIC OF INTELLIGENCE</div>
        <div className="cinematic-tagline">Build Once.<br />Connect Everything.</div>
      </motion.div>
    </div>
    <div className="cinematic-caption">{phase < 1 ? " spores in the dark" : phase < 2 ? " a signal emerges" : phase < 4 ? " intelligence takes root" : " shared intelligence"}</div>
    <div className="cinematic-progress"><span style={{ transform: `scaleX(${timeline.current})` }} /></div>
  </div>;
}
