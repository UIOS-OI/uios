import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveAuth } from "../../../lib/runtime";
import { getGatewayProvider } from "../../../lib/platform-services";
import { searchMemories } from "../../../lib/state-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;

  const auth = await resolveAuth(request);
  const tenantId = auth.tenantId;

  const q = request.nextUrl.searchParams.get("q");
  if (!q?.trim()) {
    return Response.json({ error: "Missing query parameter q." }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 50) : 10;

  if (auth.role === "viewer") {
    return Response.json({ tenantId, records: [] });
  }

  const gateway = getGatewayProvider();
  
  let embedding = Array(1536).fill(0.1);
  if (gateway?.embed) {
    try {
      const embeddings = await gateway.embed([q]);
      if (embeddings?.[0]) {
        embedding = embeddings[0];
      }
    } catch (err) {
      console.error("[Search Route] Failed to get query embedding:", err);
    }
  }

  let records = await searchMemories(tenantId, embedding, limit, q);

  // Only return ingested document chunks
  records = records.filter(r => r.metadata && (r.metadata.fileName !== undefined));

  return Response.json({ tenantId, records });
}
