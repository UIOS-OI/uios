import { NextRequest } from "next/server";
import { checkAegis, rejectCrossOriginMutation, rejectUnauthorized, requireRole, resolveTenantId } from "../../lib/runtime";
import { memoryStore } from "../../lib/platform-services";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  const query = request.nextUrl.searchParams.get("q");
  return Response.json({ tenantId, records: query ? await memoryStore.search(tenantId, query) : await memoryStore.list(tenantId) });
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
  const aegis = await checkAegis([{ role: "user", content: body.content }], tenantId);
  if (!aegis.allowed) return Response.json({ error: aegis.reason ?? "Aegis blocked this memory write." }, { status: 403, headers: { "X-UIOS-Security": "aegis-blocked" } });
  return Response.json({ record: await memoryStore.save(tenantId, body.content.trim(), metadata) }, { status: 201 });
}
