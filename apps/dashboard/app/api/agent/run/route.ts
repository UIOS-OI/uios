import { NextRequest } from "next/server";
import { tracedProvider } from "@uios/trace";
import { agentEngine, analytics } from "../../../lib/platform-services";
import { planProviders } from "../../../lib/model-access";
import { startTrace, traceAegis, traceBus } from "../../../lib/intelligence";
import { projectFoundationTraffic } from "../../../lib/foundation-universe";
import { checkAegis, checkRateLimit, estimateUnits, getPlanLimit, getUsage, recordUsage, rejectCrossOriginMutation, rejectInvalidApiKey, requireRole, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authError = await rejectInvalidApiKey(request); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "agent");
  if (!rate.allowed) {
    projectFoundationTraffic(tenantId, "tool", { allowed: false, reason: "Rate limit" });
    return Response.json({ error: "UIOS agent rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-UIOS-RateLimit": "exceeded" } });
  }
  let body: { prompt?: string; system?: string; maxSteps?: number; cloudConsent?: unknown };
  try { body = (await request.json()) as { prompt?: string; system?: string; maxSteps?: number; cloudConsent?: unknown }; } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body.prompt?.trim() || body.prompt.length > 50_000) return Response.json({ error: "Prompt must be between 1 and 50,000 characters." }, { status: 400 });
  if (body.system !== undefined && (typeof body.system !== "string" || body.system.length > 20_000)) return Response.json({ error: "System instructions must be at most 20,000 characters." }, { status: 400 });
  const messages = [{ role: "user" as const, content: body.prompt }];
  // The consent digest covers everything the model would receive.
  const disclosed = [...(body.system ? [{ role: "system" as const, content: body.system }] : []), ...messages];
  const trace = startTrace(tenantId, "uios.agent");
  const aegisStarted = Date.now();
  const aegis = await checkAegis(disclosed, tenantId);
  traceAegis(trace, aegis, aegisStarted, "agent");
  projectFoundationTraffic(tenantId, "tool", aegis);
  if (!aegis.allowed) return Response.json({ error: aegis.reason ?? "Aegis blocked this agent run." }, { status: 403 });
  const plan = await planProviders({ tenantId, messages: disclosed, consentToken: body.cloudConsent });
  if (!plan.ok) return plan.response;
  const units = estimateUnits(messages);
  const limit = await getPlanLimit(tenantId);
  if ((await getUsage(tenantId)).units + units > limit) return Response.json({ error: "UIOS usage limit reached." }, { status: 402 });
  const provider = tracedProvider(plan.providers[0], traceBus(), trace);
  const toolSpans = new Map<string, ReturnType<ReturnType<typeof traceBus>["start"]>>();
  const run = await agentEngine.run(provider, {
    prompt: body.prompt,
    system: body.system,
    maxSteps: body.maxSteps,
    signal: request.signal,
    onToolEvent: (event) => {
      if (event.phase === "start") {
        toolSpans.set(event.call.id, traceBus().start(trace, { operation: "tool.call", resourceUrn: `uios:tool:${event.call.name}`, destination: "local", meta: { tool: event.call.name } }));
        return;
      }
      const span = toolSpans.get(event.call.id) ?? traceBus().start(trace, { operation: "tool.call", resourceUrn: `uios:tool:${event.call.name}`, destination: "local", meta: { tool: event.call.name } });
      span.end(event.status === "ok" ? "ok" : "error", event.error ? { error: event.error } : undefined);
    },
  });
  if (run.status === "failed") run.error = "UIOS agent execution failed. Review the run audit for details.";
  if (run.status !== "failed") await recordUsage(tenantId, units);
  await analytics.track(tenantId, "agent.run", { status: run.status, steps: run.steps, toolCalls: run.toolCalls.length });
  return Response.json({ run, traceId: trace.traceId }, { headers: { "X-UIOS-Trace-Id": trace.traceId } });
}
