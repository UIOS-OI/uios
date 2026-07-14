import { NextRequest } from "next/server";
import type { WorkflowDefinition } from "@uios/contracts";
import { analytics, workflowEngine } from "../../../lib/platform-services";
import { checkAegis, checkRateLimit, estimateUnits, getPlanLimit, getUsage, recordUsage, rejectCrossOriginMutation, rejectInvalidApiKey, requireRole, resolveTenantId, verifyWorkflowApproval } from "../../../lib/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authError = rejectInvalidApiKey(request); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const roleError = requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  let body: { workflow?: WorkflowDefinition; input?: Record<string, unknown>; approvalToken?: string };
  try { body = await request.json() as { workflow?: WorkflowDefinition; input?: Record<string, unknown>; approvalToken?: string }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const workflow = body.workflow;
  if (!workflow?.id || !workflow.name || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) return Response.json({ error: "A workflow id, name, nodes, and edges are required." }, { status: 400 });
  if (workflow.nodes.length < 1 || workflow.nodes.length > 32 || workflow.edges.length > 96) return Response.json({ error: "Workflows are limited to 1–32 nodes and 96 edges per run." }, { status: 400 });
  const tenantId = resolveTenantId(request);
  const approvalNodes = workflow.nodes.filter((node) => node.type === "human_approval").map((node) => node.id).sort();
  if (approvalNodes.length > 0 && (!body.approvalToken || !verifyWorkflowApproval(body.approvalToken, tenantId, workflow.id, approvalNodes))) {
    analytics.track(tenantId, "workflow.approval.required", { workflowId: workflow.id, nodeCount: approvalNodes.length, tokenPresented: Boolean(body.approvalToken) });
    return Response.json({ error: "Human approval is required before this workflow can execute.", approvalRequired: true, workflowId: workflow.id, nodeIds: approvalNodes }, { status: 202 });
  }
  const rate = checkRateLimit(tenantId, "workflow");
  if (!rate.allowed) return Response.json({ error: "UIOS workflow rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const input = body.input ?? {};
  let serializedInput = "";
  try { serializedInput = JSON.stringify(input); } catch { return Response.json({ error: "Workflow input must be JSON-serializable." }, { status: 400 }); }
  if (serializedInput.length > 100_000) return Response.json({ error: "Workflow input is too large." }, { status: 400 });
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (prompt.length > 50_000) return Response.json({ error: "Workflow input is too large." }, { status: 400 });
  const aegis = await checkAegis(prompt ? [{ role: "user", content: prompt }] : [], tenantId);
  if (!aegis.allowed) return Response.json({ error: aegis.reason ?? "Aegis blocked this workflow." }, { status: 403 });
  const modelNodes = workflow.nodes.filter((node) => node.type === "model").length;
  const units = Math.max(1, modelNodes * estimateUnits(prompt ? [{ role: "user", content: prompt }] : [{ role: "user", content: workflow.name }]));
  const planLimit = getPlanLimit(tenantId);
  if (getUsage(tenantId).units + units > planLimit) return Response.json({ error: "UIOS usage limit reached." }, { status: 402 });
  const run = await workflowEngine.run(workflow, input);
  // Sanitize internal engine error messages before exposing them to callers.
  if (run.status === "failed") {
    const internalError = run.error ?? "";
    if (internalError.startsWith("No handler registered") || internalError.startsWith("Workflow contains a cycle") || internalError.startsWith("UIOS provider") || internalError.startsWith("Agent ")) {
      run.error = "UIOS workflow execution failed. Review the run audit for details.";
    } else {
      run.error = "UIOS workflow execution failed. Review the run audit for details.";
    }
  }
  if (run.status === "completed") recordUsage(tenantId, units, "workflow_run");
  analytics.track(tenantId, "workflow.run", { workflowId: workflow.id, status: run.status, nodes: workflow.nodes.length, modelNodes });
  return Response.json({ tenantId, run }, { status: run.status === "failed" ? 422 : 200 });
}
