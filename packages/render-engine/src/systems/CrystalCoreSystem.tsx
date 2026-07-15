"use client";

import gsap from "gsap";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { crystalFragmentShader, crystalVertexShader } from "../shaders/Crystal";

export type CrystalCoreSystemProps = { scale?: number };

export function CrystalCoreSystem({ scale = 1 }: CrystalCoreSystemProps) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
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
    if (group.current) {
      group.current.rotation.y += delta * 0.18;
      group.current.rotation.x = Math.sin(elapsed * 0.3) * 0.08;
    }
    if (material.current) {
      material.current.uniforms.uTime.value = elapsed;
      material.current.uniforms.uEnergy.value = 0.82 + Math.sin(elapsed * 1.2) * 0.18;
    }
  }, 2);

  return (
    <group ref={group} scale={scale}>
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
    </group>
  );
}
