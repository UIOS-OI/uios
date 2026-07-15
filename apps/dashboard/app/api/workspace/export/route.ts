import { NextRequest } from "next/server";
import { analytics, memoryStore } from "../../../lib/platform-services";
import { getUsage, listUsageEvents, rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";
import { findWorkspace, listApiKeys } from "../../../lib/state-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  
  const [workspace, usage, usageEvents, memory, recentAnalytics, apiKeys] = await Promise.all([
    findWorkspace(tenantId),
    getUsage(tenantId),
    listUsageEvents(tenantId, 100),
    memoryStore.list(tenantId),
    analytics.recent(tenantId, 100),
    listApiKeys(tenantId)
  ]);

  return Response.json({ 
    exportedAt: new Date().toISOString(), 
    workspace: workspace ?? { id: tenantId, plan: "builder" }, 
    usage, 
    usageEvents, 
    memory, 
    analytics: recentAnalytics, 
    apiKeys 
  }, { 
    headers: { 
      "Content-Disposition": `attachment; filename="uios-${tenantId}-export.json"`, 
      "Cache-Control": "no-store" 
    } 
  });
}
