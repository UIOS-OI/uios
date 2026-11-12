import { NextRequest } from "next/server";
import { projectFoundationTraffic } from "../../lib/foundation-universe";
import { checkAegis, rejectCrossOriginMutation, rejectUnauthorized, requireRole, resolveTenantId } from "../../lib/runtime";
import { memoryStore } from "../../lib/platform-services";
import { startTrace, traceAegis, traceBus } from "../../lib/intelligence";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  const query = request.nextUrl.searchParams.get("q");
  const span = traceBus().start(startTrace(tenantId, "uios.memory"), { operation: "memory.read", resourceUrn: "uios:memory", destination: "local", meta: { mode: query ? "search" : "list", queryChars: query?.length ?? 0 } });
  const records = query ? await memoryStore.search(tenantId, query) : await memoryStore.list(tenantId);
  span.end("ok", { results: records.length });
  return Response.json({ tenantId, records });
}

export async function POST(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  let body: { content?: string; metadata?: Record<string, string> };
  try { body = (await request.json()) as { content?: string; metadata?: Record<string, string> }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body.content?.trim() || body.content.length > 100_000) return Response.json({ error: "Memory content must be between 1 and 100,000 characters." }, { status: 400 });
  const metadata = body.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length > 50 || Object.entries(metadata).some(([key, value]) => key.length > 120 || typeof value !== "string" || value.length > 500)) return Response.json({ error: "Memory metadata must contain at most 50 string fields, with 120-character keys and 500-character values." }, { status: 400 });
  const trace = startTrace(tenantId, "uios.memory");
  const aegisStarted = Date.now();
  const aegis = await checkAegis([{ role: "user", content: body.content }], tenantId);
  traceAegis(trace, aegis, aegisStarted, "memory-write");
  projectFoundationTraffic(tenantId, "memory", aegis);
  if (!aegis.allowed) return Response.json({ error: aegis.reason ?? "Aegis blocked this memory write." }, { status: 403, headers: { "X-UIOS-Security": "aegis-blocked" } });
  const span = traceBus().start(trace, { operation: "memory.write", destination: "local", meta: { chars: body.content.length, metadataKeys: Object.keys(metadata).length } });
  const record = await memoryStore.save(tenantId, body.content.trim(), metadata);
  span.annotate({ recordId: record.id });
  span.end("ok");
  return Response.json({ record }, { status: 201 });
}
