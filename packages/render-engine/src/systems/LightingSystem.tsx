"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useUniverseActivity } from "../engine/UniverseActivityManager";

const LIGHT_COLORS = {
  day: new THREE.Color("#e8f7ff"),
  dusk: new THREE.Color("#dcbcff"),
  night: new THREE.Color("#92a7ff"),
  guarded: new THREE.Color("#26c8ff"),
  surge: new THREE.Color("#ff72d2"),
  flowing: new THREE.Color("#9b36ff"),
};

export function LightingSystem() {
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const coreFill = useRef<THREE.PointLight>(null);
  const activityFill = useRef<THREE.PointLight>(null);
  const activity = useUniverseActivity();

  useRenderTask("living-lighting", (_state, delta) => {
    const level = activity.activityLevel.current;
    if (keyLight.current) {
      const day = activity.time === "day" || activity.time === "dawn";
      keyLight.current.intensity = THREE.MathUtils.damp(keyLight.current.intensity, day ? 2.15 : 1.45, 1.4, delta);
      keyLight.current.color.lerp(activity.time === "dusk" ? LIGHT_COLORS.dusk : day ? LIGHT_COLORS.day : LIGHT_COLORS.night, delta * 0.6);
    }
    if (coreFill.current) coreFill.current.intensity = THREE.MathUtils.damp(coreFill.current.intensity, 160000 + level * 90000, 2, delta);
    if (activityFill.current) {
      activityFill.current.intensity = THREE.MathUtils.damp(activityFill.current.intensity, 90000 + level * 170000, 2.4, delta);
      activityFill.current.color.lerp(activity.weather === "guarded" ? LIGHT_COLORS.guarded : activity.weather === "surge" ? LIGHT_COLORS.surge : LIGHT_COLORS.flowing, delta * 1.2);
    }
  }, -5);

  return (
    <>
      <ambientLight intensity={0.48} color="#a9c5ff" />
      <directionalLight ref={keyLight} position={[900, 1200, 900]} intensity={1.7} color="#d9e8ff" />
      <pointLight ref={coreFill} position={[-900, -200, -600]} intensity={160000} distance={2200} decay={2} color="#3d43ff" />
      <pointLight ref={activityFill} position={[1100, 300, -1400]} intensity={120000} distance={2400} decay={2} color="#9b36ff" />
    </>
  );
}
