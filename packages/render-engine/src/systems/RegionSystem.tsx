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

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 17.17 + salt * 91.73) * 43758.5453;
  return value - Math.floor(value);
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

function RegionGeometry({ kind, color, level, action }: { kind: UniverseRegionKind; color: string; level: SpatialLevel; action?: UniverseRegion["action"] }) {
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
        <RegionGeometry kind={region.kind} color={region.color} level={region.level} action={region.action} />
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
