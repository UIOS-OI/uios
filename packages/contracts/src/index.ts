export type ModelRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage = {
  role: ModelRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type ChatRequest = {
  messages: ModelMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, string>;
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
};

export type ModelDescriptor = {
  id: string;
  provider: string;
  capabilities: Array<"chat" | "stream" | "embed" | "tools" | "vision">;
  contextWindow?: number;
  costPerMillionInputTokens?: number;
  costPerMillionOutputTokens?: number;
};

export type ProviderHealth = { healthy: boolean; latencyMs?: number; checkedAt: string; message?: string };

export interface ModelProvider {
  readonly id: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatResponse>;
  embed?(inputs: string[]): Promise<number[][]>;
  listModels(): Promise<ModelDescriptor[]>;
  health(): Promise<ProviderHealth>;
}

export type RoutingStrategy = "fastest" | "cheapest" | "balanced" | "explicit";

export type RouteRequest = ChatRequest & {
  strategy?: RoutingStrategy;
  provider?: string;
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
  execute(input: Record<string, unknown>): Promise<unknown>;
};

export type AgentRunRequest = {
  prompt: string;
  system?: string;
  tools?: AgentTool[];
  maxSteps?: number;
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
