"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useUniverseActivity } from "../engine/UniverseActivityManager";
import { useStreamingSectors } from "../engine/StreamingManager";
import { useInteractionSystem } from "./InteractionSystem";

const CORE = new THREE.Vector3(0, 0, -720);
const SEGMENTS = 72;
const PACKETS_PER_CURRENT = 5;
const PULSE_COLORS = {
  active: new THREE.Color("#ffffff"),
  complete: new THREE.Color("#9effd7"),
  error: new THREE.Color("#43d7ff"),
};

type Current = {
  curve: THREE.CatmullRomCurve3;
  color: THREE.Color;
  phase: number;
  target: THREE.Vector3;
};

function buildCurrent(target: THREE.Vector3, index: number, color: string): Current {
  const midpoint = CORE.clone().lerp(target, 0.5);
  const distance = CORE.distanceTo(target);
  midpoint.x += Math.sin(index * 2.1) * distance * 0.12;
  midpoint.y += Math.cos(index * 1.7) * distance * 0.1;
  midpoint.z += Math.sin(index * 0.8) * distance * 0.07;
  return {
    curve: new THREE.CatmullRomCurve3([CORE, midpoint, target], false, "catmullrom", 0.58),
    color: new THREE.Color(color),
    phase: (index * 0.173) % 1,
    target,
  };
}

export function IntelligenceCurrentSystem() {
  const activity = useUniverseActivity();
  const interaction = useInteractionSystem();
  const streaming = useStreamingSectors();
  const packets = useRef<THREE.Points>(null);
  const activityPackets = useRef<THREE.Points>(null);
  const projected = useRef(new THREE.Vector3());
  const currents = useMemo(
    () => streaming.visibleRegions.map((region, index) => buildCurrent(new THREE.Vector3(...region.position), index, region.color)),
    [streaming.visibleRegions],
  );
  const lines = useMemo(() => currents.map((current) => {
    const points = current.curve.getPoints(SEGMENTS);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const colors = new Float32Array(points.length * 3);
    for (let index = 0; index < points.length; index += 1) {
      const strength = 0.25 + index / Math.max(1, points.length - 1) * 0.75;
      colors[index * 3] = current.color.r * strength;
      colors[index * 3 + 1] = current.color.g * strength;
      colors[index * 3 + 2] = current.color.b * strength;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.32,
      transparent: true,
      vertexColors: true,
    });
    return new THREE.Line(geometry, material);
  }), [currents]);
  const packetGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(currents.length * PACKETS_PER_CURRENT * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(currents.length * PACKETS_PER_CURRENT * 3), 3));
    return geometry;
  }, [currents.length]);
  const activityGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const regionPositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>([["core", CORE], ["workspace", CORE]]);
    for (const region of streaming.visibleRegions) positions.set(region.id, new THREE.Vector3(...region.position));
    return positions;
  }, [streaming.visibleRegions]);

  useEffect(() => () => {
    for (const line of lines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  }, [lines]);

  useRenderTask("intelligence-currents", (state, _delta, elapsed) => {
    const geometry = packets.current?.geometry;
    if (!geometry) return;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    let cursor = 0;
    const flowSpeed = 1 + activity.activityLevel.current * 2.4;
    for (let currentIndex = 0; currentIndex < currents.length; currentIndex += 1) {
      const current = currents[currentIndex];
      const ndc = projected.current.copy(current.target).project(state.camera);
      const pointerDistance = Math.hypot(ndc.x - interaction.pointer.current.x, ndc.y - interaction.pointer.current.y);
      const localAwareness = Math.max(0, 1 - pointerDistance / 0.55) * interaction.pointerPresence.current;
      const material = lines[currentIndex]?.material as THREE.LineBasicMaterial | undefined;
      if (material) material.opacity = 0.3 + localAwareness * 0.42 + activity.activityLevel.current * 0.26;
      for (let packet = 0; packet < PACKETS_PER_CURRENT; packet += 1) {
        const progress = (elapsed * (0.025 + packet * 0.004) * flowSpeed + current.phase + packet / PACKETS_PER_CURRENT) % 1;
        const point = current.curve.getPointAt(progress);
        positions.setXYZ(cursor, point.x, point.y, point.z);
        const pulse = 0.65 + Math.sin(progress * Math.PI) * 0.7;
        colors.setXYZ(cursor, current.color.r * pulse, current.color.g * pulse, current.color.b * pulse);
        cursor += 1;
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;

    const pulseGeometry = activityPackets.current?.geometry;
    if (!pulseGeometry) return;
    const pulsePositions = pulseGeometry.getAttribute("position") as THREE.BufferAttribute;
    const pulseColors = pulseGeometry.getAttribute("color") as THREE.BufferAttribute;
    let pulseCursor = 0;
    for (const pulse of activity.pulses.slice(-8)) {
      const route = pulse.phase === "error" ? [...pulse.route, "aegis"] : pulse.route;
      const age = Math.max(0, (Date.now() - pulse.startedAt) / 1000);
      const rawProgress = (age * (pulse.phase === "complete" ? 0.58 : 0.34)) % 1;
      const progress = pulse.phase === "complete" ? 1 - rawProgress : rawProgress;
      const segmentFloat = progress * Math.max(1, route.length - 1);
      const segment = Math.min(route.length - 2, Math.floor(segmentFloat));
      const from = regionPositions.get(route[segment]);
      const to = regionPositions.get(route[segment + 1]);
      if (!from || !to) continue;
      const local = segmentFloat - segment;
      const point = projected.current.copy(from).lerp(to, local);
      point.y += Math.sin(local * Math.PI) * from.distanceTo(to) * 0.12;
      pulsePositions.setXYZ(pulseCursor, point.x, point.y, point.z);
      const color = pulse.phase === "error" ? PULSE_COLORS.error : pulse.phase === "complete" ? PULSE_COLORS.complete : PULSE_COLORS.active;
      pulseColors.setXYZ(pulseCursor, color.r * 2, color.g * 2, color.b * 2);
      pulseCursor += 1;
    }
    pulseGeometry.setDrawRange(0, pulseCursor);
    pulsePositions.needsUpdate = true;
    pulseColors.needsUpdate = true;
  }, 2);

  return (
    <group>
      {lines.map((line, index) => <primitive key={index} object={line} />)}
      <points ref={packets} geometry={packetGeometry} frustumCulled={false}>
        <pointsMaterial size={12} sizeAttenuation vertexColors transparent opacity={0.96} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points ref={activityPackets} geometry={activityGeometry} frustumCulled={false}>
        <pointsMaterial size={22} sizeAttenuation vertexColors transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}
