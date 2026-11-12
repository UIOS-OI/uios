import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelProvider, TraceEvent, TraceSignal } from "../../packages/contracts/src/index.ts";
import { TraceBus, newTraceContext, sanitizeMeta, tracedProvider, withSpan } from "../../services/trace/src/index.ts";
import { IntelligenceStore, SqliteTraceStore } from "../../services/intelligence-store/src/index.ts";

function memoryStores() {
  const store = new IntelligenceStore(":memory:");
  const traces = new SqliteTraceStore(store);
  return { store, traces, bus: new TraceBus(traces) };
}

test("migrations apply once and record their version", () => {
  const dir = mkdtempSync(join(tmpdir(), "uios-store-"));
  try {
    const path = join(dir, "intel.sqlite");
    const first = new IntelligenceStore(path);
    assert.equal(first.schemaVersion(), 1);
    assert.equal(first.persistence, "file");
    first.close();
    const reopened = new IntelligenceStore(path);
    assert.equal(reopened.schemaVersion(), 1);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trace events persist across store restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "uios-store-"));
  try {
    const path = join(dir, "intel.sqlite");
    const store = new IntelligenceStore(path);
    const bus = new TraceBus(new SqliteTraceStore(store));
    bus.start(newTraceContext("tenant-a"), { operation: "memory.write", resourceUrn: "uios:memory:1" }).end("ok");
    store.close();
    const reopened = new IntelligenceStore(path);
    const events = new SqliteTraceStore(reopened).query({ tenantId: "tenant-a" }).events;
    assert.equal(events.length, 1);
    assert.equal(events[0].resourceUrn, "uios:memory:1");
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spans publish start then a single persisted end event with duration", async () => {
  const { bus, traces } = memoryStores();
  const signals: TraceSignal[] = [];
  bus.subscribe("t", (signal) => signals.push(signal));
  const span = bus.start(newTraceContext("t", { agentId: "agent-1" }), { operation: "tool.call", resourceUrn: "uios:tool:search", meta: { results: 3 } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const ended = span.end("ok");
  assert.equal(span.end("error"), null, "a span can only end once");
  assert.deepEqual(signals.map((s) => s.phase), ["start", "end"]);
  assert.equal(ended?.agentId, "agent-1");
  assert.ok((ended?.durationMs ?? 0) >= 1);
  assert.equal(traces.count("t"), 1);
});

test("recording does not depend on subscribers, and subscribers only see their own tenant", () => {
  const { bus, traces } = memoryStores();
  const seen: string[] = [];
  bus.subscribe("tenant-b", (signal) => seen.push(signal.event.tenantId));
  bus.start(newTraceContext("tenant-a"), { operation: "memory.read" }).end("ok");
  assert.equal(traces.count("tenant-a"), 1, "persisted with no tenant-a subscriber");
  assert.deepEqual(seen, [], "tenant-b never sees tenant-a events");
});

test("queries are tenant-scoped, filterable, and paginate newest first", () => {
  const { bus, traces } = memoryStores();
  for (let i = 0; i < 5; i += 1) bus.start(newTraceContext("a"), { operation: i % 2 ? "memory.read" : "model.request" }).end(i === 4 ? "error" : "ok");
  bus.start(newTraceContext("b"), { operation: "memory.read" }).end("ok");
  assert.throws(() => traces.query({ tenantId: "" }), /require a tenant id/);
  assert.equal(traces.query({ tenantId: "a", operations: ["memory.read"] }).events.length, 2);
  assert.equal(traces.query({ tenantId: "a", statuses: ["error"] }).events.length, 1);
  const page1 = traces.query({ tenantId: "a", limit: 3 });
  assert.equal(page1.events.length, 3);
  assert.ok(page1.nextCursor);
  const page2 = traces.query({ tenantId: "a", limit: 3, cursor: page1.nextCursor });
  assert.equal(page2.events.length, 2);
  assert.equal(page2.nextCursor, undefined);
  const ids = new Set([...page1.events, ...page2.events].map((e) => e.id));
  assert.equal(ids.size, 5, "no duplicates across pages");
  assert.ok(page1.events.every((e) => e.tenantId === "a"));
});

test("metadata is bounded and credential-like values are redacted", () => {
  const meta = sanitizeMeta({
    ok: 1, flag: true, "bad key!": "x", nan: Number.NaN, object: { nested: true },
    token: "ghp_abcdefghijklmnopqrstuvwxyz0123", auth: "Bearer abcdefghijklmnopqrstuvwxyz", note: "x".repeat(400),
  });
  assert.equal(meta.ok, 1);
  assert.equal(meta.flag, true);
  assert.equal("bad key!" in meta, false);
  assert.equal("nan" in meta, false);
  assert.equal("object" in meta, false);
  assert.equal(meta.token, "[redacted]");
  assert.equal(meta.auth, "[redacted]");
  assert.equal(String(meta.note).length, 256);
});

test("withSpan marks failures and rethrows", async () => {
  const { bus, traces } = memoryStores();
  await assert.rejects(withSpan(bus, newTraceContext("t"), { operation: "fs.read" }, async () => { throw new Error("EACCES denied"); }), /EACCES/);
  const [event] = traces.query({ tenantId: "t" }).events;
  assert.equal(event.status, "error");
  assert.equal(event.meta.error, "EACCES denied");
});

function stubProvider(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    id: "stub",
    locality: "local",
    async chat() { return { id: "1", provider: "stub", model: "m", content: "SECRET ANSWER TEXT", usage: { inputTokens: 5, outputTokens: 2 } }; },
    async *stream() { yield { id: "1", provider: "stub", model: "m", content: "a" }; yield { id: "2", provider: "stub", model: "m", content: "b", finishReason: "stop" }; },
    async embed(inputs) { return inputs.map(() => [0, 1, 2]); },
    async listModels() { return []; },
    async health() { return { healthy: true, checkedAt: "" }; },
    ...overrides,
  };
}

test("tracedProvider records model calls with sizes only, never prompt or answer text", async () => {
  const { bus, traces } = memoryStores();
  const provider = tracedProvider(stubProvider(), bus, newTraceContext("t"));
  await provider.chat({ messages: [{ role: "user", content: "PRIVATE PROMPT TEXT" }], model: "m" });
  for await (const _ of provider.stream!({ messages: [{ role: "user", content: "x" }] })) { /* drain */ }
  await provider.embed!(["a", "b"], "query");
  const events = traces.query({ tenantId: "t" }).events;
  assert.deepEqual(events.map((e) => e.operation).sort(), ["model.embed", "model.request", "model.request"]);
  assert.ok(events.every((e) => e.destination === "local" && e.status === "ok"));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("PRIVATE PROMPT TEXT"), false);
  assert.equal(serialized.includes("SECRET ANSWER TEXT"), false);
  const chat = events.find((e) => e.meta.mode === "chat")!;
  assert.equal(chat.meta.inputTokens, 5);
  assert.equal(chat.meta.inputChars, "PRIVATE PROMPT TEXT".length);
  assert.equal(events.find((e) => e.operation === "model.embed")!.meta.dims, 3);
});

