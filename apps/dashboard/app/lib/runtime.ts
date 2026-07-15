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

export async function resolveTenantId(request: NextRequest): Promise<string> {
  return (await resolveAuth(request)).tenantId;
}

export async function resolveAuth(request: NextRequest): Promise<{ tenantId: string; role: ApiKeyRole }> {
  const fallback = (): { tenantId: string; role: ApiKeyRole } => process.env.NODE_ENV === "production" ? { tenantId: "__unauthenticated__", role: "viewer" } : { tenantId: "local-development", role: "owner" };

  const tenantIdHeader = request.headers.get("x-uios-tenant-id");
  const roleHeader = request.headers.get("x-uios-role");
  const signatureHeader = request.headers.get("x-uios-signature");

  if (tenantIdHeader && roleHeader && signatureHeader) {
    const secret = workspaceSecret ?? (process.env.NODE_ENV === "production" ? null : developmentSecret);
    if (secret) {
      const expectedSignature = createHmac("sha256", secret).update(`${tenantIdHeader}:${roleHeader}`).digest("base64url");
      let matches = false;
      try {
        matches = timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
      } catch {
        matches = false;
      }
      if (matches) {
        return { tenantId: tenantIdHeader, role: roleHeader as ApiKeyRole };
      }
    }
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const auth = await resolveApiKeyAuth(authorization.slice(7).trim());
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


export async function rejectInvalidApiKey(request: NextRequest): Promise<Response | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ") && (await resolveTenantId(request)) === "__invalid_api_key__") return Response.json({ error: "Invalid or revoked UIOS API key." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return null;
}

export async function rejectUnauthorized(request: NextRequest): Promise<Response | null> {
  const invalid = await rejectInvalidApiKey(request); if (invalid) return invalid;
  const auth = await resolveAuth(request);
  if (auth.tenantId === "__unauthenticated__") return Response.json({ error: "A signed workspace session or UIOS API key is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
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

export async function requireRole(request: NextRequest, allowed: ApiKeyRole[]): Promise<Response | null> {
  const invalid = await rejectInvalidApiKey(request); if (invalid) return invalid;
  const auth = await resolveAuth(request);
  if (auth.tenantId === "__unauthenticated__") return Response.json({ error: "A signed workspace session or UIOS API key is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (!allowed.includes(auth.role)) return Response.json({ error: "This action requires an elevated workspace role." }, { status: 403 });
  return null;
}

export function estimateUnits(messages: ChatMessage[]): number {
  return Math.max(1, Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4000));
}

export async function recordUsage(tenantId: string, units: number, kind: UsageEvent["kind"] = "model_request"): Promise<UsageState> {
  return await writeUsage(tenantId, units, kind);
}

export async function getUsage(tenantId: string): Promise<UsageState> {
  return await readUsage(tenantId);
}

export async function getPlanLimit(tenantId: string): Promise<number> {
  const workspace = await findWorkspace(tenantId);
  if (workspace?.plan === "enterprise") return Number(process.env.UIOS_ENTERPRISE_PLAN_LIMIT_UNITS ?? Number.MAX_SAFE_INTEGER);
  if (workspace?.plan === "scale") return Number(process.env.UIOS_SCALE_PLAN_LIMIT_UNITS ?? 25_000);
  return Number(process.env.UIOS_PLAN_LIMIT_UNITS ?? 1_000);
}

export async function getWorkspacePlan(tenantId: string): Promise<"builder" | "scale" | "enterprise"> {
  return (await findWorkspace(tenantId))?.plan ?? "builder";
}

export async function listUsageEvents(tenantId: string, limit = 50): Promise<UsageEvent[]> {
  return await readUsageEvents(tenantId, limit);
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
