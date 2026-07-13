import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const production = process.env.NODE_ENV === "production";
  const checks = {
    workspaceSecret: !production || Boolean(process.env.UIOS_WORKSPACE_SECRET),
    gateway: !production || Boolean(process.env.UIOS_AI_GATEWAY_KEY && process.env.UIOS_DEFAULT_MODEL),
    durableDatabase: !production || Boolean(process.env.UIOS_STATE_DB),
    aegis: !production || (process.env.UIOS_AEGIS_REQUIRED === "true" ? Boolean(process.env.UIOS_AEGIS_URL && process.env.UIOS_AEGIS_KEY && process.env.UIOS_AEGIS_FAIL_CLOSED === "true") : true),
  };
  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json({ service: "uios-dashboard", ready, checks }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
