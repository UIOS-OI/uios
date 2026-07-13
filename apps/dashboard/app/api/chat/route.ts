import { NextRequest } from "next/server";
import { analytics, getModelRouter } from "../../lib/platform-services";
import { checkAegis, checkRateLimit, estimateUnits, getPlanLimit, getUsage, recordUsage, rejectCrossOriginMutation, rejectInvalidApiKey, requireRole, resolveTenantId } from "../../lib/runtime";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const authError = rejectInvalidApiKey(request); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const roleError = requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  let body: { messages?: ChatMessage[]; model?: string };
  try {
    body = (await request.json()) as { messages?: ChatMessage[]; model?: string };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (messages.length === 0 || messages.length > 100) return Response.json({ error: "Provide between 1 and 100 messages." }, { status: 400 });
  if (messages.some((message) => !["system", "user", "assistant"].includes(message.role))) return Response.json({ error: "Message roles must be system, user, or assistant." }, { status: 400 });
  if (messages.some((message) => typeof message.content !== "string" || message.content.length > 20000)) {
    return Response.json({ error: "Message content is invalid or too large." }, { status: 400 });
  }

  const tenantId = resolveTenantId(request);
  const rate = checkRateLimit(tenantId);
  if (!rate.allowed) return Response.json({ error: "UIOS request rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-UIOS-RateLimit": "exceeded" } });
  const aegis = await checkAegis(messages, tenantId);
  if (!aegis.allowed) { analytics.track(tenantId, "aegis.request.blocked", { reason: aegis.reason ?? "policy-blocked" }); return Response.json({ error: aegis.reason ?? "Aegis blocked this request." }, { status: 403, headers: { "X-UIOS-Security": "aegis-blocked" } }); }
  const units = estimateUnits(messages);
  const planLimit = getPlanLimit(tenantId);
  const currentUsage = getUsage(tenantId);
  if (currentUsage.units + units > planLimit) return Response.json({ error: "UIOS usage limit reached. Upgrade the workspace plan to continue." }, { status: 402, headers: { "X-UIOS-Usage-Units": String(currentUsage.units) } });

  const router = getModelRouter();
  const model = body.model ?? process.env.UIOS_DEFAULT_MODEL;
  if (!router || !model) {
    return Response.json({ error: "UIOS AI routing is not configured. Set UIOS_AI_GATEWAY_KEY and UIOS_DEFAULT_MODEL." }, { status: 503 });
  }
  const requestId = randomUUID();
  const startedAt = Date.now();
  let selected;
  try {
    selected = await router.select({ messages, model, strategy: (process.env.UIOS_ROUTING_STRATEGY as "fastest" | "balanced" | "explicit" | undefined) ?? "explicit" });
  } catch (error) {
    analytics.track(tenantId, "model.request.failed", { requestId, reason: error instanceof Error ? error.message.slice(0, 120) : "provider-selection-failed" });
    return Response.json({ error: "UIOS could not select a healthy model provider." }, { status: 503, headers: { "X-UIOS-Request-Id": requestId } });
  }
  const provider = selected.provider;
  const iterator = provider.stream?.({ messages, model: selected.decision.modelId ?? model, metadata: { tenantId, requestId } });
  if (!iterator) return Response.json({ error: "Configured provider does not support streaming." }, { status: 502 });
  const encoder = new TextEncoder();
  let charged = false;
  let observed = false;
  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterator) {
          if (!observed) { analytics.track(tenantId, "model.request.completed", { requestId, provider: provider.id, model: chunk.model, strategy: selected.decision.strategy, latencyMs: Date.now() - startedAt }); observed = true; }
          if (!charged) { recordUsage(tenantId, units); charged = true; }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: chunk.id, model: chunk.model, choices: [{ delta: { content: chunk.content }, finish_reason: chunk.finishReason ?? null }] })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        analytics.track(tenantId, "model.request.stream_failed", { requestId, reason: error instanceof Error ? error.message.slice(0, 120) : "provider-failed" });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "UIOS provider failed while streaming the response." })}\n\n`));
        controller.error(error);
      }
    },
  });
  return new Response(bodyStream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-UIOS-Request-Id": requestId, "X-UIOS-Route": `${provider.id}:${selected.decision.modelId ?? model}`, "X-UIOS-Security": "aegis" } });
}
