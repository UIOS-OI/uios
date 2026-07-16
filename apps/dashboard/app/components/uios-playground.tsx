"use client";

import { FormEvent, useState } from "react";
import { emitUniverseActivity } from "../lib/universe-events";

export function UiosPlayground() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || status === "streaming") return;
    setAnswer("");
    setStatus("streaming");
    emitUniverseActivity("chat.request", "start", ["workspace", "aegis", "router", "core"], 0.82);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }) });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error ?? "UIOS could not reach the model gateway.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event.split("\n").find((line) => line.startsWith("data: "))?.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          const token = JSON.parse(data).choices?.[0]?.delta?.content;
          if (token) setAnswer((current) => current + token);
        }
      }
      setStatus("idle");
      emitUniverseActivity("chat.request", "complete", ["core", "router", "workspace"], 0.9);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "UIOS request failed.");
      setStatus("error");
      emitUniverseActivity("chat.request", "error", ["router", "aegis", "workspace"], 0.78);
    }
  }

  return <section className="playground" id="playground"><div><div className="eyebrow">Try the interface</div><h2 className="section-heading">One prompt. A routed response.</h2><p className="section-copy">This playground sends requests through the UIOS gateway boundary, where routing and Aegis policy can be applied before a provider is reached.</p></div><form className="playground-card" onSubmit={submit}><label htmlFor="uios-prompt">Ask UIOS</label><textarea id="uios-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Compare the fastest model for summarizing a customer report…" rows={3} /><div className="playground-actions"><span className={status === "streaming" ? "streaming-label" : "ready-label"}>{status === "streaming" ? "Streaming through UIOS…" : "Aegis boundary ready"}</span><button className="button" type="submit" disabled={!prompt.trim() || status === "streaming"}>{status === "streaming" ? "Working…" : "Run prompt ↗"}</button></div>{answer ? <div className="playground-answer"><span>UIOS response</span><p>{answer}</p></div> : null}</form></section>;
}
