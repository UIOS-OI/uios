"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

const WAITLIST_KEY = "uios.waitlist.v1";

type WaitlistEntry = { name: string; email: string; company?: string; createdAt: string };

const capabilities = [
  ["01", "Universal Router", "Route requests across multiple AI providers using one unified interface."],
  ["02", "Aegis Security", "Enterprise-grade governance, permissions, audit trails, and observability."],
  ["03", "Shared Memory", "Persistent context that follows users, agents, and workflows across AI systems."],
] as const;

function CapabilityCard({ index, title, description }: { index: string; title: string; description: string }) {
  const card = useRef<HTMLElement>(null);
  function tilt(event: React.PointerEvent<HTMLElement>) {
    const node = card.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    node.style.setProperty("--tilt-x", `${y * -3}deg`);
    node.style.setProperty("--tilt-y", `${x * 3}deg`);
  }
  function reset() {
    card.current?.style.setProperty("--tilt-x", "0deg");
    card.current?.style.setProperty("--tilt-y", "0deg");
  }
  return <article ref={card} className="landing-capability" onPointerMove={tilt} onPointerLeave={reset}>
    <span className="landing-card-index">{index}</span>
    <h3>{title}</h3>
    <p>{description}</p>
    <span className="landing-card-arrow" aria-hidden="true">↗</span>
  </article>;
}

export function ProductLanding() {
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const reveal = () => setVisible(true);
    window.addEventListener("uios:cinematic-complete", reveal);
    return () => window.removeEventListener("uios:cinematic-complete", reveal);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.dispatchEvent(new CustomEvent("uios:replay-vision"));
  }

  return <div className={`product-landing${visible ? " product-landing-visible" : ""}`} aria-hidden={!visible}>
    <section className="landing-hero shell" aria-labelledby="landing-title">
      <p className="landing-eyebrow">Universal Intelligence Operating System · prototype v0.1</p>
      <h1 id="landing-title">One interface<br /><em>for every AI.</em></h1>
      <p className="landing-lead">Connect AI models, enterprise systems, agents, and workflows through one intelligent platform.</p>
      <div className="landing-actions">
        <a className="landing-button landing-button-primary" href="/connect">Request Early Access <span>↗</span></a>
        <button className="landing-button landing-button-quiet" type="button" onClick={watchVision}>Watch the Vision <span>↓</span></button>
      </div>
    </section>

    <section className="landing-section shell" aria-labelledby="capabilities-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">The operating layer</p><h2 id="capabilities-title">Intelligence, woven together.</h2></div>
      <div className="landing-capability-grid">{capabilities.map(([index, title, description]) => <CapabilityCard key={title} index={index} title={title} description={description} />)}</div>
    </section>

    <section className="landing-waitlist shell" id="early-access" aria-labelledby="waitlist-title">
      <div><p className="landing-eyebrow">The next layer is forming</p><h2 id="waitlist-title">Build with the fabric.</h2><p>Tell us what you are building and we’ll share the earliest path into UIOS.</p></div>
      {submitted ? <div className="landing-confirmation" role="status"><strong>You’re on the list.</strong><span>We saved your request locally for this prototype.</span></div> : <form className="landing-form" onSubmit={submit}><label>Name<input name="name" required autoComplete="name" /></label><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Company <span>(optional)</span><input name="company" autoComplete="organization" /></label><button className="landing-button landing-button-primary" type="submit">Request Early Access <span>↗</span></button></form>}
    </section>

    <footer className="landing-footer shell"><span>UIOS · The Fabric of Intelligence</span><nav aria-label="Footer"><a href="https://github.com/UIOS-OI/uios">GitHub</a><a href="https://www.linkedin.com/">LinkedIn</a><a href="/platform">Documentation</a></nav><span>Prototype v0.1</span></footer>
  </div>;
}
