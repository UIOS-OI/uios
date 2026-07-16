import { NextRequest } from "next/server";
import { memoryStore, pluginRegistry } from "../../../lib/platform-services";
import { resolveAuth } from "../../../lib/runtime";
import { listUniverseDocuments } from "../../../lib/universe-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const documents = await listUniverseDocuments();
  const auth = await resolveAuth(request);
  if (auth.tenantId.startsWith("__")) {
    return Response.json(
      { connected: false, documents, knowledgeCount: 0, providers: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const records = await memoryStore.list(auth.tenantId);
  return Response.json(
    {
      connected: true,
      documents,
      knowledgeCount: records.length,
      providers: pluginRegistry.listProviders(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
