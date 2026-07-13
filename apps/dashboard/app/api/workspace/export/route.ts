import { NextRequest } from "next/server";
import { analytics, memoryStore } from "../../../lib/platform-services";
import { getUsage, listUsageEvents, rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";
import { findWorkspace, listApiKeys } from "../../../lib/state-store";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const authError = rejectUnauthorized(request); if (authError) return authError;
  const tenantId = resolveTenantId(request);
  return Response.json({ exportedAt: new Date().toISOString(), workspace: findWorkspace(tenantId) ?? { id: tenantId, plan: "builder" }, usage: getUsage(tenantId), usageEvents: listUsageEvents(tenantId, 100), memory: memoryStore.list(tenantId), analytics: analytics.recent(tenantId, 100), apiKeys: listApiKeys(tenantId) }, { headers: { "Content-Disposition": `attachment; filename="uios-${tenantId}-export.json"`, "Cache-Control": "no-store" } });
}
