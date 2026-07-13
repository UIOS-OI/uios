import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveTenantId } from "../../lib/runtime";
import { analytics } from "../../lib/platform-services";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const authError = rejectUnauthorized(request); if (authError) return authError;
  analytics.refresh();
  const tenantId = resolveTenantId(request);
  return Response.json({ tenantId, summary: analytics.summary(tenantId), recent: analytics.recent(tenantId) });
}
