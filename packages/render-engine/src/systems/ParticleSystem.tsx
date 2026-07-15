"use client";

import { useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { energyFragmentShader, energyVertexShader } from "../shaders/Energy";

export type ParticleSystemProps = {
  count?: number;
  radius?: number;
  color?: string;
};

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function ParticleSystem({ count = 900, radius = 6.5, color = "#6f8cff" }: ParticleSystemProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const pixelRatio = useThree((state) => Math.min(state.gl.getPixelRatio(), 1.5));
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const distance = Math.pow(seeded(index, 1), 0.58) * radius;
      const theta = seeded(index, 2) * Math.PI * 2;
      const phi = Math.acos(2 * seeded(index, 3) - 1);
      positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = distance * Math.cos(phi) * 0.7;
      positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
      scales[index] = 0.7 + seeded(index, 4) * 2.2;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return buffer;
  }, [count, radius]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: new THREE.Color(color) },
    }),
    [color, pixelRatio],
  );

  useRenderTask("particles", (_state, _delta, elapsed) => {
    if (material.current) material.current.uniforms.uTime.value = elapsed;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={energyVertexShader}
        fragmentShader={energyFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
