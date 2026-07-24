"use client";

import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useInteractionSystem } from "./InteractionSystem";

// ─── Types ────────────────────────────────────────────────────────────────────

type GalaxySystem = {
  id: string;
  label: string;
  color: string;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination: number;
  planetSize: number;
  description: string;
  kind: "rocky" | "gas" | "crystal" | "forge" | "ring";
};

// ─── Galaxy system definitions ────────────────────────────────────────────────

const GALAXY_SYSTEMS: GalaxySystem[] = [
  {
    id: "memory",
    label: "Memory Atmosphere",
    color: "#d8fbff",
    orbitRadius: 5800,
    orbitSpeed: 0.042,
    orbitPhase: 0,
    orbitInclination: 0.18,
    planetSize: 520,
    description: "A luminous intelligence atmosphere containing every authorized file and knowledge world.",
    kind: "rocky",
  },
  {
    id: "aegis",
    label: "Aegis System",
    color: "#35c8ff",
    orbitRadius: 8200,
    orbitSpeed: 0.031,
    orbitPhase: Math.PI * 0.45,
    orbitInclination: -0.22,
    planetSize: 460,
    description: "A distant defensive system surrounding governed actions, policy, and approval evidence.",
    kind: "crystal",
  },
  {
    id: "router",
    label: "Router System",
    color: "#b675ff",
    orbitRadius: 10600,
    orbitSpeed: 0.024,
    orbitPhase: Math.PI * 0.9,
    orbitInclination: 0.12,
    planetSize: 400,
    description: "A high-energy transit system routing intent toward models, tools, agents, and workflows.",
    kind: "ring",
  },
  {
    id: "agents",
    label: "Agent Nexus",
    color: "#ff76c8",
    orbitRadius: 13000,
    orbitSpeed: 0.018,
    orbitPhase: Math.PI * 1.35,
    orbitInclination: -0.28,
    planetSize: 480,
    description: "An active system of agents, tools, approvals, and durable execution paths.",
    kind: "gas",
  },
  {
    id: "observatory",
    label: "Observatory System",
    color: "#6fd7ff",
    orbitRadius: 15400,
    orbitSpeed: 0.013,
    orbitPhase: Math.PI * 1.75,
    orbitInclination: 0.35,
    planetSize: 380,
    description: "A remote evidence system where usage, performance, and activity become spatial signals.",
    kind: "rocky",
  },
  {
    id: "forge",
    label: "Forge System",
    color: "#ffb64f",
    orbitRadius: 17800,
    orbitSpeed: 0.009,
    orbitPhase: Math.PI * 0.22,
    orbitInclination: -0.15,
    planetSize: 440,
    description: "A stellar foundry where governed capabilities, workflows, and integrations assemble.",
    kind: "forge",
  },
  {
    id: "marketplace",
    label: "Marketplace System",
    color: "#63f0ba",
    orbitRadius: 20200,
    orbitSpeed: 0.006,
    orbitPhase: Math.PI * 1.1,
    orbitInclination: 0.08,
    planetSize: 360,
    description: "A distributed trade system for explicitly permitted tools and integrations.",
    kind: "gas",
  },
];

// ─── GLSL shaders ─────────────────────────────────────────────────────────────

