"use client";

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const UIOS_ACTIVITY_EVENT = "uios:activity";

export type UniverseActivityKind =
  | "agent.run"
  | "chat.request"
  | "document.upload"
  | "memory.read"
  | "memory.write"
  | "security.event"
  | "workflow.complete";

export type UniverseActivityPhase = "start" | "complete" | "error";

export type UniverseActivity = {
  id: string;
  kind: UniverseActivityKind;
  phase: UniverseActivityPhase;
  route: string[];
  startedAt: number;
  intensity: number;
};

export type IntelligenceWeather = "calm" | "flowing" | "surge" | "guarded";
export type UniverseTime = "dawn" | "day" | "dusk" | "night";

type UniverseActivityState = {
  pulses: UniverseActivity[];
  activityLevel: MutableRefObject<number>;
  weather: IntelligenceWeather;
  time: UniverseTime;
};

const ActivityContext = createContext<UniverseActivityState>({
  pulses: [],
  activityLevel: { current: 0 },
  weather: "calm",
  time: "night",
});

const VALID_KINDS = new Set<UniverseActivityKind>([
  "agent.run", "chat.request", "document.upload", "memory.read", "memory.write", "security.event", "workflow.complete",
]);
const VALID_PHASES = new Set<UniverseActivityPhase>(["start", "complete", "error"]);

function timeFromHour(hour: number): UniverseTime {
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "dusk";
  return "night";
}

function parseActivity(value: unknown): UniverseActivity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UniverseActivity>;
  if (!candidate.kind || !VALID_KINDS.has(candidate.kind)) return null;
  if (!candidate.phase || !VALID_PHASES.has(candidate.phase)) return null;
  const route = Array.isArray(candidate.route)
    ? candidate.route.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9._-]{2,72}$/.test(id)).slice(0, 8)
    : [];
  if (route.length < 2) return null;
  return {
    id: typeof candidate.id === "string" ? candidate.id.slice(0, 96) : crypto.randomUUID(),
    kind: candidate.kind,
    phase: candidate.phase,
    route,
    startedAt: Number.isFinite(candidate.startedAt) ? Number(candidate.startedAt) : Date.now(),
    intensity: Math.min(1, Math.max(0.2, Number(candidate.intensity) || 0.72)),
  };
}

export function UniverseActivityManager({ children }: { children: ReactNode }) {
  const [pulses, setPulses] = useState<UniverseActivity[]>([]);
  const [time, setTime] = useState<UniverseTime>(() => timeFromHour(new Date().getHours()));
  const activityLevel = useRef(0);

  useEffect(() => {
    const recent = sessionStorage.getItem("uios.universe.activity.v1");
    if (recent) {
      try {
        const parsed = parseActivity(JSON.parse(recent));
        if (parsed && Date.now() - parsed.startedAt < 30_000) setPulses([parsed]);
      } catch { /* Ignore malformed or stale visual telemetry. */ }
    }

    const receive = (event: Event) => {
      const parsed = parseActivity((event as CustomEvent<unknown>).detail);
      if (!parsed) return;
      activityLevel.current = Math.min(1, activityLevel.current + parsed.intensity * 0.72);
      setPulses((current) => [...current.filter((pulse) => Date.now() - pulse.startedAt < 14_000), parsed].slice(-8));
    };
    window.addEventListener(UIOS_ACTIVITY_EVENT, receive);
    return () => window.removeEventListener(UIOS_ACTIVITY_EVENT, receive);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      activityLevel.current *= 0.84;
      setPulses((current) => current.filter((pulse) => Date.now() - pulse.startedAt < 14_000));
      setTime(timeFromHour(new Date().getHours()));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const weather = useMemo<IntelligenceWeather>(() => {
    if (pulses.some((pulse) => pulse.kind === "security.event" || pulse.phase === "error")) return "guarded";
    if (pulses.length >= 5) return "surge";
    if (pulses.length > 0) return "flowing";
    return "calm";
  }, [pulses]);
  const value = useMemo(() => ({ activityLevel, pulses, time, weather }), [pulses, time, weather]);
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useUniverseActivity() {
  return useContext(ActivityContext);
}
