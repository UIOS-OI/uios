export const runtime = "nodejs";

export function GET() {
  return Response.json({
    security: { workspaceSecretConfigured: Boolean(process.env.UIOS_WORKSPACE_SECRET), productionSecretRequired: process.env.NODE_ENV === "production" },
    gateway: { configured: Boolean(process.env.UIOS_AI_GATEWAY_KEY ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY), model: process.env.UIOS_DEFAULT_MODEL ?? null, endpoint: process.env.UIOS_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1/chat/completions" },
    aegis: { configured: Boolean(process.env.UIOS_AEGIS_URL && process.env.UIOS_AEGIS_KEY), required: process.env.UIOS_AEGIS_REQUIRED === "true", failClosed: process.env.UIOS_AEGIS_FAIL_CLOSED === "true" },
    persistence: { backend: process.env.UIOS_STATE_DB ? "sqlite" : process.env.UIOS_STATE_FILE ? "json" : "memory" },
    billing: { configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_SCALE) },
  });
}
