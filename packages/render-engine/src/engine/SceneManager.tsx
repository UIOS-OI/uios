"use client";

import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { backgroundFragmentShader, backgroundVertexShader } from "../shaders/Background";
import { CrystalCoreSystem } from "../systems/CrystalCoreSystem";
import { InteractionSystem } from "../systems/InteractionSystem";
import { LightingSystem } from "../systems/LightingSystem";
import { NeuralNetworkSystem } from "../systems/NeuralNetworkSystem";
import { ParticleSystem } from "../systems/ParticleSystem";
import { RegionSystem } from "../systems/RegionSystem";
import { CameraManager } from "./CameraManager";
import { RenderLoop, useRenderTask } from "./RenderLoop";

function BackgroundPlane() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useRenderTask("background", (_state, _delta, elapsed) => {
    if (material.current) material.current.uniforms.uTime.value = elapsed;
  }, -10);

  return (
    <mesh position={[0, 0, -12]} scale={[28, 18, 1]} renderOrder={-10}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}

export function DefaultRenderScene() {
  return (
    <>
      <LightingSystem />
      <ParticleSystem />
      <NeuralNetworkSystem />
      <CrystalCoreSystem />
      <RegionSystem />
    </>
  );
}

export type SceneManagerProps = {
  children?: ReactNode;
  className?: string;
  onPerformanceChange?: (factor: number) => void;
};

export function SceneManager({ children, className, onPerformanceChange }: SceneManagerProps) {
  const [dpr, setDpr] = useState(1.5);
  const handlePerformance = useCallback(
    (factor: number) => {
      setDpr(1 + factor * 0.5);
      onPerformanceChange?.(factor);
    },
    [onPerformanceChange],
  );

  return (
    <Canvas
      className={className}
      dpr={dpr}
      frameloop="always"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      performance={{ min: 0.5, max: 1, debounce: 180 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={({ factor }) => handlePerformance(factor)}
        onFallback={() => handlePerformance(0)}
      />
      <AdaptiveDpr pixelated />
      <CameraManager />
      <RenderLoop>
        <BackgroundPlane />
        <InteractionSystem>{children ?? <DefaultRenderScene />}</InteractionSystem>
      </RenderLoop>
    </Canvas>
  );
}
