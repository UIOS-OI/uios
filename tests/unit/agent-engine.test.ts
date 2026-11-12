import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatRequest, ChatResponse, ModelProvider } from "../../packages/contracts/src/index.ts";
import { AgentEngine } from "../../services/agent-engine/src/index.ts";

/** Provider that replays a fixed script of responses and records every request it receives. */
function scriptedProvider(script: Array<Partial<ChatResponse>>): ModelProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  let index = 0;
  return {
    id: "scripted",
    requests,
    async chat(request) {
      requests.push(structuredClone(request));
      const next = script[Math.min(index, script.length - 1)];
      index += 1;
      return { id: `r${index}`, provider: "scripted", model: "m", content: "", ...next };
    },
    async listModels() {
      return [];
    },
    async health() {
      return { healthy: true, checkedAt: new Date(0).toISOString() };
    },
  };
}

test("returns the model output when no tools are requested", async () => {
  const provider = scriptedProvider([{ content: "done" }]);
  const run = await new AgentEngine().run(provider, { prompt: "hi", system: "be brief" });
  assert.equal(run.status, "completed");
  assert.equal(run.output, "done");
  assert.equal(run.steps, 1);
  assert.deepEqual(provider.requests[0].messages.map((m) => m.role), ["system", "user"]);
});

test("executes a registered tool and feeds the result back to the model", async () => {
  const provider = scriptedProvider([
    { content: "", toolCalls: [{ id: "c1", name: "add", input: { a: 2, b: 3 } }] },
    { content: "the sum is 5" },
  ]);
  const seen: Array<Record<string, unknown>> = [];
  const run = await new AgentEngine().run(provider, {
    prompt: "add 2 and 3",
    tools: [{ name: "add", description: "adds", execute: async (input) => { seen.push(input); return { sum: Number(input.a) + Number(input.b) }; } }],
  });
  assert.equal(run.status, "completed");
  assert.equal(run.output, "the sum is 5");
  assert.deepEqual(seen, [{ a: 2, b: 3 }]);
  const toolMessage = provider.requests[1].messages.find((m) => m.role === "tool");
  assert.equal(toolMessage?.content, JSON.stringify({ sum: 5 }));
  assert.equal(toolMessage?.toolCallId, "c1");
});

test("fails instead of executing a tool that was not registered", async () => {
  const provider = scriptedProvider([{ toolCalls: [{ id: "c1", name: "rm_rf", input: {} }] }]);
  const run = await new AgentEngine().run(provider, { prompt: "x", tools: [] });
  assert.equal(run.status, "failed");
  assert.match(run.error ?? "", /unregistered tool: rm_rf/);
});

test("stops at the step limit when the model keeps calling tools", async () => {
  const provider = scriptedProvider([{ toolCalls: [{ id: "c", name: "noop", input: {} }] }]);
  const run = await new AgentEngine().run(provider, { prompt: "loop", maxSteps: 3, tools: [{ name: "noop", description: "", execute: async () => null }] });
  assert.equal(run.status, "limit_reached");
  assert.equal(run.steps, 3);
  assert.equal(provider.requests.length, 3);
});

test("clamps maxSteps to the 1..32 safety range", async () => {
  const provider = scriptedProvider([{ toolCalls: [{ id: "c", name: "noop", input: {} }] }]);
  const run = await new AgentEngine().run(provider, { prompt: "loop", maxSteps: 1000, tools: [{ name: "noop", description: "", execute: async () => null }] });
  assert.equal(run.steps, 32);
  const zero = await new AgentEngine().run(scriptedProvider([{ content: "ok" }]), { prompt: "x", maxSteps: 0 });
  assert.equal(zero.status, "completed");
});

test("reports a failed run when the tool throws", async () => {
  const provider = scriptedProvider([{ toolCalls: [{ id: "c", name: "boom", input: {} }] }]);
  const run = await new AgentEngine().run(provider, { prompt: "x", tools: [{ name: "boom", description: "", execute: async () => { throw new Error("tool exploded"); } }] });
  assert.equal(run.status, "failed");
  assert.equal(run.error, "tool exploded");
});
