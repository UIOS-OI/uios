"use client";

import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { type ReactNode, useCallback, useState } from "react";
import * as THREE from "three";
import { CosmosSandbox } from "../systems/CosmosSandbox";
import { CameraManager, type CameraHome } from "./CameraManager";
import { PerformanceManager } from "./PerformanceManager";
import { RenderLoop } from "./RenderLoop";

export function DefaultRenderScene() {
  return <CosmosSandbox />;
}

export type SceneManagerProps = {
  children?: ReactNode;
  className?: string;
  cameraHome?: CameraHome;
  cameraNear?: number;
  cameraFar?: number;
  cameraPosition?: [number, number, number];
  onPerformanceChange?: (factor: number) => void;
  onRegionChange?: (regionId: string | null, arrived: boolean, label?: string) => void;
};

export function SceneManager({ children, className, cameraHome, cameraNear = 2, cameraFar = 8000000, cameraPosition = [2400, 2800, 14800], onPerformanceChange }: SceneManagerProps) {
  const [dpr, setDpr] = useState(1.5);
  const [performanceFactor, setPerformanceFactor] = useState(1);
  const handlePerformance = useCallback(
    (factor: number) => {
      setDpr(1.1 + factor * 0.65);
      setPerformanceFactor(factor);
      onPerformanceChange?.(factor);
    },
    [onPerformanceChange],
  );

  return (
    <Canvas
      className={className}
      camera={{ far: cameraFar, fov: cameraHome?.fov ?? 50, near: cameraNear, position: cameraPosition }}
      dpr={dpr}
      frameloop="always"
      gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
      performance={{ min: 0.5, max: 1, debounce: 180 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.18;
        gl.setClearColor("#01030a", 1);
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={({ factor }) => handlePerformance(factor)}
        onFallback={() => handlePerformance(0)}
      />
      <AdaptiveDpr />
      <PerformanceManager factor={performanceFactor}>
        <color attach="background" args={["#01030a"]} />
        <RenderLoop>
          <CameraManager home={cameraHome} />
          {children ?? <DefaultRenderScene />}
          <EffectComposer multisampling={0} enableNormalPass={false}>
            <Bloom intensity={1.38} luminanceThreshold={0.2} luminanceSmoothing={0.22} mipmapBlur />
          </EffectComposer>
        </RenderLoop>
      </PerformanceManager>
    </Canvas>
  );
}
