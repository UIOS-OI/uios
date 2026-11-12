import { NextRequest } from "next/server";
import type { TraceSignal } from "@uios/contracts";
import { traceBus, traceRecordingState } from "../../../lib/intelligence";
import { rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBSCRIBERS_PER_TENANT = 8;

/**
 * Live trace stream (Server-Sent Events) for the caller's workspace. Subscribing only observes:
 * events are recorded whether or not anyone listens (DECISIONS.md D-14).
 */
export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  const bus = traceBus();
  if (bus.subscriberCount(tenantId) >= MAX_SUBSCRIBERS_PER_TENANT) return Response.json({ error: "Too many live trace connections for this workspace." }, { status: 429 });
  const encoder = new TextEncoder();
  let cleanup = () => undefined as void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => { try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); } };
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ recording: traceRecordingState() })}\n\n`);
      const unsubscribe = bus.subscribe(tenantId, (signal: TraceSignal) => {
        send(`${signal.phase === "end" ? `id: ${signal.event.id}\n` : ""}event: trace\ndata: ${JSON.stringify(signal)}\n\n`);
      });
      const heartbeat = setInterval(() => send(`: heartbeat ${Date.now()}\n\n`), 15_000);
      cleanup = () => { clearInterval(heartbeat); unsubscribe(); };
      request.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
