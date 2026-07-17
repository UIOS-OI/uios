"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type ElementRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useInteractionSystem } from "../systems/InteractionSystem";
import { useRenderTask } from "./RenderLoop";
import { useUniverseTopology, type SpatialLevel } from "./UniverseManager";

const HOME_TARGET = new THREE.Vector3(0, 0, -10000);
const HOME_POSITION = new THREE.Vector3(0, 260, 1900);
const PORTAL_DISTANCE: Record<SpatialLevel, number> = { system: 180000, planet: 5200, world: 5200, district: 5100, building: 5100, workspace: 5000, document: 5200, graph: 5200, network: 5200 };
const FLIGHT_TIME: Record<SpatialLevel, number> = { system: 9.5, planet: 8, world: 7, district: 6, building: 5.2, workspace: 4.8, document: 8, graph: 8, network: 8 };
const REVEAL_DISTANCE: Record<SpatialLevel, number> = { system: 320000, planet: 56000, world: 48000, district: 42000, building: 36000, workspace: 32000, document: 30000, graph: 28000, network: 26000 };
const LOCAL_VIEW_LIMITS: Record<SpatialLevel, { min: number; max: number }> = {
  system: { min: 4000, max: 900000000 }, planet: { min: 400, max: 300000000 }, world: { min: 160, max: 300000000 },
  district: { min: 70, max: 300000000 }, building: { min: 24, max: 300000000 }, workspace: { min: 8, max: 300000000 },
  document: { min: 700, max: 300000000 }, graph: { min: 700, max: 300000000 }, network: { min: 700, max: 300000000 },
};

