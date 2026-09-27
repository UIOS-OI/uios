"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type ElementRef, useLayoutEffect, useRef } from "react";
import * as THREE from "three";

const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const DEFAULT_HOME = new THREE.Vector3(2400, 2800, 14800);
const DEFAULT_INTRO = new THREE.Vector3(8000, 18000, 64000);

export type CameraHome = {
  position?: [number, number, number];
  intro?: [number, number, number];
  fov?: number;
  minDistance?: number;
  maxDistance?: number;
  introDuration?: number;
};

export function CameraManager({ home }: { home?: CameraHome }) {
  const camera = useThree((state) => state.camera);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const landing = useRef<gsap.core.Timeline | null>(null);
  const isFlying = useRef(true);

  const homeX = home?.position?.[0] ?? DEFAULT_HOME.x;
  const homeY = home?.position?.[1] ?? DEFAULT_HOME.y;
  const homeZ = home?.position?.[2] ?? DEFAULT_HOME.z;
  const introX = home?.intro?.[0] ?? DEFAULT_INTRO.x;
  const introY = home?.intro?.[1] ?? DEFAULT_INTRO.y;
  const introZ = home?.intro?.[2] ?? DEFAULT_INTRO.z;
  const homeFov = home?.fov ?? 50;
  const introDuration = home?.introDuration ?? 3.1;

  useLayoutEffect(() => {
    if (!controls.current) return;
    camera.position.set(introX, introY, introZ);
    controls.current.target.set(0, 0, 0);
    perspectiveCamera.fov = homeFov + 8;
    perspectiveCamera.updateProjectionMatrix();
    controls.current.update();
    landing.current = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => {
        isFlying.current = false;
      },
    });
    landing.current.to(camera.position, { x: homeX, y: homeY, z: homeZ, duration: introDuration }, 0);
    landing.current.to(controls.current.target, { x: HOME_TARGET.x, y: HOME_TARGET.y, z: HOME_TARGET.z, duration: introDuration }, 0);
    landing.current.to(perspectiveCamera, {
      fov: homeFov,
      duration: Math.max(1.2, introDuration - 0.5),
      onUpdate: () => perspectiveCamera.updateProjectionMatrix(),
    }, 0.2);
    return () => {
      landing.current?.kill();
    };
  }, [camera, homeFov, homeX, homeY, homeZ, introDuration, introX, introY, introZ, perspectiveCamera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.068}
      enablePan
      enableRotate
      enableZoom
      maxDistance={home?.maxDistance ?? 5200000}
      minDistance={home?.minDistance ?? 120}
      onStart={() => {
        landing.current?.kill();
        isFlying.current = false;
      }}
      panSpeed={1.05}
      rotateSpeed={0.48}
      screenSpacePanning
      target={HOME_TARGET}
      zoomSpeed={2.8}
      zoomToCursor
    />
  );
}
