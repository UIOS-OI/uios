"use client";

import dynamic from "next/dynamic";
import type { FoundationTrafficSample, FoundationUniverseLink } from "@uios/render-engine";
import styles from "./foundation-experience.module.css";

const SceneManager = dynamic(() => import("@uios/render-engine").then((mod) => mod.SceneManager), { ssr: false });
const FoundationUniverse = dynamic(() => import("@uios/render-engine").then((mod) => mod.FoundationUniverse), { ssr: false });

const cameraHome = {
  position: [16, 7.2, 28] as [number, number, number],
  intro: [42, 20, 74] as [number, number, number],
  fov: 42,
  minDistance: 11,
  maxDistance: 220,
  introDuration: 2.4,
};

export function FoundationCanvas({
  link,
  events,
  reducedMotion,
}: {
  link: FoundationUniverseLink | null;
  events: FoundationTrafficSample[];
  reducedMotion: boolean;
}) {
  return (
    <SceneManager
      className={styles.canvas}
      cameraFar={4000}
      cameraHome={cameraHome}
      cameraNear={0.08}
      cameraPosition={cameraHome.intro}
    >
      <FoundationUniverse events={events} link={link} reducedMotion={reducedMotion} />
    </SceneManager>
  );
}
