import { NextRequest } from "next/server";
import { listUniverseDocuments, readUniverseDocument } from "../../../lib/universe-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docPath = searchParams.get("path");
  const id = searchParams.get("id");

  if (!docPath && !id) {
    return Response.json({ error: "Provide path or id query parameter." }, { status: 400 });
  }

  const resolvedPath = docPath ?? id ?? "";
  const doc = await readUniverseDocument(resolvedPath);

  if (!doc) {
    // Try matching by scanning catalog
    const catalog = await listUniverseDocuments();
    const match = catalog.find((d) => d.path === resolvedPath || `doc-${d.path}` === resolvedPath);
    if (!match) return Response.json({ error: "Body not found." }, { status: 404 });
    const full = await readUniverseDocument(match.path);
    return Response.json(
      {
        id: `doc-${match.path}`,
        label: match.title,
        contentType: "document",
        documentPath: match.path,
        preview: full?.content.slice(0, 2000) ?? "",
        fullContent: full?.content ?? "",
        size: full?.content.length ?? 0,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return Response.json(
    {
      id: `doc-${doc.path}`,
      label: doc.title,
      contentType: "document",
      documentPath: doc.path,
      preview: doc.content.slice(0, 2000),
      fullContent: doc.content,
      size: doc.content.length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
