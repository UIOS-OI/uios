import { NextRequest } from "next/server";
import { getPlanLimit, getUsage, getWorkspacePlan, listUsageEvents, rejectUnauthorized, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const authError = rejectUnauthorized(request); if (authError) return authError;
  const tenantId = resolveTenantId(request);
  const planLimit = getPlanLimit(tenantId);
  const state = getUsage(tenantId);
  return Response.json({ tenantId, plan: getWorkspacePlan(tenantId), planLimit, ...state, remainingUnits: Math.max(0, planLimit - state.units), events: listUsageEvents(tenantId) });
}
