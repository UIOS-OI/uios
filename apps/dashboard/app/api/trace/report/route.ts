import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { TraceEvent } from "@uios/contracts";
import { isTraceOperation, isTraceStatus, sanitizeMeta, sanitizeUrn } from "@uios/trace";
import { traceBus, traceStore } from "../../../lib/intelligence";
import { checkRateLimit, rejectCrossOriginMutation, requireRole, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";

const AGENT = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_SKEW_MS = 5 * 60_000;

type Reported = Partial<Record<keyof TraceEvent, unknown>>;

/**
 * External agents (e.g. Claude Code hooks) report operations they performed. Events are stored with
 * observer "reported:<agent>" and are never presented as observed by UIOS (DECISIONS.md D-19).
 */
export async function POST(request: NextRequest) {
  const roleError = await requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "trace-report");
  if (!rate.allowed) return Response.json({ error: "Trace report rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  if (!traceStore()) return Response.json({ error: "Trace recording is unavailable on this server." }, { status: 503 });
  let body: { agent?: unknown; events?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (typeof body.agent !== "string" || !AGENT.test(body.agent)) return Response.json({ error: "`agent` must be 1-48 lowercase characters [a-z0-9._-]." }, { status: 400 });
  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) return Response.json({ error: "Provide between 1 and 100 events." }, { status: 400 });
  const now = Date.now();
  const accepted: TraceEvent[] = [];
  for (const [index, raw] of (body.events as Reported[]).entries()) {
    const invalid = (reason: string) => Response.json({ error: `events[${index}]: ${reason}` }, { status: 400 });
    if (!raw || typeof raw !== "object") return invalid("must be an object");
    if (!isTraceOperation(raw.operation)) return invalid("unknown operation");
    if (!isTraceStatus(raw.status)) return invalid("unknown status");
    const started = typeof raw.startedAt === "string" ? Date.parse(raw.startedAt) : Number.NaN;
    const ended = typeof raw.endedAt === "string" ? Date.parse(raw.endedAt) : started;
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || ended > now + MAX_SKEW_MS || now - started > 7 * 86_400_000) return invalid("startedAt/endedAt must be valid ISO times within the last 7 days, with endedAt >= startedAt");
    for (const key of ["traceId", "parentId", "projectId", "modelId"] as const) {
      if (raw[key] !== undefined && (typeof raw[key] !== "string" || !ID.test(raw[key] as string))) return invalid(`${key} must match ${ID}`);
    }
    if (raw.destination !== undefined && (typeof raw.destination !== "string" || !/^(local|remote:[A-Za-z0-9.-]{1,253})$/.test(raw.destination))) return invalid("destination must be 'local' or 'remote:<host>'");
    accepted.push({
      id: randomUUID(),
      traceId: (raw.traceId as string | undefined) ?? randomUUID(),
      ...(raw.parentId ? { parentId: raw.parentId as string } : {}),
      tenantId,
      ...(raw.projectId ? { projectId: raw.projectId as string } : {}),
      agentId: `external:${body.agent}`,
      ...(raw.modelId ? { modelId: raw.modelId as string } : {}),
      operation: raw.operation,
      ...(typeof raw.resourceUrn === "string" && sanitizeUrn(raw.resourceUrn) ? { resourceUrn: sanitizeUrn(raw.resourceUrn) } : {}),
      ...(raw.destination ? { destination: raw.destination as string } : {}),
      status: raw.status,
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(ended).toISOString(),
      durationMs: ended - started,
      meta: sanitizeMeta(raw.meta && typeof raw.meta === "object" ? raw.meta as Record<string, unknown> : undefined),
      observer: `reported:${body.agent}`,
    });
  }
  for (const event of accepted) traceBus().record(event);
  return Response.json({ accepted: accepted.length, ids: accepted.map((event) => event.id), observer: `reported:${body.agent}` }, { status: 201 });
}
