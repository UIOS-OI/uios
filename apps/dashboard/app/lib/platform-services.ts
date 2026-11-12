import { AnalyticsCollector } from "@uios/analytics";
import { createGatewayProvider, type GatewayModelProvider } from "@uios/gateway-provider";
import { createOllamaProvider, type OllamaModelProvider } from "@uios/provider-ollama";
import { MemoryStore } from "@uios/memory";
import { listAnalyticsEvents, listMemories, saveAnalyticsEvent, saveMemory } from "./state-store";
import { AgentEngine } from "@uios/agent-engine";
import { createModelRouter, ModelRouter, NoEligibleProviderError } from "@uios/router";
import { WorkflowEngine } from "@uios/workflow-engine";
import { PluginRegistry } from "@uios/plugin-registry";
import { tracedProvider, type TraceContext } from "@uios/trace";
import type { ModelProvider } from "@uios/contracts";
import { traceBus } from "./intelligence";

export const memoryStore = new MemoryStore({ save: saveMemory, list: listMemories });
export const analytics = new AnalyticsCollector({ save: saveAnalyticsEvent, list: listAnalyticsEvents });
export const agentEngine = new AgentEngine();
export const pluginRegistry = new PluginRegistry();

/**
 * Routing policy (DECISIONS.md D-11):
 * - local-only: remote providers are never used.
 * - consent (default): remote providers are used only with a per-request consent token bound to the disclosed data.
 * - cloud-allowed: the operator has pre-authorized the configured remote providers for this deployment.
 */
export type RoutingPolicy = "local-only" | "consent" | "cloud-allowed";

export function routingPolicy(): RoutingPolicy {
  const value = process.env.UIOS_ROUTING_POLICY;
  return value === "local-only" || value === "cloud-allowed" ? value : "consent";
}

let ollamaProvider: OllamaModelProvider | null | undefined;
let gatewayProvider: GatewayModelProvider | null | undefined;
let fallbackProvider: GatewayModelProvider | null | undefined;
let modelRouter: ModelRouter | null | undefined;

export function getOllamaProvider(): OllamaModelProvider | null {
  if (ollamaProvider !== undefined) return ollamaProvider;
  const chatModel = process.env.UIOS_OLLAMA_CHAT_MODEL;
  if (!chatModel) { ollamaProvider = null; return ollamaProvider; }
  ollamaProvider = createOllamaProvider({
    id: "ollama",
    baseUrl: process.env.UIOS_OLLAMA_URL || "http://127.0.0.1:11434",
    chatModel,
    embedModel: process.env.UIOS_OLLAMA_EMBED_MODEL || undefined,
    numCtx: Number(process.env.UIOS_OLLAMA_NUM_CTX ?? 8192) || 8192,
    keepAlive: process.env.UIOS_OLLAMA_KEEP_ALIVE || undefined,
    timeoutMs: Number(process.env.UIOS_OLLAMA_TIMEOUT_MS ?? 120_000) || 120_000,
  });
  return ollamaProvider;
}

export function getGatewayProvider(): GatewayModelProvider | null {
  if (gatewayProvider !== undefined) return gatewayProvider;
  const apiKey = process.env.UIOS_AI_GATEWAY_KEY ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY;
  const model = process.env.UIOS_DEFAULT_MODEL;
  if (!apiKey || !model) { gatewayProvider = null; return gatewayProvider; }
  gatewayProvider = createGatewayProvider({ id: "uios-gateway", baseUrl: process.env.UIOS_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1", apiKey, defaultModel: model, embeddingModel: process.env.UIOS_EMBEDDING_MODEL || undefined, locality: process.env.UIOS_AI_GATEWAY_LOCALITY === "local" ? "local" : "remote" });
  return gatewayProvider;
}

function getFallbackProvider(): GatewayModelProvider | null {
  if (fallbackProvider !== undefined) return fallbackProvider;
  const fallbackKey = process.env.UIOS_FALLBACK_GATEWAY_KEY;
  const fallbackModel = process.env.UIOS_FALLBACK_DEFAULT_MODEL;
  fallbackProvider = fallbackKey && fallbackModel ? createGatewayProvider({ id: "uios-fallback", baseUrl: process.env.UIOS_FALLBACK_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1", apiKey: fallbackKey, defaultModel: fallbackModel }) : null;
  return fallbackProvider;
}

/** All configured providers, local first. Null when nothing is configured. */
export function getModelRouter(): ModelRouter | null {
  if (modelRouter !== undefined) return modelRouter;
  const providers = [getOllamaProvider(), getGatewayProvider(), getFallbackProvider()].filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));
  modelRouter = providers.length ? createModelRouter(providers) : null;
  return modelRouter;
}

/** Whether remote providers may be used without a per-request consent token. */
export function remoteAllowedWithoutConsent(): boolean {
  return routingPolicy() === "cloud-allowed";
}

/**
 * Embedding provider for background work (ingestion, search). Background jobs cannot ask for consent,
 * so a remote embedder is used only when the operator pre-authorized cloud routing; otherwise the
 * caller stores content unembedded and searches lexically.
 */
export function getEmbeddingProvider(context?: TraceContext): { provider: ModelProvider & { embed: NonNullable<ModelProvider["embed"]> }; model: string } | { provider: null; reason: string } {
  const local = getOllamaProvider();
  if (local?.embeddingModelId) {
    const provider = context ? tracedProvider(local, traceBus(), context) : local;
    return { provider: provider as ModelProvider & { embed: NonNullable<ModelProvider["embed"]> }, model: `ollama:${local.embeddingModelId}` };
  }
  const gateway = getGatewayProvider();
  if (gateway && (gateway.locality === "local" || remoteAllowedWithoutConsent())) {
    const provider = context ? tracedProvider(gateway, traceBus(), context) : gateway;
    return { provider: provider as ModelProvider & { embed: NonNullable<ModelProvider["embed"]> }, model: `${gateway.id}:${gateway.embeddingModelId}` };
  }
  return { provider: null, reason: gateway ? "remote-embedding-not-permitted" : "no-embedding-provider" };
}

/** Workflow engine bound to one request's trace context and routing policy. */
export function createWorkflowEngine(context: TraceContext): WorkflowEngine {
  return new WorkflowEngine()
    .register("condition", async (_node, input) => input)
    .register("prompt", async (node, input) => ({ ...input, [node.id]: String(node.config.template ?? node.label) }))
    .register("model", async (node, input) => {
      const router = getModelRouter();
      if (!router) throw new Error("UIOS AI routing is not configured.");
      const prompt = String(node.config.prompt ?? input.prompt ?? node.label);
      const messages = [{ role: "user" as const, content: prompt }];
      // Workflows run unattended: remote providers only under an operator-level cloud-allowed policy.
      const { providers } = await router.candidates({ messages, strategy: "explicit", allowRemote: remoteAllowedWithoutConsent() });
      const response = await tracedProvider(providers[0], traceBus(), context).chat({ messages, model: typeof node.config.model === "string" ? node.config.model : undefined });
      return { ...input, [node.id]: response.content };
    })
    .register("human_approval", async (_node, input) => input);
}

export { NoEligibleProviderError };
