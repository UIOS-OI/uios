export function GET() {
  return Response.json({ service: "uios-dashboard", status: "ok", security: "aegis" });
}
