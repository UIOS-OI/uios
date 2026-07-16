"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRenderTask } from "../engine/RenderLoop";
import { useGalaxyTopology, type GalaxyDescriptor } from "../engine/UniverseManager";
import { useInteractionSystem } from "./InteractionSystem";

const CORE_ORIGIN = new THREE.Vector3(0, 0, -720);
const TUBE_SEGMENTS = 64;
const TUBE_RADIUS = 140;
const TUBE_RADIAL_SEGMENTS = 6;
const PACKETS_PER_STREAM = 12;

function buildStreamCurve(galaxy: GalaxyDescriptor, index: number): THREE.CatmullRomCurve3 {
  const target = new THREE.Vector3(...galaxy.position);
  const dist = CORE_ORIGIN.distanceTo(target);
  const mid1 = CORE_ORIGIN.clone().lerp(target, 0.33);
  const mid2 = CORE_ORIGIN.clone().lerp(target, 0.66);
  mid1.x += Math.sin(index * 2.1 + 0.5) * dist * 0.09;
  mid1.y += Math.cos(index * 1.4) * dist * 0.07;
  mid2.x += Math.cos(index * 1.8 + 1.2) * dist * 0.06;
  mid2.y += Math.sin(index * 2.3) * dist * 0.05;
  return new THREE.CatmullRomCurve3([CORE_ORIGIN, mid1, mid2, target], false, "catmullrom", 0.5);
}

type StreamDef = {
  curve: THREE.CatmullRomCurve3;
  color: THREE.Color;
  galaxy: GalaxyDescriptor;
};

export function FluidConnectionSystem() {
  const { galaxies } = useGalaxyTopology();
  const interaction = useInteractionSystem();
  const packetMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const streams = useMemo<StreamDef[]>(
    () => galaxies.map((galaxy, index) => ({
      curve: buildStreamCurve(galaxy, index),
      color: new THREE.Color(galaxy.color),
      galaxy,
    })),
    [galaxies],
  );

  const tubes = useMemo(
    () => streams.map((stream) => ({
      geometry: new THREE.TubeGeometry(stream.curve, TUBE_SEGMENTS, TUBE_RADIUS, TUBE_RADIAL_SEGMENTS, false),
      material: new THREE.MeshBasicMaterial({
        color: stream.color,
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    })),
    [streams],
  );

  const totalPackets = streams.length * PACKETS_PER_STREAM;

  useRenderTask("fluid-connections", (state) => {
    const mesh = packetMeshRef.current;
    if (!mesh || streams.length === 0) return;
    const elapsed = state.clock.elapsedTime;
    streams.forEach((stream, si) => {
      for (let pi = 0; pi < PACKETS_PER_STREAM; pi++) {
        const instanceIndex = si * PACKETS_PER_STREAM + pi;
        const phase = ((pi / PACKETS_PER_STREAM) + elapsed * 0.032) % 1;
        const pos = stream.curve.getPointAt(phase);
        const size = 180 + Math.sin(elapsed * 3.1 + pi * 0.9) * 70;
        dummy.position.copy(pos);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        mesh.setMatrixAt(instanceIndex, dummy.matrix);
        const brightness = 0.5 + 0.5 * Math.sin(elapsed * 4.2 + pi * 1.1 + si * 0.7);
        const c = stream.color.clone().multiplyScalar(brightness);
        mesh.setColorAt(instanceIndex, c);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, 40);

  if (streams.length === 0) return null;

  return (
    <group>
      {tubes.map((tube, index) => (
        <mesh
          key={streams[index]!.galaxy.id}
          geometry={tube.geometry}
          material={tube.material}
          onClick={() => interaction.select(streams[index]!.galaxy.id)}
        />
      ))}
      {totalPackets > 0 && (
        <instancedMesh
          ref={packetMeshRef}
          args={[undefined, undefined, totalPackets]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 5, 5]} />
          <meshBasicMaterial
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </group>
  );
}
