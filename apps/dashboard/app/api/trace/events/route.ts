import { NextRequest } from "next/server";
import { isTraceOperation, isTraceStatus } from "@uios/trace";
import { traceRecordingState, traceStore } from "../../../lib/intelligence";
import { rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Persisted trace history for the caller's workspace, newest first, cursor-paginated. */
export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  const store = traceStore();
  if (!store) return Response.json({ events: [], recording: traceRecordingState(), error: "Trace recording is unavailable on this server." }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const list = (name: string) => params.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const operations = list("operation");
  const statuses = list("status");
  if (!operations.every(isTraceOperation) || !statuses.every(isTraceStatus)) return Response.json({ error: "Unknown operation or status filter." }, { status: 400 });
  const since = params.get("since") ?? undefined;
  const until = params.get("until") ?? undefined;
  if ((since && !ISO.test(since)) || (until && !ISO.test(until))) return Response.json({ error: "since/until must be ISO-8601 UTC timestamps." }, { status: 400 });
  const text = (name: string) => { const value = params.get(name); return value && value.length <= 200 ? value : undefined; };
  try {
    const page = store.query({
      tenantId,
      operations: operations.length ? operations : undefined,
      statuses: statuses.length ? statuses : undefined,
      agentId: text("agent"), modelId: text("model"), projectId: text("project"), traceId: text("trace"), observer: text("observer"),
      since, until, cursor: text("cursor"), limit: Number(params.get("limit") ?? 100),
    });
    return Response.json({ ...page, recording: traceRecordingState() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid trace cursor.") return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
