"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type ElementRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useInteractionSystem } from "../systems/InteractionSystem";
import { useRenderTask } from "./RenderLoop";
import { useUniverseActivity } from "./UniverseActivityManager";
import { useUniverseTopology, type SpatialLevel } from "./UniverseManager";

const HOME_TARGET = new THREE.Vector3(0, 0, -10000);
const HOME_POSITION = new THREE.Vector3(0, 260, 1900);
const PORTAL_DISTANCE: Record<SpatialLevel, number> = { system: 30000, planet: 5200, world: 5200, district: 5100, building: 5100, workspace: 5000, document: 5200, graph: 5200, network: 5200 };
const FLIGHT_TIME: Record<SpatialLevel, number> = { system: 9.5, planet: 8, world: 7, district: 6, building: 5.2, workspace: 4.8, document: 8, graph: 8, network: 8 };
const LOCAL_VIEW_LIMITS: Record<SpatialLevel, { min: number; max: number }> = {
  system: { min: 700, max: 900000 }, planet: { min: 400, max: 700000 }, world: { min: 160, max: 500000 },
  district: { min: 70, max: 250000 }, building: { min: 24, max: 120000 }, workspace: { min: 8, max: 900000 },
  document: { min: 700, max: 900000 }, graph: { min: 700, max: 900000 }, network: { min: 700, max: 900000 },
};

export function CameraManager() {
  const camera = useThree((state) => state.camera);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const [warpZoom, setWarpZoom] = useState(true);
  const interaction = useInteractionSystem();
  const activity = useUniverseActivity();
  const topology = useUniverseTopology();
  const { arrive, arrivedId, pointer, pointerPresence, selectedId, setPortalPhase } = interaction;
  const selectedRegion = topology.nodeById(selectedId);
  const activeRegion = topology.nodeById(arrivedId);
  const localViewEnabled = arrivedId === selectedId && interaction.portalPhase === "idle";
  const viewLimits = activeRegion ? LOCAL_VIEW_LIMITS[activeRegion.level] : { min: 280, max: 1200000 };
  const flight = useRef<gsap.core.Timeline | null>(null);
  const isFlying = useRef(false);

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
    flight.current?.kill();
    isFlying.current = true;
    controls.current.enabled = false;

    if (interaction.navigationMode === "reveal") {
      setPortalPhase("materialize");
      flight.current = gsap.timeline({
        onComplete: () => {
          camera.position.copy(HOME_POSITION);
          perspectiveCamera.fov = 48;
          perspectiveCamera.updateProjectionMatrix();
          if (controls.current) { controls.current.target.copy(HOME_TARGET); controls.current.enabled = true; controls.current.update(); }
          isFlying.current = false;
          setPortalPhase("idle");
          arrive(selectedId);
        },
      });
      flight.current.to(perspectiveCamera, { fov: 42, duration: 0.38, ease: "power2.in", onUpdate: () => perspectiveCamera.updateProjectionMatrix() });
      flight.current.to(perspectiveCamera, { fov: 50, duration: 0.52, ease: "power3.out", onUpdate: () => perspectiveCamera.updateProjectionMatrix() });
      return () => { flight.current?.kill(); };
    }

    const currentPath = arrivedId ? topology.pathTo(arrivedId) : [];
    const outbound = selectedId === null || currentPath.some((node) => node.id === selectedId);
    const duration = selectedRegion ? FLIGHT_TIME[selectedRegion.level] : 6.5;
    const portalDistance = selectedRegion ? PORTAL_DISTANCE[selectedRegion.level] : 2200;
    const start = camera.position.clone();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const target = outbound || !selectedRegion ? start.clone().addScaledVector(direction, 18000) : new THREE.Vector3(...selectedRegion.position);
    const departure = start.clone().add(start.clone().sub(target).normalize().multiplyScalar(Math.min(600, start.distanceTo(target) * 0.035)));
    const approach = target.clone().add(new THREE.Vector3(portalDistance * 0.18, portalDistance * 0.12, portalDistance));
    const threshold = target.clone().add(new THREE.Vector3(0, 0, portalDistance * 0.08));
    const inside = target.clone().addScaledVector(direction, 12000);

    setPortalPhase("approach");
    flight.current = gsap.timeline({
      onComplete: () => {
        // The tunnel masks a floating-origin rebase. Only the entered universe is mounted afterward.
        camera.position.copy(HOME_POSITION);
        if (controls.current) {
          controls.current.target.copy(HOME_TARGET);
          controls.current.enabled = true;
          controls.current.update();
        }
        isFlying.current = false;
        setPortalPhase("idle");
        arrive(selectedId);
      },
    });
    flight.current.to(camera.position, { x: departure.x, y: departure.y, z: departure.z, duration: 0.65, ease: "sine.out" });
    flight.current.to(camera.position, { x: approach.x, y: approach.y, z: approach.z, duration: duration * 0.5, ease: "power2.inOut" });
    flight.current.to(controls.current.target, { x: target.x, y: target.y, z: target.z, duration: duration * 0.5, ease: "power2.inOut" }, 0.65);
    flight.current.call(() => setPortalPhase("fracture"));
    flight.current.to(camera.position, { x: threshold.x, y: threshold.y, z: threshold.z, duration: duration * 0.18, ease: "power3.in" });
    flight.current.call(() => setPortalPhase("tunnel"));
    flight.current.to(camera.position, { x: inside.x, y: inside.y, z: inside.z, duration: duration * 0.2, ease: "power4.in" });
    flight.current.call(() => setPortalPhase("materialize"));
    flight.current.to(camera, { fov: 49.5, duration: duration * 0.07, yoyo: true, repeat: 1, onUpdate: () => camera.updateProjectionMatrix() });
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
      camera.position.z = THREE.MathUtils.damp(camera.position.z, HOME_POSITION.z - activity.activityLevel.current * 22, 0.8, delta);
    }
    controls.current.update();
  }, 30);

  return <OrbitControls ref={controls} enableDamping dampingFactor={warpZoom ? 0.065 : 0.045} enablePan={localViewEnabled} enableRotate={localViewEnabled} enableZoom={localViewEnabled} maxDistance={viewLimits.max} minDistance={viewLimits.min} panSpeed={0.9} rotateSpeed={0.45} screenSpacePanning target={HOME_TARGET} zoomSpeed={warpZoom ? 2.8 : 0.72} zoomToCursor />;
}