test("tracedProvider marks remote destinations and records stream consumers that stop early", async () => {
  const { bus, traces } = memoryStores();
  const remote = tracedProvider(stubProvider({ id: "cloud", locality: "remote", destination: "api.example.com" }), bus, newTraceContext("t"));
  for await (const _ of remote.stream!({ messages: [] })) break;
  const [event] = traces.query({ tenantId: "t" }).events;
  assert.equal(event.destination, "remote:api.example.com");
  assert.equal(event.status, "cancelled");
  assert.equal(event.meta.reason, "consumer-stopped");
});

test("a failing sink never breaks execution and is counted", () => {
  const bus = new TraceBus({ write() { throw new Error("disk full"); } });
  const original = console.error;
  console.error = () => undefined;
  try {
    const event: TraceEvent | null = bus.start(newTraceContext("t"), { operation: "memory.read" }).end("ok");
    assert.ok(event);
    assert.equal(bus.droppedWrites, 1);
  } finally {
    console.error = original;
  }
});

test("retention prunes only old events", () => {
  const { bus, traces } = memoryStores();
  bus.start(newTraceContext("t"), { operation: "memory.read" }).end("ok");
  assert.equal(traces.prune(30), 0);
  assert.equal(traces.prune(30, Date.now() + 31 * 86_400_000), 1);
});
