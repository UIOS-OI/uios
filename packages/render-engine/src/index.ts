export { CameraManager } from "./engine/CameraManager";
export { DefaultRenderScene, SceneManager, type SceneManagerProps } from "./engine/SceneManager";
export { RenderLoop, useRenderTask, type RenderTask } from "./engine/RenderLoop";

export { CrystalCoreSystem, type CrystalCoreSystemProps } from "./systems/CrystalCoreSystem";
export {
  InteractionSystem,
  useInteractionSystem,
  type InteractionState,
} from "./systems/InteractionSystem";
export { LightingSystem } from "./systems/LightingSystem";
export { NeuralNetworkSystem, type NeuralNetworkSystemProps } from "./systems/NeuralNetworkSystem";
export { ParticleSystem, type ParticleSystemProps } from "./systems/ParticleSystem";
export { RegionSystem, type RegionSystemProps, type RenderRegion } from "./systems/RegionSystem";

export { crystalFragmentShader, crystalVertexShader } from "./shaders/Crystal";
export { energyFragmentShader, energyVertexShader } from "./shaders/Energy";
export { pulseFragmentShader, pulseVertexShader } from "./shaders/Pulse";
export { backgroundFragmentShader, backgroundVertexShader } from "./shaders/Background";