const PLANET_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1 + uSeed * 4.7, 311.7 + uSeed * 9.3))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.52;
    for (int i = 0; i < 6; i++) { v += noise(p) * a; p = p * 2.03 + 7.13; a *= 0.48; }
    return v;
  }
  void main() {
    vec2 uv2 = vec2(vUv.x * 5.0 + uTime * 0.006, vUv.y * 3.0);
    float terrain = fbm(uv2);
    float detail  = fbm(uv2 * 2.4 + 13.7);
    float lat = abs(vUv.y - 0.5) * 2.0;
    float gasMix = step(0.56, fract(uSeed * 0.731));
    float bands = 0.5 + 0.5 * sin(vUv.y * 74.0 + terrain * 9.0);
    vec3 ocean = mix(vec3(0.006, 0.018, 0.045), uColor * 0.24, 0.62);
    vec3 land  = mix(uColor * 0.52, vec3(0.42, 0.48, 0.34), terrain * 0.45);
    vec3 rocky = mix(ocean, land, smoothstep(0.48, 0.57, terrain + detail * 0.12));
    vec3 gaseous = mix(uColor * 0.2, uColor * 0.86 + vec3(0.14), bands * 0.58 + terrain * 0.22);
    vec3 surface = mix(rocky, gaseous, gasMix);
    float ice = smoothstep(0.72, 0.94, lat + noise(vec2(vUv.x * 9.0, uSeed)) * 0.18);
    surface = mix(surface, vec3(0.72, 0.86, 0.94), ice * (1.0 - gasMix * 0.65));
    float clouds = smoothstep(0.64, 0.78, fbm(uv2 * 1.7 + vec2(23.0, uSeed))) * (1.0 - gasMix * 0.55);
    surface = mix(surface, vec3(0.88, 0.94, 1.0), clouds * 0.42);
    vec3 light = normalize(vec3(-0.55, 0.48, 0.72));
    float diff = max(0.0, dot(vNormal, light));
    float nightGlow = pow(max(0.0, 1.0 - diff), 4.0) * smoothstep(0.58, 0.78, detail) * (1.0 - gasMix) * 0.14;
    float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    vec3 color = surface * (0.08 + diff * 1.1) + uColor * nightGlow + uColor * rim * 0.22;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.4);
    gl_FragColor = vec4(uColor, fresnel * 0.52);
  }
`;

const CRYSTAL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying float vFresnel;
  uniform float uTime;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    pos += normal * sin(uTime * 1.2 + position.y * 3.0) * 0.04;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    vFresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.8);
  }
`;

const CRYSTAL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying float vFresnel;
  void main() {
    vec3 col = uColor * (0.4 + vFresnel * 0.7) + vec3(1.0) * vFresnel * 0.3;
    col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, 0.85);
  }
