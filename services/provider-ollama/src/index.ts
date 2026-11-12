import type {
  ChatRequest, ChatResponse, EmbedPurpose, ModelCapability, ModelDescriptor, ModelMessage, ModelProvider, ProviderHealth, ProviderLocality, ToolCall,
} from "@uios/contracts";
import { randomUUID } from "node:crypto";

export type OllamaProviderOptions = {
  id?: string;
  baseUrl?: string;
  chatModel: string;
  embedModel?: string;
  /** Context window sent as options.num_ctx on every request. */
  numCtx?: number;
  /** Ollama keep_alive, e.g. "10m". Omitted when undefined so the server default applies. */
  keepAlive?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type OllamaToolCall = { function?: { name?: string; arguments?: Record<string, unknown> | string } };
type OllamaMessage = { role?: string; content?: string; thinking?: string; tool_calls?: OllamaToolCall[] };
type OllamaChatChunk = {
  model?: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};
type OllamaShow = { capabilities?: string[]; model_info?: Record<string, unknown> };

export type OllamaModelInfo = { capabilities?: string[]; contextLength?: number; embeddingLength?: number };

const THINK_BLOCK = /<think>([\s\S]*?)<\/think>\s*/g;

/** Moves <think> blocks out of answer text. Returns the cleaned answer and any extracted reasoning. */
export function separateReasoning(content: string): { content: string; reasoning: string } {
  const parts: string[] = [];
  let cleaned = content.replace(THINK_BLOCK, (_match, inner: string) => { parts.push(inner.trim()); return ""; });
  const unterminated = cleaned.indexOf("<think>");
  if (unterminated !== -1) {
    parts.push(cleaned.slice(unterminated + 7).trim());
    cleaned = cleaned.slice(0, unterminated);
  }
  return { content: cleaned, reasoning: parts.join("\n").trim() };
}

/**
 * Streaming counterpart of separateReasoning. Tags may be split across chunks, so any trailing text
 * that could be the start of a tag is held back until the next chunk decides it.
 */
export class ThinkStreamFilter {
  private inThink = false;
  private carry = "";

  push(text: string): string {
    let rest = this.carry + text;
    this.carry = "";
    let out = "";
    while (rest) {
      const tag = this.inThink ? "</think>" : "<think>";
      const index = rest.indexOf(tag);
      if (index !== -1) {
        if (!this.inThink) out += rest.slice(0, index);
        rest = rest.slice(index + tag.length);
        this.inThink = !this.inThink;
        continue;
      }
      const hold = partialTagSuffix(rest, tag);
      if (!this.inThink) out += rest.slice(0, rest.length - hold);
      this.carry = rest.slice(rest.length - hold);
      break;
    }
    return out;
  }

  /** Releases held-back text at end of stream. An unterminated think block is discarded, not shown. */
  flush(): string {
    const out = this.inThink ? "" : this.carry;
    this.carry = "";
    return out;
  }
}

function partialTagSuffix(text: string, tag: string): number {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
    if (tag.startsWith(text.slice(text.length - length))) return length;
  }
  return 0;
}

function parseArguments(value: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  throw new Error("Ollama returned tool arguments that are not a JSON object.");
}

function toToolCalls(calls: OllamaToolCall[] | undefined): ToolCall[] | undefined {
  if (!calls?.length) return undefined;
  return calls.map((call) => {
    const name = call.function?.name;
    if (!name) throw new Error("Ollama returned a tool call without a function name.");
    return { id: `call_${randomUUID()}`, name, input: parseArguments(call.function?.arguments) };
  });
}

function toOllamaMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return { role: "assistant", content: message.content, tool_calls: message.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.input } })) };
  }
  if (message.role === "tool") return { role: "tool", content: message.content, ...(message.name ? { tool_name: message.name } : {}) };
  return { role: message.role, content: message.content };
}

function finishReason(reason: string | undefined, toolCalls: ToolCall[] | undefined): ChatResponse["finishReason"] {
  if (toolCalls?.length) return "tool_call";
  if (reason === "length") return "length";
  return reason ? "stop" : undefined;
}

