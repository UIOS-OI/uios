"use client";

import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { backgroundFragmentShader, backgroundVertexShader } from "../shaders/Background";
import { CrystalCoreSystem } from "../systems/CrystalCoreSystem";
import { InteractionSystem, useInteractionSystem } from "../systems/InteractionSystem";
import { LightingSystem } from "../systems/LightingSystem";
import { NeuralNetworkSystem } from "../systems/NeuralNetworkSystem";
import { ParticleSystem } from "../systems/ParticleSystem";
import { IntelligenceCurrentSystem } from "../systems/IntelligenceCurrentSystem";
import { RegionSystem } from "../systems/RegionSystem";
import { PortalTransitionSystem } from "../systems/PortalTransitionSystem";
import { IntentNavigationSystem } from "../systems/IntentNavigationSystem";
import { CameraManager } from "./CameraManager";
import { PerformanceManager } from "./PerformanceManager";
import { RenderLoop, useRenderTask } from "./RenderLoop";
import { StreamingManager } from "./StreamingManager";
import { UniverseActivityManager } from "./UniverseActivityManager";
import { useUniverseActivity } from "./UniverseActivityManager";
import { UniverseManager, useUniverseTopology } from "./UniverseManager";

const ENVIRONMENTS: Record<string, readonly [string, string]> = {
  memory: ["#123f68", "#9cecff"],
  router: ["#35104d", "#c06cff"],
  aegis: ["#071c38", "#31a8ff"],
  agents: ["#34102f", "#ff72cf"],
  forge: ["#3d1908", "#ffad4f"],
  root: ["#0b204d", "#668cff"],
};

function BackgroundPlane() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const activity = useUniverseActivity();
  const interaction = useInteractionSystem();
  const topology = useUniverseTopology();
  const activeKind = topology.nodeById(interaction.arrivedId)?.kind;
  const environment = ENVIRONMENTS[activeKind ?? "root"] ?? ENVIRONMENTS.root;
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uActivity: { value: 0 }, uTimeOfDay: { value: 0 }, uEnvironmentA: { value: new THREE.Color(environment[0]) }, uEnvironmentB: { value: new THREE.Color(environment[1]) } }), []);
  const targetA = useMemo(() => new THREE.Color(environment[0]), [environment[0]]);
  const targetB = useMemo(() => new THREE.Color(environment[1]), [environment[1]]);

  useRenderTask("background", (_state, delta, elapsed) => {
    if (material.current) {
      material.current.uniforms.uTime.value = elapsed;
      material.current.uniforms.uActivity.value = activity.activityLevel.current;
      material.current.uniforms.uTimeOfDay.value = activity.time === "day" ? 1 : activity.time === "dawn" ? 0.7 : activity.time === "dusk" ? 0.4 : 0;
      (material.current.uniforms.uEnvironmentA.value as THREE.Color).lerp(targetA, Math.min(1, delta * 1.2));
      (material.current.uniforms.uEnvironmentB.value as THREE.Color).lerp(targetB, Math.min(1, delta * 1.2));
    }
  }, -10);

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export function DefaultRenderScene() {
  return (
    <StreamingManager>
      <LightingSystem />
      <ParticleSystem />
      <NeuralNetworkSystem />
      <IntelligenceCurrentSystem />
      <CrystalCoreSystem />
      <RegionSystem />
    </StreamingManager>
  );
}

function UniverseStateObserver({ onRegionChange }: { onRegionChange?: (regionId: string | null, arrived: boolean, label?: string) => void }) {
  const interaction = useInteractionSystem();
  const topology = useUniverseTopology();
  useEffect(() => {
    onRegionChange?.(interaction.selectedId, interaction.arrivedId === interaction.selectedId, topology.nodeById(interaction.selectedId)?.label);
  }, [interaction.arrivedId, interaction.selectedId, onRegionChange, topology]);
  useEffect(() => {
    const navigateBack = () => interaction.goBack();
    window.addEventListener("uios:navigate-back", navigateBack);
    return () => window.removeEventListener("uios:navigate-back", navigateBack);
  }, [interaction.goBack]);
  return null;
}

export type SceneManagerProps = {
  children?: ReactNode;
  className?: string;
  onPerformanceChange?: (factor: number) => void;
  onRegionChange?: (regionId: string | null, arrived: boolean, label?: string) => void;
};

export function SceneManager({ children, className, onPerformanceChange, onRegionChange }: SceneManagerProps) {
  const [dpr, setDpr] = useState(1.5);
  const [performanceFactor, setPerformanceFactor] = useState(1);
  const handlePerformance = useCallback(
    (factor: number) => {
      setDpr(1 + factor * 0.5);
      setPerformanceFactor(factor);
      onPerformanceChange?.(factor);
    },
    [onPerformanceChange],
  );

  return (
    <UniverseManager>
      <Canvas
      className={className}
      camera={{ far: 3200000, fov: 48, near: 0.5, position: [0, 260, 1900] }}
      dpr={dpr}
      frameloop="always"
      gl={{ antialias: true, alpha: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
      performance={{ min: 0.5, max: 1, debounce: 180 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.18;
        gl.setClearColor("#102755", 0);
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={({ factor }) => handlePerformance(factor)}
        onFallback={() => handlePerformance(0)}
      />
        <AdaptiveDpr pixelated />
        <PerformanceManager factor={performanceFactor}>
          <UniverseActivityManager>
            <RenderLoop>
              <InteractionSystem>
                <BackgroundPlane />
                <CameraManager />
                <PortalTransitionSystem />
                <IntentNavigationSystem />
                <UniverseStateObserver onRegionChange={onRegionChange} />
                {children ?? <DefaultRenderScene />}
              </InteractionSystem>
              <EffectComposer multisampling={0} enableNormalPass={false}>
                <Bloom intensity={0.82} luminanceThreshold={0.82} luminanceSmoothing={0.18} mipmapBlur />
              </EffectComposer>
            </RenderLoop>
          </UniverseActivityManager>
        </PerformanceManager>
      </Canvas>
    </UniverseManager>
  );
}
