import { NextRequest } from "next/server";
import { pluginRegistry } from "../../lib/platform-services";
import { rejectUnauthorized, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const authError = rejectUnauthorized(request); if (authError) return authError;
  return Response.json({ tenantId: resolveTenantId(request), plugins: pluginRegistry.listManifests(), providers: pluginRegistry.listProviders() });
}
