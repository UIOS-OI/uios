export const runtime = "nodejs";

const plans = [
  { id: "builder", name: "Builder", price: 0, interval: "month", includedUnits: 1000, description: "Prototype your first UIOS application." },
  { id: "scale", name: "Scale", price: 99, interval: "month", includedUnits: 25000, description: "Production routing, observability and team controls." },
  { id: "enterprise", name: "Enterprise", price: null, interval: "custom", includedUnits: null, description: "Private connectivity, SSO, custom limits and support." },
] as const;

export function GET() {
  return Response.json({ currency: "usd", plans, billingProvider: process.env.STRIPE_SECRET_KEY ? "stripe" : "configuration_required" });
}
