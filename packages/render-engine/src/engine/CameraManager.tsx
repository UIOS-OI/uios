"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type ElementRef, useLayoutEffect, useRef } from "react";
import * as THREE from "three";

const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const HOME_POSITION = new THREE.Vector3(2400, 2800, 14800);

export function CameraManager() {
  const camera = useThree((state) => state.camera);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const landing = useRef<gsap.core.Timeline | null>(null);
  const isFlying = useRef(true);

  useLayoutEffect(() => {
    if (!controls.current) return;
    camera.position.set(8000, 18000, 64000);
    controls.current.target.set(0, 0, 0);
    perspectiveCamera.fov = 58;
    perspectiveCamera.updateProjectionMatrix();
    controls.current.update();
    landing.current = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => {
        isFlying.current = false;
      },
    });
    landing.current.to(camera.position, { x: HOME_POSITION.x, y: HOME_POSITION.y, z: HOME_POSITION.z, duration: 3.1 }, 0);
    landing.current.to(controls.current.target, { x: HOME_TARGET.x, y: HOME_TARGET.y, z: HOME_TARGET.z, duration: 3.1 }, 0);
    landing.current.to(perspectiveCamera, {
      fov: 50,
      duration: 2.6,
      onUpdate: () => perspectiveCamera.updateProjectionMatrix(),
    }, 0.2);
    return () => {
      landing.current?.kill();
    };
  }, [camera, perspectiveCamera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.068}
      enablePan
      enableRotate
      enableZoom
      maxDistance={5200000}
      minDistance={120}
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
