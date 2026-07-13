"use client";

import { useEffect, useState } from "react";

type Config = { gateway: { configured: boolean; model: string | null; endpoint: string }; aegis: { configured: boolean; required: boolean; failClosed: boolean }; persistence: { backend: string }; billing: { configured: boolean } };
type ProviderHealth = { configured: boolean; healthy: boolean; provider?: string; latencyMs?: number; message?: string };

const labels = [
  ["gateway", "Model gateway", "Connect UIOS to a provider-neutral streaming endpoint."],
  ["aegis", "Aegis security", "Protect requests with the built-in security plane."],
  ["persistence", "Workspace state", "Keep tenants and usage durable across restarts."],
  ["billing", "Monetization", "Enable Scale checkout and usage-based upgrades."],
] as const;

export function SystemReadiness() {
  const [config, setConfig] = useState<Config | null>(null);
  const [provider, setProvider] = useState<ProviderHealth | null>(null);
  useEffect(() => { fetch("/api/config").then((response) => response.json()).then(setConfig).catch(() => undefined); }, []);
  useEffect(() => { fetch("/api/provider/health", { cache: "no-store" }).then((response) => response.json()).then(setProvider).catch(() => undefined); }, []);
  return <section className="readiness" id="readiness"><div className="readiness-header"><div><div className="eyebrow">Workspace readiness</div><h2 className="section-heading">Everything you need to go live.</h2></div><span className={`readiness-badge ${provider?.healthy ? "ready" : "setup"}`}>{provider?.healthy ? "Ready to route" : "Setup required"}</span></div><div className="readiness-grid">{labels.map(([key, title, description]) => { const configured = !config ? false : key === "persistence" ? config.persistence.backend !== "memory" : key === "gateway" ? Boolean(provider?.healthy) : key === "aegis" ? config.aegis.configured : config.billing.configured; const state = !config ? "Loading…" : configured ? (key === "gateway" ? `${provider?.provider ?? "gateway"} · ${provider?.latencyMs ?? "—"}ms` : key === "persistence" ? config.persistence.backend : "Configured") : key === "gateway" && provider?.configured ? provider.message ?? "Provider unreachable" : "Needs configuration"; return <article className="readiness-card" key={key}><div className={`readiness-icon ${configured ? "on" : "off"}`}>{configured ? "✓" : "·"}</div><div><h3>{title}</h3><p>{description}</p><span className="readiness-state">{state}</span></div></article>; })}</div>{config && !provider?.configured ? <div className="readiness-help"><strong>Connect a model gateway</strong><span>Set <code>UIOS_AI_GATEWAY_KEY</code> and <code>UIOS_DEFAULT_MODEL</code> in your dashboard environment, then reload this page.</span></div> : null}</section>;
}
