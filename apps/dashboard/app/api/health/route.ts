export const runtime = "nodejs";

export function GET() {
  return Response.json({
    service: "uios-dashboard",
    status: "ok",
    security: "aegis",
    version: process.env.NEXT_PUBLIC_DEPLOY_ID ?? "dev",
    timestamp: new Date().toISOString(),
  });
}
