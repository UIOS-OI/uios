import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatRequest, ChatResponse, ModelDescriptor, ModelProvider, ProviderHealth } from "../../packages/contracts/src/index.ts";
import { ModelRouter, createModelRouter } from "../../services/router/src/index.ts";

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
