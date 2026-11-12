import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";
import { searchMemories } from "../../../lib/state-store";
import { getEmbeddingProvider } from "../../../lib/platform-services";
import { startTrace, traceBus } from "../../../lib/intelligence";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;

  const tenantId = await resolveTenantId(request);
  const q = request.nextUrl.searchParams.get("q") ?? "";

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10;

  // Without a real query vector, search falls back to lexical ranking; it never uses a placeholder vector.
  const trace = startTrace(tenantId, "uios.search");
  const span = traceBus().start(trace, { operation: "memory.read", resourceUrn: "uios:memory", destination: "local", meta: { queryChars: q.length, limit } });
  let embedding: number[] | null = null;
  const selected = getEmbeddingProvider(span.child());
  if (selected.provider && q.trim()) {
    try {
      const [vector] = await selected.provider.embed([q], "query");
      if (Array.isArray(vector) && vector.length > 0 && vector.every((value) => Number.isFinite(value))) embedding = vector;
    } catch (err) {
      console.warn("[Search API] Embedding generation failed, falling back to keyword matching:", err instanceof Error ? err.message : err);
    }
  }

  let memories;
  try {
    memories = await searchMemories(tenantId, embedding, limit, q);
  } catch (error) {
    span.end("error", { error: error instanceof Error ? error.message.slice(0, 160) : "search failed" });
    throw error;
  }
  span.end("ok", { results: memories.length, mode: embedding ? "vector" : "lexical" });

  return Response.json({ records: memories });
}
