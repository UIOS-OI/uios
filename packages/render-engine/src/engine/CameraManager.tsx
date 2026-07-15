"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useLayoutEffect } from "react";

export function CameraManager() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    const entrance = gsap.fromTo(
      camera.position,
      { x: 0, y: 2.2, z: 12 },
      { x: 0, y: 0.6, z: 7.5, duration: 2.2, ease: "power3.out" },
    );
    return () => {
      entrance.kill();
    };
  }, [camera]);

  return (
    <>
      <PerspectiveCamera makeDefault fov={48} near={0.1} far={80} position={[0, 0.6, 7.5]} />
      <OrbitControls
        enableDamping
        enablePan={false}
        minDistance={4.4}
        maxDistance={11}
        maxPolarAngle={Math.PI * 0.72}
        minPolarAngle={Math.PI * 0.28}
      />
    </>
  );
}
