import { NextRequest } from "next/server";
import { agentEngine, analytics, getModelRouter } from "../../../lib/platform-services";
import { checkAegis, checkRateLimit, estimateUnits, getPlanLimit, getUsage, recordUsage, rejectCrossOriginMutation, rejectInvalidApiKey, requireRole, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authError = await rejectInvalidApiKey(request); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "agent");
  if (!rate.allowed) return Response.json({ error: "UIOS agent rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-UIOS-RateLimit": "exceeded" } });
  let body: { prompt?: string; system?: string; maxSteps?: number };
  try { body = (await request.json()) as { prompt?: string; system?: string; maxSteps?: number }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body.prompt?.trim() || body.prompt.length > 50_000) return Response.json({ error: "Prompt must be between 1 and 50,000 characters." }, { status: 400 });
  if (body.system !== undefined && (typeof body.system !== "string" || body.system.length > 20_000)) return Response.json({ error: "System instructions must be at most 20,000 characters." }, { status: 400 });
  const messages = [{ role: "user" as const, content: body.prompt }];
  const aegis = await checkAegis(messages, tenantId);
  if (!aegis.allowed) return Response.json({ error: aegis.reason ?? "Aegis blocked this agent run." }, { status: 403 });
  const router = getModelRouter();
  if (!router) return Response.json({ error: "UIOS AI routing is not configured." }, { status: 503 });
  let provider;
  try { provider = (await router.select({ messages, model: process.env.UIOS_DEFAULT_MODEL, strategy: "explicit" })).provider; } catch { return Response.json({ error: "UIOS could not select a model provider." }, { status: 503 }); }
  const units = estimateUnits(messages);
  const limit = await getPlanLimit(tenantId);
  if ((await getUsage(tenantId)).units + units > limit) return Response.json({ error: "UIOS usage limit reached." }, { status: 402 });
  const run = await agentEngine.run(provider, { prompt: body.prompt, system: body.system, maxSteps: body.maxSteps });
  if (run.status === "failed") run.error = "UIOS agent execution failed. Review the run audit for details.";
  if (run.status !== "failed") await recordUsage(tenantId, units);
  await analytics.track(tenantId, "agent.run", { status: run.status, steps: run.steps, toolCalls: run.toolCalls.length });
  return Response.json({ run });
}