`;

// ─── Nebula cloud ─────────────────────────────────────────────────────────────

function NebulaCloud({ color, radius }: { color: string; radius: number }) {
  const count = 800;
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const r = radius * (0.8 + Math.random() * 2.2);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.55;
      positions[i * 3]     = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(phi) * 0.38;
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
      const b = 0.22 + Math.random() * 0.78;
      colors[i * 3]     = base.r * b;
      colors[i * 3 + 1] = base.g * b;
      colors[i * 3 + 2] = base.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [color, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors transparent opacity={0.38} size={120}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  );
}

// ─── Orbit ring ───────────────────────────────────────────────────────────────

function OrbitRing({ radius, color, inclination }: { radius: number; color: string; inclination: number }) {
  return (
    <mesh rotation={[Math.PI / 2 + inclination, 0, 0]}>
      <torusGeometry args={[radius, 18, 4, 200]} />
      <meshBasicMaterial
        color={color} transparent opacity={0.06}
        blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </mesh>
  );
}

// ─── Planet body ─────────────────────────────────────────────────────────────

function PlanetBody({ system }: { system: GalaxySystem }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < system.id.length; i++) h = Math.imul(h ^ system.id.charCodeAt(i), 16777619);
    return ((h >>> 0) / 4294967295);
  }, [system.id]);

  const surfaceUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(system.color) },
    uSeed:  { value: seed },
    uTime:  { value: 0 },
  }), [system.color, seed]);

  const atmoUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(system.color).lerp(new THREE.Color("#bdeeff"), 0.45) },
  }), [system.color]);

  const crystalUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(system.color) },
    uTime:  { value: 0 },
  }), [system.color]);

  useRenderTask(`galaxy-planet-${system.id}`, (_state, _delta, elapsed) => {
    if (system.kind === "rocky" || system.kind === "gas" || system.kind === "forge") {
      surfaceUniforms.uTime.value = elapsed;
      if (meshRef.current) meshRef.current.rotation.y = elapsed * 0.08;
    }
    if (system.kind === "crystal") {
      crystalUniforms.uTime.value = elapsed;
      if (meshRef.current) meshRef.current.rotation.y = elapsed * 0.14;
    }
  }, 4);

  if (system.kind === "crystal") {
    return (
      <group>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[system.planetSize, 2]} />
          <shaderMaterial
            vertexShader={CRYSTAL_VERT}
            fragmentShader={CRYSTAL_FRAG}
            uniforms={crystalUniforms}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
        {[1.3, 1.6, 1.9].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2 + i * 0.35, i * 0.22, 0]}>
            <torusGeometry args={[system.planetSize * r, system.planetSize * 0.022, 6, 80]} />
            <meshBasicMaterial
              color={system.color} transparent opacity={0.55 - i * 0.12}
              blending={THREE.AdditiveBlending} depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    );
  }

  if (system.kind === "ring") {
    return (
      <group>
        <mesh ref={meshRef}>
          <sphereGeometry args={[system.planetSize, 48, 32]} />
          <shaderMaterial
            vertexShader={PLANET_VERT}
            fragmentShader={PLANET_FRAG}
            uniforms={surfaceUniforms}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[system.planetSize * 1.06, 32, 20]} />
          <shaderMaterial
            vertexShader={ATMO_VERT}
            fragmentShader={ATMO_FRAG}
            uniforms={atmoUniforms}
            transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide}
          />
        </mesh>
        {[1.8, 2.2, 2.7].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2 + 0.18, i * 0.12, 0]}>
            <torusGeometry args={[system.planetSize * r, system.planetSize * (0.028 - i * 0.006), 6, 120]} />
            <meshBasicMaterial
              color={system.color} transparent opacity={0.72 - i * 0.14}
              blending={THREE.AdditiveBlending} depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    );
  }

  // rocky / gas / forge
  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[system.planetSize, 64, 40]} />
        <shaderMaterial
          vertexShader={PLANET_VERT}
          fragmentShader={PLANET_FRAG}
          uniforms={surfaceUniforms}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[system.planetSize * 1.06, 32, 20]} />
        <shaderMaterial
          vertexShader={ATMO_VERT}
          fragmentShader={ATMO_FRAG}
          uniforms={atmoUniforms}
          transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide}
        />
      </mesh>
      {system.kind === "forge" && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[system.planetSize * 2.1, system.planetSize * 0.038, 8, 90]} />
          <meshBasicMaterial
            color={system.color} transparent opacity={0.65}
            blending={THREE.AdditiveBlending} depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── Individual orbital planet ────────────────────────────────────────────────

function OrbitalPlanet({ system }: { system: GalaxySystem }) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [birthScale, setBirthScale] = useState(0.001);
  const interaction = useInteractionSystem();
  const isSelected = interaction.selectedId === system.id;

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 1600);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setBirthScale(ease);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useRenderTask(`orbital-${system.id}`, (state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const angle = system.orbitPhase + t * system.orbitSpeed;
    group.current.position.set(
      Math.cos(angle) * system.orbitRadius,
      Math.sin(angle * 0.68 + system.orbitInclination) * system.orbitRadius * 0.22,
      Math.sin(angle) * system.orbitRadius,
    );
  }, 4);

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    interaction.select(system.id);
    window.dispatchEvent(new CustomEvent("uios:cinematic-travel", { detail: { id: system.id } }));
  };

  const handlePointerOver = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
    interaction.hover(system.id);
  };

  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = "default";
    interaction.hover(null);
  };

  return (
    <group ref={group} scale={birthScale}>
      <NebulaCloud color={system.color} radius={system.planetSize * 6} />
      <group onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <PlanetBody system={system} />
        {/* invisible hit target */}
        <mesh scale={system.planetSize * 2.8}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {/* glow halo */}
        <mesh scale={system.planetSize * 1.9}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshBasicMaterial
            color={system.color} transparent
            opacity={(hovered || isSelected) ? 0.14 : 0.05}
            blending={THREE.AdditiveBlending} depthWrite={false}
          />
        </mesh>
        <pointLight
          color={system.color}
          intensity={(hovered || isSelected) ? system.planetSize * 800 : system.planetSize * 280}
          distance={system.planetSize * 18}
          decay={2}
        />
      </group>
      {hovered && (
        <Html center distanceFactor={system.planetSize * 60} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(4,10,28,0.92)",
            border: `1px solid ${system.color}55`,
            borderRadius: 8,
            color: "#eef2ff",
            fontFamily: "ui-monospace,monospace",
            fontSize: 10,
            letterSpacing: "0.07em",
            padding: "6px 12px",
            whiteSpace: "nowrap",
          }}>
            <div style={{ color: system.color, fontWeight: "bold", marginBottom: 2 }}>{system.label}</div>
            <div style={{ opacity: 0.7 }}>{system.description.slice(0, 52)}…</div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Star field ───────────────────────────────────────────────────────────────

function StarField() {
  const count = 12000;
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const starColors = [
      new THREE.Color("#ffffff"),
      new THREE.Color("#c8d8ff"),
      new THREE.Color("#ffddb0"),
      new THREE.Color("#b8e0ff"),
    ];
    for (let i = 0; i < count; i++) {
      const r = 180000 + Math.random() * 400000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = starColors[Math.floor(Math.random() * starColors.length)];
      const b = 0.4 + Math.random() * 0.6;
      colors[i * 3] = c.r * b;
      colors[i * 3 + 1] = c.g * b;
      colors[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors transparent opacity={0.88} size={280}
        sizeAttenuation depthWrite={false}
      />
    </points>
  );
}

// ─── Milky-way dust band ──────────────────────────────────────────────────────

function GalaxyDust() {
  const count = 4000;
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const arm = i % 3;
      const radius = 30000 + Math.pow(Math.random(), 0.5) * 140000;
      const angle = radius * 0.000032 + arm * Math.PI * 0.66 + (Math.random() - 0.5) * 0.6;
      positions[i * 3]     = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * radius * 0.06;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      const hue = 0.6 + Math.random() * 0.2;
      const c = new THREE.Color().setHSL(hue, 0.55, 0.45 + Math.random() * 0.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors transparent opacity={0.28} size={640}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  );
}

// ─── Central star (intelligence sun) ─────────────────────────────────────────

function IntelligenceSun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);

  useRenderTask("intelligence-sun", (_state, _delta, elapsed) => {
    if (meshRef.current) meshRef.current.rotation.y = elapsed * 0.06;
    if (glowRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.4) * 0.04;
      glowRef.current.scale.setScalar(pulse);
    }
    if (coronaRef.current) coronaRef.current.rotation.z = elapsed * 0.02;
  }, 2);

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[320, 48, 32]} />
        <meshStandardMaterial
          color="#fff4a0"
          emissive="#ffe040"
          emissiveIntensity={3.2}
          roughness={0.1}
          metalness={0}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[380, 24, 16]} />
        <meshBasicMaterial
          color="#fffbe0"
          transparent opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={coronaRef} rotation={[0.4, 0, 0]}>
        <sphereGeometry args={[520, 20, 14]} />
        <meshBasicMaterial
          color="#ffc340"
          transparent opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#fffbe8" intensity={2_200_000} distance={320_000} decay={2} />
      <ambientLight color="#0a122a" intensity={0.38} />
    </group>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function GalaxyScene() {
  return (
    <group>
      <StarField />
      <GalaxyDust />
      <IntelligenceSun />
      {GALAXY_SYSTEMS.map((system) => (
        <group key={system.id}>
          <OrbitRing
            radius={system.orbitRadius}
            color={system.color}
            inclination={system.orbitInclination}
          />
          <OrbitalPlanet system={system} />
        </group>
      ))}
    </group>
  );
}
