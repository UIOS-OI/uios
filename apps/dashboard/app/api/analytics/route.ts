import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveTenantId } from "../../lib/runtime";
import { analytics } from "../../lib/platform-services";

export const runtime = "nodejs";

// Debounce analytics.refresh() to at most once per 15 seconds across all requests.
let lastRefreshAt = 0;
const REFRESH_DEBOUNCE_MS = 15_000;

export function GET(request: NextRequest) {
  const authError = rejectUnauthorized(request); if (authError) return authError;
  const now = Date.now();
  if (now - lastRefreshAt >= REFRESH_DEBOUNCE_MS) {
    analytics.refresh();
    lastRefreshAt = now;
  }
  const tenantId = resolveTenantId(request);
  return Response.json({ tenantId, summary: analytics.summary(tenantId), recent: analytics.recent(tenantId) });
}
