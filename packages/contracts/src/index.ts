export type ModelRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage = {
  role: ModelRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

/** JSON-Schema described function a model may call. Execution is always mediated by UIOS. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export type ChatRequest = {
  messages: ModelMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, string>;
  tools?: ToolSpec[];
  /** Request model reasoning output when the model supports it. Defaults to off. */
  think?: boolean;
  signal?: AbortSignal;
};

export type ChatResponse = {
  id: string;
  provider: string;
  model: string;
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs?: number;
  finishReason?: "stop" | "length" | "tool_call" | "content_filter";
  toolCalls?: ToolCall[];
  /** Model reasoning text, kept separate from the answer and never shown as answer content. */
  reasoning?: string;
};

export type ModelCapability = "chat" | "stream" | "embed" | "tools" | "vision" | "thinking";

/** Where inference runs. Remote providers receive data off the user's machine (DECISIONS.md D-11). */
export type ProviderLocality = "local" | "remote";

export type ModelDescriptor = {
  id: string;
  provider: string;
  capabilities: ModelCapability[];
  locality?: ProviderLocality;
  installed?: boolean;
  embeddingDims?: number;
  contextWindow?: number;
  costPerMillionInputTokens?: number;
  costPerMillionOutputTokens?: number;
};

export type ProviderHealth = { healthy: boolean; latencyMs?: number; checkedAt: string; message?: string };

export type EmbedPurpose = "document" | "query";

export interface ModelProvider {
  readonly id: string;
  /** Defaults to "remote" when omitted, so an undeclared provider is never treated as local. */
  readonly locality?: ProviderLocality;
  /** Host that receives requests, for disclosure and tracing. */
  readonly destination?: string;
  readonly capabilities?: ModelCapability[];
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatResponse>;
  embed?(inputs: string[], purpose?: EmbedPurpose): Promise<number[][]>;
  listModels(): Promise<ModelDescriptor[]>;
  health(): Promise<ProviderHealth>;
}

export type RoutingStrategy = "fastest" | "cheapest" | "balanced" | "explicit";

export type RouteRequest = ChatRequest & {
  strategy?: RoutingStrategy;
  provider?: string;
  /** Required capability; providers that declare capabilities without it are skipped. */
  capability?: ModelCapability;
  /** When false, remote providers are never eligible. Callers enforce consent before setting true. */
  allowRemote?: boolean;
};

export type RouteDecision = {
  providerId: string;
  modelId?: string;
  strategy: RoutingStrategy;
  candidates: string[];
};

export type UiosPluginKind = "model" | "embedding" | "vector" | "tool" | "workflow" | "security";

export type UiosPermission = "models:invoke" | "models:embed" | "tools:invoke" | "memory:read" | "memory:write" | "network:egress" | "secrets:read";

export type UiosPluginManifest = {
  id: string;
  name: string;
  version: string;
  kind: UiosPluginKind;
  description: string;
  permissions: UiosPermission[];
  capabilities: string[];
};

export type PluginContext = {
  registerModelProvider(provider: ModelProvider): void;
  log(event: string, metadata?: Record<string, unknown>): void;
};

export interface UiosPlugin {
  readonly manifest: UiosPluginManifest;
  setup(context: PluginContext): Promise<void> | void;
}

export type WorkflowNode = {
  id: string;
  type: "prompt" | "model" | "tool" | "condition" | "human_approval" | "webhook";
  label: string;
  config: Record<string, unknown>;
};

export type WorkflowEdge = { from: string; to: string; condition?: string };

export type WorkflowDefinition = {
  id: string;
  name: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowRunStatus = "queued" | "running" | "waiting" | "completed" | "failed";

export type WorkflowRun = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  currentNodeId?: string;
  output?: Record<string, unknown>;
  error?: string;
};

export type AgentTool = {
  name: string;
  description: string;
  /** JSON Schema for the tool input, sent to the model as a tool spec. */
  parameters?: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
};

export type AgentToolEvent = { phase: "start" | "end"; call: ToolCall; status?: "ok" | "error"; durationMs?: number; error?: string };

export type AgentRunRequest = {
  prompt: string;
  system?: string;
  tools?: AgentTool[];
  maxSteps?: number;
  onToolEvent?(event: AgentToolEvent): void;
  signal?: AbortSignal;
};

export type AgentRun = {
  id: string;
  status: "completed" | "failed" | "limit_reached";
  output: string;
  steps: number;
  toolCalls: ToolCall[];
  error?: string;
};

export type MemoryRecord = {
  id: string;
  tenantId: string;
  content: string;
  metadata: Record<string, string>;
  createdAt: string;
};

export type AnalyticsEvent = {
  id: string;
  tenantId: string;
  name: string;
  properties: Record<string, string | number | boolean>;
  timestamp: string;
};

// ─── Trace (Live Trace backbone, DECISIONS.md D-13/D-14) ─────────────────────

export type TraceOperation =
  | "model.request" | "model.embed"
  | "memory.read" | "memory.write"
  | "conversation.read" | "conversation.write"
  | "document.ingest"
  | "fs.read" | "fs.write" | "fs.create" | "fs.delete"
  | "git.read" | "git.write" | "github.read"
  | "tool.call" | "api.call"
  | "security.check"
  | "test.run" | "build.run" | "deploy.run"
  | "resource.discover";

export type TraceStatus = "ok" | "error" | "denied" | "cancelled";

/** "uios" = observed in-process by UIOS; "reported:<agent>" = self-reported by an external agent. */
export type TraceObserver = "uios" | `reported:${string}`;

export type TraceMeta = Record<string, string | number | boolean>;

export type TraceEvent = {
  id: string;
  traceId: string;
  parentId?: string;
  tenantId: string;
  projectId?: string;
  agentId?: string;
  modelId?: string;
  providerId?: string;
  operation: TraceOperation;
  resourceUrn?: string;
  /** "local" or "remote:<host>". */
  destination?: string;
  status: TraceStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  meta: TraceMeta;
  observer: TraceObserver;
};

/** Live bus message: "start" is transient (in-flight visualization); "end" is the persisted event. */
export type TraceSignal =
  | { phase: "start"; event: Omit<TraceEvent, "status" | "endedAt" | "durationMs"> }
  | { phase: "end"; event: TraceEvent };
