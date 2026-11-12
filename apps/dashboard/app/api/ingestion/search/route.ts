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

  // Without a real query vector, search falls back to lexical ranking; it never uses a placeholder vector.
  let embedding: number[] | null = null;
  const provider = getGatewayProvider();
  if (provider?.embed && q.trim()) {
    try {
      const [vector] = await provider.embed([q]);
      if (Array.isArray(vector) && vector.length > 0 && vector.every((value) => Number.isFinite(value))) embedding = vector;
    } catch (err) {
      console.warn("[Search API] Embedding generation failed, falling back to keyword matching:", err instanceof Error ? err.message : err);
    }
  }

  const memories = await searchMemories(tenantId, embedding, limit, q);

  return Response.json({ records: memories });
}
