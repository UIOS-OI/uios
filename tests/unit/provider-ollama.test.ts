import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { OllamaModelProvider, ThinkStreamFilter, separateReasoning } from "../../services/provider-ollama/src/index.ts";

// Mock of Ollama's native API. Behaviour switches on the model name so each test is explicit.
const requests: Array<{ url: string; body: any }> = [];
let server: Server;
let baseUrl = "";
let installed = ["qwen3.5:2b", "nomic-embed-text:latest", "plain:1b"];

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ url: req.url ?? "", body });
      const json = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
      if (req.url === "/api/version") return json(200, { version: "0.9.9-mock" });
      if (req.url === "/api/tags") return json(200, { models: installed.map((name) => ({ name })) });
      if (req.url === "/api/show") {
        if (body.model === "qwen3.5:2b") return json(200, { capabilities: ["completion", "tools", "thinking"], model_info: { "qwen3.context_length": 32768 } });
        if (body.model.startsWith("nomic-embed-text")) return json(200, { capabilities: ["embedding"], model_info: { "nomic-bert.embedding_length": 768 } });
        if (body.model === "plain:1b") return json(200, { capabilities: ["completion"] });
        return json(404, { error: `model '${body.model}' not found` });
      }
      if (req.url === "/api/embed") {
        const count = body.model === "short-embed" ? body.input.length - 1 : body.input.length;
        return json(200, { embeddings: Array.from({ length: count }, (_, i) => [i, 0.25, 0.5]) });
      }
      if (req.url === "/api/chat") {
        if (body.model === "missing-model") return json(404, { error: "model 'missing-model' not found, try pulling it first" });
        if (body.stream) {
          res.writeHead(200, { "content-type": "application/x-ndjson" });
          const parts = ["Hel", "lo <thi", "nk>secret plan</th", "ink> world"];
          parts.forEach((content) => res.write(JSON.stringify({ model: body.model, message: { role: "assistant", content }, done: false }) + "\n"));
          res.end(JSON.stringify({ model: body.model, message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 11, eval_count: 4 }) + "\n");
          return;
        }
        if (body.tools) {
          return json(200, { model: body.model, message: { role: "assistant", content: "", tool_calls: [{ function: { name: "search_memory", arguments: { query: "ollama" } } }] }, done: true, done_reason: "stop" });
        }
        return json(200, { model: body.model, message: { role: "assistant", content: "<think>internal</think>Answer.", thinking: "native trace" }, done: true, done_reason: "stop", prompt_eval_count: 20, eval_count: 3 });
      }
      json(404, { error: "unknown" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { requests.length = 0; installed = ["qwen3.5:2b", "nomic-embed-text:latest", "plain:1b"]; });

const provider = (overrides: Partial<ConstructorParameters<typeof OllamaModelProvider>[0]> = {}) =>
  new OllamaModelProvider({ baseUrl, chatModel: "qwen3.5:2b", embedModel: "nomic-embed-text", ...overrides });

test("declares itself local with the Ollama host as destination", () => {
  const p = provider();
  assert.equal(p.locality, "local");
  assert.equal(p.destination, new URL(baseUrl).host);
});

test("chat sends num_ctx, disables thinking for thinking-capable models, and separates reasoning", async () => {
  const response = await provider().chat({ messages: [{ role: "user", content: "hi" }] });
  const sent = requests.find((r) => r.url === "/api/chat")!.body;
  assert.equal(sent.options.num_ctx, 8192);
  assert.equal(sent.think, false);
  assert.equal(sent.stream, false);
  assert.equal(response.content, "Answer.");
  assert.match(response.reasoning ?? "", /native trace/);
  assert.match(response.reasoning ?? "", /internal/);
  assert.deepEqual(response.usage, { inputTokens: 20, outputTokens: 3, totalTokens: 23 });
});

test("does not send the think flag to models without the thinking capability", async () => {
  await provider({ chatModel: "plain:1b" }).chat({ messages: [{ role: "user", content: "hi" }] });
  const sent = requests.find((r) => r.url === "/api/chat")!.body;
  assert.equal("think" in sent, false);
});

test("maps tool specs out and tool calls back", async () => {
  const response = await provider().chat({
    messages: [{ role: "user", content: "find" }],
    tools: [{ name: "search_memory", description: "search", parameters: { type: "object", properties: { query: { type: "string" } } } }],
  });
  const sent = requests.find((r) => r.url === "/api/chat")!.body;
  assert.equal(sent.tools[0].type, "function");
  assert.equal(sent.tools[0].function.name, "search_memory");
  assert.equal(response.finishReason, "tool_call");
  assert.equal(response.toolCalls?.[0].name, "search_memory");
  assert.deepEqual(response.toolCalls?.[0].input, { query: "ollama" });
});

test("serialises assistant tool calls and tool results in Ollama's message format", async () => {
  await provider({ chatModel: "plain:1b" }).chat({
    messages: [
      { role: "user", content: "x" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "t", input: { a: 1 } }] },
      { role: "tool", name: "t", toolCallId: "c1", content: "{\"ok\":true}" },
    ],
  });
  const sent = requests.find((r) => r.url === "/api/chat")!.body;
  assert.deepEqual(sent.messages[1].tool_calls, [{ function: { name: "t", arguments: { a: 1 } } }]);
  assert.equal(sent.messages[2].tool_name, "t");
});

