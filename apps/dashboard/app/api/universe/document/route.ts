import { NextRequest } from "next/server";
import { readUniverseDocument } from "../../../lib/universe-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) return Response.json({ error: "Document path is required." }, { status: 400 });
  const document = await readUniverseDocument(relativePath);
  if (!document) return Response.json({ error: "Document is outside the published Memory catalog." }, { status: 404 });
  return Response.json(document, { headers: { "Cache-Control": "private, no-store" } });
}
