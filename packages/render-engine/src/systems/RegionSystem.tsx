"use client";

import { Html } from "@react-three/drei";
import { type CSSProperties, type ReactNode, useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useStreamingSectors } from "../engine/StreamingManager";
import { useUniverseActivity } from "../engine/UniverseActivityManager";
import {
  type SpatialLevel,
  type UniverseRegion,
  type UniverseRegionKind,
} from "../engine/UniverseManager";
import { useInteractionSystem } from "./InteractionSystem";

export type RenderRegion = UniverseRegion;
export type RegionSystemProps = {
  regions?: RenderRegion[];
  renderInterface?: (region: RenderRegion) => ReactNode;
};

const LEVEL_SCALE: Record<SpatialLevel, number> = {
  system: 12000,
  planet: 12000,
  world: 10500,
  district: 9500,
  building: 8500,
  workspace: 8000,
  document: 9000,
  graph: 8500,
  network: 8000,
};

const PLANET_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vNormalView;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 19.31) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0.0; float amplitude = 0.52;
    for (int octave = 0; octave < 5; octave++) { value += noise(p) * amplitude; p = p * 2.03 + 7.13; amplitude *= 0.48; }
    return value;
  }
  void main() {
    vec2 mapUv = vec2(vUv.x * 5.0, vUv.y * 3.0);
    float terrain = fbm(mapUv + vec2(uSeed * 0.17, 0.0));
    float detail = fbm(mapUv * 2.4 + 13.7);
    float latitude = abs(vUv.y - 0.5) * 2.0;
    float gasMix = step(0.56, fract(uSeed * 0.731));
    float bands = 0.5 + 0.5 * sin(vUv.y * 74.0 + terrain * 9.0);
    vec3 ocean = mix(vec3(0.006, 0.018, 0.045), uColor * 0.24, 0.62);
    vec3 land = mix(uColor * 0.52, vec3(0.42, 0.48, 0.34), terrain * 0.45);
    vec3 rocky = mix(ocean, land, smoothstep(0.48, 0.57, terrain + detail * 0.12));
    vec3 gaseous = mix(uColor * 0.2, uColor * 0.86 + vec3(0.14), bands * 0.58 + terrain * 0.22);
    vec3 surface = mix(rocky, gaseous, gasMix);
    float ice = smoothstep(0.72, 0.94, latitude + noise(vec2(vUv.x * 9.0, uSeed)) * 0.18);
    surface = mix(surface, vec3(0.72, 0.86, 0.94), ice * (1.0 - gasMix * 0.65));
    float clouds = smoothstep(0.64, 0.78, fbm(mapUv * 1.7 + vec2(23.0, uSeed))) * (1.0 - gasMix * 0.55);
    surface = mix(surface, vec3(0.88, 0.94, 1.0), clouds * 0.42);
    vec3 lightDirection = normalize(vec3(-0.55, 0.48, 0.72));
    float diffuse = max(0.0, dot(normalize(vNormalView), lightDirection));
    float nightGlow = pow(max(0.0, 1.0 - diffuse), 4.0) * smoothstep(0.58, 0.78, detail) * (1.0 - gasMix) * 0.12;
    float rim = pow(1.0 - max(0.0, dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0))), 3.0);
    vec3 color = surface * (0.075 + diffuse * 1.12) + uColor * nightGlow + uColor * rim * 0.2;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormalView;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0))), 3.4);
    gl_FragColor = vec4(uColor, fresnel * 0.42);
  }
