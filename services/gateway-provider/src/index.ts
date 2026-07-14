import type { ChatRequest, ChatResponse, ModelDescriptor, ModelProvider, ProviderHealth } from "@uios/contracts";
import { randomUUID } from "node:crypto";

export type GatewayProviderOptions = {
  id?: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs?: number;
};

type GatewayChunk = { choices?: Array<{ delta?: { content?: string }; finish_reason?: ChatResponse["finishReason"] }> };

export class GatewayModelProvider implements ModelProvider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(options: GatewayProviderOptions) {
    this.id = options.id ?? "uios-gateway";
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.request(request, false);
    const json = await response.json() as { id?: string; model?: string; choices?: Array<{ message?: { content?: string }; finish_reason?: ChatResponse["finishReason"] }>; usage?: ChatResponse["usage"] };
    const choice = json.choices?.[0];
    return { id: json.id ?? randomUUID(), provider: this.id, model: json.model ?? request.model ?? this.defaultModel, content: choice?.message?.content ?? "", finishReason: choice?.finish_reason, usage: json.usage };
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

  async listModels(): Promise<ModelDescriptor[]> {
    return [{ id: this.defaultModel, provider: this.id, capabilities: ["chat", "stream", "tools"] }];
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
      body: JSON.stringify({ model: request.model ?? this.defaultModel, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, stream }),
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`UIOS provider ${this.id} rejected request (${response.status})`);
    return response;
  }
}

export function createGatewayProvider(options: GatewayProviderOptions): GatewayModelProvider {
  return new GatewayModelProvider(options);
}
