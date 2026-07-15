import { NextRequest } from "next/server";
import { checkRateLimit, rejectCrossOriginMutation, requireRole, resolveTenantId, signWorkflowApproval } from "../../../lib/runtime";
import { analytics } from "../../../lib/platform-services";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ["owner", "admin"]); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request); const rate = checkRateLimit(tenantId, "approval"); if (!rate.allowed) return Response.json({ error: "Approval rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  let body: { workflowId?: string; nodeIds?: string[] };
  try { body = await request.json() as { workflowId?: string; nodeIds?: string[] }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const workflowId = body.workflowId?.trim(); const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id)).slice(0, 32) : [];
  if (!workflowId || !/^[a-zA-Z0-9_-]{1,120}$/.test(workflowId) || nodeIds.length === 0) return Response.json({ error: "workflowId and at least one valid nodeId are required." }, { status: 400 });
  const approvalToken = signWorkflowApproval(tenantId, workflowId, nodeIds);
  await analytics.track(tenantId, "workflow.approval.issued", { workflowId, nodeCount: nodeIds.length, expiresInSeconds: 300 });
  return Response.json({ workflowId, nodeIds, approvalToken, expiresInSeconds: 300 }, { status: 201 });
}
