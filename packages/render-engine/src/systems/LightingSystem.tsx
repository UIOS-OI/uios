"use client";

export function LightingSystem() {
  return (
    <>
      <ambientLight intensity={0.18} color="#8596ff" />
      <directionalLight position={[4, 6, 5]} intensity={1.7} color="#d9e8ff" />
      <pointLight position={[-4, -1, 2]} intensity={26} distance={10} color="#3d43ff" />
      <pointLight position={[3, 1, 1]} intensity={20} distance={9} color="#9b36ff" />
    </>
  );
}