export class OllamaModelProvider implements ModelProvider {
  readonly id: string;
  readonly locality: ProviderLocality = "local";
  readonly destination: string;
  readonly capabilities: ModelCapability[];
  readonly chatModel: string;
  readonly embedModel?: string;
  private readonly baseUrl: string;
  private readonly numCtx: number;
  private readonly keepAlive?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly modelInfo = new Map<string, Promise<OllamaModelInfo>>();

  constructor(options: OllamaProviderOptions) {
    this.id = options.id ?? "ollama";
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.destination = new URL(this.baseUrl).host;
    this.chatModel = options.chatModel;
    this.embedModel = options.embedModel;
    this.numCtx = Math.min(Math.max(Math.floor(options.numCtx ?? 8192), 512), 262_144);
    this.keepAlive = options.keepAlive;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetch ?? fetch;
    this.capabilities = ["chat", "stream", "tools", ...(this.embedModel ? (["embed"] as const) : [])];
  }

  get embeddingModelId(): string | undefined {
    return this.embedModel;
  }

  /** Model metadata from /api/show, cached per model. Missing fields stay undefined; nothing is guessed. */
  async describeModel(model: string): Promise<OllamaModelInfo> {
    let pending = this.modelInfo.get(model);
    if (!pending) {
      pending = (async () => {
        const show = await this.post<OllamaShow>("/api/show", { model }, Math.min(this.timeoutMs, 15_000));
        const info = show.model_info ?? {};
        const numeric = (suffix: string) => {
          const entry = Object.entries(info).find(([key, value]) => key.endsWith(suffix) && typeof value === "number");
          return entry ? (entry[1] as number) : undefined;
        };
        return { capabilities: Array.isArray(show.capabilities) ? show.capabilities : undefined, contextLength: numeric(".context_length"), embeddingLength: numeric(".embedding_length") };
      })();
      pending.catch(() => this.modelInfo.delete(model));
      this.modelInfo.set(model, pending);
    }
    return pending;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = await this.chatBody(request, false);
    const json = await this.post<OllamaChatChunk>("/api/chat", body, this.timeoutMs, request.signal);
    const toolCalls = toToolCalls(json.message?.tool_calls);
    const separated = separateReasoning(json.message?.content ?? "");
    const reasoning = [json.message?.thinking?.trim(), separated.reasoning].filter(Boolean).join("\n");
    return {
      id: randomUUID(),
      provider: this.id,
      model: json.model ?? body.model as string,
      content: separated.content,
      finishReason: finishReason(json.done_reason, toolCalls),
      toolCalls,
      ...(reasoning ? { reasoning } : {}),
      usage: { inputTokens: json.prompt_eval_count, outputTokens: json.eval_count, totalTokens: json.prompt_eval_count !== undefined && json.eval_count !== undefined ? json.prompt_eval_count + json.eval_count : undefined },
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const body = await this.chatBody(request, true);
    const response = await this.send("/api/chat", body, this.timeoutMs, request.signal);
    if (!response.body) throw new Error(`UIOS provider ${this.id} returned no stream body`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const model = body.model as string;
    let buffer = "";
    const filter = new ThinkStreamFilter();
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatChunk;
        if (chunk.error) throw new Error(`UIOS provider ${this.id} stream error: ${chunk.error.slice(0, 200)}`);
        const toolCalls = toToolCalls(chunk.message?.tool_calls);
        const content = filter.push(chunk.message?.content ?? "") + (chunk.done ? filter.flush() : "");
        const reasoning = chunk.message?.thinking ?? "";
        if (content || reasoning || toolCalls || chunk.done) {
          yield {
            id: randomUUID(),
            provider: this.id,
            model: chunk.model ?? model,
            content,
            ...(reasoning ? { reasoning } : {}),
            ...(toolCalls ? { toolCalls } : {}),
            finishReason: chunk.done ? finishReason(chunk.done_reason, toolCalls) : undefined,
            ...(chunk.done ? { usage: { inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count } } : {}),
          };
        }
      }
      if (done) break;
    }
  }

