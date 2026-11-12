import { test } from "node:test";
import assert from "node:assert/strict";
import type { MemoryRecord, UiosPlugin, UiosPluginManifest } from "../../packages/contracts/src/index.ts";
import { MemoryStore } from "../../services/memory/src/index.ts";
import { PluginRegistry } from "../../services/plugin-registry/src/index.ts";

test("memory list and search never cross tenant boundaries", async () => {
  const store = new MemoryStore();
  await store.save("tenant-a", "alpha quarterly revenue report");
  await store.save("tenant-b", "beta quarterly revenue forecast");
  const a = await store.search("tenant-a", "quarterly revenue");
  assert.equal(a.length, 1);
  assert.equal(a[0].tenantId, "tenant-a");
  assert.equal((await store.list("tenant-b")).length, 1);
  assert.deepEqual(await store.search("tenant-c", "quarterly revenue"), []);
});

test("memory search ranks by matched terms and ignores short terms", async () => {
  const store = new MemoryStore();
  await store.save("t", "ollama runs locally");
  await store.save("t", "ollama runs qwen locally on the laptop");
  const results = await store.search("t", "ollama qwen laptop of");
  assert.equal(results[0].content, "ollama runs qwen locally on the laptop");
  assert.deepEqual(await store.search("t", "a an of"), []);
});

test("memory clear removes only the given tenant", async () => {
  const store = new MemoryStore();
  await store.save("a", "keep me out");
  await store.save("b", "keep me");
  await store.clear("a");
  assert.equal((await store.list("a")).length, 0);
  assert.equal((await store.list("b")).length, 1);
});

test("memory loads persisted records and writes new ones through", async () => {
  const saved: MemoryRecord[] = [];
  const existing: MemoryRecord = { id: "1", tenantId: "t", content: "persisted fact", metadata: {}, createdAt: new Date(0).toISOString() };
  const store = new MemoryStore({ save: (r) => { saved.push(r); }, list: async () => [existing] });
  assert.equal((await store.list("t"))[0].content, "persisted fact");
  await store.save("t", "new fact", { source: "test" });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].metadata, { source: "test" });
});

function plugin(manifest: Partial<UiosPluginManifest>, onSetup?: UiosPlugin["setup"]): UiosPlugin {
  return {
    manifest: { id: "sample-plugin", name: "Sample", version: "1.0.0", kind: "tool", description: "", permissions: [], capabilities: [], ...manifest },
    setup: onSetup ?? (() => undefined),
  };
}

test("plugin install requires every requested permission to be approved", async () => {
  const registry = new PluginRegistry();
  await assert.rejects(registry.install(plugin({ permissions: ["network:egress", "memory:read"] }), ["memory:read"]), /require approval: network:egress/);
  assert.equal(registry.list().length, 0);
  await registry.install(plugin({ permissions: ["memory:read"] }), ["memory:read"]);
  assert.deepEqual(registry.listManifests().map((m) => m.id), ["sample-plugin"]);
});

test("plugin install rejects unknown permissions, invalid ids, and duplicates", async () => {
  const registry = new PluginRegistry();
  await assert.rejects(registry.install(plugin({ permissions: ["root:everything" as never] }), ["root:everything" as never]), /unknown permission/);
  await assert.rejects(registry.install(plugin({ id: "Bad_ID" })), /Invalid UIOS plugin id/);
  await registry.install(plugin({}));
  await assert.rejects(registry.install(plugin({})), /already installed/);
});

test("plugins can register model providers once", async () => {
  const registry = new PluginRegistry();
  const provider = { id: "p", chat: async () => ({ id: "", provider: "p", model: "", content: "" }), listModels: async () => [], health: async () => ({ healthy: true, checkedAt: "" }) };
  await registry.install(plugin({ id: "provider-one" }, (ctx) => ctx.registerModelProvider(provider)));
  assert.deepEqual(registry.listProviders(), ["p"]);
  await assert.rejects(registry.install(plugin({ id: "provider-two" }, (ctx) => ctx.registerModelProvider(provider))), /provider already registered/);
});
