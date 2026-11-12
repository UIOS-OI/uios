import { fetchJson, baseUrl } from "./helpers.mjs";

const mockUrl = "http://127.0.0.1:4010";

async function mockStats() {
  return (await fetch(`${mockUrl}/__mock/stats`)).json();
}

async function createWorkspace(name) {
  const res = await fetchJson("/api/workspace", { method: "POST", body: JSON.stringify({ name }) });
  if (res.status !== 200) throw new Error(`workspace creation failed: ${res.status}`);
  return { id: res.body.workspace.id, cookie: res.headers.get("set-cookie").split(";")[0] };
}

async function chat(cookie, messages, extra = {}) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages, ...extra }),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* SSE body */ }
  return { status: response.status, headers: response.headers, text, json };
}

async function traceEvents(cookie, query = "") {
  const res = await fetchJson(`/api/trace/events${query}`, { headers: { cookie } });
  if (res.status !== 200) throw new Error(`trace events returned ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.events;
}

export default async function run(test, ctx) {
  const local = {};

  test("TC-LOCAL-01", "Chat runs on the local Ollama provider by default", async () => {
    Object.assign(local, await createWorkspace("Intelligence Core A"));
    const before = await mockStats();
    const res = await chat(local.cookie, [{ role: "user", content: "hello local model" }]);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${res.text.slice(0, 200)}`);
    if (res.headers.get("x-uios-locality") !== "local") throw new Error(`expected local locality, got ${res.headers.get("x-uios-locality")}`);
    if (!res.headers.get("x-uios-route")?.startsWith("ollama:")) throw new Error(`expected ollama route, got ${res.headers.get("x-uios-route")}`);
    if (!res.text.includes("local ") || !res.text.includes("reply") || !res.text.includes("[DONE]")) throw new Error("local stream content missing");
    const after = await mockStats();
    if (after.gatewayChatCalls !== before.gatewayChatCalls) throw new Error("cloud gateway was called for a local request");
    local.traceId = res.headers.get("x-uios-trace-id");
  });

  test("TC-CONSENT-01", "Local failure returns a disclosure and sends nothing to the cloud", async () => {
    const before = await mockStats();
    const messages = [{ role: "system", content: "be brief" }, { role: "user", content: "force-local-failure please" }];
    const res = await chat(local.cookie, messages);
    if (res.status !== 409) throw new Error(`expected 409 consent request, got ${res.status}: ${res.text.slice(0, 200)}`);
    const d = res.json;
    if (!d.consentRequired || d.reason !== "local-failed" || d.provider.id !== "uios-gateway") throw new Error(`unexpected disclosure: ${JSON.stringify(d).slice(0, 300)}`);
    if (d.provider.destination !== "127.0.0.1:4010" || d.provider.model !== "mock-model") throw new Error("disclosure must name the remote host and model");
    if (d.data.messages !== 2 || d.data.totalChars !== "be brief".length + "force-local-failure please".length) throw new Error("disclosure sizes are wrong");
    if (!/mock local model crashed/.test(d.localError)) throw new Error("disclosure must explain the local failure");
    if (JSON.stringify(d).includes("force-local-failure please")) throw new Error("disclosure must describe sizes, not echo content");
    const after = await mockStats();
    if (after.gatewayChatCalls !== before.gatewayChatCalls) throw new Error("cloud gateway was called before consent");
    local.consentMessages = messages;
    local.consentToken = d.consentToken;
  });

  test("TC-CONSENT-02", "Consent token sends exactly the disclosed messages to the disclosed provider", async () => {
    const before = await mockStats();
    const res = await chat(local.cookie, local.consentMessages, { cloudConsent: local.consentToken });
    if (res.status !== 200) throw new Error(`expected 200 after consent, got ${res.status}: ${res.text.slice(0, 200)}`);
    if (res.headers.get("x-uios-locality") !== "remote") throw new Error("consented request must be marked remote");
    if (!res.headers.get("x-uios-route")?.startsWith("uios-gateway:")) throw new Error("consented request must use the disclosed provider");
    const after = await mockStats();
    if (after.gatewayChatCalls !== before.gatewayChatCalls + 1) throw new Error("exactly one cloud call expected");
    if (after.ollamaChatCalls !== before.ollamaChatCalls) throw new Error("consented request should go straight to the disclosed provider");
  });

  test("TC-CONSENT-03", "Consent cannot be reused for different content or another workspace", async () => {
    const altered = [...local.consentMessages.slice(0, 1), { role: "user", content: "force-local-failure and also send my secrets" }];
    const tampered = await chat(local.cookie, altered, { cloudConsent: local.consentToken });
    if (tampered.status !== 403) throw new Error(`altered content must be refused, got ${tampered.status}`);
    const other = await createWorkspace("Intelligence Core B");
    local.other = other;
    const foreign = await chat(other.cookie, local.consentMessages, { cloudConsent: local.consentToken });
    if (foreign.status !== 403) throw new Error(`cross-workspace consent must be refused, got ${foreign.status}`);
    const forged = await chat(local.cookie, local.consentMessages, { cloudConsent: `${local.consentToken.split(".")[0]}.forged` });
    if (forged.status !== 403) throw new Error(`forged consent must be refused, got ${forged.status}`);
  });

  test("TC-TRACE-01", "Trace history records real model, failure, remote, and Aegis events without content", async () => {
    const events = await traceEvents(local.cookie, "?limit=200");
    const model = events.filter((e) => e.operation === "model.request");
    if (!model.some((e) => e.providerId === "ollama" && e.status === "ok" && e.destination === "local")) throw new Error("missing successful local model.request");
    if (!model.some((e) => e.providerId === "ollama" && e.status === "error")) throw new Error("missing failed local model.request");
    if (!model.some((e) => e.providerId === "uios-gateway" && e.destination === "remote:127.0.0.1:4010" && e.status === "ok")) throw new Error("missing consented remote model.request");
    if (!events.some((e) => e.operation === "security.check" && e.status === "ok")) throw new Error("missing security.check");
    if (!events.every((e) => e.observer === "uios" && e.tenantId === local.id)) throw new Error("events must be uios-observed and tenant-scoped");
    const serialized = JSON.stringify(events);
    if (serialized.includes("hello local model") || serialized.includes("force-local-failure please")) throw new Error("trace must not contain prompt content");
    const byTrace = await traceEvents(local.cookie, `?trace=${local.traceId}`);
    if (!byTrace.length || !byTrace.every((e) => e.traceId === local.traceId)) throw new Error("trace filter failed");
    const okLocal = model.find((e) => e.providerId === "ollama" && e.status === "ok");
    if (okLocal.meta.inputTokens !== 9 || okLocal.meta.outputTokens !== 2) throw new Error(`token counts must come from the provider: ${JSON.stringify(okLocal.meta)}`);
  });

  test("TC-TRACE-02", "Trace history is isolated per workspace", async () => {
    const events = await traceEvents(local.other.cookie);
    if (events.some((e) => e.tenantId !== local.other.id)) throw new Error("foreign events leaked");
    if (events.some((e) => e.traceId === local.traceId)) throw new Error("workspace A trace visible to workspace B");
    const anonymous = await fetchJson("/api/trace/events");
    if (anonymous.status !== 401) throw new Error(`anonymous trace read must be 401, got ${anonymous.status}`);
  });

  test("TC-TRACE-03", "Live stream delivers start and end signals for a real memory write", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/trace/stream`, { headers: { cookie: local.cookie }, signal: controller.signal });
    if (response.status !== 200) throw new Error(`stream returned ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const signals = [];
    const reading = (async () => {
      while (signals.filter((s) => s.event.operation === "memory.write").length < 2) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop();
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          if (frame.includes("event: trace") && data) signals.push(JSON.parse(data.slice(6)));
        }
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const write = await fetchJson("/api/memory", { method: "POST", headers: { cookie: local.cookie }, body: JSON.stringify({ content: "Live trace memory record" }) });
    if (write.status !== 201) throw new Error(`memory write failed: ${write.status}`);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try { await reading; } catch { /* aborted */ } finally { clearTimeout(timeout); controller.abort(); }
    const phases = signals.filter((s) => s.event.operation === "memory.write").map((s) => s.phase);
    if (phases[0] !== "start" || phases[1] !== "end") throw new Error(`expected start then end, got ${JSON.stringify(phases)}`);
    if (signals.some((s) => s.event.tenantId !== local.id)) throw new Error("stream leaked another tenant");
  });

  test("TC-TRACE-04", "External agents can report events, which are labelled as reported and sanitized", async () => {
    const now = new Date();
    const event = { operation: "fs.write", status: "ok", startedAt: new Date(now.getTime() - 50).toISOString(), endedAt: now.toISOString(), resourceUrn: "file:/home/dev/uios/README.md", destination: "local", meta: { bytes: 120, token: "ghp_abcdefghijklmnopqrstuvwxyz012345" } };
    const anonymous = await fetchJson("/api/trace/report", { method: "POST", body: JSON.stringify({ agent: "claude-code", events: [event] }) });
    if (anonymous.status !== 401) throw new Error(`anonymous report must be 401, got ${anonymous.status}`);
    const bad = await fetchJson("/api/trace/report", { method: "POST", headers: { cookie: local.cookie }, body: JSON.stringify({ agent: "claude-code", events: [{ ...event, operation: "fs.teleport" }] }) });
    if (bad.status !== 400) throw new Error(`unknown operation must be 400, got ${bad.status}`);
    const spoof = await fetchJson("/api/trace/report", { method: "POST", headers: { cookie: local.cookie }, body: JSON.stringify({ agent: "Uios Core!", events: [event] }) });
    if (spoof.status !== 400) throw new Error(`invalid agent name must be 400, got ${spoof.status}`);
    const ok = await fetchJson("/api/trace/report", { method: "POST", headers: { cookie: local.cookie }, body: JSON.stringify({ agent: "claude-code", events: [event] }) });
    if (ok.status !== 201 || ok.body.observer !== "reported:claude-code") throw new Error(`report failed: ${ok.status} ${JSON.stringify(ok.body)}`);
    const stored = await traceEvents(local.cookie, "?observer=reported:claude-code");
    if (stored.length !== 1) throw new Error(`expected one reported event, got ${stored.length}`);
    if (stored[0].agentId !== "external:claude-code" || stored[0].meta.token !== "[redacted]" || stored[0].meta.bytes !== 120) throw new Error(`reported event not sanitized/labelled: ${JSON.stringify(stored[0])}`);
  });

  test("TC-TRACE-05", "Coverage reports instrumentation gaps explicitly", async () => {
    const res = await fetchJson("/api/trace/coverage", { headers: { cookie: local.cookie } });
    if (res.status !== 200) throw new Error(`coverage returned ${res.status}`);
    const byOp = Object.fromEntries(res.body.operations.map((entry) => [entry.operation, entry.status]));
    if (byOp["model.request"] !== "instrumented" || byOp["fs.read"] !== "not-instrumented") throw new Error("coverage statuses are wrong");
    if (res.body.recording.recording !== true || res.body.recording.persistence !== "file") throw new Error(`recording state wrong: ${JSON.stringify(res.body.recording)}`);
  });

  test("TC-MODELS-01", "Models endpoint reports real provider locality and installed models", async () => {
    const res = await fetchJson("/api/models", { headers: { cookie: local.cookie } });
    if (res.status !== 200) throw new Error(`models returned ${res.status}`);
    if (res.body.policy !== "consent") throw new Error("policy should be consent");
    const ollama = res.body.providers.find((p) => p.id === "ollama");
    const gateway = res.body.providers.find((p) => p.id === "uios-gateway");
    if (ollama?.locality !== "local" || gateway?.locality !== "remote") throw new Error("locality wrong");
    const chatModel = ollama.models.find((m) => m.id === "mock-local");
    const embedModel = ollama.models.find((m) => m.id === "nomic-embed-text");
    if (!chatModel?.installed || chatModel.contextWindow !== 8192 || embedModel?.embeddingDims !== 768) throw new Error(`model metadata wrong: ${JSON.stringify(ollama.models)}`);
  });

  test("TC-DOCS-01", "Private docs require a session; public docs stay public", async () => {
    const privateAnon = await fetchJson("/api/universe/document?path=docs%2Fintelligence-core%2FDECISIONS.md");
    if (privateAnon.status !== 404) throw new Error(`anonymous private doc must be 404, got ${privateAnon.status}`);
    const publicAnon = await fetchJson("/api/universe/document?path=docs%2FGENESIS_ENGINE.md");
    if (publicAnon.status !== 200) throw new Error(`public doc must be 200, got ${publicAnon.status}`);
    const topology = await fetchJson("/api/universe/topology");
    if (JSON.stringify(topology.body.documents).includes("intelligence-core")) throw new Error("anonymous catalogue must not list private docs");
    const privateAuthed = await fetchJson("/api/universe/document?path=docs%2Fintelligence-core%2FDECISIONS.md", { headers: { cookie: local.cookie } });
    if (privateAuthed.status !== 200) throw new Error(`signed-in private doc must be 200, got ${privateAuthed.status}`);
  });

  test("TC-INGEST-LOCAL-01", "Uploads are embedded by the local model with true dimensions", async () => {
    const before = await mockStats();
    const form = new FormData();
    form.append("file", new Blob(["Local embeddings keep documents on this machine."], { type: "text/plain" }), "local.txt");
    const upload = await fetch(`${baseUrl}/api/ingestion/upload`, { method: "POST", headers: { cookie: local.cookie }, body: form });
    if (upload.status !== 202) throw new Error(`upload returned ${upload.status}`);
    const { jobId } = await upload.json();
    let status;
    for (let i = 0; i < 40; i += 1) {
      status = (await fetchJson(`/api/ingestion/status?jobId=${jobId}`, { headers: { cookie: local.cookie } })).body?.status;
      if (status === "completed" || status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (status !== "completed") throw new Error(`ingestion ended ${status}`);
    const after = await mockStats();
    if (after.ollamaEmbedCalls <= before.ollamaEmbedCalls) throw new Error("local embedder was not called");
    const search = await fetchJson("/api/ingestion/search?q=Local%20embeddings%20machine", { headers: { cookie: local.cookie } });
    const chunk = search.body.records.find((r) => r.metadata?.fileName === "local.txt");
    if (chunk?.metadata.embeddingStatus !== "embedded" || chunk.metadata.embeddingModel !== "ollama:nomic-embed-text" || chunk.metadata.embeddingDims !== "768") throw new Error(`chunk provenance wrong: ${JSON.stringify(chunk?.metadata)}`);
    const events = await traceEvents(local.cookie, "?operation=document.ingest,model.embed");
    if (!events.some((e) => e.operation === "document.ingest" && e.status === "ok") || !events.some((e) => e.operation === "model.embed" && e.destination === "local")) throw new Error("ingestion was not traced");
  });
}
