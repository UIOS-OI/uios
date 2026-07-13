import { randomUUID } from "node:crypto";
import type { AgentRun, AgentRunRequest, ModelMessage, ModelProvider, ToolCall } from "@uios/contracts";

export class AgentEngine {
  async run(provider: ModelProvider, request: AgentRunRequest): Promise<AgentRun> {
    const run: AgentRun = { id: randomUUID(), status: "completed", output: "", steps: 0, toolCalls: [] };
    const tools = request.tools ?? [];
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const maxSteps = Math.min(Math.max(request.maxSteps ?? 8, 1), 32);
    const messages: ModelMessage[] = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];

    try {
      for (let step = 1; step <= maxSteps; step += 1) {
        run.steps = step;
        const response = await provider.chat({ messages });
        if (!response.toolCalls?.length) {
          run.output = response.content;
          return run;
        }
        for (const toolCall of response.toolCalls) {
          run.toolCalls.push(toolCall);
          const tool = toolMap.get(toolCall.name);
          if (!tool) throw new Error(`Agent requested an unregistered tool: ${toolCall.name}`);
          const result = await tool.execute(toolCall.input);
          messages.push({ role: "assistant", content: response.content, toolCalls: [toolCall] });
          messages.push({ role: "tool", name: toolCall.name, toolCallId: toolCall.id, content: JSON.stringify(result) });
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
