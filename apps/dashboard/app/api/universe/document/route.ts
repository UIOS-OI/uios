import { NextRequest } from "next/server";
import { readUniverseDocument } from "../../../lib/universe-documents";

import { resolveAuth } from "../../../lib/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = { includePrivate: !(await resolveAuth(request)).tenantId.startsWith("__") };
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) return Response.json({ error: "Document path is required." }, { status: 400 });
  const document = await readUniverseDocument(relativePath, access);
  if (!document) return Response.json({ error: "Document is outside the published Memory catalog." }, { status: 404 });
  return Response.json(document, { headers: { "Cache-Control": "private, no-store" } });
}
