"use client";
import { useEffect, useState } from "react";

type Analytics = { summary: Record<string, number> };
type Provider = { healthy: boolean; provider?: string; latencyMs?: number };

export function OperationsPulse() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  useEffect(() => { const load = () => { fetch("/api/analytics", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setAnalytics).catch(() => undefined); fetch("/api/provider/health", { cache: "no-store" }).then((r) => r.json()).then(setProvider).catch(() => undefined); }; load(); const timer = window.setInterval(load, 15_000); return () => window.clearInterval(timer); }, []);
  const value = (key: string) => (analytics?.summary[key] ?? 0).toLocaleString();
  return <section className="operations-pulse" aria-label="Operations pulse"><div className="operations-heading"><div><div className="panel-kicker">Operations pulse</div><h2>Signal, not guesswork.</h2></div><span className={`provider-pill ${provider?.healthy ? "healthy" : "offline"}`}><i />{provider?.healthy ? `${provider.provider} · ${provider.latencyMs ?? "—"}ms` : "Provider setup"}</span></div><div className="operations-grid"><div><strong>{value("model.request.completed")}</strong><span>routed responses</span></div><div><strong>{value("workflow.run")}</strong><span>workflow runs</span></div><div><strong>{value("aegis.request.blocked")}</strong><span>Aegis blocks</span></div><div><strong>{value("agent.run")}</strong><span>agent runs</span></div></div></section>;
}
