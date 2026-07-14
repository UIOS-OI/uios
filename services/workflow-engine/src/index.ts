import type { WorkflowDefinition, WorkflowNode, WorkflowRun } from "@uios/contracts";
import { randomUUID } from "node:crypto";

export type WorkflowNodeHandler = (node: WorkflowNode, input: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class WorkflowEngine {
  private readonly handlers = new Map<WorkflowNode["type"], WorkflowNodeHandler>();

  register(type: WorkflowNode["type"], handler: WorkflowNodeHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  async run(workflow: WorkflowDefinition, input: Record<string, unknown> = {}): Promise<WorkflowRun> {
    const run: WorkflowRun = { id: randomUUID(), workflowId: workflow.id, status: "running", output: { ...input } };
    const incoming = new Map(workflow.nodes.map((node) => [node.id, workflow.edges.filter((edge) => edge.to === node.id).length]));
    const queue = workflow.nodes.filter((node) => incoming.get(node.id) === 0);
    const completed = new Set<string>();
    try {
      while (queue.length > 0) {
        const node = queue.shift()!;
        run.currentNodeId = node.id;
        const handler = this.handlers.get(node.type);
        if (!handler) throw new Error(`No handler registered for workflow node type: ${node.type}`);
        run.output = { ...run.output, ...(await handler(node, run.output ?? {})) };
        completed.add(node.id);
        for (const edge of workflow.edges.filter((candidate) => candidate.from === node.id)) {
          const remaining = (incoming.get(edge.to) ?? 1) - 1;
          incoming.set(edge.to, remaining);
          if (remaining === 0) {
            const nextNode = workflow.nodes.find((candidate) => candidate.id === edge.to);
            if (!nextNode) throw new Error(`Workflow edge references a missing node id: ${edge.to}`);
            queue.push(nextNode);
          }
        }
      }
      if (completed.size !== workflow.nodes.length) throw new Error("Workflow contains a cycle or unreachable node.");
      run.status = "completed";
      delete run.currentNodeId;
      return run;
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : "Workflow failed";
      return run;
    }
  }
}
