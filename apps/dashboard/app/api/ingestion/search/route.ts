import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";
import { searchMemories } from "../../../lib/state-store";
import { getGatewayProvider } from "../../../lib/platform-services";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;

  const tenantId = await resolveTenantId(request);
  const q = request.nextUrl.searchParams.get("q") ?? "";

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10;

  let embedding = Array(1536).fill(0.1);
  const provider = getGatewayProvider();
  if (provider && q.trim()) {
    try {
      if (provider.embed) {
        const embeddings = await provider.embed([q]);
        if (embeddings && embeddings[0]) {
          embedding = embeddings[0];
        }
      }
    } catch (err) {
      console.warn("[Search API] Embedding generation failed, falling back to keyword matching:", err);
    }
  }

  const memories = await searchMemories(tenantId, embedding, limit, q);

  return Response.json({ records: memories });
}
