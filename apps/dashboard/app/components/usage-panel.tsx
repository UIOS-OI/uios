"use client";
import { useEffect, useState } from "react";
type Usage = { plan: string; planLimit: number; units: number; events: Array<{ units: number; source: string }> };
export function UsagePanel() {
  const [data, setData] = useState<Usage | null>(null);
  useEffect(() => { fetch("/api/usage", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setData).catch(() => undefined); }, []);
  const used = data?.units ?? 0; const limit = data?.planLimit ?? 1000; const percent = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return <section className="usage-panel" aria-label="Workspace usage"><div className="panel-kicker">Workspace pulse <span className="live-dot" /> live <span className="usage-plan">{data?.plan ?? "builder"}</span></div><div className="usage-row"><strong>{used.toLocaleString()}</strong><span>/ {limit.toLocaleString()} units</span></div><div className="usage-track"><span style={{ width: `${percent}%` }} /></div><div className="usage-meta"><span>{percent}% consumed</span><span>{data?.events.length ?? 0} recent events</span></div></section>;
}
