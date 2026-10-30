export type ProtectionMode = "firewall" | "proxy" | "sidecar";

export type TrafficKind = "prompt" | "api" | "tool" | "memory" | "workflow";

export type TrafficVerdict = "pass" | "deflect";

export type ThreatClass =
  | "prompt-injection"
  | "credential"
  | "private-key"
  | "policy"
  | "rate-limit"
  | "fail-closed";

export type FoundationLink = {
  llmLabel: string;
  modelId: string;
  protection: ProtectionMode;
  connectedAt: number;
};

export type FoundationEvent = {
  id: string;
  at: number;
  kind: TrafficKind;
  verdict: TrafficVerdict;
  threat?: ThreatClass;
};

export type FoundationSnapshot = {
  connected: boolean;
  link: FoundationLink | null;
  counts: { pass: number; deflect: number };
  events: FoundationEvent[];
};

const EVENT_LIMIT = 48;
const protections = new Set<ProtectionMode>(["firewall", "proxy", "sidecar"]);
const kinds = new Set<TrafficKind>(["prompt", "api", "tool", "memory", "workflow"]);

type TenantFoundation = {
  link: FoundationLink;
  events: FoundationEvent[];
  pass: number;
  deflect: number;
};

const foundations = new Map<string, TenantFoundation>();

export function isProtectionMode(value: unknown): value is ProtectionMode {
  return typeof value === "string" && protections.has(value as ProtectionMode);
}

export function isTrafficKind(value: unknown): value is TrafficKind {
  return typeof value === "string" && kinds.has(value as TrafficKind);
}

export function threatFromReason(reason: string | undefined): ThreatClass {
  if (!reason) return "policy";
  if (/private key/i.test(reason)) return "private-key";
  if (/credential/i.test(reason)) return "credential";
  if (/prompt-injection|injection/i.test(reason)) return "prompt-injection";
  if (/rate limit/i.test(reason)) return "rate-limit";
  if (/fail closed|unavailable|not configured/i.test(reason)) return "fail-closed";
  return "policy";
}

export function readFoundation(tenantId: string): FoundationSnapshot {
  const current = foundations.get(tenantId);
  if (!current) return { connected: false, link: null, counts: { pass: 0, deflect: 0 }, events: [] };
  return {
    connected: true,
    link: current.link,
    counts: { pass: current.pass, deflect: current.deflect },
    events: current.events.slice(),
  };
}

export function connectFoundation(tenantId: string, link: Omit<FoundationLink, "connectedAt">): FoundationSnapshot {
  foundations.set(tenantId, {
    link: { ...link, connectedAt: Date.now() },
    events: [],
    pass: 0,
    deflect: 0,
  });
  return readFoundation(tenantId);
}

export function disconnectFoundation(tenantId: string): FoundationSnapshot {
  foundations.delete(tenantId);
  return readFoundation(tenantId);
}

export function projectFoundationTraffic(
  tenantId: string,
  kind: TrafficKind,
  decision: { allowed: boolean; reason?: string },
): FoundationEvent | null {
  if (!tenantId || tenantId.startsWith("__")) return null;
  const current = foundations.get(tenantId);
  if (!current) return null;
  const verdict: TrafficVerdict = decision.allowed ? "pass" : "deflect";
  const event: FoundationEvent = {
    id: crypto.randomUUID(),
    at: Date.now(),
    kind,
    verdict,
    threat: verdict === "deflect" ? threatFromReason(decision.reason) : undefined,
  };
  current.events.push(event);
  if (current.events.length > EVENT_LIMIT) current.events.splice(0, current.events.length - EVENT_LIMIT);
  if (verdict === "pass") current.pass += 1;
  else current.deflect += 1;
  return event;
}
