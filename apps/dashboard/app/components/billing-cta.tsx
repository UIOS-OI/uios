"use client";

import { useState } from "react";

export function BillingCta({ planId }: { planId: "scale" | "enterprise" }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function startCheckout() {
    if (planId === "enterprise") {
      window.location.href = "mailto:hello@uios.dev?subject=UIOS Enterprise";
      return;
    }
    if (!email) { setMessage("Enter your email to continue."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, email }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Checkout unavailable.");
      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout unavailable.");
      setBusy(false);
    }
  }

  if (planId === "enterprise") return <button className="button button-light billing-button" onClick={startCheckout}>Talk to us ↗</button>;
  return <div className="billing-cta"><input aria-label="Billing email" type="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button billing-button" onClick={startCheckout} disabled={busy}>{busy ? "Opening…" : "Upgrade ↗"}</button>{message ? <small>{message}</small> : null}</div>;
}