  async embed(inputs: string[], purpose: EmbedPurpose = "document"): Promise<number[][]> {
    if (!this.embedModel) throw new Error(`UIOS provider ${this.id} has no embedding model configured.`);
    // nomic-embed-text is trained with task prefixes; other models receive raw text.
    const prefix = /nomic-embed/i.test(this.embedModel) ? (purpose === "query" ? "search_query: " : "search_document: ") : "";
    const json = await this.post<{ embeddings?: number[][] }>("/api/embed", { model: this.embedModel, input: inputs.map((input) => prefix + input), truncate: true, ...(this.keepAlive ? { keep_alive: this.keepAlive } : {}) }, this.timeoutMs);
    if (!Array.isArray(json.embeddings) || json.embeddings.length !== inputs.length) {
      throw new Error(`UIOS provider ${this.id} returned ${Array.isArray(json.embeddings) ? json.embeddings.length : "no"} embeddings for ${inputs.length} inputs.`);
    }
    return json.embeddings;
  }

  async listModels(): Promise<ModelDescriptor[]> {
    const response = await this.send("/api/tags", undefined, Math.min(this.timeoutMs, 10_000));
    const json = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const installed = new Set((json.models ?? []).map((model) => model.name ?? model.model).filter((name): name is string => Boolean(name)));
    const has = (name: string) => installed.has(name) || installed.has(`${name}:latest`);
    const descriptors: ModelDescriptor[] = [];
    for (const [modelId, role] of [[this.chatModel, "chat"], ...(this.embedModel ? [[this.embedModel, "embed"] as const] : [])] as Array<[string, "chat" | "embed"]>) {
      const present = has(modelId);
      let info: OllamaModelInfo = {};
      if (present) info = await this.describeModel(modelId).catch(() => ({}));
      const reported = (info.capabilities ?? []) as string[];
      const capabilities: ModelCapability[] = role === "embed"
        ? ["embed"]
        : ["chat", "stream", ...(reported.includes("tools") ? (["tools"] as const) : []), ...(reported.includes("thinking") ? (["thinking"] as const) : []), ...(reported.includes("vision") ? (["vision"] as const) : [])];
      descriptors.push({ id: modelId, provider: this.id, capabilities, locality: "local", installed: present, contextWindow: info.contextLength, embeddingDims: role === "embed" ? info.embeddingLength : undefined });
    }
    return descriptors;
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    const checkedAt = () => new Date().toISOString();
    try {
      const version = await this.send("/api/version", undefined, 5000);
      const { version: serverVersion } = (await version.json()) as { version?: string };
      const models = await this.listModels();
      const missing = models.filter((model) => !model.installed).map((model) => model.id);
      if (missing.length) return { healthy: false, latencyMs: Date.now() - started, checkedAt: checkedAt(), message: `Ollama ${serverVersion ?? "?"} is running but model(s) are not installed: ${missing.join(", ")}. Run: ollama pull ${missing[0]}` };
      return { healthy: true, latencyMs: Date.now() - started, checkedAt: checkedAt(), message: `Ollama ${serverVersion ?? "unknown version"}` };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - started, checkedAt: checkedAt(), message: `Ollama is not reachable at ${this.baseUrl}: ${error instanceof Error ? error.message : "unknown error"}` };
    }
  }

  private async chatBody(request: ChatRequest, stream: boolean): Promise<Record<string, unknown>> {
    const model = request.model ?? this.chatModel;
    // Send `think` only to models that report the capability; older servers or other models reject or ignore it.
    const info = await this.describeModel(model).catch(() => ({} as OllamaModelInfo));
    const supportsThinking = info.capabilities?.includes("thinking") === true;
    const options: Record<string, unknown> = { num_ctx: this.numCtx };
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxTokens !== undefined) options.num_predict = request.maxTokens;
    return {
      model,
      messages: request.messages.map(toOllamaMessage),
      stream,
      options,
      ...(supportsThinking ? { think: request.think === true } : {}),
      ...(this.keepAlive ? { keep_alive: this.keepAlive } : {}),
      ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}),
    };
  }

  private async post<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    const response = await this.send(path, body, timeoutMs, signal);
    return (await response.json()) as T;
  }

  private async send(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      const detail = await response.text().then((text) => { try { return (JSON.parse(text) as { error?: string }).error ?? text; } catch { return text; } }).catch(() => "");
      throw new Error(`UIOS provider ${this.id} rejected ${path} (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    return response;
  }
}

export function createOllamaProvider(options: OllamaProviderOptions): OllamaModelProvider {
  return new OllamaModelProvider(options);
}
