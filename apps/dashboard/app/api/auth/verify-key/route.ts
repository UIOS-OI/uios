import { NextRequest, NextResponse } from "next/server";
import { resolveApiKeyAuth } from "../../../lib/state-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }
    const auth = await resolveApiKeyAuth(token.trim());
    if (!auth) {
      return NextResponse.json({ error: "Invalid or revoked UIOS API key." }, { status: 401 });
    }
    return NextResponse.json({ tenantId: auth.tenantId, role: auth.role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
