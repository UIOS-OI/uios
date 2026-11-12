import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GatewayModelProvider } from "../../services/gateway-provider/src/index.ts";

type Captured = { url?: string; headers: IncomingMessage["headers"]; body: unknown };
const captured: Captured[] = [];
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      captured.push({ url: request.url, headers: request.headers, body });
      if (request.url === "/v1/chat/completions" && body?.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`);
        response.write("data: {not json}\n\n");
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] })}\n\n`);
        response.end("data: [DONE]\n\n");
        return;
      }
      if (request.url === "/v1/chat/completions") {
        if (body?.model === "rejected-model") { response.writeHead(429); response.end(); return; }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "c1", model: body.model, choices: [{ message: { content: "pong" }, finish_reason: "stop" }], usage: { totalTokens: 3 } }));
        return;
      }
      if (request.url === "/v1/embeddings") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: body.input.map((_: string, i: number) => ({ embedding: [i, 0.5] })) }));
        return;
      }
      if (request.url === "/v1/models") { response.writeHead(200); response.end("{}"); return; }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const provider = () => new GatewayModelProvider({ baseUrl, apiKey: "test-key", defaultModel: "default-model", embeddingModel: "embed-model", timeoutMs: 2000 });

test("chat sends the default model with bearer auth and parses the reply", async () => {
  const response = await provider().chat({ messages: [{ role: "user", content: "ping" }] });
  assert.equal(response.content, "pong");
  assert.equal(response.model, "default-model");
  assert.equal(response.finishReason, "stop");
  const request = captured.at(-1)!;
  assert.equal(request.headers.authorization, "Bearer test-key");
  assert.equal((request.body as { stream: boolean }).stream, false);
});

test("chat surfaces provider rejections as errors", async () => {
  await assert.rejects(provider().chat({ messages: [], model: "rejected-model" }), /rejected request \(429\)/);
});

test("stream yields deltas in order and skips malformed chunks", async () => {
  const parts: string[] = [];
  let finish: string | undefined;
  for await (const chunk of provider().stream({ messages: [{ role: "user", content: "hi" }] })) {
    parts.push(chunk.content);
    finish = chunk.finishReason ?? finish;
  }
  assert.equal(parts.join(""), "Hello");
  assert.equal(finish, "stop");
});

test("embed uses the configured embedding model and returns one vector per input", async () => {
  const p = provider();
  assert.equal(p.embeddingModelId, "embed-model");
  const vectors = await p.embed(["a", "b", "c"]);
  assert.deepEqual(vectors, [[0, 0.5], [1, 0.5], [2, 0.5]]);
  assert.equal((captured.at(-1)!.body as { model: string }).model, "embed-model");
});

test("health reports reachable and unreachable gateways", async () => {
  assert.equal((await provider().health()).healthy, true);
  const unreachable = new GatewayModelProvider({ baseUrl: "http://127.0.0.1:1/v1", apiKey: "k", defaultModel: "m", timeoutMs: 500 });
  const health = await unreachable.health();
  assert.equal(health.healthy, false);
  assert.ok(health.message);
});
