import { getGatewayProvider } from "../../../lib/platform-services";
export const runtime = "nodejs";
export async function GET() {
  const provider = getGatewayProvider();
  if (!provider) return Response.json({ configured: false, healthy: false, message: "Provider credentials or default model are not configured." }, { headers: { "Cache-Control": "no-store" } });
  const health = await provider.health();
  return Response.json({ configured: true, provider: provider.id, ...health }, { status: health.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
