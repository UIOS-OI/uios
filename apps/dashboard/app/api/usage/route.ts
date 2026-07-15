import { NextRequest } from "next/server";
import { getPlanLimit, getUsage, getWorkspacePlan, listUsageEvents, rejectUnauthorized, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  const planLimit = await getPlanLimit(tenantId);
  const state = await getUsage(tenantId);
  const plan = await getWorkspacePlan(tenantId);
  const events = await listUsageEvents(tenantId);
  return Response.json({ tenantId, plan, planLimit, ...state, remainingUnits: Math.max(0, planLimit - state.units), events });
}

