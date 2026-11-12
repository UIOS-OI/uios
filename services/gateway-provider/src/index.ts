import type { ChatRequest, ChatResponse, ModelCapability, ModelDescriptor, ModelMessage, ModelProvider, ProviderHealth, ProviderLocality, ToolCall } from "@uios/contracts";
import { randomUUID } from "node:crypto";

export type GatewayProviderOptions = {
  id?: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  embeddingModel?: string;
  timeoutMs?: number;
  /** Defaults to "remote". Set "local" only for gateways that run on the user's machine. */
  locality?: ProviderLocality;
};

type OpenAiToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string } };

function toOpenAiMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return { role: "assistant", content: message.content || null, tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) };
  }
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  return { role: message.role, content: message.content };
}

function parseToolCalls(calls: OpenAiToolCall[] | undefined): ToolCall[] | undefined {
  if (!calls?.length) return undefined;
  return calls.map((call) => {
    const name = call.function?.name;
    if (!name) throw new Error("Gateway returned a tool call without a function name.");
    let input: unknown = {};
    if (call.function?.arguments) {
      try { input = JSON.parse(call.function.arguments); } catch { throw new Error(`Gateway returned malformed JSON arguments for tool ${name}.`); }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Gateway returned non-object arguments for tool ${name}.`);
    return { id: call.id ?? randomUUID(), name, input: input as Record<string, unknown> };
  });
}

type GatewayChunk = { choices?: Array<{ delta?: { content?: string }; finish_reason?: ChatResponse["finishReason"] }> };

export class GatewayModelProvider implements ModelProvider {
  readonly id: string;
  readonly locality: ProviderLocality;
  readonly destination: string;
  readonly capabilities: ModelCapability[] = ["chat", "stream", "tools", "embed"];
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly embeddingModel: string;
  private readonly timeoutMs: number;

  constructor(options: GatewayProviderOptions) {
    this.id = options.id ?? "uios-gateway";
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.embeddingModel = options.embeddingModel ?? "text-embedding-3-small";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.locality = options.locality ?? "remote";
    this.destination = new URL(this.baseUrl).host;
  }

  get embeddingModelId(): string {
    return this.embeddingModel;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.request(request, false);
    const json = await response.json() as { id?: string; model?: string; choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } & ChatResponse["usage"] };
    const choice = json.choices?.[0];
    const toolCalls = parseToolCalls(choice?.message?.tool_calls);
    const finish = toolCalls ? "tool_call" : choice?.finish_reason === "tool_calls" ? "tool_call" : choice?.finish_reason as ChatResponse["finishReason"];
    const usage = json.usage ? { inputTokens: json.usage.inputTokens ?? json.usage.prompt_tokens, outputTokens: json.usage.outputTokens ?? json.usage.completion_tokens, totalTokens: json.usage.totalTokens ?? json.usage.total_tokens } : undefined;
    return { id: json.id ?? randomUUID(), provider: this.id, model: json.model ?? request.model ?? this.defaultModel, content: choice?.message?.content ?? "", finishReason: finish, toolCalls, usage };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const response = await this.request(request, true);
    if (!response.body) throw new Error(`UIOS provider ${this.id} returned no stream body`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const data = event.split("\n").find((line) => line.startsWith("data: "))?.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        let chunk: GatewayChunk;
        try {
          chunk = JSON.parse(data) as GatewayChunk;
        } catch {
          console.warn(`[UIOS] ${this.id}: skipping malformed SSE chunk`);
          continue;
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content || choice?.finish_reason) yield { id: randomUUID(), provider: this.id, model: request.model ?? this.defaultModel, content: choice.delta?.content ?? "", finishReason: choice.finish_reason };
      }
    }
  }

  async embed(inputs: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "X-UIOS-Provider": this.id },
      body: JSON.stringify({ model: this.embeddingModel, input: inputs }),
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`UIOS provider ${this.id} rejected embedding request (${response.status})`);
    const json = await response.json() as { data?: Array<{ embedding: number[] }> };
    if (!json.data) throw new Error(`UIOS provider ${this.id} returned invalid embedding response`);
    return json.data.map((item) => item.embedding);
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return [
      { id: this.defaultModel, provider: this.id, capabilities: ["chat", "stream", "tools"], locality: this.locality },
      { id: this.embeddingModel, provider: this.id, capabilities: ["embed"], locality: this.locality },
    ];
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(Math.min(this.timeoutMs, 5000)) });
      return { healthy: response.ok, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), message: response.ok ? undefined : `Provider returned ${response.status}` };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), message: error instanceof Error ? error.message : "Provider health check failed" };
    }
  }

  private async request(request: ChatRequest, stream: boolean): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "X-UIOS-Provider": this.id },
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages.map(toOpenAiMessage),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream,
        ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}),
      }),
      cache: "no-store",
      signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`UIOS provider ${this.id} rejected request (${response.status})`);
    return response;
  }
}

export function createGatewayProvider(options: GatewayProviderOptions): GatewayModelProvider {
  return new GatewayModelProvider(options);
}
