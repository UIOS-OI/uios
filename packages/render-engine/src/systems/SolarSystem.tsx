"use client";

import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useGalaxyTopology, type CelestialBody, type GalaxyDescriptor } from "../engine/UniverseManager";
import { useInteractionSystem } from "./InteractionSystem";
import { getPlanetTexture } from "../engine/TextureManager";

// ── GLSL Shaders ─────────────────────────────────────────────────────────────
const BODY_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BODY_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform float uUseTexture;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1+uSeed,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
  float fbm(vec2 p){float v=0.;float a=0.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=p*2.1+7.3;a*=0.48;}return v;}

  void main(){
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Procedural terrain fallback
    vec2 uv2 = vec2(vUv.x * 4.0 + uTime * 0.008, vUv.y * 3.0);
    float terrain = fbm(uv2);
    vec3 baseColor = mix(uColor * 0.12, uColor * 0.88, terrain);

    // Texture sample if enabled
    if (uUseTexture > 0.5) {
      vec2 mapUv = vec2(vUv.x + uTime * 0.0015, vUv.y);
      vec4 texColor = texture2D(uTexture, mapUv);
      baseColor = mix(baseColor, texColor.rgb, 0.85);
    }

    // Lighting computations
    vec3 lightDir = normalize(vec3(0.6, 0.5, 0.8));
    float diff = max(0.0, dot(normal, lightDir));
    
    // Fresnel / Rim glow effect
    float rim = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.5);
    
    // Combine surface, diffuse lighting and glowing atmosphere rim
    vec3 finalColor = baseColor * (0.15 + diff * 1.05) + uColor * rim * 0.45;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ── Atmosphere Glow Shader ──────────────────────────────────────────────────
const ATMOSPHERE_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ATMOSPHERE_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float intensity = pow(0.6 - dot(normal, viewDir), 3.0);
    gl_FragColor = vec4(uColor, 1.0) * intensity * 0.8;
  }