export function CameraManager() {
  const camera = useThree((state) => state.camera);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const [warpZoom, setWarpZoom] = useState(true);
  const interaction = useInteractionSystem();
  const topology = useUniverseTopology();
  const { arrive, arrivedId, pointer, pointerPresence, selectedId, setPortalPhase } = interaction;
  const selectedRegion = topology.nodeById(selectedId);
  const activeRegion = topology.nodeById(arrivedId);
  const localViewEnabled = arrivedId === selectedId && interaction.portalPhase === "idle";
  const viewLimits = activeRegion ? LOCAL_VIEW_LIMITS[activeRegion.level] : { min: 280, max: 300000000 };
  const flight = useRef<gsap.core.Timeline | null>(null);
  const landing = useRef<gsap.core.Timeline | null>(null);
  const isFlying = useRef(false);

  useLayoutEffect(() => {
    if (!controls.current) return;
    isFlying.current = true;
    camera.position.set(-4800, 3200, 48000);
    controls.current.target.set(0, 600, -52000);
    perspectiveCamera.fov = 61;
    perspectiveCamera.updateProjectionMatrix();
    controls.current.update();
    landing.current = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => { isFlying.current = false; },
    });
    landing.current.to(camera.position, { x: HOME_POSITION.x, y: HOME_POSITION.y, z: HOME_POSITION.z, duration: 4.6 }, 0);
    landing.current.to(controls.current.target, { x: HOME_TARGET.x, y: HOME_TARGET.y, z: HOME_TARGET.z, duration: 4.6 }, 0);
    landing.current.to(perspectiveCamera, { fov: 48, duration: 4.1, onUpdate: () => perspectiveCamera.updateProjectionMatrix() }, 0.25);
    return () => { landing.current?.kill(); };
  }, [camera, perspectiveCamera]);

  const takeCameraControl = () => {
    if (!landing.current?.isActive()) return;
    landing.current.kill();
    isFlying.current = false;
  };

  useEffect(() => {
    setWarpZoom(window.localStorage.getItem("uios.warp-zoom.v1") !== "off");
    const updateWarpZoom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") setWarpZoom(detail.enabled);
    };
    window.addEventListener("uios:warp-zoom", updateWarpZoom);
    return () => window.removeEventListener("uios:warp-zoom", updateWarpZoom);
  }, []);

  useLayoutEffect(() => {
    if (!controls.current || selectedId === arrivedId) return;
    landing.current?.kill();
    flight.current?.kill();
    isFlying.current = true;
    controls.current.enabled = false;

    if (interaction.navigationMode === "reveal") {
      setPortalPhase("materialize");
      const target = selectedRegion ? new THREE.Vector3(...selectedRegion.position) : HOME_TARGET.clone();
      const approach = selectedRegion ? target.clone().add(new THREE.Vector3(0, REVEAL_DISTANCE[selectedRegion.level] * 0.12, REVEAL_DISTANCE[selectedRegion.level])) : HOME_POSITION.clone();
      flight.current = gsap.timeline({
        onComplete: () => {
          perspectiveCamera.fov = 48;
          perspectiveCamera.updateProjectionMatrix();
          if (controls.current) { controls.current.enabled = true; controls.current.update(); }
          isFlying.current = false;
          setPortalPhase("idle");
          arrive(selectedId);
        },
      });
      flight.current.to(camera.position, { x: approach.x, y: approach.y, z: approach.z, duration: 0.72, ease: "power3.inOut" }, 0);
      flight.current.to(controls.current.target, { x: target.x, y: target.y, z: target.z, duration: 0.72, ease: "power3.inOut" }, 0);
      flight.current.to(perspectiveCamera, { fov: 37, duration: 0.46, ease: "power2.in", onUpdate: () => perspectiveCamera.updateProjectionMatrix() }, 0);
      flight.current.to(perspectiveCamera, { fov: 48, duration: 0.26, ease: "power3.out", onUpdate: () => perspectiveCamera.updateProjectionMatrix() });
      return () => { flight.current?.kill(); };
    }

    const duration = selectedRegion ? FLIGHT_TIME[selectedRegion.level] : 6.5;
    const portalDistance = selectedRegion ? PORTAL_DISTANCE[selectedRegion.level] : 2200;
    const target = selectedRegion ? new THREE.Vector3(...selectedRegion.position) : HOME_TARGET.clone();
    const approach = selectedRegion ? target.clone().add(new THREE.Vector3(0, portalDistance * 0.12, portalDistance)) : HOME_POSITION.clone();

    setPortalPhase("approach");
    flight.current = gsap.timeline({
      onComplete: () => {
        if (controls.current) {
          controls.current.enabled = true;
          controls.current.update();
        }
        isFlying.current = false;
        setPortalPhase("idle");
        arrive(selectedId);
      },
    });
    
    flight.current.to(camera.position, { x: approach.x, y: approach.y, z: approach.z, duration: duration * 0.8, ease: "power2.inOut" }, 0);
    flight.current.to(controls.current.target, { x: target.x, y: target.y, z: target.z, duration: duration * 0.8, ease: "power2.inOut" }, 0);
    
    return () => { flight.current?.kill(); };
  }, [arrive, arrivedId, camera, interaction.navigationMode, selectedId, selectedRegion, setPortalPhase, topology]);

  useRenderTask("camera-director", (_state, delta, elapsed) => {
    if (!controls.current || isFlying.current) return;
    if (!selectedId && !arrivedId) {
      const awareness = pointerPresence.current;
      controls.current.target.x = THREE.MathUtils.damp(controls.current.target.x, HOME_TARGET.x + pointer.current.x * 80 * awareness, 1.8, delta);
      controls.current.target.y = THREE.MathUtils.damp(controls.current.target.y, HOME_TARGET.y + pointer.current.y * 50 * awareness, 1.8, delta);
      camera.position.x += Math.sin(elapsed * 0.085) * delta * 0.08;
      camera.position.y += Math.cos(elapsed * 0.07) * delta * 0.05;
    }
    controls.current.update();
  }, 30);

  return <OrbitControls ref={controls} enableDamping dampingFactor={warpZoom ? 0.075 : 0.045} enablePan={true} enableRotate={true} enableZoom={true} maxDistance={viewLimits.max} minDistance={viewLimits.min} onStart={takeCameraControl} panSpeed={warpZoom ? 1.15 : 0.72} rotateSpeed={0.45} screenSpacePanning target={HOME_TARGET} zoomSpeed={warpZoom ? 3.4 : 0.72} zoomToCursor />;
}
