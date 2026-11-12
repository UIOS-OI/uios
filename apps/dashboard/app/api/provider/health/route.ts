import { providerLocality } from "@uios/router";
import { getModelRouter, routingPolicy } from "../../../lib/platform-services";

export const runtime = "nodejs";

/** Reachability of every configured provider (no model listing, no workspace data). */
export async function GET() {
  const router = getModelRouter();
  if (!router) return Response.json({ configured: false, healthy: false, message: "No model provider is configured. Set UIOS_OLLAMA_CHAT_MODEL for local inference." }, { headers: { "Cache-Control": "no-store" } });
  const providers = await Promise.all(router.allProviders().map(async (provider) => ({ provider: provider.id, locality: providerLocality(provider), ...(await router.health(provider)) })));
  const healthy = providers.some((provider) => provider.healthy);
  return Response.json({ configured: true, healthy, policy: routingPolicy(), providers }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
