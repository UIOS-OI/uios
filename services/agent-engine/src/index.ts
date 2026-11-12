import { randomUUID } from "node:crypto";
import type { AgentRun, AgentRunRequest, ModelMessage, ModelProvider, ToolSpec } from "@uios/contracts";

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

export class AgentEngine {
  async run(provider: ModelProvider, request: AgentRunRequest): Promise<AgentRun> {
    const run: AgentRun = { id: randomUUID(), status: "completed", output: "", steps: 0, toolCalls: [] };
    const tools = request.tools ?? [];
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const toolSpecs: ToolSpec[] = tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters ?? EMPTY_SCHEMA }));
    const maxSteps = Math.min(Math.max(request.maxSteps ?? 8, 1), 32);
    const messages: ModelMessage[] = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];

    try {
      for (let step = 1; step <= maxSteps; step += 1) {
        if (request.signal?.aborted) throw new Error("Agent run was cancelled.");
        run.steps = step;
        const response = await provider.chat({ messages, ...(toolSpecs.length ? { tools: toolSpecs } : {}), signal: request.signal });
        if (!response.toolCalls?.length) {
          run.output = response.content;
          return run;
        }
        messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });
        for (const toolCall of response.toolCalls) {
          run.toolCalls.push(toolCall);
          const tool = toolMap.get(toolCall.name);
          if (!tool) {
            request.onToolEvent?.({ phase: "end", call: toolCall, status: "error", durationMs: 0, error: "unregistered tool" });
            throw new Error(`Agent requested an unregistered tool: ${toolCall.name}`);
          }
          request.onToolEvent?.({ phase: "start", call: toolCall });
          const started = Date.now();
          let result: unknown;
          try {
            result = await tool.execute(toolCall.input);
          } catch (error) {
            request.onToolEvent?.({ phase: "end", call: toolCall, status: "error", durationMs: Date.now() - started, error: error instanceof Error ? error.message : "tool failed" });
            throw error;
          }
          request.onToolEvent?.({ phase: "end", call: toolCall, status: "ok", durationMs: Date.now() - started });
          messages.push({ role: "tool", name: toolCall.name, toolCallId: toolCall.id, content: JSON.stringify(result ?? null) });
        }
      }
      run.status = "limit_reached";
      run.error = `Agent exceeded the ${maxSteps}-step safety limit.`;
      return run;
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : "Agent execution failed";
      return run;
    }
  }
}
