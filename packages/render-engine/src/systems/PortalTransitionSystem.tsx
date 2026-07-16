"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useInteractionSystem } from "./InteractionSystem";

export function PortalTransitionSystem() {
  const interaction = useInteractionSystem();
  const group = useRef<THREE.Group>(null);
  const tunnel = useRef<THREE.Mesh>(null);
  const rings = useMemo(() => Array.from({ length: 18 }, (_, index) => index), []);
  const visible = interaction.navigationMode === "cinematic" && interaction.portalPhase !== "idle" && interaction.portalPhase !== "approach";

  useRenderTask("portal-transition", (state, delta, elapsed) => {
    if (!group.current || !visible) return;
    group.current.position.copy(state.camera.position);
    group.current.quaternion.copy(state.camera.quaternion);
    const target = interaction.portalPhase === "fracture" ? 0.35 : interaction.portalPhase === "tunnel" ? 1 : 0.62;
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, target, 4, delta));
    group.current.rotation.z = Math.sin(elapsed * 0.7) * 0.08;
    if (tunnel.current) {
      tunnel.current.rotation.y += delta * 0.45;
      const material = tunnel.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.damp(material.opacity, interaction.portalPhase === "tunnel" ? 0.34 : 0.14, 4, delta);
    }
  }, 42);

  if (!visible) return null;
  return (
    <group ref={group} frustumCulled={false}>
      <mesh ref={tunnel} position={[0, 0, -4200]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1600, 260, 8400, 24, 28, true]} />
        <meshBasicMaterial color="#8b72ff" wireframe transparent opacity={0.2} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {rings.map((index) => (
        <mesh key={index} position={[0, 0, -300 - index * 430]}>
          <torusGeometry args={[180 + index * 64, 7 + index * 0.4, 6, 48]} />
          <meshBasicMaterial color={index % 3 === 0 ? "#dffcff" : "#7f69ff"} transparent opacity={0.2 + index / rings.length * 0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      <pointLight color="#937cff" intensity={280000} distance={9000} decay={2} position={[0, 0, -1200]} />
    </group>
  );
}
