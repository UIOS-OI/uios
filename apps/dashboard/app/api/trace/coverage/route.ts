import { NextRequest } from "next/server";
import { TRACE_COVERAGE, traceRecordingState } from "../../../lib/intelligence";
import { rejectUnauthorized } from "../../../lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which operations Live Trace can observe. Anything "not-instrumented" must render as a gap, not as silence. */
export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  return Response.json({ recording: traceRecordingState(), operations: TRACE_COVERAGE, observers: { uios: "Observed in-process by UIOS.", "reported:<agent>": "Self-reported by an external agent through POST /api/trace/report; not independently verified." } }, { headers: { "Cache-Control": "private, no-store" } });
}
