import { NextRequest } from "next/server";
import { providerLocality } from "@uios/router";
import { getModelRouter, routingPolicy } from "../../lib/platform-services";
import { rejectUnauthorized } from "../../lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configured providers with their locality, live health, and models as reported by each provider. */
export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request); if (authError) return authError;
  const router = getModelRouter();
  const providers = await Promise.all((router?.allProviders() ?? []).map(async (provider) => {
    const [health, models] = await Promise.all([
      router!.health(provider),
      provider.listModels().catch((error: unknown) => ({ error: error instanceof Error ? error.message.slice(0, 160) : "listModels failed" })),
    ]);
    return { id: provider.id, locality: providerLocality(provider), destination: provider.destination ?? null, health, models };
  }));
  return Response.json({ policy: routingPolicy(), providers }, { headers: { "Cache-Control": "private, no-store" } });
}
