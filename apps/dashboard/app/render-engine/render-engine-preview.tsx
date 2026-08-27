"use client";

import { SceneManager } from "@uios/render-engine";
import styles from "./render-engine.module.css";

export function RenderEnginePreview() {
  return (
    <main className={styles.page}>
      <SceneManager className={styles.canvas} />
      <p className={styles.intro}>
        <small>Click to ignite a sun · Shift-click a black hole · Scroll into the dark</small>
      </p>
    </main>
  );
}
