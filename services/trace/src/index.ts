import { randomUUID } from "node:crypto";
import type {
  ChatRequest, ChatResponse, EmbedPurpose, ModelProvider, TraceEvent, TraceMeta, TraceObserver, TraceOperation, TraceSignal, TraceStatus,
} from "@uios/contracts";

export const TRACE_OPERATIONS: readonly TraceOperation[] = [
  "model.request", "model.embed", "memory.read", "memory.write", "conversation.read", "conversation.write", "document.ingest",
  "fs.read", "fs.write", "fs.create", "fs.delete", "git.read", "git.write", "github.read", "tool.call", "api.call",
  "security.check", "test.run", "build.run", "deploy.run", "resource.discover",
];

const operationSet = new Set<string>(TRACE_OPERATIONS);
const statusSet = new Set<string>(["ok", "error", "denied", "cancelled"]);

export function isTraceOperation(value: unknown): value is TraceOperation {
  return typeof value === "string" && operationSet.has(value);
}

export function isTraceStatus(value: unknown): value is TraceStatus {
  return typeof value === "string" && statusSet.has(value);
}

// Values that look like credentials are never stored, even inside metadata a caller supplied.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\buios_live_[A-Za-z0-9_-]{8,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /(?:api[_-]?key|secret|password|passwd|token|bearer)\s*[:=]\s*\S{8,}/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/,
];

export function looksSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

const META_KEY = /^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/;

/** Bounded, credential-free metadata. Content belongs in resources, never in trace metadata. */
export function sanitizeMeta(meta: Record<string, unknown> | undefined): TraceMeta {
  const out: TraceMeta = {};
  if (!meta) return out;
  for (const [key, value] of Object.entries(meta).slice(0, 32)) {
    if (!META_KEY.test(key)) continue;
    if (typeof value === "number") { if (Number.isFinite(value)) out[key] = value; continue; }
    if (typeof value === "boolean") { out[key] = value; continue; }
    if (typeof value === "string") out[key] = looksSecret(value) ? "[redacted]" : value.slice(0, 256);
  }
  return out;
}

export function sanitizeUrn(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.slice(0, 512);
  return looksSecret(trimmed) ? "[redacted]" : trimmed;
}

export interface TraceSink {
  write(event: TraceEvent): void;
}

export type TraceContext = {
  tenantId: string;
  traceId: string;
  parentId?: string;
  agentId?: string;
  projectId?: string;
  observer?: TraceObserver;
};

export type SpanInit = {
  operation: TraceOperation;
  resourceUrn?: string;
  destination?: string;
  modelId?: string;
  providerId?: string;
  agentId?: string;
  projectId?: string;
  meta?: Record<string, unknown>;
};

type Listener = (signal: TraceSignal) => void;

export class TraceSpan {
  readonly id: string;
  private readonly started: number;
  private readonly startedAt: string;
  private ended = false;
  private meta: TraceMeta;
  private readonly bus: TraceBus;
  private readonly context: TraceContext;
  private readonly init: SpanInit;

  constructor(bus: TraceBus, context: TraceContext, init: SpanInit) {
    this.bus = bus;
    this.context = context;
    this.init = init;
    this.id = randomUUID();
    this.started = Date.now();
    this.startedAt = new Date(this.started).toISOString();
    this.meta = sanitizeMeta(init.meta);
  }

  /** Context for operations caused by this one (they share the trace id and point at this span). */
  child(): TraceContext {
    return { ...this.context, parentId: this.id };
  }

  annotate(meta: Record<string, unknown>): void {
    this.meta = { ...this.meta, ...sanitizeMeta(meta) };
  }

  base() {
    return {
      id: this.id,
      traceId: this.context.traceId,
      ...(this.context.parentId ? { parentId: this.context.parentId } : {}),
      tenantId: this.context.tenantId,
      ...((this.init.projectId ?? this.context.projectId) ? { projectId: this.init.projectId ?? this.context.projectId } : {}),
      ...((this.init.agentId ?? this.context.agentId) ? { agentId: this.init.agentId ?? this.context.agentId } : {}),
      ...(this.init.modelId ? { modelId: this.init.modelId } : {}),
      ...(this.init.providerId ? { providerId: this.init.providerId } : {}),
      operation: this.init.operation,
      ...(sanitizeUrn(this.init.resourceUrn) ? { resourceUrn: sanitizeUrn(this.init.resourceUrn) } : {}),
      ...(this.init.destination ? { destination: this.init.destination } : {}),
      startedAt: this.startedAt,
      meta: this.meta,
      observer: this.context.observer ?? "uios",
    };
  }

  /** Ends the span once; later calls return null so an operation is never recorded twice. */
  end(status: TraceStatus, meta?: Record<string, unknown>): TraceEvent | null {
    if (this.ended) return null;
    this.ended = true;
    if (meta) this.annotate(meta);
    const endedAt = Date.now();
    const event: TraceEvent = { ...this.base(), meta: this.meta, status, endedAt: new Date(endedAt).toISOString(), durationMs: endedAt - this.started };
    this.bus.publishEnd(event);
    return event;
  }
}

/**
 * In-process trace bus. Recording does not depend on subscribers (D-14): every ended span is written
 * to the sink whether or not any UI is listening; subscribers only receive a live copy.
 */
