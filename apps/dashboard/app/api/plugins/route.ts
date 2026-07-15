import { NextRequest } from "next/server";
import { pluginRegistry } from "../../lib/platform-services";
import { rejectUnauthorized, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  return Response.json({ tenantId, plugins: pluginRegistry.listManifests(), providers: pluginRegistry.listProviders() });
}

