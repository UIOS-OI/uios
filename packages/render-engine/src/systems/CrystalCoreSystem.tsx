"use client";

import gsap from "gsap";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useUniverseActivity } from "../engine/UniverseActivityManager";
import { crystalFragmentShader, crystalVertexShader } from "../shaders/Crystal";
import { useInteractionSystem } from "./InteractionSystem";

export type CrystalCoreSystemProps = {
  scale?: number;
  position?: [number, number, number];
};

export function CrystalCoreSystem({ scale = 185, position = [0, 0, -820] }: CrystalCoreSystemProps) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const pulseShell = useRef<THREE.Mesh>(null);
  const coreLight = useRef<THREE.PointLight>(null);
  const activity = useUniverseActivity();
  const interaction = useInteractionSystem();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 1 },
      uColorA: { value: new THREE.Color("#2d56ff") },
      uColorB: { value: new THREE.Color("#cf5cff") },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!group.current) return;
    const animation = gsap.fromTo(
      group.current.scale,
      { x: 0.001, y: 0.001, z: 0.001 },
      { x: scale, y: scale, z: scale, duration: 1.7, ease: "back.out(1.5)" },
    );
    return () => {
      animation.kill();
    };
  }, [scale]);

  useRenderTask("crystal-core", (_state, delta, elapsed) => {
    const awareness = interaction.pointerPresence.current * 0.12 + (interaction.hoveredId === "core" ? 0.22 : 0);
    const systemPulse = activity.activityLevel.current * 0.42;
    if (group.current) {
      group.current.rotation.y += delta * (0.18 + systemPulse * 0.08);
      group.current.rotation.x = Math.sin(elapsed * 0.3) * 0.08;
    }
    if (material.current) {
      material.current.uniforms.uTime.value = elapsed;
      material.current.uniforms.uEnergy.value = 0.82 + Math.sin(elapsed * 1.2) * 0.18 + awareness + systemPulse;
    }
    if (pulseShell.current) {
      const pulse = 1.15 + Math.sin(elapsed * 1.35) * 0.035 + awareness * 0.42 + systemPulse * 0.38;
      pulseShell.current.scale.setScalar(pulse);
      const shellMaterial = pulseShell.current.material as THREE.MeshBasicMaterial;
      shellMaterial.opacity = 0.08 + awareness * 0.16 + systemPulse * 0.24;
    }
    if (coreLight.current) coreLight.current.intensity = 220000 + (awareness + systemPulse) * 240000;
  }, 2);

  return (
    <group
      ref={group}
      scale={scale}
      position={position}
      onPointerOver={(event) => { event.stopPropagation(); interaction.hover("core"); }}
      onPointerOut={() => interaction.hover(null)}
      onClick={(event) => {
        event.stopPropagation();
        interaction.pointerIntensity.current = 1;
        if (interaction.canGoBack) interaction.goBack();
      }}
    >
      <mesh scale={2.4}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.18, 2]} />
        <shaderMaterial
          ref={material}
          vertexShader={crystalVertexShader}
          fragmentShader={crystalFragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh scale={1.14}>
        <icosahedronGeometry args={[1.18, 1]} />
        <meshBasicMaterial color="#8397ff" wireframe transparent opacity={0.16} />
      </mesh>
      <mesh scale={0.72}>
        <icosahedronGeometry args={[1.18, 2]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={pulseShell} scale={1.15}>
        <icosahedronGeometry args={[1.18, 2]} />
        <meshBasicMaterial color="#9f8cff" wireframe transparent opacity={0.08} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={coreLight} color="#8aa8ff" intensity={220000} distance={2400} decay={2} />
    </group>
  );
}
