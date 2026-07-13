import { AnalyticsCollector } from "@uios/analytics";
import { createGatewayProvider, type GatewayModelProvider } from "@uios/gateway-provider";
import { MemoryStore } from "@uios/memory";
import { listAnalyticsEvents, listMemories, saveAnalyticsEvent, saveMemory } from "./state-store";
import { AgentEngine } from "@uios/agent-engine";
import { createModelRouter, ModelRouter } from "@uios/router";
import { WorkflowEngine } from "@uios/workflow-engine";
import { PluginRegistry } from "@uios/plugin-registry";

export const memoryStore = new MemoryStore({ save: saveMemory, list: listMemories });
export const analytics = new AnalyticsCollector({ save: saveAnalyticsEvent, list: listAnalyticsEvents });
export const agentEngine = new AgentEngine();
export const workflowEngine = new WorkflowEngine()
  .register("condition", async (_node, input) => input)
  .register("prompt", async (node, input) => ({ ...input, [node.id]: String(node.config.template ?? node.label) }))
  .register("model", async (node, input) => {
    const router = getModelRouter();
    if (!router) throw new Error("UIOS AI routing is not configured.");
    const prompt = String(node.config.prompt ?? input.prompt ?? node.label);
    const selected = await router.select({ messages: [{ role: "user", content: prompt }], model: typeof node.config.model === "string" ? node.config.model : undefined, strategy: "explicit" });
    const response = await selected.provider.chat({ messages: [{ role: "user", content: prompt }], model: typeof node.config.model === "string" ? node.config.model : undefined });
    return { ...input, [node.id]: response.content };
  })
  .register("human_approval", async (_node, input) => input);
export const pluginRegistry = new PluginRegistry();

let gatewayProvider: GatewayModelProvider | null | undefined;
let modelRouter: ModelRouter | null | undefined;

export function getGatewayProvider(): GatewayModelProvider | null {
  if (gatewayProvider !== undefined) return gatewayProvider;
  const apiKey = process.env.UIOS_AI_GATEWAY_KEY ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY;
  const model = process.env.UIOS_DEFAULT_MODEL;
  if (!apiKey || !model) { gatewayProvider = null; return gatewayProvider; }
  gatewayProvider = createGatewayProvider({ id: "uios-gateway", baseUrl: process.env.UIOS_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1", apiKey, defaultModel: model });
  return gatewayProvider;
}

export function getModelRouter(): ModelRouter | null {
  if (modelRouter !== undefined) return modelRouter;
  const primary = getGatewayProvider();
  if (!primary) { modelRouter = null; return modelRouter; }
  const providers = [primary];
  const fallbackKey = process.env.UIOS_FALLBACK_GATEWAY_KEY;
  const fallbackModel = process.env.UIOS_FALLBACK_DEFAULT_MODEL;
  if (fallbackKey && fallbackModel) providers.push(createGatewayProvider({ id: "uios-fallback", baseUrl: process.env.UIOS_FALLBACK_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1", apiKey: fallbackKey, defaultModel: fallbackModel }));
  modelRouter = createModelRouter(providers);
  return modelRouter;
}
