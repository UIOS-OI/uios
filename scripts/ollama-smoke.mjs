// UIOS local-inference smoke test. Run on the machine where Ollama is installed:
//   corepack pnpm ollama-smoke
// Optional: UIOS_BASE_URL + UIOS_API_KEY to also verify the request path through a running UIOS server.
// Every value in the report is observed from Ollama/UIOS responses; nothing is estimated or filled in.
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";

const baseUrl = (process.env.UIOS_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const chatModel = process.env.UIOS_OLLAMA_CHAT_MODEL || "qwen3.5:2b";
const embedModel = process.env.UIOS_OLLAMA_EMBED_MODEL || "nomic-embed-text";
const numCtx = Number(process.env.UIOS_OLLAMA_NUM_CTX || 8192);

const report = {
  observedAt: new Date().toISOString(),
  host: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? "unknown", logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30), node: process.version },
  ollama: { url: baseUrl },
  config: { chatModel, embedModel, numCtx },
  checks: [],
};

function check(name, ok, details = {}) {
  report.checks.push({ name, ok, ...details });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${details.note ? ` — ${details.note}` : ""}`);
  return ok;
}

async function call(path, body, timeoutMs = 300_000) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: response.status, json, ms: Math.round(performance.now() - started) };
}

const perSecond = (count, durationNs) => (count && durationNs ? Math.round((count / (durationNs / 1e9)) * 10) / 10 : null);

try {
  const version = await call("/api/version", undefined, 5000).catch((error) => ({ status: 0, json: { error: error.message } }));
  report.ollama.version = version.json.version ?? null;
  if (!check("Ollama reachable", version.status === 200, { note: version.status === 200 ? `version ${version.json.version}` : `cannot reach ${baseUrl}: ${version.json.error ?? version.status}` })) throw new Error("stop");

  const tags = await call("/api/tags");
  const installed = (tags.json.models ?? []).map((m) => m.name);
  report.ollama.installedModels = installed;
  const has = (name) => installed.includes(name) || installed.includes(`${name}:latest`);
  const chatInstalled = check(`chat model installed (${chatModel})`, has(chatModel), { note: has(chatModel) ? "" : `run: ollama pull ${chatModel}` });
  const embedInstalled = check(`embedding model installed (${embedModel})`, has(embedModel), { note: has(embedModel) ? "" : `run: ollama pull ${embedModel}` });

  let thinking = false;
  if (chatInstalled) {
    const show = await call("/api/show", { model: chatModel });
    const capabilities = show.json.capabilities ?? null;
    const contextLength = Object.entries(show.json.model_info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1] ?? null;
    thinking = Array.isArray(capabilities) && capabilities.includes("thinking");
    report.model = { capabilities, maxContextLength: contextLength, thinkingCapable: thinking };
    check("model metadata", show.status === 200, { note: `capabilities=${JSON.stringify(capabilities)} maxContext=${contextLength}` });

    const prompt = "Reply with exactly this sentence and nothing else: UIOS local inference OK";
    const chat = await call("/api/chat", { model: chatModel, stream: false, messages: [{ role: "user", content: prompt }], options: { num_ctx: numCtx, temperature: 0 }, ...(thinking ? { think: false } : {}) });
    const content = chat.json.message?.content ?? "";
    report.chat = {
      status: chat.status,
      wallMs: chat.ms,
      loadMs: chat.json.load_duration ? Math.round(chat.json.load_duration / 1e6) : null,
      promptTokens: chat.json.prompt_eval_count ?? null,
      outputTokens: chat.json.eval_count ?? null,
      promptTokensPerSecond: perSecond(chat.json.prompt_eval_count, chat.json.prompt_eval_duration),
      outputTokensPerSecond: perSecond(chat.json.eval_count, chat.json.eval_duration),
      thinkBlockInContent: content.includes("<think>"),
      thinkingFieldReturned: Boolean(chat.json.message?.thinking),
      reply: content.slice(0, 200),
    };
    check("chat round trip", chat.status === 200 && content.length > 0, { note: chat.status === 200 ? `${chat.ms} ms wall, ${report.chat.outputTokensPerSecond ?? "?"} tok/s output` : JSON.stringify(chat.json).slice(0, 200) });
    check("reply follows instruction", /UIOS local inference OK/i.test(content), { note: `reply: ${JSON.stringify(content.slice(0, 80))}` });
    check("no reasoning leaked into answer", !content.includes("<think>"), {});

    const tool = await call("/api/chat", {
      model: chatModel, stream: false, options: { num_ctx: numCtx, temperature: 0 }, ...(thinking ? { think: false } : {}),
      messages: [{ role: "user", content: "What time is it in UTC? Use the tool." }],
      tools: [{ type: "function", function: { name: "current_time", description: "Returns the current UTC time.", parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"] } } }],
    });
    const calls = tool.json.message?.tool_calls ?? [];
    report.toolCalling = { status: tool.status, wallMs: tool.ms, toolCalls: calls.map((c) => ({ name: c.function?.name, arguments: c.function?.arguments })) };
    check("tool calling (informational)", tool.status === 200, { note: calls.length ? `model called ${calls.map((c) => c.function?.name).join(", ")}` : "model answered without calling the tool; small models may need prompting" });
  }

  if (embedInstalled) {
    const embed = await call("/api/embed", { model: embedModel, input: ["search_query: what does UIOS run locally?"] });
    const dims = embed.json.embeddings?.[0]?.length ?? null;
    report.embedding = { status: embed.status, wallMs: embed.ms, dims };
    check("embedding", embed.status === 200 && dims > 0, { note: `dims=${dims}, ${embed.ms} ms` });
  }

  if (process.env.UIOS_BASE_URL && process.env.UIOS_API_KEY) {
    const response = await fetch(`${process.env.UIOS_BASE_URL.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.UIOS_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "Say hello from UIOS in five words." }] }),
      signal: AbortSignal.timeout(300_000),
    });
    const body = await response.text();
    report.uios = { status: response.status, locality: response.headers.get("x-uios-locality"), route: response.headers.get("x-uios-route"), traceId: response.headers.get("x-uios-trace-id") };
    check("UIOS /api/chat routed locally", response.status === 200 && report.uios.locality === "local", { note: response.status === 200 ? `route ${report.uios.route}, trace ${report.uios.traceId}` : body.slice(0, 200) });
  } else {
    report.uios = { skipped: "Set UIOS_BASE_URL and UIOS_API_KEY to verify the UIOS request path." };
  }
} catch (error) {
  if (error.message !== "stop") check("unexpected error", false, { note: error.message });
}

const required = report.checks.filter((c) => !c.name.includes("informational"));
report.passed = required.length > 0 && required.every((c) => c.ok);
mkdirSync(new URL("../apps/dashboard/.uios-data/", import.meta.url), { recursive: true });
const file = new URL(`../apps/dashboard/.uios-data/ollama-smoke-${report.observedAt.replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\n${report.passed ? "PASSED" : "FAILED"} — report written to ${file.pathname}`);
process.exitCode = report.passed ? 0 : 1;