`;

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 17.17 + salt * 91.73) * 43758.5453;
  return value - Math.floor(value);
}

function seedFromId(id: string) {
  let value = 2166136261;
  for (let index = 0; index < id.length; index += 1) value = Math.imul(value ^ id.charCodeAt(index), 16777619);
  return (value >>> 0) / 4294967295;
}

function PlanetBody({ color, id }: { color: string; id: string }) {
  const seed = useMemo(() => seedFromId(id), [id]);
  const surfaceUniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uSeed: { value: seed } }), [color, seed]);
  const atmosphereUniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color).lerp(new THREE.Color("#bdeeff"), 0.55) } }), [color]);
  const ringed = seed > 0.58;

  return (
    <group rotation={[0.08 + seed * 0.22, seed * Math.PI * 2, -0.12 + seed * 0.28]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1.16, 64, 48]} />
        <shaderMaterial vertexShader={PLANET_VERTEX_SHADER} fragmentShader={PLANET_FRAGMENT_SHADER} uniforms={surfaceUniforms} />
      </mesh>
      <mesh scale={1.055}>
        <sphereGeometry args={[1.16, 48, 32]} />
        <shaderMaterial vertexShader={ATMOSPHERE_VERTEX_SHADER} fragmentShader={ATMOSPHERE_FRAGMENT_SHADER} uniforms={atmosphereUniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      {ringed ? (
        <mesh rotation={[Math.PI / 2, 0, seed * 0.6]}>
          <ringGeometry args={[1.55, 2.45, 128]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.08} metalness={0.08} roughness={0.82} transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
      <pointLight color={color} intensity={18000} distance={5.5} decay={2} />
    </group>
  );
}

function GalaxyShell({ color, level }: { color: string; level: SpatialLevel }) {
  const geometry = useMemo(() => {
    const count = level === "system" ? 320 : 220;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const arm = index % 4;
      const radius = 0.22 + Math.pow(seeded(index, 1), 0.62) * 2.5;
      const angle = radius * 2.7 + arm * Math.PI * 0.5 + seeded(index, 2) * 0.48;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (seeded(index, 3) - 0.5) * (0.09 + radius * 0.08);
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [level]);

  return (
    <group rotation={[0.22, 0, -0.1]}>
      <points geometry={geometry}>
        <pointsMaterial color={color} size={0.085} sizeAttenuation transparent opacity={0.92} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {[1.05, 1.68, 2.42].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / 2, index * 0.18, 0]}>
          <torusGeometry args={[radius, index === 0 ? 0.028 : 0.014, 6, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.22 - index * 0.045} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <mesh scale={[2.9, 0.16, 2.9]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.075} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function OrbitingContents({ color, id, index, level }: { color: string; id: string; index: number; level: SpatialLevel }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const inheritedScale = useRef(new THREE.Vector3(1, 1, 1));
  const geometry = useMemo(() => {
    const count = level === "system" ? 44 : 28;
    const positions = new Float32Array(count * 3);
    for (let item = 0; item < count; item += 1) {
      const radius = 3.2 + seeded(item + index * 7, 5) * 3.6;
      const angle = item / count * Math.PI * 6 + seeded(item, index + 8) * 0.5;
      positions[item * 3] = Math.cos(angle) * radius;
      positions[item * 3 + 1] = (seeded(item, index + 9) - 0.5) * 2.7;
      positions[item * 3 + 2] = Math.sin(angle) * radius;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [index, level]);

  useRenderTask(`contents-${id}`, (state, delta) => {
    if (!group.current || !material.current) return;
    group.current.getWorldPosition(worldPosition.current);
    group.current.getWorldScale(inheritedScale.current);
    const distance = state.camera.position.distanceTo(worldPosition.current);
    const localScale = Math.max(1, inheritedScale.current.x);
    const visibility = THREE.MathUtils.clamp(1 - (distance / localScale - 9) / 22, 0.08, 0.82);
    material.current.opacity = THREE.MathUtils.damp(material.current.opacity, visibility, 4, delta);
    group.current.rotation.y += delta * 0.045;
    group.current.rotation.z -= delta * 0.012;
  }, 3);

  return (
    <group ref={group} rotation={[0.18, index * 0.31, -0.08]}>
      <points geometry={geometry}>
        <pointsMaterial ref={material} color={color} size={0.19} sizeAttenuation transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {Array.from({ length: 9 }, (_, item) => {
        const angle = item / 9 * Math.PI * 2 + index * 0.17;
        const radius = 3.8 + (item % 3) * 0.72;
        return (
          <mesh key={item} position={[Math.cos(angle) * radius, Math.sin(item * 1.9) * 0.72, Math.sin(angle) * radius]} rotation={[item * 0.7, angle, item * 0.22]} scale={0.12 + (item % 3) * 0.035}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={color} transparent opacity={0.68} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })}
    </group>
  );
}

function RegionGeometry({ kind, color, id, level, action }: { kind: UniverseRegionKind; color: string; id: string; level: SpatialLevel; action?: UniverseRegion["action"] }) {
  if (level === "system") {
    return <>
      <mesh><sphereGeometry args={[0.72, 48, 32]} /><meshStandardMaterial color="#17355f" emissive={color} emissiveIntensity={1.8} metalness={0.15} roughness={0.12} /></mesh>
      <mesh scale={1.18}><sphereGeometry args={[0.88, 28, 18]} /><meshBasicMaterial color={color} wireframe transparent opacity={0.42} blending={THREE.AdditiveBlending} /></mesh>
      <mesh scale={1.65}><sphereGeometry args={[1, 28, 18]} /><meshBasicMaterial color={color} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
    </>;
  }
  if (action === "open-document") {
    return <>
      <mesh rotation={[0.18, -0.35, 0.08]}><dodecahedronGeometry args={[1.05, 1]} /><meshStandardMaterial color="#9bdfff" emissive={color} emissiveIntensity={1.15} metalness={0.35} roughness={0.08} /></mesh>
      <mesh scale={1.28} rotation={[-0.1, 0.45, 0.2]}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color={color} wireframe transparent opacity={0.48} blending={THREE.AdditiveBlending} /></mesh>
      {[1.5, 1.85].map((radius, index) => <mesh key={radius} rotation={[Math.PI / 2 + index * 0.55, index * 0.6, 0]}><torusGeometry args={[radius, 0.025, 6, 72]} /><meshBasicMaterial color={color} transparent opacity={0.6 - index * 0.16} blending={THREE.AdditiveBlending} /></mesh>)}
    </>;
  }
  if (level === "planet") return <PlanetBody color={color} id={id} />;
  if (kind === "workspace") {
    return <>
      <mesh><sphereGeometry args={[0.5, 24, 16]} /><meshStandardMaterial color="#eafff8" emissive={color} emissiveIntensity={0.8} roughness={0.2} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.86, 0.028, 8, 64]} /><meshBasicMaterial color={color} transparent opacity={0.65} /></mesh>
    </>;
  }
  if (kind === "aegis") {
    return <>
      <mesh><octahedronGeometry args={[1.1, 1]} /><meshStandardMaterial color="#07182b" emissive={color} emissiveIntensity={0.8} roughness={0.18} metalness={0.65} /></mesh>
      <mesh scale={1.5}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color={color} wireframe transparent opacity={0.25} /></mesh>
    </>;
  }
  if (kind === "memory") {
    return <group>{[-0.6, 0, 0.6].map((x, index) => <mesh key={x} position={[x, (index - 1) * 0.28, 0]} rotation={[0.2, index * 0.7, 0.25]}><octahedronGeometry args={[0.62, 0]} /><meshStandardMaterial color="#dffcff" emissive={color} emissiveIntensity={0.42} roughness={0.08} metalness={0.18} /></mesh>)}</group>;
  }
  if (kind === "router") {
    return <>{[0.78, 1.08, 1.38].map((radius, index) => <mesh key={radius} rotation={[Math.PI / 2 + index * 0.25, index * 0.65, 0]}><torusGeometry args={[radius, 0.045, 8, 72]} /><meshBasicMaterial color={index === 1 ? "#ffc45e" : color} transparent opacity={0.8} /></mesh>)}</>;
  }
  if (kind === "agents") {
    return <group>{Array.from({ length: 9 }, (_, index) => { const angle = index / 9 * Math.PI * 2; return <mesh key={index} position={[Math.cos(angle) * 1.15, Math.sin(angle * 2) * 0.35, Math.sin(angle) * 1.15]}><tetrahedronGeometry args={[0.22, 0]} /><meshBasicMaterial color={color} /></mesh>; })}</group>;
  }
  if (kind === "observatory") {
    return <>{[0, 1, 2].map((index) => <mesh key={index} rotation={[index * 0.72, index * 0.45, index * 0.25]}><torusGeometry args={[1.15 + index * 0.16, 0.025, 6, 64]} /><meshBasicMaterial color={color} transparent opacity={0.65} /></mesh>)}</>;
  }
  if (kind === "forge") {
    return <group>{Array.from({ length: 7 }, (_, index) => <mesh key={index} position={[(index - 3) * 0.28, Math.sin(index * 1.8) * 0.7, Math.cos(index) * 0.35]} rotation={[index, index * 0.4, 0]}><boxGeometry args={[0.2, 0.9, 0.2]} /><meshStandardMaterial color="#2a1604" emissive={color} emissiveIntensity={0.8} metalness={0.8} roughness={0.25} /></mesh>)}</group>;
  }
  if (kind === "marketplace") {
    return <group>{Array.from({ length: 5 }, (_, index) => { const angle = index / 5 * Math.PI * 2; return <mesh key={index} position={[Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0]}><dodecahedronGeometry args={[0.32, 0]} /><meshBasicMaterial color={color} wireframe /></mesh>; })}</group>;
  }
  return <><mesh><icosahedronGeometry args={[0.72, 1]} /><meshStandardMaterial color="#101633" emissive={color} emissiveIntensity={0.9} metalness={0.55} roughness={0.2} /></mesh><mesh scale={1.3}><sphereGeometry args={[0.72, 18, 12]} /><meshBasicMaterial color={color} transparent opacity={0.08} /></mesh></>;
}

function DefaultInterface({ region }: { region: RenderRegion }) {
  return (
    <div className="uios-region-interface">
      <span>{region.eyebrow}</span>
      <h2>{region.label}</h2>
      <p>{region.description}</p>
      <small>{region.source === "workspace" ? "Workspace topology" : "UIOS system region"}</small>
    </div>
  );
}

function RegionDestination({ region, index, renderInterface, children }: { region: RenderRegion; index: number; renderInterface?: (region: RenderRegion) => ReactNode; children?: ReactNode }) {
  const visual = useRef<THREE.Group>(null);
  const personality = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const interaction = useInteractionSystem();
  const activity = useUniverseActivity();
  const active = interaction.hoveredId === region.id || interaction.selectedId === region.id;
  const arrived = interaction.arrivedId === region.id;
  const worldScale = LEVEL_SCALE[region.level] * (region.scale ?? 1);
  const traffic = activity.pulses.some((pulse) => pulse.route.includes(region.id));
  const activate = () => {
    if (region.action === "open-document" && region.documentPath) {
      window.dispatchEvent(new CustomEvent("uios:open-document", { detail: { path: region.documentPath, title: region.label } }));
      return;
    }
    interaction.select(region.id);
  };

  useRenderTask(`region-${region.id}`, (_state, delta, elapsed) => {
    if (!visual.current) return;
    const breathing = 1 + Math.sin(elapsed * 0.72 + index) * 0.045;
    const target = active ? 1.2 : 1;
    const next = THREE.MathUtils.damp(visual.current.scale.x / worldScale, target * breathing, 3.8, delta) * worldScale;
    visual.current.scale.setScalar(next);
    visual.current.rotation.y += delta * (index % 2 === 0 ? 0.035 : -0.035);
    if (halo.current) halo.current.rotation.z -= delta * 0.16;
    if (!personality.current) return;
    const motion = personality.current;
    const trafficBoost = traffic ? 2.2 : 1;
    if (region.kind === "aegis") {
      motion.rotation.y += delta * 0.035;
      motion.scale.setScalar(1 + Math.sin(elapsed * 0.62) * 0.025 + (traffic ? 0.08 : 0));
    } else if (region.kind === "memory") {
      motion.position.y = Math.sin(elapsed * 0.23) * 0.13;
      motion.rotation.y += delta * 0.055;
    } else if (region.kind === "router") {
      motion.rotation.y += delta * 0.42 * trafficBoost;
      motion.rotation.z -= delta * 0.16 * trafficBoost;
    } else if (region.kind === "agents") {
      motion.rotation.y += delta * 0.34 * trafficBoost;
      motion.rotation.x = Math.sin(elapsed * 0.9) * 0.18;
    } else if (region.kind === "forge") {
      motion.rotation.y += delta * 0.12;
      motion.scale.setScalar(0.94 + (Math.sin(elapsed * 0.8) + 1) * 0.06 + (traffic ? 0.1 : 0));
    } else if (region.kind === "observatory") {
      motion.rotation.x += delta * 0.08;
      motion.rotation.z += delta * 0.04;
    } else if (region.kind === "marketplace") {
      motion.rotation.z -= delta * 0.1;
    } else {
      motion.rotation.y += delta * 0.08 * trafficBoost;
    }
  }, 3);

  return (
    <group position={region.position}>
      <group ref={visual} scale={worldScale}>
      <group ref={personality}
        onPointerOver={(event) => { event.stopPropagation(); interaction.hover(region.id); }}
        onPointerOut={() => interaction.hover(null)}
        onClick={(event) => { event.stopPropagation(); activate(); }}
      >
        {region.action === "open-document" ? null : <GalaxyShell color={region.color} level={region.level} />}
        {region.action === "open-document" ? null : <OrbitingContents color={region.color} id={region.id} index={index} level={region.level} />}
        <RegionGeometry kind={region.kind} color={region.color} id={region.id} level={region.level} action={region.action} />
        <mesh
          onPointerOver={(event) => { event.stopPropagation(); interaction.hover(region.id); }}
          onPointerOut={() => interaction.hover(null)}
          onClick={(event) => { event.stopPropagation(); activate(); }}
          scale={region.level === "system" ? 3.8 : 3.1}
        >
          <sphereGeometry args={[1, 18, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <mesh ref={halo} scale={1.8} rotation={[1.2, 0.2, 0]}>
          <torusGeometry args={[1, 0.012, 5, 64]} />
          <meshBasicMaterial color={region.color} transparent opacity={active ? 0.72 : 0.24} blending={THREE.AdditiveBlending} />
        </mesh>
        <pointLight color={region.color} intensity={active ? worldScale * 110 : worldScale * 45} distance={worldScale * 8} decay={2} />
      </group>
      </group>

      <Html center position={[0, worldScale * 2.2, 0]} distanceFactor={Math.max(100, worldScale * 30)} style={{ pointerEvents: "none" }}>
        <button
          className={`uios-region-signal level-${region.level}${active ? " is-active" : ""}`}
          onClick={activate}
          onMouseEnter={() => interaction.hover(region.id)}
          onMouseLeave={() => interaction.hover(null)}
          style={{ pointerEvents: "auto", "--region-color": region.color } as CSSProperties}
          type="button"
        >
          <i />
          <span>{region.label}</span>
        </button>
      </Html>

      {active ? (
        <Html center position={[worldScale * 1.5, worldScale * 0.65, 0]} distanceFactor={Math.max(80, worldScale * 18)} style={{ pointerEvents: "none" }}>
          <div className="uios-object-popup">
            <span>{region.action === "open-document" ? "Memory artifact" : `${region.level} entrance`}</span>
            <strong>{region.label}</strong>
            <small>{region.action === "open-document" ? "Click to open this file" : "Click to reveal the universe inside"}</small>
          </div>
        </Html>
      ) : null}

      {arrived && region.level === "workspace" ? (
        <Html center position={[worldScale * 1.8, worldScale * 0.2, 0]} distanceFactor={Math.max(20, worldScale * 2.5)} transform sprite>
          {renderInterface ? renderInterface(region) : <DefaultInterface region={region} />}
        </Html>
      ) : null}
      {children}
    </group>
  );
}

export function RegionSystem({ regions, renderInterface }: RegionSystemProps) {
  const streaming = useStreamingSectors();
  const visibleRegions = useMemo(() => regions ?? [...streaming.visibleRegions], [regions, streaming.visibleRegions]);
  return visibleRegions.map((region, index) => <RegionDestination key={region.id} region={region} index={index} renderInterface={renderInterface} />);
}
