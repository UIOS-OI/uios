"use client";

export type UniverseEventKind =
  | "agent.run"
  | "chat.request"
  | "document.upload"
  | "memory.read"
  | "memory.write"
  | "security.event"
  | "workflow.complete";

export function emitUniverseActivity(
  kind: UniverseEventKind,
  phase: "start" | "complete" | "error",
  route: string[],
  intensity = 0.72,
) {
  if (typeof window === "undefined") return;
  const detail = {
    id: crypto.randomUUID(),
    kind,
    phase,
    route: route.slice(0, 8),
    startedAt: Date.now(),
    intensity: Math.min(1, Math.max(0.2, intensity)),
  };
  sessionStorage.setItem("uios.universe.activity.v1", JSON.stringify(detail));
  window.dispatchEvent(new CustomEvent("uios:activity", { detail }));
}