export class TraceBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private sink?: TraceSink;
  private sinkErrors = 0;

  constructor(sink?: TraceSink) {
    this.sink = sink;
  }

  setSink(sink: TraceSink | undefined): void {
    this.sink = sink;
  }

  get droppedWrites(): number {
    return this.sinkErrors;
  }

  start(context: TraceContext, init: SpanInit): TraceSpan {
    const span = new TraceSpan(this, context, init);
    this.deliver(context.tenantId, { phase: "start", event: span.base() });
    return span;
  }

  /** Records an already-completed event (e.g. reported by an external agent). */
  record(event: TraceEvent): void {
    this.publishEnd(event);
  }

  publishEnd(event: TraceEvent): void {
    if (this.sink) {
      try {
        this.sink.write(event);
      } catch (error) {
        this.sinkErrors += 1;
        console.error("[UIOS trace] failed to persist trace event:", error instanceof Error ? error.message : error);
      }
    }
    this.deliver(event.tenantId, { phase: "end", event });
  }

  subscribe(tenantId: string, listener: Listener): () => void {
    let set = this.listeners.get(tenantId);
    if (!set) { set = new Set(); this.listeners.set(tenantId, set); }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(tenantId);
    };
  }

  subscriberCount(tenantId?: string): number {
    if (tenantId) return this.listeners.get(tenantId)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  private deliver(tenantId: string, signal: TraceSignal): void {
    for (const listener of this.listeners.get(tenantId) ?? []) {
      try { listener(signal); } catch { /* a broken subscriber never affects execution */ }
    }
  }
}

/** Runs `operation` inside a span, ending it ok/error automatically. */
export async function withSpan<T>(bus: TraceBus, context: TraceContext, init: SpanInit, operation: (span: TraceSpan) => Promise<T>): Promise<T> {
  const span = bus.start(context, init);
  try {
    const result = await operation(span);
    span.end("ok");
    return result;
  } catch (error) {
    span.end(isAbort(error) ? "cancelled" : "error", { error: errorLabel(error) });
    throw error;
  }
}

export function isAbort(error: unknown): boolean {
  // Caller-initiated aborts are cancellations; timeouts are errors.
  return error instanceof Error && error.name === "AbortError";
}

export function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  return error.message.slice(0, 160);
}

export function providerDestination(provider: ModelProvider): string {
  return provider.locality === "local" ? "local" : `remote:${provider.destination ?? "unknown"}`;
}

function responseMeta(response: ChatResponse): Record<string, unknown> {
  return {
    model: response.model,
    finishReason: response.finishReason ?? "",
    toolCalls: response.toolCalls?.length ?? 0,
    ...(response.usage?.inputTokens !== undefined ? { inputTokens: response.usage.inputTokens } : {}),
    ...(response.usage?.outputTokens !== undefined ? { outputTokens: response.usage.outputTokens } : {}),
    reasoningReturned: Boolean(response.reasoning),
  };
}

function requestMeta(request: ChatRequest): Record<string, unknown> {
  return {
    messages: request.messages.length,
    inputChars: request.messages.reduce((total, message) => total + message.content.length, 0),
    tools: request.tools?.length ?? 0,
  };
}

/**
 * Wraps a provider so every chat, stream and embed call becomes a traced span. Only sizes, counts and
 * model ids are recorded — never prompt or response text.
 */
export function tracedProvider(provider: ModelProvider, bus: TraceBus, context: TraceContext): ModelProvider {
  const destination = providerDestination(provider);
  const resourceFor = (model: string | undefined) => `model:${provider.id}:${model ?? "default"}`;
  const traced: ModelProvider = {
    id: provider.id,
    locality: provider.locality,
    destination: provider.destination,
    capabilities: provider.capabilities,
    listModels: () => provider.listModels(),
    health: () => provider.health(),
    async chat(request) {
      return withSpan(bus, context, { operation: "model.request", providerId: provider.id, modelId: request.model, resourceUrn: resourceFor(request.model), destination, meta: { ...requestMeta(request), mode: "chat" } }, async (span) => {
        const response = await provider.chat(request);
        span.annotate(responseMeta(response));
        return response;
      });
    },
  };
  if (provider.stream) {
    const stream = provider.stream.bind(provider);
    traced.stream = async function* (request: ChatRequest) {
      const span = bus.start(context, { operation: "model.request", providerId: provider.id, modelId: request.model, resourceUrn: resourceFor(request.model), destination, meta: { ...requestMeta(request), mode: "stream" } });
      let chunks = 0;
      let firstChunkMs: number | undefined;
      const started = Date.now();
      try {
        for await (const chunk of stream(request)) {
          chunks += 1;
          if (firstChunkMs === undefined) firstChunkMs = Date.now() - started;
          if (chunk.finishReason || chunk.usage) span.annotate(responseMeta(chunk));
          yield chunk;
        }
        span.end("ok", { chunks, ...(firstChunkMs !== undefined ? { firstChunkMs } : {}) });
      } catch (error) {
        span.end(isAbort(error) ? "cancelled" : "error", { chunks, error: errorLabel(error) });
        throw error;
      } finally {
        // Consumer stopped early (e.g. client disconnected): record that instead of leaving the span open.
        span.end("cancelled", { chunks, reason: "consumer-stopped" });
      }
    };
  }
  if (provider.embed) {
    const embed = provider.embed.bind(provider);
    traced.embed = (inputs: string[], purpose?: EmbedPurpose) =>
      withSpan(bus, context, { operation: "model.embed", providerId: provider.id, resourceUrn: resourceFor("embed"), destination, meta: { inputs: inputs.length, inputChars: inputs.reduce((t, i) => t + i.length, 0), purpose: purpose ?? "document" } }, async (span) => {
        const vectors = await embed(inputs, purpose);
        span.annotate({ vectors: vectors.length, dims: vectors[0]?.length ?? 0 });
        return vectors;
      });
  }
  return traced;
}

export function newTraceContext(tenantId: string, extra: Partial<Omit<TraceContext, "tenantId" | "traceId">> = {}): TraceContext {
  return { tenantId, traceId: randomUUID(), ...extra };
}
