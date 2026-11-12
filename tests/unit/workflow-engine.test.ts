import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkflowDefinition, WorkflowNode } from "../../packages/contracts/src/index.ts";
import { WorkflowEngine } from "../../services/workflow-engine/src/index.ts";

const node = (id: string, type: WorkflowNode["type"] = "prompt"): WorkflowNode => ({ id, type, label: id, config: {} });

function recordingEngine(order: string[]): WorkflowEngine {
  return new WorkflowEngine()
    .register("prompt", async (n, input) => { order.push(n.id); return { ...input, [n.id]: true }; })
    .register("condition", async (n, input) => { order.push(n.id); return input; });
}

test("runs nodes in dependency order and merges outputs", async () => {
  const order: string[] = [];
  const workflow: WorkflowDefinition = {
    id: "w", name: "w", version: 1,
    nodes: [node("c"), node("a"), node("b")],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
  };
  const run = await recordingEngine(order).run(workflow, { seed: 1 });
  assert.equal(run.status, "completed");
  assert.deepEqual(order, ["a", "b", "c"]);
  assert.deepEqual(run.output, { seed: 1, a: true, b: true, c: true });
  assert.equal(run.currentNodeId, undefined);
});

test("waits for every incoming edge before running a join node", async () => {
  const order: string[] = [];
  const workflow: WorkflowDefinition = {
    id: "w", name: "w", version: 1,
    nodes: [node("a"), node("b"), node("join")],
    edges: [{ from: "a", to: "join" }, { from: "b", to: "join" }],
  };
  await recordingEngine(order).run(workflow);
  assert.equal(order.at(-1), "join");
  assert.equal(order.filter((id) => id === "join").length, 1);
});

test("detects cycles", async () => {
  const workflow: WorkflowDefinition = {
    id: "w", name: "w", version: 1,
    nodes: [node("start"), node("a"), node("b")],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
  };
  const run = await recordingEngine([]).run(workflow);
  assert.equal(run.status, "failed");
  assert.match(run.error ?? "", /cycle or unreachable/);
});

test("fails when a node type has no handler", async () => {
  const run = await recordingEngine([]).run({ id: "w", name: "w", version: 1, nodes: [node("x", "webhook")], edges: [] });
  assert.equal(run.status, "failed");
  assert.match(run.error ?? "", /No handler registered for workflow node type: webhook/);
});

test("fails when an edge references a missing node", async () => {
  const run = await recordingEngine([]).run({ id: "w", name: "w", version: 1, nodes: [node("a")], edges: [{ from: "a", to: "ghost" }] });
  assert.equal(run.status, "failed");
  assert.match(run.error ?? "", /missing node id: ghost/);
});
