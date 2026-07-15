"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { pulseFragmentShader, pulseVertexShader } from "../shaders/Pulse";

export type NeuralNetworkSystemProps = { nodes?: number; connectionDistance?: number };

function nodePosition(index: number, count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(count - 1, 1)) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = golden * index;
  return new THREE.Vector3(Math.cos(theta) * radius * 3.5, y * 2.6, Math.sin(theta) * radius * 3.5);
}

export function NeuralNetworkSystem({ nodes = 42, connectionDistance = 1.55 }: NeuralNetworkSystemProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const positions = Array.from({ length: nodes }, (_, index) => nodePosition(index, nodes));
    const segments: number[] = [];
    const progress: number[] = [];

    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        if (positions[left].distanceTo(positions[right]) <= connectionDistance) {
          segments.push(...positions[left].toArray(), ...positions[right].toArray());
          progress.push(left / nodes, right / nodes);
        }
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    buffer.setAttribute("aProgress", new THREE.Float32BufferAttribute(progress, 1));
    return buffer;
  }, [connectionDistance, nodes]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#7487ff") },
      uOpacity: { value: 0.62 },
    }),
    [],
  );

  useRenderTask("neural-network", (_state, _delta, elapsed) => {
    if (material.current) material.current.uniforms.uTime.value = elapsed;
  }, 1);

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={material}
        vertexShader={pulseVertexShader}
        fragmentShader={pulseFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
