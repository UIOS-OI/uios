import path from "node:path";
import { IntelligenceStore, SqliteTraceStore } from "@uios/intelligence-store";
import { TraceBus, newTraceContext, type TraceContext, type TraceSpan } from "@uios/trace";
import type { TraceOperation } from "@uios/contracts";

/**
 * Process-wide Intelligence Core singletons. Held on globalThis so every route handler bundle shares
 * one store and one trace bus (live subscribers must see events emitted by other routes).
 */
type CoreState = {
  store: IntelligenceStore | null;
  traceStore: SqliteTraceStore | null;
  bus: TraceBus;
  storeError?: string;
};

const KEY = Symbol.for("uios.intelligence-core.v1");
const buildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

/** Resolves the intelligence database path. Never shares a file with the workspace state store. */
export function intelligenceDbLocation(): string {
  if (process.env.UIOS_INTELLIGENCE_DB) return process.env.UIOS_INTELLIGENCE_DB;
  const stateDb = process.env.UIOS_STATE_DB;
  if (stateDb && !/^postgres(ql)?:\/\//.test(stateDb)) {
    const parsed = path.parse(stateDb);
    return path.join(parsed.dir, `${parsed.name}.intelligence.sqlite`);
  }
  // Without configured storage, production stays in memory and reports itself as not durable.
  return process.env.NODE_ENV === "production" ? ":memory:" : path.join(".uios-data", "intelligence.sqlite");
}

function retentionDays(): number {
  return Math.min(Math.max(Number(process.env.UIOS_TRACE_RETENTION_DAYS ?? 30) || 30, 1), 3650);
}

function core(): CoreState {
  const holder = globalThis as typeof globalThis & { [KEY]?: CoreState };
  if (holder[KEY]) return holder[KEY];
  const state: CoreState = { store: null, traceStore: null, bus: new TraceBus() };
  if (!buildPhase()) {
    try {
      state.store = new IntelligenceStore(intelligenceDbLocation());
      state.traceStore = new SqliteTraceStore(state.store);
      state.traceStore.prune(retentionDays());
      state.bus.setSink(state.traceStore);
    } catch (error) {
      // Trace recording is unavailable, and that is reported (coverage endpoint), never hidden.
      state.storeError = error instanceof Error ? error.message : String(error);
      console.error("[UIOS] Intelligence store unavailable:", state.storeError);
    }
  }
  holder[KEY] = state;
  return state;
}

export function traceBus(): TraceBus {
  return core().bus;
}

export function traceStore(): SqliteTraceStore | null {
  return core().traceStore;
}

export function intelligenceStore(): IntelligenceStore | null {
  return core().store;
}

export function startTrace(tenantId: string, agentId: string, extra: Partial<Omit<TraceContext, "tenantId" | "traceId" | "agentId">> = {}): TraceContext {
  return newTraceContext(tenantId, { agentId, ...extra });
}

export async function traced<T>(context: TraceContext, init: Parameters<TraceBus["start"]>[1], operation: (span: TraceSpan) => Promise<T>): Promise<T> {
  const span = traceBus().start(context, init);
  try {
    const result = await operation(span);
    span.end("ok");
    return result;
  } catch (error) {
    span.end(error instanceof Error && error.name === "AbortError" ? "cancelled" : "error", { error: error instanceof Error ? error.message.slice(0, 160) : "error" });
    throw error;
  }
}

/** Records an Aegis policy decision as a security.check span (verdict only, never the inspected text). */
export function traceAegis(context: TraceContext, decision: { allowed: boolean; reason?: string }, startedAt: number, subject: string): void {
  const span = traceBus().start(context, { operation: "security.check", resourceUrn: `aegis:policy:${subject}`, destination: process.env.UIOS_AEGIS_URL ? "remote:aegis" : "local" });
  span.end(decision.allowed ? "ok" : "denied", { verdict: decision.allowed ? "allow" : "deny", ...(decision.reason ? { reason: decision.reason.slice(0, 120) } : {}), checkMs: Date.now() - startedAt });
}

export type CoverageEntry = { operation: TraceOperation; status: "instrumented" | "not-instrumented"; detail: string };

/** What Live Trace can and cannot show. Gaps are explicit so the UI never implies unobserved activity. */
export const TRACE_COVERAGE: CoverageEntry[] = [
  { operation: "model.request", status: "instrumented", detail: "Chat, agent steps, and workflow model nodes via the traced provider wrapper (sizes and token counts only)." },
  { operation: "model.embed", status: "instrumented", detail: "Ingestion and search embeddings." },
  { operation: "memory.read", status: "instrumented", detail: "GET /api/memory and /api/ingestion/search." },
  { operation: "memory.write", status: "instrumented", detail: "POST /api/memory and ingestion chunk writes." },
  { operation: "document.ingest", status: "instrumented", detail: "Upload processing jobs." },
  { operation: "security.check", status: "instrumented", detail: "Aegis decisions for chat, agent, workflow, and memory writes." },
  { operation: "tool.call", status: "instrumented", detail: "Agent tool execution. No tools are registered until Stage 5, so none occur yet." },
  { operation: "conversation.read", status: "not-instrumented", detail: "Conversations are not stored until Stage 3." },
  { operation: "conversation.write", status: "not-instrumented", detail: "Conversations are not stored until Stage 3." },
  { operation: "resource.discover", status: "not-instrumented", detail: "Resource discovery arrives in Stage 2." },
  { operation: "fs.read", status: "not-instrumented", detail: "UIOS has no file tools until Stage 5. External agents may report these." },
  { operation: "fs.write", status: "not-instrumented", detail: "UIOS has no file tools until Stage 5. External agents may report these." },
  { operation: "fs.create", status: "not-instrumented", detail: "UIOS has no file tools until Stage 5. External agents may report these." },
  { operation: "fs.delete", status: "not-instrumented", detail: "UIOS has no file tools until Stage 5. External agents may report these." },
  { operation: "git.read", status: "not-instrumented", detail: "Local Git connector arrives in Stage 2." },
  { operation: "git.write", status: "not-instrumented", detail: "Git write tools arrive in Stage 5 (approval required)." },
  { operation: "github.read", status: "not-instrumented", detail: "GitHub connector arrives in Stage 2." },
  { operation: "api.call", status: "not-instrumented", detail: "Integration calls arrive with connectors." },
  { operation: "test.run", status: "not-instrumented", detail: "Test runner tool arrives in Stage 5." },
  { operation: "build.run", status: "not-instrumented", detail: "Not yet instrumented." },
  { operation: "deploy.run", status: "not-instrumented", detail: "Not yet instrumented." },
];

export function traceRecordingState() {
  const state = core();
  return {
    recording: Boolean(state.traceStore),
    persistence: state.store ? state.store.persistence : "unavailable",
    retentionDays: retentionDays(),
    droppedWrites: state.bus.droppedWrites,
    ...(state.storeError ? { error: "Intelligence store could not be opened; see server logs." } : {}),
  };
}
