import { NextRequest } from "next/server";
import {
  connectFoundation,
  disconnectFoundation,
  isProtectionMode,
  readFoundation,
} from "../../lib/foundation-universe";
import { rejectCrossOriginMutation, rejectUnauthorized, requireRole, resolveTenantId } from "../../lib/runtime";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (label.length < 1 || label.length > max) return null;
  if (/(?:api[_-]?key|secret|password|bearer)\s*[:=]/i.test(label)) return null;
  if (/^[A-Za-z0-9_\-]{24,}$/.test(label) && /[A-Z]/.test(label) && /\d/.test(label)) return null;
  return label;
}

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;
  const tenantId = await resolveTenantId(request);
  return Response.json(readFoundation(tenantId), { headers: noStore });
}

export async function POST(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]);
  if (roleError) return roleError;
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  let body: { llmLabel?: unknown; modelId?: unknown; protection?: unknown };
  try {
    body = (await request.json()) as { llmLabel?: unknown; modelId?: unknown; protection?: unknown };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400, headers: noStore });
  }
  const llmLabel = cleanLabel(body.llmLabel, 80);
  const modelId = cleanLabel(body.modelId, 120);
  if (!llmLabel || !modelId) {
    return Response.json({ error: "Provide an LLM name and model id. Do not send credentials." }, { status: 400, headers: noStore });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(modelId)) {
    return Response.json({ error: "Model id must be a model name, not a URL or secret." }, { status: 400, headers: noStore });
  }
  if (!isProtectionMode(body.protection)) {
    return Response.json({ error: "Protection must be firewall, proxy, or sidecar." }, { status: 400, headers: noStore });
  }
  const tenantId = await resolveTenantId(request);
  return Response.json(connectFoundation(tenantId, { llmLabel, modelId, protection: body.protection }), { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;
  const roleError = await requireRole(request, ["owner", "admin", "developer"]);
  if (roleError) return roleError;
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  return Response.json(disconnectFoundation(tenantId), { headers: noStore });
}
