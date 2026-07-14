"use client";

import { FormEvent, useEffect, useState } from "react";

const WAITLIST_KEY = "uios.waitlist.v1";

type WaitlistEntry = { name: string; email: string; company?: string; createdAt: string };
type CapabilityId = "router" | "aegis" | "memory";

const capabilities = [
  { id: "router", index: "01", title: "Universal Router", description: "One intelligent path to the right model, tool, or system.", signal: "ROUTE OPTIMIZED" },
  { id: "aegis", index: "02", title: "Aegis Security", description: "Policy and protection woven through every intelligence path.", signal: "BOUNDARY ENFORCED" },
  { id: "memory", index: "03", title: "Shared Memory", description: "Context that stays connected wherever intelligence moves.", signal: "CONTEXT SYNCHRONIZED" },
] as const;

const ambientNodes = [
  [8, 22], [15, 72], [24, 42], [31, 15], [36, 82], [45, 28], [53, 76], [61, 18], [68, 50], [75, 83], [83, 29], [91, 65],
] as const;

function CapabilityEcosystem() {
  const [active, setActive] = useState<CapabilityId>("router");
  const capability = capabilities.find((item) => item.id === active) ?? capabilities[0];

  useEffect(() => {
    const select = (event: Event) => {
      const next = (event as CustomEvent<CapabilityId>).detail;
      if (capabilities.some((item) => item.id === next)) setActive(next);
    };
    window.addEventListener("uios:select-capability", select);
    return () => window.removeEventListener("uios:select-capability", select);
  }, []);

  return <div className="capability-ecosystem" data-active={active}>
    <div className="ecosystem-field" aria-label="Interactive UIOS capability network">
      <svg className="ecosystem-connections" viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden="true">
        <path className="connection-router" d="M50 31 C37 25 28 17 18 12" />
        <path className="connection-aegis" d="M50 31 C63 24 74 17 84 12" />
        <path className="connection-memory" d="M50 31 C50 42 50 49 50 57" />
      </svg>
      {ambientNodes.map(([left, top]) => <span className="ecosystem-node" style={{ left: `${left}%`, top: `${top}%` }} key={`${left}-${top}`}><i /></span>)}
      <span className="ecosystem-security-node security-node-one" /><span className="ecosystem-security-node security-node-two" /><span className="ecosystem-security-node security-node-three" />
      <div className="ecosystem-core"><span>UIOS</span><small>INTELLIGENCE CORE</small></div>
      {capabilities.map((item) => <button className={`ecosystem-pillar ecosystem-pillar-${item.id}`} type="button" aria-pressed={active === item.id} onClick={() => setActive(item.id)} key={item.id}>
        <span>{item.index}</span><strong>{item.title}</strong>
      </button>)}
    </div>
    <div className="ecosystem-readout" aria-live="polite">
      <span className="ecosystem-status"><i /> {capability.signal}</span>
      <div><strong>{capability.title}</strong><p>{capability.description}</p></div>
      <span className="ecosystem-action">Select a node to reshape the fabric.</span>
    </div>
  </div>;
}

export function ProductLanding() {
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const reveal = () => setVisible(true);
    const hide = () => setVisible(false);
    window.addEventListener("uios:cinematic-complete", reveal);
    window.addEventListener("uios:replay-vision", hide);
    return () => {
      window.removeEventListener("uios:cinematic-complete", reveal);
      window.removeEventListener("uios:replay-vision", hide);
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entry: WaitlistEntry = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      company: String(form.get("company") ?? "").trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const existing = JSON.parse(window.localStorage.getItem(WAITLIST_KEY) ?? "[]") as WaitlistEntry[];
    window.localStorage.setItem(WAITLIST_KEY, JSON.stringify([...existing, entry]));
    setSubmitted(true);
    event.currentTarget.reset();
  }

  function watchVision() {
    setVisible(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.dispatchEvent(new CustomEvent("uios:replay-vision"));
  }

  function selectAegis() {
    window.dispatchEvent(new CustomEvent("uios:select-capability", { detail: "aegis" }));
  }

  return <div className={`product-landing${visible ? " product-landing-visible" : ""}`} aria-hidden={!visible}>
    <nav className="landing-navigation" aria-label="Primary navigation">
      <a className="landing-navigation-brand" href="/" aria-label="UIOS home"><span aria-hidden="true">U</span><span aria-hidden="true">I</span><i aria-hidden="true" /><span aria-hidden="true">S</span><small>The Fabric of Intelligence</small></a>
      <div className="landing-navigation-links"><a href="#capabilities">Product</a><a href="/products">Solutions</a><a href="#capabilities" onClick={selectAegis}>Aegis Security</a><a href="/platform">Developers</a><a href="/connect">Company</a></div>
      <a className="landing-navigation-cta" href="/connect">Request Access</a>
    </nav>
    <section className="landing-hero shell" aria-labelledby="landing-title">
      <p className="landing-eyebrow">UIOS</p>
      <h1 id="landing-title">Intelligence,<br /><em>connected.</em></h1>
      <p className="landing-lead">The intelligence layer connecting everything.</p>
      <div className="landing-actions">
        <a className="landing-button landing-button-primary" href="/connect">Request Early Access <span>↗</span></a>
        <button className="landing-button landing-button-quiet" type="button" onClick={watchVision}>Replay the reveal <span>↻</span></button>
      </div>
    </section>

    <section className="landing-section shell" id="capabilities" aria-labelledby="capabilities-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">The living architecture</p><h2 id="capabilities-title">Three forces.<br />One fabric.</h2></div>
      <CapabilityEcosystem />
    </section>

    <section className="landing-waitlist shell" id="early-access" aria-labelledby="waitlist-title">
      <div><p className="landing-eyebrow">The next layer is forming</p><h2 id="waitlist-title">Build with the fabric.</h2><p>Tell us what you are building and we’ll share the earliest path into UIOS.</p></div>
      {submitted ? <div className="landing-confirmation" role="status"><strong>You’re on the list.</strong><span>We saved your request locally for this prototype.</span></div> : <form className="landing-form" onSubmit={submit}><label>Name<input name="name" required autoComplete="name" /></label><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Company <span>(optional)</span><input name="company" autoComplete="organization" /></label><button className="landing-button landing-button-primary" type="submit">Request Early Access <span>↗</span></button></form>}
    </section>

    <footer className="landing-footer shell"><span>UIOS · The Fabric of Intelligence</span><nav aria-label="Footer"><a href="https://github.com/UIOS-OI/uios">GitHub</a><a href="https://www.linkedin.com/">LinkedIn</a><a href="/platform">Documentation</a></nav><span>Prototype v0.1</span></footer>
  </div>;
}
