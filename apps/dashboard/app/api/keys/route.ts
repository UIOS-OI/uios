import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { checkRateLimit, rejectCrossOriginMutation, rejectUnauthorized, requireRole, resolveAuth, resolveTenantId } from "../../lib/runtime";
import { getApiKeyRole, hashApiKey, listApiKeys, revokeApiKey, saveApiKey, type ApiKeyRole } from "../../lib/state-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  return Response.json({ tenantId, keys: await listApiKeys(tenantId) });
}

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ["owner", "admin"]); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "admin-key"); if (!rate.allowed) return Response.json({ error: "Administrative rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  let body: { name?: string; role?: ApiKeyRole };
  try { body = (await request.json()) as { name?: string; role?: ApiKeyRole }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const name = body.name?.trim();
  if (!name || name.length > 80) return Response.json({ error: "Key name must be between 1 and 80 characters." }, { status: 400 });
  const role = body.role ?? "developer";
  if (!["owner", "admin", "developer", "viewer"].includes(role)) return Response.json({ error: "Invalid API key role." }, { status: 400 });
  if (role === "owner" && (await resolveAuth(request)).role !== "owner") return Response.json({ error: "Only an owner can create another owner key." }, { status: 403 });
  const rawKey = `uios_live_${randomBytes(24).toString("base64url")}`;
  const keyHash = await hashApiKey(rawKey);
  const record = await saveApiKey({ id: `key_${randomUUID().replace(/-/g, "")}`, tenantId, name, role, keyPrefix: rawKey.slice(0, 18), keyHash, createdAt: new Date().toISOString() });
  return Response.json({ id: record.id, name: record.name, role: record.role, keyPrefix: record.keyPrefix, rawKey, createdAt: record.createdAt }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authError = await requireRole(request, ["owner", "admin"]); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "admin-key"); if (!rate.allowed) return Response.json({ error: "Administrative rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Key id is required." }, { status: 400 });
  const targetRole = await getApiKeyRole(tenantId, id);
  if (!targetRole) return Response.json({ error: "Key was not found or is already revoked." }, { status: 404 });
  if (targetRole === "owner" && (await resolveAuth(request)).role !== "owner") return Response.json({ error: "Only an owner can revoke an owner key." }, { status: 403 });
  if (!(await revokeApiKey(tenantId, id))) return Response.json({ error: "Key was not found or is already revoked." }, { status: 404 });
  return Response.json({ id, revoked: true });
}
