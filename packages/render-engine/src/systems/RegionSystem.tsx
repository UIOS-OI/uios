"use client";

import { Html } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useInteractionSystem } from "./InteractionSystem";

export type RenderRegion = { id: string; label: string; position: [number, number, number] };
export type RegionSystemProps = { regions?: RenderRegion[] };

const defaultRegions: RenderRegion[] = [
  { id: "region-alpha", label: "ALPHA", position: [-2.9, 1.6, 0.2] },
  { id: "region-beta", label: "BETA", position: [2.8, 1.25, -0.4] },
  { id: "region-gamma", label: "GAMMA", position: [0.2, -2.25, 0.4] },
];

function RegionMarker({ region, index }: { region: RenderRegion; index: number }) {
  const group = useRef<THREE.Group>(null);
  const interaction = useInteractionSystem();
  const active = interaction.hoveredId === region.id || interaction.selectedId === region.id;

  useRenderTask(`region-${region.id}`, (_state, _delta, elapsed) => {
    if (!group.current) return;
    const pulse = 1 + Math.sin(elapsed * 1.8 + index) * 0.07;
    group.current.scale.setScalar(active ? pulse * 1.18 : pulse);
    group.current.rotation.z = elapsed * (index % 2 === 0 ? 0.12 : -0.12);
  }, 3);

  return (
    <group ref={group} position={region.position}>
      <mesh
        onPointerOver={(event) => { event.stopPropagation(); interaction.hover(region.id); }}
        onPointerOut={() => interaction.hover(null)}
        onClick={(event) => { event.stopPropagation(); interaction.select(region.id); }}
      >
        <torusGeometry args={[0.18, 0.025, 8, 32]} />
        <meshBasicMaterial color={active ? "#ffffff" : "#7894ff"} transparent opacity={active ? 1 : 0.7} />
      </mesh>
      {active ? (
        <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <span style={{ color: "#eef2ff", font: "600 9px ui-monospace", letterSpacing: "0.16em" }}>
            {region.label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

export function RegionSystem({ regions }: RegionSystemProps) {
  const stableRegions = useMemo(() => regions ?? defaultRegions, [regions]);
  return stableRegions.map((region, index) => (
    <RegionMarker key={region.id} region={region} index={index} />
  ));
}
