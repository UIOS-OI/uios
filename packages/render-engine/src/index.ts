export { CameraManager } from "./engine/CameraManager";
export {
  PerformanceManager,
  usePerformanceBudget,
  type PerformanceBudget,
  type PerformanceTier,
} from "./engine/PerformanceManager";
export { DefaultRenderScene, SceneManager, type SceneManagerProps } from "./engine/SceneManager";
export { RenderLoop, useRenderTask, type RenderTask } from "./engine/RenderLoop";
export {
  UIOS_ACTIVITY_EVENT,
  UniverseActivityManager,
  useUniverseActivity,
  type IntelligenceWeather,
  type UniverseActivity,
  type UniverseActivityKind,
  type UniverseActivityPhase,
  type UniverseTime,
} from "./engine/UniverseActivityManager";
export { StreamingManager, useStreamingSectors } from "./engine/StreamingManager";
export {
  UniverseManager,
  useUniverseTopology,
  type UniverseRegion,
  type UniverseRegionKind,
  type UniverseTopology,
} from "./engine/UniverseManager";
export {
  createNoiseTexture,
  optimizeTexture,
  type TextureOptimizationOptions,
} from "./engine/TextureManager";

export { CrystalCoreSystem, type CrystalCoreSystemProps } from "./systems/CrystalCoreSystem";
export { GalaxyScene } from "./systems/GalaxyScene";
export {
  InteractionSystem,
  useInteractionSystem,
  type InteractionState,
} from "./systems/InteractionSystem";
export { LightingSystem } from "./systems/LightingSystem";
export { IntelligenceCurrentSystem } from "./systems/IntelligenceCurrentSystem";
export { FluidConnectionSystem } from "./systems/FluidConnectionSystem";
export { SolarSystem, type SolarSystemProps } from "./systems/SolarSystem";
export { CelestialInfoPanel, type CelestialInfoPanelProps } from "./systems/CelestialInfoPanel";
export {
  GalaxyManager,
  useGalaxyTopology,
  type CelestialBody,
  type GalaxyDescriptor,
} from "./engine/UniverseManager";
export { NeuralNetworkSystem, type NeuralNetworkSystemProps } from "./systems/NeuralNetworkSystem";
export { ParticleSystem, type ParticleSystemProps } from "./systems/ParticleSystem";
export { RegionSystem, type RegionSystemProps, type RenderRegion } from "./systems/RegionSystem";

export { crystalFragmentShader, crystalVertexShader } from "./shaders/Crystal";
export { energyFragmentShader, energyVertexShader } from "./shaders/Energy";
export { pulseFragmentShader, pulseVertexShader } from "./shaders/Pulse";
export { backgroundFragmentShader, backgroundVertexShader } from "./shaders/Background";

export { useSettings } from "./store/settings";
