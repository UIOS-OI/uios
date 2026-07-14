"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import heroArtwork from "../uios-hero.png";

type CapabilityId = "router" | "aegis" | "memory";

export function CinematicFabric() {
  const [replayKey, setReplayKey] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let revealTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("uios:cinematic-complete"));
    }, 900);

    const updateScroll = () => setScrolled(window.scrollY > window.innerHeight * .35);
    const replay = () => {
      window.clearTimeout(revealTimer);
      setReplayKey((key) => key + 1);
      setScrolled(false);
      revealTimer = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("uios:cinematic-complete"));
      }, 900);
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("uios:replay-vision", replay);
    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("uios:replay-vision", replay);
    };
  }, []);

  function explore(capability?: CapabilityId) {
    if (capability) {
      window.dispatchEvent(new CustomEvent("uios:select-capability", { detail: capability }));
    }
    document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" });
  }

  return <div className={`cinematic-experience reference-experience${scrolled ? " cinematic-scrolled" : ""}`}>
    <div className="reference-frame" key={replayKey}>
      <Image
        className="reference-artwork"
        src={heroArtwork}
        alt="UIOS intelligence fabric connecting AI models, knowledge, vector databases, security, agents, workflows, MCP servers, applications, and the user."
        fill
        priority
        unoptimized
        sizes="100vw"
      />
      <nav className="reference-hitareas" aria-label="UIOS hero navigation">
        <a className="reference-hitarea reference-home" href="/" aria-label="UIOS home"><span>UIOS home</span></a>
        <button className="reference-hitarea reference-product" type="button" onClick={() => explore()}><span>Product</span></button>
        <a className="reference-hitarea reference-solutions" href="/products"><span>Solutions</span></a>
        <button className="reference-hitarea reference-aegis-nav" type="button" onClick={() => explore("aegis")}><span>Aegis Security</span></button>
        <a className="reference-hitarea reference-developers" href="/platform"><span>Developers</span></a>
        <a className="reference-hitarea reference-company" href="/connect"><span>Company</span></a>
        <a className="reference-hitarea reference-access" href="/connect"><span>Request Access</span></a>
        <button className="reference-hitarea reference-models" type="button" onClick={() => explore("router")}><span>AI Models and Universal Router</span></button>
        <button className="reference-hitarea reference-knowledge" type="button" onClick={() => explore("memory")}><span>Knowledge and Shared Memory</span></button>
        <button className="reference-hitarea reference-security" type="button" onClick={() => explore("aegis")}><span>Security and Aegis</span></button>
        <button className="reference-hitarea reference-explore" type="button" onClick={() => explore()}><span>Explore UIOS</span></button>
        <button className="reference-hitarea reference-scroll" type="button" onClick={() => explore()}><span>Scroll to explore</span></button>
      </nav>
    </div>
  </div>;
}