test("stream yields answer text with think spans removed even when tags split across chunks", async () => {
  let text = "";
  let final;
  for await (const chunk of provider().stream({ messages: [{ role: "user", content: "hi" }] })) {
    text += chunk.content;
    if (chunk.finishReason) final = chunk;
  }
  assert.equal(text, "Hello  world");
  assert.equal(final?.finishReason, "stop");
  assert.deepEqual(final?.usage, { inputTokens: 11, outputTokens: 4 });
});

test("embed applies nomic task prefixes and returns one vector per input", async () => {
  const p = provider();
  const vectors = await p.embed(["alpha", "beta"], "query");
  assert.equal(vectors.length, 2);
  const sent = requests.find((r) => r.url === "/api/embed")!.body;
  assert.deepEqual(sent.input, ["search_query: alpha", "search_query: beta"]);
  await p.embed(["gamma"]);
  assert.deepEqual(requests.filter((r) => r.url === "/api/embed")[1].body.input, ["search_document: gamma"]);
});

test("embed rejects a response whose vector count does not match the inputs", async () => {
  await assert.rejects(provider({ embedModel: "short-embed" }).embed(["a", "b"]), /returned 1 embeddings for 2 inputs/);
});

test("listModels reports installation, capabilities, context and embedding size from the server", async () => {
  const models = await provider().listModels();
  const chat = models.find((m) => m.id === "qwen3.5:2b")!;
  const embed = models.find((m) => m.id === "nomic-embed-text")!;
  assert.equal(chat.installed, true);
  assert.deepEqual(chat.capabilities, ["chat", "stream", "tools", "thinking"]);
  assert.equal(chat.contextWindow, 32768);
  assert.equal(embed.installed, true);
  assert.equal(embed.embeddingDims, 768);
});

test("health is unhealthy, with a pull hint, when the chat model is not installed", async () => {
  installed = ["nomic-embed-text:latest"];
  const health = await provider().health();
  assert.equal(health.healthy, false);
  assert.match(health.message ?? "", /not installed: qwen3\.5:2b.*ollama pull qwen3\.5:2b/);
  installed = ["qwen3.5:2b", "nomic-embed-text:latest"];
  assert.equal((await provider().health()).healthy, true);
});

test("health is unhealthy when Ollama is not reachable", async () => {
  const health = await new OllamaModelProvider({ baseUrl: "http://127.0.0.1:1", chatModel: "x", timeoutMs: 500 }).health();
  assert.equal(health.healthy, false);
  assert.match(health.message ?? "", /not reachable/);
});

test("surfaces Ollama error messages instead of failing silently", async () => {
  await assert.rejects(provider({ chatModel: "missing-model" }).chat({ messages: [{ role: "user", content: "x" }] }), /\(404\): model 'missing-model' not found/);
});

test("cancellation aborts an in-flight request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider({ chatModel: "plain:1b" }).chat({ messages: [{ role: "user", content: "x" }], signal: controller.signal }));
});

test("separateReasoning leaves text without think blocks untouched", () => {
  assert.deepEqual(separateReasoning("plain"), { content: "plain", reasoning: "" });
});

test("ThinkStreamFilter handles tags split at every possible position", () => {
  const source = "A<think>hidden</think>B<think>x</think>C";
  for (let size = 1; size <= source.length; size += 1) {
    const filter = new ThinkStreamFilter();
    let out = "";
    for (let i = 0; i < source.length; i += size) out += filter.push(source.slice(i, i + size));
    out += filter.flush();
    assert.equal(out, "ABC", `chunk size ${size}`);
  }
});

test("ThinkStreamFilter releases a lone '<' that is not a tag and drops an unterminated think block", () => {
  const filter = new ThinkStreamFilter();
  assert.equal(filter.push("a <") + filter.push("b") + filter.flush(), "a <b");
  const open = new ThinkStreamFilter();
  assert.equal(open.push("x<think>never closed") + open.flush(), "x");
});

test("separateReasoning moves an unterminated think block out of the answer", () => {
  assert.deepEqual(separateReasoning("Answer <think>half"), { content: "Answer ", reasoning: "half" });
});
