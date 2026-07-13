import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getUsage as readUsage, listUsageEvents as readUsageEvents, recordUsage as writeUsage, resolveApiKeyAuth, type ApiKeyRole, type UsageEvent, type UsageState } from "./state-store";
import { findWorkspace } from "./state-store";

type ChatMessage = { role: string; content: string };

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();


const workspaceSecret = process.env.UIOS_WORKSPACE_SECRET;
const developmentSecret = "uios-development-workspace-secret";

export function workspaceSecretConfigured(): boolean { return Boolean(workspaceSecret); }

const workspaceSessionTtlSeconds = 60 * 60 * 8;

export function signWorkspaceId(workspaceId: string, ttlSeconds = workspaceSessionTtlSeconds): string {
  const secret = workspaceSecret ?? (process.env.NODE_ENV === "production" ? null : developmentSecret);
  if (!secret) throw new Error("UIOS_WORKSPACE_SECRET must be configured in production.");
  const expiresAt = Math.floor(Date.now() / 1000) + Math.min(Math.max(ttlSeconds, 60), workspaceSessionTtlSeconds);
  const payload = `${workspaceId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function signWorkflowApproval(tenantId: string, workflowId: string, nodeIds: string[], ttlSeconds = 300): string {
  const secret = workspaceSecret ?? (process.env.NODE_ENV === "production" ? null : developmentSecret);
  if (!secret) throw new Error("UIOS_WORKSPACE_SECRET must be configured in production.");
  const expiresAt = Math.floor(Date.now() / 1000) + Math.min(Math.max(ttlSeconds, 30), 900);
  const payload = Buffer.from(JSON.stringify({ tenantId, workflowId, nodeIds: [...nodeIds].sort(), expiresAt })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyWorkflowApproval(token: string, tenantId: string, workflowId: string, nodeIds: string[]): boolean {
  const secret = workspaceSecret ?? (process.env.NODE_ENV === "production" ? null : developmentSecret);
  if (!secret) return false;
  const separator = token.lastIndexOf("."); if (separator < 1) return false;
  const payload = token.slice(0, separator); const provided = token.slice(separator + 1); const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try { if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return false; } catch { return false; }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { tenantId?: string; workflowId?: string; nodeIds?: string[]; expiresAt?: number };
    return parsed.tenantId === tenantId && parsed.workflowId === workflowId && JSON.stringify(parsed.nodeIds ?? []) === JSON.stringify([...nodeIds].sort()) && Number(parsed.expiresAt) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

export function resolveTenantId(request: NextRequest): string {
  return resolveAuth(request).tenantId;
}

export function resolveAuth(request: NextRequest): { tenantId: string; role: ApiKeyRole } {
  const fallback = (): { tenantId: string; role: ApiKeyRole } => process.env.NODE_ENV === "production" ? { tenantId: "__unauthenticated__", role: "viewer" } : { tenantId: "local-development", role: "owner" };
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const auth = resolveApiKeyAuth(authorization.slice(7).trim());
    if (auth) return auth;
    return { tenantId: "__invalid_api_key__", role: "viewer" };
  }
  const signed = request.cookies.get("uios_workspace")?.value;
  if (!signed) return fallback();
  const signatureSeparator = signed.lastIndexOf(".");
  const expirySeparator = signed.lastIndexOf(".", signatureSeparator - 1);
  if (signatureSeparator < 1 || expirySeparator < 1) return fallback();
  const workspaceId = signed.slice(0, expirySeparator);
  const expiresAt = Number(signed.slice(expirySeparator + 1, signatureSeparator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return fallback();
  const payload = `${workspaceId}.${expiresAt}`;
  const provided = signed.slice(signatureSeparator + 1);
  let expected: string;
  try {
    const secret = workspaceSecret ?? (process.env.NODE_ENV === "production" ? null : developmentSecret);
    if (!secret) return fallback();
    expected = createHmac("sha256", secret).update(payload).digest("base64url");
  } catch { return fallback(); }
  try {
    if (timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return { tenantId: workspaceId, role: "owner" };
  } catch {
    return fallback();
  }
  return fallback();
}

export function rejectInvalidApiKey(request: NextRequest): Response | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ") && resolveTenantId(request) === "__invalid_api_key__") return Response.json({ error: "Invalid or revoked UIOS API key." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return null;
}

export function rejectUnauthorized(request: NextRequest): Response | null {
  const invalid = rejectInvalidApiKey(request); if (invalid) return invalid;
  if (resolveAuth(request).tenantId === "__unauthenticated__") return Response.json({ error: "A signed workspace session or UIOS API key is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return null;
}

export function rejectCrossOriginMutation(request: NextRequest): Response | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin mutations are not allowed." }, { status: 403 }); } catch { return Response.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" && !request.headers.get("authorization")) return Response.json({ error: "Cross-site mutations are not allowed." }, { status: 403 });
  return null;
}

export function requireRole(request: NextRequest, allowed: ApiKeyRole[]): Response | null {
  const invalid = rejectInvalidApiKey(request); if (invalid) return invalid;
  const auth = resolveAuth(request);
  if (auth.tenantId === "__unauthenticated__") return Response.json({ error: "A signed workspace session or UIOS API key is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (!allowed.includes(auth.role)) return Response.json({ error: "This action requires an elevated workspace role." }, { status: 403 });
  return null;
}

export function estimateUnits(messages: ChatMessage[]): number {
  return Math.max(1, Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4000));
}

export function recordUsage(tenantId: string, units: number, kind: UsageEvent["kind"] = "model_request"): UsageState {
  return writeUsage(tenantId, units, kind);
}

export function getUsage(tenantId: string): UsageState {
  return readUsage(tenantId);
}

export function getPlanLimit(tenantId: string): number {
  const workspace = findWorkspace(tenantId);
  if (workspace?.plan === "enterprise") return Number(process.env.UIOS_ENTERPRISE_PLAN_LIMIT_UNITS ?? Number.MAX_SAFE_INTEGER);
  if (workspace?.plan === "scale") return Number(process.env.UIOS_SCALE_PLAN_LIMIT_UNITS ?? 25_000);
  return Number(process.env.UIOS_PLAN_LIMIT_UNITS ?? 1_000);
}

export function getWorkspacePlan(tenantId: string): "builder" | "scale" | "enterprise" {
  return findWorkspace(tenantId)?.plan ?? "builder";
}

export function listUsageEvents(tenantId: string, limit = 50): UsageEvent[] {
  return readUsageEvents(tenantId, limit);
}

export function checkRateLimit(tenantId: string, bucket = "inference"): { allowed: boolean; retryAfterSeconds: number } {
  const limit = Math.max(1, Number(process.env.UIOS_RATE_LIMIT_PER_MINUTE ?? 30));
  const key = `${bucket}:${tenantId}`;
  const now = Date.now();
  if (rateWindows.size > 10_000) {
    for (const [windowKey, window] of rateWindows) if (now - window.startedAt >= 60_000) rateWindows.delete(windowKey);
    if (rateWindows.size > 10_000) rateWindows.delete(rateWindows.keys().next().value as string);
  }
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (now - current.startedAt)) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function localAegisDecision(messages: ChatMessage[]): { allowed: boolean; reason?: string } {
  const text = messages.map((message) => message.content).join("\n");
  if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i.test(text)) return { allowed: false, reason: "Private key material cannot enter the UIOS model boundary." };
  if (/(?:api[_-]?key|secret|password)\s*[:=]\s*[^\s]{16,}/i.test(text)) return { allowed: false, reason: "Credential-like material cannot enter the UIOS model boundary." };
  if (/ignore (?:all|any|the) previous instructions|reveal the system prompt/i.test(text)) return { allowed: false, reason: "Prompt-injection pattern blocked by the Aegis policy boundary." };
  return { allowed: true };
}

export async function checkAegis(messages: ChatMessage[], tenantId = "local-development"): Promise<{ allowed: boolean; reason?: string }> {
  const local = localAegisDecision(messages);
  if (!local.allowed) return local;
  const baseUrl = process.env.UIOS_AEGIS_URL;
  const apiKey = process.env.UIOS_AEGIS_KEY;
  if (!baseUrl || !apiKey) {
    if (process.env.UIOS_AEGIS_REQUIRED === "true") return { allowed: false, reason: "Aegis is required but UIOS_AEGIS_URL/UIOS_AEGIS_KEY are not configured." };
    return local;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/proxy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "uios:model-gateway", agentTask: "Route an AI request through UIOS", payload: { messages, tenantId }, agentSessionId: `uios-${tenantId}` }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const decision = (await response.json().catch(() => ({}))) as { allowed?: boolean; message?: string };
    if (!response.ok || decision.allowed !== true) return { allowed: false, reason: decision.message ?? "Aegis returned a non-affirmative decision." };
  } catch {
    if (process.env.UIOS_AEGIS_FAIL_CLOSED === "true") return { allowed: false, reason: "Aegis was unavailable and UIOS is configured to fail closed." };
  }
  return local;
}
