import { NextRequest } from "next/server";
import { getModelRouter, memoryStore } from "../../../lib/platform-services";
import { resolveAuth } from "../../../lib/runtime";
import { buildGalaxyDescriptors, listUniverseDocuments } from "../../../lib/universe-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  const access = { includePrivate: !auth.tenantId.startsWith("__") };
  const documents = await listUniverseDocuments(access);

  if (auth.tenantId.startsWith("__")) {
    const galaxies = buildGalaxyDescriptors(documents, []);
    return Response.json(
      { connected: false, documents, knowledgeCount: 0, providers: [], galaxies },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const records = await memoryStore.list(auth.tenantId);
  const memoryPayload = records.map((r) => ({
    id: r.id,
    content: r.content,
    metadata: r.metadata as Record<string, string>,
    createdAt: r.createdAt,
  }));
  const galaxies = buildGalaxyDescriptors(documents, memoryPayload);

  return Response.json(
    {
      connected: true,
      documents,
      knowledgeCount: records.length,
      providers: getModelRouter()?.listProviders() ?? [],
      galaxies,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
