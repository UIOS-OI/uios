import { NextRequest, NextResponse } from "next/server";
import { rejectCrossOriginMutation } from "../../../lib/runtime";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const response = NextResponse.json({ loggedOut: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("uios_workspace", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
