import { NextRequest } from "next/server";
import { rejectCrossOriginMutation, requireRole, resolveTenantId } from "../../../lib/runtime";
import { enqueueJob } from "../../../lib/ingestion-queue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;

  const roleError = await requireRole(request, ["owner", "admin", "developer"]);
  if (roleError) return roleError;

  const tenantId = await resolveTenantId(request);

  let fileName = "";
  let fileType = "";
  let buffer: Buffer | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (file) {
      fileName = file.name;
      fileType = file.type;
      buffer = Buffer.from(await file.arrayBuffer());
    }
  } catch (err) {
    try {
      const rawBody = await request.arrayBuffer();
      const bodyBuffer = Buffer.from(rawBody);
      const parsed = parseMultipartBody(bodyBuffer, request.headers.get("content-type"));
      if (parsed.file) {
        fileName = parsed.file.name;
        fileType = parsed.file.type;
        buffer = parsed.file.data;
      }
    } catch (fallbackErr: any) {
      return Response.json({ error: `Failed to parse request: ${fallbackErr.message}` }, { status: 400 });
    }
  }

  if (!buffer) {
    return Response.json({ error: "Missing or invalid file field." }, { status: 400 });
  }

  if (buffer.length === 0) {
    return Response.json({ error: "File is empty." }, { status: 400 });
  }

  const jobId = enqueueJob(tenantId, buffer, fileName, fileType);

  return Response.json({ jobId, status: "queued" }, { status: 202 });
}

function parseMultipartBody(bodyBuffer: Buffer, contentTypeHeader: string | null): { file: { name: string; type: string; data: Buffer } | null } {
  let boundary = "";
  if (contentTypeHeader) {
    const match = contentTypeHeader.match(/boundary=(.+)$/);
    if (match) {
      boundary = match[1];
    }
  }

  if (!boundary) {
    const lineEndIndex = bodyBuffer.indexOf("\r\n");
    if (lineEndIndex > 0) {
      const firstLine = bodyBuffer.subarray(0, lineEndIndex).toString("utf8");
      if (firstLine.startsWith("--")) {
        boundary = firstLine.slice(2);
      }
    }
  }

  if (!boundary) {
    return { file: null };
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let partStart = bodyBuffer.indexOf(boundaryBuffer);
  if (partStart === -1) {
    return { file: null };
  }
  
  partStart += boundaryBuffer.length + 2;

  const headerEnd = bodyBuffer.indexOf("\r\n\r\n", partStart);
  if (headerEnd === -1) {
    return { file: null };
  }

  const headerText = bodyBuffer.subarray(partStart, headerEnd).toString("utf8");
  const filenameMatch = headerText.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? filenameMatch[1] : "uploaded_file";

  const contentTypeMatch = headerText.match(/Content-Type:\s*([^\s\r\n]+)/i);
  const contentType = contentTypeMatch ? contentTypeMatch[1] : "application/octet-stream";

  const fileDataStart = headerEnd + 4;
  let fileDataEnd = bodyBuffer.indexOf(boundaryBuffer, fileDataStart);
  if (fileDataEnd === -1) {
    fileDataEnd = bodyBuffer.length;
  } else {
    if (bodyBuffer[fileDataEnd - 2] === 13 && bodyBuffer[fileDataEnd - 1] === 10) {
      fileDataEnd -= 2;
    }
  }

  const fileData = bodyBuffer.subarray(fileDataStart, fileDataEnd);

  return {
    file: {
      name: filename,
      type: contentType,
      data: fileData
    }
  };
}
