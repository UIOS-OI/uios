import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatRequest, ChatResponse, ModelDescriptor, ModelProvider, ProviderHealth } from "../../packages/contracts/src/index.ts";
import { ModelRouter, NoEligibleProviderError, createModelRouter } from "../../services/router/src/index.ts";

function fakeProvider(id: string, health: Partial<ProviderHealth> = {}): ModelProvider & { healthCalls: number } {
  return {
    id,
    healthCalls: 0,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return { id: "r", provider: id, model: request.model ?? "m", content: `from ${id}` };
    },
    async listModels(): Promise<ModelDescriptor[]> {
      return [];
    },
    async health(): Promise<ProviderHealth> {
      this.healthCalls += 1;
      return { healthy: true, checkedAt: new Date(0).toISOString(), ...health };
    },
  };
}

test("rejects duplicate provider registration", () => {
  const router = new ModelRouter().register(fakeProvider("a"));
  assert.throws(() => router.register(fakeProvider("a")), /already registered/);
});

test("fails when no providers are registered", async () => {
  await assert.rejects(new ModelRouter().select({ messages: [], strategy: "balanced" }), /no model providers/);
});

test("explicit strategy selects the first registered provider without health checks", async () => {
  const a = fakeProvider("a");
  const b = fakeProvider("b");
  const { decision } = await createModelRouter([a, b]).select({ messages: [], strategy: "explicit" });
  assert.equal(decision.providerId, "a");
  assert.deepEqual(decision.candidates, ["a", "b"]);
  assert.equal(a.healthCalls + b.healthCalls, 0);
});

test("a named provider must exist", async () => {
  const router = createModelRouter([fakeProvider("a")]);
  await assert.rejects(router.select({ messages: [], provider: "missing" }), /unavailable: missing/);
  const { decision } = await router.select({ messages: [], provider: "a" });
  assert.equal(decision.strategy, "explicit");
});

test("fastest strategy picks the lowest-latency healthy provider and skips unhealthy ones", async () => {
  const router = createModelRouter([
    fakeProvider("slow", { latencyMs: 400 }),
    fakeProvider("down", { healthy: false, latencyMs: 1 }),
    fakeProvider("quick", { latencyMs: 20 }),
  ]);
  const { decision } = await router.select({ messages: [], strategy: "fastest" });
  assert.equal(decision.providerId, "quick");
  assert.deepEqual(decision.candidates, ["quick", "slow"]);
});

test("fails closed when every provider is unhealthy", async () => {
  const router = createModelRouter([fakeProvider("a", { healthy: false }), fakeProvider("b", { healthy: false })]);
  await assert.rejects(router.select({ messages: [], strategy: "balanced" }), /no healthy model providers/);
});

test("caches health results between selections", async () => {
  const a = fakeProvider("a");
  const router = createModelRouter([a]);
  await router.select({ messages: [], strategy: "balanced" });
  await router.select({ messages: [], strategy: "balanced" });
  assert.equal(a.healthCalls, 1);
});

test("route returns the provider response with measured latency", async () => {
  const { decision, response } = await createModelRouter([fakeProvider("a")]).route({ messages: [], model: "m1", strategy: "explicit" });
  assert.equal(decision.providerId, "a");
  assert.equal(response.content, "from a");
  assert.equal(response.model, "m1");
  assert.equal(typeof response.latencyMs, "number");
});

function localProvider(id: string, health: Partial<ProviderHealth> = {}) {
  return Object.assign(fakeProvider(id, health), { locality: "local" as const });
}

test("local providers are ordered before remote ones regardless of registration order", async () => {
  const router = createModelRouter([fakeProvider("cloud"), localProvider("ollama")]);
  const { decision } = await router.candidates({ messages: [], strategy: "explicit" });
  assert.deepEqual(decision.candidates, ["ollama", "cloud"]);
});

test("allowRemote=false excludes remote providers and reports what was excluded", async () => {
  const router = createModelRouter([fakeProvider("cloud"), localProvider("ollama")]);
  const { providers } = await router.candidates({ messages: [], strategy: "explicit", allowRemote: false });
  assert.deepEqual(providers.map((p) => p.id), ["ollama"]);

  const cloudOnly = createModelRouter([fakeProvider("cloud")]);
  await assert.rejects(cloudOnly.candidates({ messages: [], allowRemote: false }), (error: unknown) => {
    assert.ok(error instanceof NoEligibleProviderError);
    assert.deepEqual(error.remoteExcluded, ["cloud"]);
    return true;
  });
});

test("an undeclared locality is treated as remote, never as local", async () => {
  const router = createModelRouter([fakeProvider("undeclared")]);
  await assert.rejects(router.candidates({ messages: [], allowRemote: false }), /No local model provider/);
});

test("a named remote provider is refused when remote routing is not permitted", async () => {
  const router = createModelRouter([fakeProvider("cloud"), localProvider("ollama")]);
  await assert.rejects(router.candidates({ messages: [], provider: "cloud", allowRemote: false }), /remote routing is not permitted/);
});

test("capability filtering skips providers that declare they lack it", async () => {
  const chatOnly = Object.assign(localProvider("chat-only"), { capabilities: ["chat" as const] });
  const embedder = Object.assign(localProvider("embedder"), { capabilities: ["embed" as const] });
  const { providers } = await createModelRouter([chatOnly, embedder]).candidates({ messages: [], strategy: "explicit", capability: "embed" });
  assert.deepEqual(providers.map((p) => p.id), ["embedder"]);
});

test("unhealthy local provider falls behind healthy remote only when remote is allowed", async () => {
  const router = createModelRouter([localProvider("ollama", { healthy: false }), fakeProvider("cloud")]);
  const allowed = await router.candidates({ messages: [], strategy: "balanced" });
  assert.deepEqual(allowed.decision.candidates, ["cloud"]);
  await assert.rejects(createModelRouter([localProvider("ollama", { healthy: false }), fakeProvider("cloud")]).candidates({ messages: [], strategy: "balanced", allowRemote: false }), /no healthy model providers/);
});
