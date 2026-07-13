"use client";

import { FormEvent, useState } from "react";

export function AgentLab() {
  const [prompt, setPrompt] = useState("");
  const [memory, setMemory] = useState("");
  const [result, setResult] = useState("");
  const [memoryResults, setMemoryResults] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");

  async function runAgent(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || status === "running") return;
    setStatus("running"); setResult("");
    try {
      const response = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, maxSteps: 6 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Agent run failed.");
      setResult(`${body.run.output || "Agent completed without a final response."}\n\nSteps: ${body.run.steps} · Tool calls: ${body.run.toolCalls.length}`);
      setStatus("idle");
    } catch (error) { setResult(error instanceof Error ? error.message : "Agent run failed."); setStatus("error"); }
  }

  async function saveMemory() {
    if (!memory.trim()) return;
    const response = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: memory, metadata: { source: "agent-lab" } }) });
    if (response.ok) setMemory("");
  }

  async function searchMemory() {
    if (!memory.trim()) return;
    const response = await fetch(`/api/memory?q=${encodeURIComponent(memory)}`);
    const body = await response.json();
    setMemoryResults((body.records ?? []).map((record: { content: string }) => record.content));
  }

  return <section className="agent-lab" id="agent-lab"><div className="eyebrow">Developer workspace</div><div className="agent-lab-header"><div><h2 className="section-heading">Agent Lab</h2><p className="section-copy">Run a bounded agent, keep workspace memory close, and see how UIOS turns platform primitives into a working application.</p></div><span className="lab-badge">Aegis gated</span></div><div className="lab-grid"><form className="lab-panel" onSubmit={runAgent}><label htmlFor="agent-prompt">Agent instruction</label><textarea id="agent-prompt" rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Research the latest workspace memory and propose the next action…" /><div className="lab-actions"><span>{status === "running" ? "Running bounded loop…" : "6-step safety limit"}</span><button className="button" disabled={!prompt.trim() || status === "running"}>{status === "running" ? "Running…" : "Run agent ↗"}</button></div>{result ? <pre className={`lab-result ${status === "error" ? "error" : ""}`}>{result}</pre> : null}</form><div className="lab-panel"><label htmlFor="agent-memory">Workspace memory</label><textarea id="agent-memory" rows={3} value={memory} onChange={(event) => setMemory(event.target.value)} placeholder="Save or search a project fact…" /><div className="lab-actions"><span>Tenant-scoped</span><div><button className="text-button" type="button" onClick={saveMemory}>Save</button><button className="text-button" type="button" onClick={searchMemory}>Search</button></div></div>{memoryResults.length ? <div className="memory-results">{memoryResults.map((item) => <p key={item}>{item}</p>)}</div> : <p className="lab-hint">Memory stays inside the current workspace boundary.</p>}</div></div></section>;
}
