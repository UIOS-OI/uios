import type { ChatResponse, ModelProvider, RouteRequest, RouteDecision, RoutingStrategy } from "@uios/contracts";

export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly healthCache = new Map<string, { checkedAt: number; status: Awaited<ReturnType<ModelProvider["health"]>> }>();

  register(provider: ModelProvider): this {
    if (this.providers.has(provider.id)) throw new Error(`UIOS provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
    return this;
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }

  async select(request: RouteRequest): Promise<{ decision: RouteDecision; provider: ModelProvider }> {
    const decision = await this.decide(request);
    const provider = this.providers.get(decision.providerId);
    if (!provider) throw new Error(`UIOS provider unavailable: ${decision.providerId}`);
    return { decision, provider };
  }

  async route(request: RouteRequest): Promise<{ decision: RouteDecision; response: ChatResponse }> {
    const { decision, provider } = await this.select(request);
    const started = Date.now();
    const response = await provider.chat({ ...request, model: decision.modelId ?? request.model });
    return { decision, response: { ...response, latencyMs: response.latencyMs ?? Date.now() - started } };
  }

  private async decide(request: RouteRequest): Promise<RouteDecision> {
    const strategy = request.strategy ?? "balanced";
    if (request.provider) {
      if (!this.providers.has(request.provider)) throw new Error(`UIOS provider unavailable: ${request.provider}`);
      return { providerId: request.provider, modelId: request.model, strategy: "explicit", candidates: [request.provider] };
    }

    const providers = [...this.providers.values()];
    if (providers.length === 0) throw new Error("UIOS has no model providers registered");
    if (strategy === "explicit") return { providerId: providers[0].id, modelId: request.model, strategy, candidates: providers.map((provider) => provider.id) };
    const health = await Promise.all(providers.map(async (provider) => {
      const cached = this.healthCache.get(provider.id);
      if (cached && Date.now() - cached.checkedAt < 5_000) return { provider, status: cached.status };
      const status = await provider.health(); this.healthCache.set(provider.id, { checkedAt: Date.now(), status });
      return { provider, status };
    }));
    const healthy = health.filter(({ status }) => status.healthy);
    if (healthy.length === 0) throw new Error("UIOS has no healthy model providers");
    const ordered = [...healthy].sort((left, right) => {
      if (strategy === "fastest") return (left.status.latencyMs ?? Infinity) - (right.status.latencyMs ?? Infinity);
      return left.provider.id.localeCompare(right.provider.id);
    });
    const selected = ordered[0].provider;
    return { providerId: selected.id, modelId: request.model, strategy, candidates: ordered.map(({ provider }) => provider.id) };
  }
}

export function createModelRouter(providers: ModelProvider[] = []): ModelRouter {
  return providers.reduce((router, provider) => router.register(provider), new ModelRouter());
}
