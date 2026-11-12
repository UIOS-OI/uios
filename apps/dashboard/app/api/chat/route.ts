import { NextRequest } from "next/server";
import type { ChatResponse } from "@uios/contracts";
import { providerLocality } from "@uios/router";
import { tracedProvider } from "@uios/trace";
import { analytics } from "../../lib/platform-services";
import { projectFoundationTraffic } from "../../lib/foundation-universe";
import { cloudConsentResponse, planProviders } from "../../lib/model-access";
import { startTrace, traceAegis, traceBus } from "../../lib/intelligence";
import { checkAegis, checkRateLimit, estimateUnits, getPlanLimit, getUsage, recordUsage, rejectCrossOriginMutation, rejectInvalidApiKey, requireRole, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatBody = { messages?: ChatMessage[]; model?: string; provider?: string; cloudConsent?: unknown };

export async function POST(request: NextRequest) {
  const authError = await rejectInvalidApiKey(request); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]); if (roleError) return roleError;
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return Response.json({ error: "Provide between 1 and 100 messages." }, { status: 400 });
  if (messages.some((message) => !["system", "user", "assistant"].includes(message?.role))) return Response.json({ error: "Message roles must be system, user, or assistant." }, { status: 400 });
  if (messages.some((message) => typeof message.content !== "string" || message.content.length > 20000)) {
    return Response.json({ error: "Message content is invalid or too large." }, { status: 400 });
  }
  if (body.model !== undefined && (typeof body.model !== "string" || !body.provider)) return Response.json({ error: "`model` must be a string and requires `provider` (see GET /api/models)." }, { status: 400 });
  if (body.provider !== undefined && (typeof body.provider !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(body.provider))) return Response.json({ error: "`provider` must be a provider id from GET /api/models." }, { status: 400 });

  const tenantId = await resolveTenantId(request);
  const trace = startTrace(tenantId, "uios.chat");
  const trafficKind = request.headers.get("authorization")?.startsWith("Bearer ") ? "api" : "prompt";
  const rate = checkRateLimit(tenantId);
  if (!rate.allowed) {
    projectFoundationTraffic(tenantId, trafficKind, { allowed: false, reason: "Rate limit" });
    return Response.json({ error: "UIOS request rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-UIOS-RateLimit": "exceeded" } });
  }
  const aegisStarted = Date.now();
  const aegis = await checkAegis(messages, tenantId);
  traceAegis(trace, aegis, aegisStarted, "chat");
  projectFoundationTraffic(tenantId, trafficKind, aegis);
  if (!aegis.allowed) { await analytics.track(tenantId, "aegis.request.blocked", { reason: aegis.reason ?? "policy-blocked" }); return Response.json({ error: aegis.reason ?? "Aegis blocked this request." }, { status: 403, headers: { "X-UIOS-Security": "aegis-blocked" } }); }
  const units = estimateUnits(messages);
  const planLimit = await getPlanLimit(tenantId);
  const currentUsage = await getUsage(tenantId);
  if (currentUsage.units + units > planLimit) return Response.json({ error: "UIOS usage limit reached. Upgrade the workspace plan to continue." }, { status: 402, headers: { "X-UIOS-Usage-Units": String(currentUsage.units) } });

  const plan = await planProviders({ tenantId, messages, consentToken: body.cloudConsent, provider: body.provider });
  if (!plan.ok) return plan.response;

  const requestId = trace.traceId;
  const startedAt = Date.now();
  const failures: string[] = [];
  // Fail over only before the first chunk. Remote providers are in the list only if policy or consent allows.
  for (const candidate of plan.providers) {
    const provider = tracedProvider(candidate, traceBus(), trace);
    const iterator = provider.stream?.({ messages, model: body.model, metadata: { tenantId, requestId } })?.[Symbol.asyncIterator]();
    if (!iterator) { failures.push(`${candidate.id}: streaming unsupported`); continue; }
    let first: IteratorResult<ChatResponse>;
    try {
      first = await iterator.next();
    } catch (error) {
      failures.push(`${candidate.id}: ${error instanceof Error ? error.message.slice(0, 160) : "failed"}`);
      await analytics.track(tenantId, "model.request.failed", { requestId, provider: candidate.id, reason: error instanceof Error ? error.message.slice(0, 120) : "provider-failed" });
      continue;
    }
    const locality = providerLocality(candidate);
    await analytics.track(tenantId, "model.request.completed", { requestId, provider: candidate.id, model: first.value?.model ?? "", locality, consented: plan.remoteConsented, latencyMs: Date.now() - startedAt });
    await recordUsage(tenantId, units);
    return new Response(streamFrom(first, iterator, tenantId, requestId), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive",
        "X-UIOS-Request-Id": requestId, "X-UIOS-Trace-Id": trace.traceId,
        "X-UIOS-Route": `${candidate.id}:${first.value?.model ?? body.model ?? "default"}`, "X-UIOS-Locality": locality, "X-UIOS-Security": "aegis",
      },
    });
  }

  // Every permitted provider failed. Never fall back to cloud silently: offer consent, or fail visibly.
  const onlyLocalTried = plan.providers.every((provider) => providerLocality(provider) === "local");
  if (onlyLocalTried && !plan.remoteConsented) {
    const consent = await cloudConsentResponse(tenantId, messages, "local-failed", failures.join("; "));
    if (consent) return consent;
  }
  return Response.json({ error: "The model provider failed before responding.", providers: failures, traceId: trace.traceId }, { status: 502, headers: { "X-UIOS-Request-Id": requestId } });
}

function streamFrom(first: IteratorResult<ChatResponse>, iterator: AsyncIterator<ChatResponse>, tenantId: string, requestId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frame = (chunk: ChatResponse) => `data: ${JSON.stringify({ id: chunk.id, model: chunk.model, choices: [{ delta: { content: chunk.content }, finish_reason: chunk.finishReason ?? null }] })}\n\n`;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) controller.enqueue(encoder.encode(frame(first.value)));
        if (!first.done) {
          for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
            // Reasoning is never streamed as answer text.
            if (next.value.content || next.value.finishReason) controller.enqueue(encoder.encode(frame(next.value)));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        await analytics.track(tenantId, "model.request.stream_failed", { requestId, reason: error instanceof Error ? error.message.slice(0, 120) : "provider-failed" });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "UIOS provider failed while streaming the response." })}\n\n`));
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
