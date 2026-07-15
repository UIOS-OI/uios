import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rejectCrossOriginMutation, rejectUnauthorized, resolveTenantId, signWorkspaceId } from "../../lib/runtime";
import { deleteWorkspaceData, findWorkspace, saveWorkspace } from "../../lib/state-store";
import { analytics, memoryStore } from "../../lib/platform-services";
import { requireRole } from "../../lib/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const id = await resolveTenantId(request);
  const workspace = await findWorkspace(id);
  if (!workspace && id !== "local-development") {
    return Response.json({ error: "Workspace not found." }, { status: 401 });
  }
  const resolvedWorkspace = workspace ?? { id, name: "Local workspace", plan: "builder" as const, createdAt: new Date().toISOString() };
  return Response.json({ workspace: resolvedWorkspace });
}

export async function POST(request: NextRequest) {
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "workspace-create"); if (!rate.allowed) return Response.json({ error: "Workspace creation rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  if (process.env.NODE_ENV === "production" && !process.env.UIOS_WORKSPACE_SECRET) return Response.json({ error: "Workspace signing is not configured. Set UIOS_WORKSPACE_SECRET before creating workspaces." }, { status: 503 });
  let body: { name?: string };
  try { body = (await request.json()) as { name?: string }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const name = body.name?.trim();
  if (!name || name.length > 80) return Response.json({ error: "Workspace name must be between 1 and 80 characters." }, { status: 400 });
  const workspace = { id: `ws_${randomUUID().replace(/-/g, "")}`, name, plan: "builder" as const, createdAt: new Date().toISOString() };
  await saveWorkspace(workspace);
  const response = NextResponse.json({ workspace });
  response.cookies.set("uios_workspace", signWorkspaceId(workspace.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  return response;
}

export async function DELETE(request: NextRequest) {
  const authError = await requireRole(request, ["owner"]); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  if (tenantId === "local-development") return Response.json({ error: "A named workspace is required for deletion." }, { status: 400 });
  await deleteWorkspaceData(tenantId);
  await memoryStore.clear(tenantId);
  await analytics.clear(tenantId);
  const response = NextResponse.json({ deleted: true, tenantId, deletedAt: new Date().toISOString() });
  response.headers.set("Cache-Control", "no-store");
  // Clear the workspace session so the deleted tenant cannot continue to authenticate.
  response.cookies.set("uios_workspace", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