`;

// ── Nebula cloud ──────────────────────────────────────────────────────────────
function NebulaCloud({ color, bodyCount }: { color: string; bodyCount: number }) {
  const count = Math.max(400, Math.min(2400, 400 + bodyCount * 50));
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const r = 9000 + Math.random() * 28000;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.55;
      positions[i * 3]     = r * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
      const b = 0.25 + Math.random() * 0.75;
      colors[i * 3]     = base.r * b;
      colors[i * 3 + 1] = base.g * b;
      colors[i * 3 + 2] = base.b * b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [count, color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry}>
      <pointsMaterial
        vertexColors transparent opacity={0.52} size={300}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  );
}

// ── Orbiting body ─────────────────────────────────────────────────────────────
type OrbitingBodyProps = {
  body: CelestialBody;
  isNew: boolean;
  onSelect: (body: CelestialBody) => void;
};

function OrbitingBody({ body, isNew, onSelect }: OrbitingBodyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [birthScale, setBirthScale] = useState(isNew ? 0 : 1);
  const [hovered, setHovered] = useState(false);
  const bodyRadius = 700 + body.size * 3000;

  useEffect(() => {
    if (!isNew) return;
    let frame: number;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 1200);
      setBirthScale(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isNew]);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(body.color) },
    uSeed: { value: Math.abs(body.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 99 * 0.01 },
    uTime: { value: 0 },
    uTexture: { value: null },
    uUseTexture: { value: 0.0 }
  }), [body.color, body.id]);

  useRenderTask(`body-${body.id}`, (state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    uniforms.uTime.value = t;
    const angle = body.orbitPhase + t * body.orbitSpeed;
    mesh.position.set(
      Math.cos(angle) * body.orbitRadius,
      Math.sin(angle * 0.7 + body.orbitInclination) * body.orbitRadius * 0.28,
      Math.sin(angle) * body.orbitRadius,
    );
    mesh.rotation.y = t * 0.11;
    const hoverMult = hovered ? 1.2 : 1.0;
    const s = bodyRadius * birthScale * hoverMult;
    mesh.scale.setScalar(s);
  }, 55);

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => { e.stopPropagation(); onSelect(body); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      <sphereGeometry args={[1, 22, 14]} />
      <shaderMaterial vertexShader={BODY_VERT} fragmentShader={BODY_FRAG} uniforms={uniforms} />
      {hovered && (
        <Html center distanceFactor={90000} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(4,10,28,0.9)", border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 7, color: "#eef2ff", fontFamily: "ui-monospace,monospace",
            fontSize: 9, letterSpacing: "0.07em", padding: "4px 9px", whiteSpace: "nowrap",
          }}>
            {body.label}
          </div>
        </Html>
      )}
    </mesh>
  );
}

// ── Host planet ───────────────────────────────────────────────────────────────
function HostPlanet({ galaxy, onEnter }: { galaxy: GalaxyDescriptor; onEnter: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const radius = 4200 + galaxy.hostPlanet.size * 2200;
  const seed = galaxy.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Lazy-load texture for this host system
  useEffect(() => {
    const loadedTex = getPlanetTexture(galaxy.id);
    if (loadedTex) {
      setTexture(loadedTex);
    } else {
      // Poll/Check again in next frames/ticks or listen for loading
      const interval = setInterval(() => {
        const tex = getPlanetTexture(galaxy.id);
        if (tex) {
          setTexture(tex);
          clearInterval(interval);
        }
      }, 250);
      return () => clearInterval(interval);
    }
  }, [galaxy.id]);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(galaxy.color) },
    uSeed: { value: seed * 0.01 },
    uTime: { value: 0 },
    uTexture: { value: null as THREE.Texture | null },
    uUseTexture: { value: 0.0 }
  }), [galaxy.color, seed]);

  // Update uniform values
  useEffect(() => {
    if (texture) {
      uniforms.uTexture.value = texture;
      uniforms.uUseTexture.value = 1.0;
    }
  }, [texture, uniforms]);

  useRenderTask(`host-${galaxy.id}`, (state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.04;
      uniforms.uTime.value = state.clock.elapsedTime;
    }
  }, 55);

  return (
    <group>
      {/* Outer Atmosphere Glow */}
      <mesh>
        <sphereGeometry args={[radius * 1.06, 32, 32]} />
        <shaderMaterial
          vertexShader={ATMOSPHERE_VERT}
          fragmentShader={ATMOSPHERE_FRAG}
          uniforms={{ uColor: { value: new THREE.Color(galaxy.color) } }}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Textured Solid Planet Body */}
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onEnter(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[radius, 48, 32]} />
        <shaderMaterial vertexShader={BODY_VERT} fragmentShader={BODY_FRAG} uniforms={uniforms} />
        {hovered && (
          <Html center distanceFactor={90000} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(4,10,28,0.94)", border: `1px solid ${galaxy.color}66`,
              borderRadius: 9, color: "#fff", fontFamily: "ui-monospace,monospace",
              fontSize: 10, padding: "5px 12px", whiteSpace: "nowrap",
            }}>
              {galaxy.hostPlanet.label} · <span style={{ color: galaxy.color }}>Zoom In</span>
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

// ── Per-galaxy scene ──────────────────────────────────────────────────────────
function GalaxySolarSystem({
  galaxy, newArrivals, onBodySelect, onEnter,
}: {
  galaxy: GalaxyDescriptor;
  newArrivals: Set<string>;
  onBodySelect: (body: CelestialBody) => void;
  onEnter: (id: string) => void;
}) {
  return (
    <group position={galaxy.position}>
      <NebulaCloud color={galaxy.color} bodyCount={galaxy.bodies.length} />
      <HostPlanet galaxy={galaxy} onEnter={() => onEnter(galaxy.id)} />
      {galaxy.bodies.map((body) => (
        <OrbitingBody
          key={body.id}
          body={body}
          isNew={newArrivals.has(body.id)}
          onSelect={onBodySelect}
        />
      ))}
    </group>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export type SolarSystemProps = {
  onBodySelect?: (body: CelestialBody) => void;
};

export function SolarSystem({ onBodySelect }: SolarSystemProps) {
  const { galaxies, newArrivals } = useGalaxyTopology();
  const interaction = useInteractionSystem();

  const handleEnter = (galaxyId: string) => {
    interaction.select(galaxyId);
  };

  return (
    <group>
      {galaxies.map((galaxy) => (
        <GalaxySolarSystem
          key={galaxy.id}
          galaxy={galaxy}
          newArrivals={newArrivals}
          onBodySelect={(body) => onBodySelect?.(body)}
          onEnter={handleEnter}
        />
      ))}
    </group>
  );
}
