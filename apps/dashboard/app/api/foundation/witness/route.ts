import { NextRequest } from "next/server";
import { isTrafficKind, projectFoundationTraffic, readFoundation } from "../../../lib/foundation-universe";
import { checkAegis, checkRateLimit, rejectCrossOriginMutation, rejectUnauthorized, requireRole, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]);
  if (roleError) return roleError;
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  if (!readFoundation(tenantId).connected) {
    return Response.json({ error: "Connect an LLM and a protection layer before the foundation can observe traffic." }, { status: 409, headers: noStore });
  }
  let body: { kind?: unknown; sample?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; sample?: unknown };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400, headers: noStore });
  }
  if (!isTrafficKind(body.kind)) return Response.json({ error: "Traffic kind must be prompt, api, tool, memory, or workflow." }, { status: 400, headers: noStore });
  if (typeof body.sample !== "string" || body.sample.trim().length < 1 || body.sample.length > 4000) {
    return Response.json({ error: "Provide a sample between 1 and 4,000 characters. The sample is classified and not stored." }, { status: 400, headers: noStore });
  }
  const rate = checkRateLimit(tenantId, "foundation");
  if (!rate.allowed) {
    const limited = projectFoundationTraffic(tenantId, body.kind, { allowed: false, reason: "Rate limit" });
    return Response.json({ error: "Foundation observation rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds, event: limited }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds), "X-UIOS-RateLimit": "exceeded" } });
  }
  const aegis = await checkAegis([{ role: "user", content: body.sample }], tenantId);
  const event = projectFoundationTraffic(tenantId, body.kind, aegis);
  return Response.json(
    { verdict: event?.verdict ?? (aegis.allowed ? "pass" : "deflect"), threat: event?.threat ?? null, event },
    { status: aegis.allowed ? 200 : 403, headers: { ...noStore, "X-UIOS-Security": aegis.allowed ? "aegis" : "aegis-blocked" } },
  );
}
