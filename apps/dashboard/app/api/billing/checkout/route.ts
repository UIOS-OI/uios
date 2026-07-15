import { NextRequest } from "next/server";
import { checkRateLimit, rejectCrossOriginMutation, requireRole, resolveTenantId } from "../../../lib/runtime";

const priceByPlan: Record<string, string | undefined> = {
  scale: process.env.STRIPE_PRICE_SCALE,
};

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ["owner", "admin"]); if (authError) return authError;
  const originError = rejectCrossOriginMutation(request); if (originError) return originError;
  const tenantId = await resolveTenantId(request);
  const rate = checkRateLimit(tenantId, "billing-checkout");
  if (!rate.allowed) return Response.json({ error: "Billing checkout rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  let body: { planId?: string; email?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = (await request.json()) as { planId?: string; email?: string; successUrl?: string; cancelUrl?: string };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const planId = body.planId ?? "scale";
  const price = priceByPlan[planId];
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (planId === "builder") return Response.json({ error: "Builder is free and does not require checkout." }, { status: 400 });
  if (planId === "enterprise") return Response.json({ error: "Enterprise checkout is handled by the UIOS team." }, { status: 422 });
  if (!stripeKey || !price) return Response.json({ error: "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_SCALE." }, { status: 503 });
  if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) return Response.json({ error: "A valid billing email is required." }, { status: 400 });

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const workspaceId = tenantId;
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    customer_email: body.email,
    "metadata[uios_workspace_id]": workspaceId,
    "metadata[uios_plan]": planId,
    "subscription_data[metadata][uios_workspace_id]": workspaceId,
    "subscription_data[metadata][uios_plan]": planId,
    success_url: body.successUrl ?? `${origin}/?billing=success`,
    cancel_url: body.cancelUrl ?? `${origin}/?billing=cancelled`,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const session = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !session.url) return Response.json({ error: session.error?.message ?? "Stripe checkout could not be created." }, { status: response.status || 502 });
  return Response.json({ sessionId: session.id, url: session.url });
}
