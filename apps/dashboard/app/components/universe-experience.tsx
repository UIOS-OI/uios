"use client";

import dynamic from "next/dynamic";
import styles from "./universe-experience.module.css";

const SceneManager = dynamic(
  () => import("@uios/render-engine").then((mod) => mod.SceneManager),
  { ssr: false },
);

export function UniverseExperience() {
  return (
    <main className={styles.page}>
      <SceneManager className={styles.canvas} />
      <p className={styles.cosmosHint}>
        Drag to look · wheel to dive · 1 sun · 2 world · 3 comet · 4 hole · 5 pulsar · 6 binary · click to seed · hold to grow · drag off a body to launch · [ ] time · space pause · F follow · R reset
      </p>
    </main>
  );
}
