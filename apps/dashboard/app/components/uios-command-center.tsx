"use client";

import { useEffect, useState } from "react";

const modules = [
  { id: "router", label: "Router", detail: "Choose the best model for every request.", metric: "12 providers" },
  { id: "agents", label: "Agents", detail: "Coordinate agent runs, tools and approvals.", metric: "6 runtimes" },
  { id: "memory", label: "Memory", detail: "Keep context portable across applications.", metric: "semantic" },
  { id: "aegis", label: "Aegis", detail: "Protect every action with identity and policy.", metric: "protected" },
];

export function UiosCommandCenter() {
  const [selected, setSelected] = useState("router");
  const [firstVisit, setFirstVisit] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem("uios-onboarding-seen") === "1") setFirstVisit(false);
  }, []);

  function dismissOnboarding() {
    window.localStorage.setItem("uios-onboarding-seen", "1");
    setFirstVisit(false);
  }

  const active = modules.find((module) => module.id === selected) ?? modules[0];

  return (
    <section className="command-center" aria-label="UIOS platform preview">
      <div className="command-topline">
        <div><span className="live-dot" /> UIOS control plane <span className="command-muted">/ platform preview</span></div>
        <div className="command-chip">Aegis protected</div>
      </div>
      <div className="command-body">
        <div className="module-rail">
          <div className="rail-label">Core modules</div>
          {modules.map((module) => (
            <button className={`module-button${selected === module.id ? " active" : ""}`} key={module.id} onClick={() => setSelected(module.id)} aria-pressed={selected === module.id}>
              <span className={`module-icon ${module.id}`} aria-hidden="true" />
              <span><strong>{module.label}</strong><small>{module.metric}</small></span>
              <span className="module-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className="module-detail">
          <div className="detail-kicker">Now exploring</div>
          <h3>{active.label}<span className="detail-status">ready</span></h3>
          <p>{active.detail}</p>
          <div className="signal-row"><span>request flow</span><span className="signal-line"><i /></span><span>policy check</span><span className="signal-line"><i /></span><span>response</span></div>
          <div className="detail-footer">Built once on UIOS <span>•</span> secure by default</div>
        </div>
      </div>
      {firstVisit ? <div className="onboarding-tip" role="status"><span className="tip-spark">✦</span><div><strong>New to UIOS?</strong><p>Tap a module to see how the platform works.</p></div><button onClick={dismissOnboarding} aria-label="Dismiss UIOS introduction">×</button></div> : null}
    </section>
  );
}
