"use client";

import { SceneManager } from "@uios/render-engine";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import styles from "./render-engine.module.css";

export function RenderEnginePreview() {
  const reduceMotion = useReducedMotion();
  const [performance, setPerformance] = useState(1);

  return (
    <main className={styles.page}>
      <SceneManager className={styles.canvas} onPerformanceChange={setPerformance} />
      <motion.header
        className={styles.header}
        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35 }}
      >
        <span>UIOS / RENDER ENGINE</span>
        <span>{performance >= 0.5 ? "60 FPS TARGET" : "ADAPTIVE MODE"}</span>
      </motion.header>
      <motion.section
        className={styles.intro}
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.7 }}
      >
        <p>REAL-TIME VISUAL SYSTEM</p>
        <h1>THE FABRIC,<br />RENDERED.</h1>
        <small>Drag to orbit. Scroll to zoom. Select a region.</small>
      </motion.section>
    </main>
  );
}
