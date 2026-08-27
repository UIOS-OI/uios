"use client";

import { Html } from "@react-three/drei";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";
import { usePerformanceBudget } from "../engine/PerformanceManager";
import { useRenderTask } from "../engine/RenderLoop";

export type SpatialHtmlProps = {
  children: ReactNode;
  id: string;
  worldWidth: number;
  color?: string;
  width?: number;
  height?: number;
  occlude?: boolean;
  interactive?: boolean;
};

const worldPosition = new THREE.Vector3();
const desiredWorld = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
const towardRegion = new THREE.Vector3();
const localPosition = new THREE.Vector3();

function hashPhase(id: string) {
  let value = 2166136261;
  for (let index = 0; index < id.length; index += 1) value = Math.imul(value ^ id.charCodeAt(index), 16777619);
  return ((value >>> 0) / 4294967295) * Math.PI * 2;
}

export function orientationTowardOrigin(position: readonly [number, number, number]): [number, number, number] {
  const dummy = new THREE.Object3D();
  dummy.position.set(position[0], position[1], position[2]);
  dummy.lookAt(0, 0, 0);
  dummy.rotateY(Math.PI);
  return [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z];
}

export function SpatialHtml({
  children,
  id,
  worldWidth,
  color = "#7aa2ff",
  width = 520,
  height = 340,
  occlude = false,
  interactive = true,
}: SpatialHtmlProps) {
  const marker = useRef<THREE.Group>(null);
  const surface = useRef<THREE.Group>(null);
  const slabMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const frameMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const htmlRoot = useRef<HTMLDivElement>(null);
  const reduceMotion = useRef(false);
  const budget = usePerformanceBudget();
  const phase = useMemo(() => hashPhase(id), [id]);
  const thickness = 12;
  const htmlScale = worldWidth / width;
  const richEffects = budget.tier !== "economy";
  const skipRaycast = useMemo(() => () => undefined, []);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useRenderTask(`spatial-html-${id}`, (state, delta, elapsed) => {
    if (!marker.current || !surface.current || !surface.current.parent) return;
    marker.current.getWorldPosition(worldPosition);
    const camera = state.camera as THREE.PerspectiveCamera;
    towardRegion.copy(worldPosition).sub(camera.position);
    const distance = towardRegion.length();
    if (distance < 1) return;
    towardRegion.multiplyScalar(1 / distance);
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const foreground = 2400;
    const vFov = camera.fov * Math.PI / 180;
    const viewHeight = 2 * Math.tan(vFov / 2) * foreground;
    const targetHeight = viewHeight * 0.36;
    const readableScale = targetHeight / height;
    desiredWorld.copy(camera.position).addScaledVector(towardRegion, foreground).addScaledVector(cameraRight, targetHeight * 0.38).addScaledVector(cameraUp, -targetHeight * 0.16);
    localPosition.copy(desiredWorld);
    surface.current.parent.worldToLocal(localPosition);
    if (surface.current.userData.placed) {
      surface.current.position.lerp(localPosition, Math.min(1, delta * 6));
    } else {
      surface.current.position.copy(localPosition);
      surface.current.userData.placed = true;
    }
    surface.current.scale.setScalar(readableScale);
    surface.current.lookAt(camera.position);
    if (richEffects && !reduceMotion.current) {
      surface.current.position.y += Math.sin(elapsed * 0.55 + phase) * readableScale * 4;
    }
    const focus = THREE.MathUtils.clamp(1 - (distance - worldWidth * 2.2) / Math.max(1, worldWidth * 14), 0.42, 1);
    if (htmlRoot.current) {
      htmlRoot.current.style.opacity = String(0.72 + focus * 0.28);
      htmlRoot.current.style.filter = "none";
      htmlRoot.current.style.pointerEvents = interactive ? "auto" : "none";
    }
    if (slabMaterial.current) {
      slabMaterial.current.emissiveIntensity = 0.16 + focus * 0.34;
      slabMaterial.current.opacity = 0.58 + focus * 0.32;
    }
    if (frameMaterial.current) {
      frameMaterial.current.opacity = 0.22 + focus * 0.48;
    }
  }, 8);

  return (
    <>
      <group ref={marker} scale={htmlScale}>
        <mesh raycast={skipRaycast} renderOrder={1}>
          <boxGeometry args={[width, height, thickness]} />
          <meshStandardMaterial
            ref={slabMaterial}
            color="#07101f"
            emissive={color}
            emissiveIntensity={0.16}
            metalness={0.42}
            roughness={0.28}
            transparent
            opacity={0.82}
          />
        </mesh>
        <mesh raycast={skipRaycast} position={[0, 0, thickness / 2 + 0.4]}>
          <planeGeometry args={[width + 18, height + 18]} />
          <meshBasicMaterial
            ref={frameMaterial}
            color={color}
            transparent
            opacity={0.28}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {richEffects ? (
          <pointLight color={color} intensity={worldWidth * 4.5} distance={worldWidth * 3.2} decay={2} position={[0, 0, thickness * 4]} />
        ) : null}
      </group>
      <group ref={surface}>
        <Html
          center
          distanceFactor={400}
          occlude={occlude}
          position={[0, 0, 1]}
          style={{ height, pointerEvents: interactive ? "auto" : "none", width } satisfies CSSProperties}
          transform
          zIndexRange={[40, 0]}
        >
          <div
            className="uios-spatial-surface"
            onPointerDown={(event) => event.stopPropagation()}
            ref={htmlRoot}
            style={{ "--surface-color": color, height, width } as CSSProperties}
          >
            {children}
          </div>
        </Html>
      </group>
    </>
  );
}
