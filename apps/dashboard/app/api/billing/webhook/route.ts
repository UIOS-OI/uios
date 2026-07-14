import { createHmac, timingSafeEqual } from "node:crypto";
import { updateWorkspacePlan } from "../../../lib/state-store";

export const runtime = "nodejs";

function validSignature(payload: string, signature: string, secret: string): boolean {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const rawSignature = request.headers.get("stripe-signature") ?? "";
  if (rawSignature.length > 4096) return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  const payload = await request.text();
  if (!validSignature(payload, rawSignature, secret)) return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  let event: { type?: string; data?: { object?: { metadata?: Record<string, string>; subscription?: string | null } } };
  try { event = JSON.parse(payload) as typeof event; } catch { return Response.json({ error: "Stripe payload must be valid JSON." }, { status: 400 }); }
  const metadata = event.data?.object?.metadata ?? {};
  const workspaceId = metadata.uios_workspace_id;
  if (workspaceId && event.type === "checkout.session.completed") updateWorkspacePlan(workspaceId, metadata.uios_plan === "enterprise" ? "enterprise" : "scale");
  if (workspaceId && event.type === "customer.subscription.deleted") updateWorkspacePlan(workspaceId, "builder");
  return Response.json({ received: true });
}
