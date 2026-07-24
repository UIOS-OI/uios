"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./universe-experience.module.css";
import { useLivingAudio } from "./use-living-audio";
import { WorkspaceSession } from "./workspace-session";
import { UiosPlayground } from "./uios-playground";
import { UiosCommandCenter } from "./uios-command-center";
import { UsagePanel } from "./usage-panel";
import { ApiKeyConsole } from "./api-key-console";
import { SystemReadiness } from "./system-readiness";

const SceneManager = dynamic(
  () => import("@uios/render-engine").then((mod) => mod.SceneManager),
  { ssr: false },
);

export function UniverseExperience() {
  const video = useRef<HTMLVideoElement>(null);
  const hasCrossedPortal = useRef(false);
  const reduceMotion = useReducedMotion();
  const [entered, setEntered] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [performance, setPerformance] = useState(1);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeZoneLabel, setActiveZoneLabel] = useState("Root Universe");
  const [arrivalNotice, setArrivalNotice] = useState<string | null>(null);
  const [documentReader, setDocumentReader] = useState<{ title: string; path: string; content?: string; error?: string } | null>(null);
  const [intent, setIntent] = useState("");
  const [warpZoom, setWarpZoom] = useState(true);
  const [activityLabel, setActivityLabel] = useState("Listening for intelligence activity");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const { disable: disableAudio, enable: enableAudio, enabled: audioEnabled } = useLivingAudio(activeRegion);
  const enterUniverse = useCallback(() => setEntered(true), []);
  const travelOutward = useCallback(() => window.dispatchEvent(new Event("uios:navigate-back")), []);
  useEffect(() => {
    const stored = window.localStorage.getItem("uios.warp-zoom.v1");
    if (stored === "off") setWarpZoom(false);
  }, []);

  const toggleWarpZoom = useCallback(() => {
    setWarpZoom((current) => {
      const enabled = !current;
      window.localStorage.setItem("uios.warp-zoom.v1", enabled ? "on" : "off");
      window.dispatchEvent(new CustomEvent("uios:warp-zoom", { detail: { enabled } }));
      return enabled;
    });
  }, []);

  useEffect(() => {
    if (entered || reduceMotion) return;
    const playback = video.current?.play();
    void playback?.catch(() => setBlocked(true));
  }, [entered, reduceMotion]);

  const startIntro = useCallback(() => {
    setBlocked(false);
    void video.current?.play().catch(() => setBlocked(true));
  }, []);

  useEffect(() => {
    if (!activeRegion) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (documentReader) setDocumentReader(null);
      else travelOutward();
    };
    window.addEventListener("keydown", navigate);
    return () => {
      window.removeEventListener("keydown", navigate);
    };
  }, [activeRegion, documentReader, travelOutward]);

  useEffect(() => {
    const openDocument = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; title?: string }>).detail;
      if (!detail?.path || !detail.title) return;
      setDocumentReader({ path: detail.path, title: detail.title });
      void fetch(`/api/universe/document?path=${encodeURIComponent(detail.path)}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as { content?: string; error?: string; path?: string; title?: string };
          if (!response.ok || !payload.content) throw new Error(payload.error ?? "The Memory artifact could not be opened.");
          setDocumentReader({ content: payload.content, path: payload.path ?? detail.path!, title: payload.title ?? detail.title! });
        })
        .catch((error: unknown) => setDocumentReader({ error: error instanceof Error ? error.message : "The Memory artifact could not be opened.", path: detail.path!, title: detail.title! }));
    };
    window.addEventListener("uios:open-document", openDocument);
    return () => window.removeEventListener("uios:open-document", openDocument);
  }, []);
  const handleRegionChange = useCallback((regionId: string | null, arrived: boolean, label?: string) => {
    setActiveRegion(regionId);
    if (regionId) {
      const destination = label ?? regionId.replace(/-/g, " ");
      if (arrived) {
        hasCrossedPortal.current = true;
        setActiveZoneLabel(destination);
        setArrivalNotice(destination);
      } else setArrivalNotice(null);
      setActivityLabel(arrived ? `${destination} coordinate space reached` : `Departing for ${destination}`);
    } else {
      if (arrived) {
        setActiveZoneLabel("Root Universe");
        if (hasCrossedPortal.current) setArrivalNotice("Root Universe");
      } else setArrivalNotice(null);
      setActivityLabel(arrived ? "Universe coordinate space reached" : "Travelling outward to the Universe");
    }
  }, []);

  useEffect(() => {
    if (!arrivalNotice) return;
    const timeout = window.setTimeout(() => setArrivalNotice(null), 20000);
    return () => window.clearTimeout(timeout);
  }, [arrivalNotice]);
  const toggleSound = useCallback(() => {
    if (audioEnabled) {
      disableAudio();
      setMuted(true);
    } else {
      enableAudio();
      setMuted(false);
    }
  }, [audioEnabled, disableAudio, enableAudio]);
  const revealIntent = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = intent.trim();
    if (!query) return;
    window.dispatchEvent(new CustomEvent("uios:intent-reveal", { detail: { query } }));
    setActivityLabel(`Core is revealing: ${query}`);
    setIntent("");
  }, [intent]);

  useEffect(() => {
    const describe = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; phase?: string }>).detail;
      if (!detail?.kind) return;
      const action = detail.kind.replace(".", " ");
      setActivityLabel(detail.phase === "complete" ? `${action} returned through the fabric` : detail.phase === "error" ? `${action} diverted through Aegis` : `${action} pulse moving through the fabric`);
    };
    window.addEventListener("uios:activity", describe);
    return () => window.removeEventListener("uios:activity", describe);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.visibilityField} aria-hidden="true" />
      <SceneManager className={styles.canvas} onPerformanceChange={setPerformance} onRegionChange={handleRegionChange} />

      <header className={styles.statusRail}>
        <a href="/" className={styles.identity} aria-label="UIOS intelligence universe">
          <span>UI</span><i />S
          <small>The Fabric of Intelligence</small>
        </a>
        <div className={styles.telemetry} aria-live="polite">
          <span><i /> Universe active</span>
          <span>{performance >= 0.5 ? "Adaptive 60 FPS target" : "Economy render mode"}</span>
          <button className={`${styles.audioControl} ${dashboardOpen ? styles.warpActive : ""}`} onClick={() => setDashboardOpen(!dashboardOpen)} type="button">{dashboardOpen ? "✕ Close control panel" : "⚙ Control panel"}</button>
          <button className={styles.audioControl} onClick={toggleSound} type="button">{audioEnabled ? "Mute living audio" : "Enable living audio"}</button>
          <button aria-pressed={warpZoom} className={`${styles.audioControl} ${warpZoom ? styles.warpActive : ""}`} onClick={toggleWarpZoom} type="button">Warp zoom {warpZoom ? "on" : "off"}</button>
          <button className={styles.audioControl} onClick={() => { setBlocked(false); setEntered(false); }} type="button">Play cinematic intro</button>
        </div>
      </header>

      <div className={styles.guidance}>
        <span>Drag to look</span>
        <span>{activeRegion ? "Select an object to reveal its reality layer" : "Select a system to reveal it"}</span>
        <span>{warpZoom ? "Wheel warp zoom toward cursor" : "Wheel precision zoom"} · drag to orbit</span>
      </div>
      {activeRegion ? <button className={styles.navigationControl} onClick={travelOutward} type="button">← Travel outward</button> : null}
      <div className={styles.livingSignal} aria-live="polite"><i />{activityLabel}</div>
      <div className={styles.zoneBadge} aria-label={`Current zone: ${activeZoneLabel}`}>
        <span>Current zone</span>
        <strong>{activeZoneLabel}</strong>
      </div>
      <form className={styles.intentBar} onSubmit={revealIntent}>
        <i />
        <input aria-label="Ask UIOS to reveal a reality layer" onChange={(event) => setIntent(event.target.value)} placeholder="Ask the Core to reveal engineering docs…" value={intent} />
        <button type="submit">Reveal</button>
      </form>

      <AnimatePresence>
        {arrivalNotice ? (
          <motion.aside
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={styles.arrivalNotice}
            exit={{ opacity: 0, y: -12, scale: .97 }}
            initial={{ opacity: 0, y: 18, scale: .96 }}
            key={arrivalNotice}
            transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span>Universe entered</span>
            <h1>{arrivalNotice}</h1>
            <p>Wheel to zoom · drag to orbit · right-drag to pan</p>
            <small>To go back: press Esc, select Travel Outward, or click the Intelligence Core.</small>
            <button onClick={() => setArrivalNotice(null)} type="button">Continue exploring</button>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {dashboardOpen ? (
          <motion.div
            animate={{ x: 0, opacity: 1 }}
            className={styles.dashboardDrawer}
            exit={{ x: -440, opacity: 0 }}
            initial={{ x: -440, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className={styles.drawerHeader}>
              <h2>UIOS Control Panel</h2>
              <button className={styles.drawerClose} onClick={() => setDashboardOpen(false)} type="button">✕</button>
            </header>
            <div className={styles.drawerBody}>
              <WorkspaceSession />
              <UiosPlayground />
              <UiosCommandCenter />
              <UsagePanel />
              <ApiKeyConsole />
              <SystemReadiness />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {documentReader ? (
          <motion.aside animate={{ opacity: 1, scale: 1 }} className={styles.documentReader} exit={{ opacity: 0, scale: .98 }} initial={{ opacity: 0, scale: .98 }} transition={{ duration: .25 }}>
            <header>
              <div><span>Memory artifact</span><h2>{documentReader.title}</h2><small>{documentReader.path}</small></div>
              <button onClick={() => setDocumentReader(null)} type="button" aria-label="Close document reader">×</button>
            </header>
            <div className={styles.documentContent}>
              {documentReader.error ? <p className={styles.documentError}>{documentReader.error}</p> : documentReader.content ? <pre>{documentReader.content}</pre> : <p>Memory is resolving this artifact…</p>}
            </div>
            <footer>Press Esc to close · Source content is read-only</footer>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!entered ? (
          <motion.section
            animate={{ opacity: 1 }}
            className={styles.intro}
            exit={{ opacity: 0, transition: { duration: 1.15, ease: "easeInOut" } }}
            initial={{ opacity: 1 }}
            key="universe-intro"
          >
            <video
              ref={video}
              autoPlay
              className={styles.introVideo}
              muted={muted}
              onEnded={enterUniverse}
              onError={enterUniverse}
              playsInline
              preload="auto"
            >
              <source src="/media/uios-intro.mp4" type="video/mp4" />
            </video>
            <div className={styles.introVignette} />
            {blocked ? <button className={styles.enterButton} onClick={startIntro} type="button">Enter the intelligence universe</button> : null}
            <div className={styles.introControls}>
              <button onClick={toggleSound} type="button">{audioEnabled ? "Mute universe" : "Enable living audio"}</button>
              <button onClick={enterUniverse} type="button">Skip introduction</button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
