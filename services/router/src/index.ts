import type { ChatResponse, ModelProvider, ProviderHealth, RouteRequest, RouteDecision, RoutingStrategy } from "@uios/contracts";

/** Thrown when no provider satisfies the request. `remoteExcluded` lists remote providers filtered out by policy. */
export class NoEligibleProviderError extends Error {
  readonly remoteExcluded: string[];
  readonly unhealthy: string[];
  constructor(message: string, remoteExcluded: string[] = [], unhealthy: string[] = []) {
    super(message);
    this.name = "NoEligibleProviderError";
    this.remoteExcluded = remoteExcluded;
    this.unhealthy = unhealthy;
  }
}

export function providerLocality(provider: ModelProvider): "local" | "remote" {
  return provider.locality === "local" ? "local" : "remote";
}

export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly healthCache = new Map<string, { checkedAt: number; status: ProviderHealth }>();
  private readonly healthTtlMs: number;

  constructor(options: { healthTtlMs?: number } = {}) {
    this.healthTtlMs = options.healthTtlMs ?? 5_000;
  }

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

  getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId);
  }

  allProviders(): ModelProvider[] {
    return [...this.providers.values()];
  }

  async health(provider: ModelProvider): Promise<ProviderHealth> {
    const cached = this.healthCache.get(provider.id);
    if (cached && Date.now() - cached.checkedAt < this.healthTtlMs) return cached.status;
    const status = await provider.health();
    this.healthCache.set(provider.id, { checkedAt: Date.now(), status });
    return status;
  }

  async select(request: RouteRequest): Promise<{ decision: RouteDecision; provider: ModelProvider }> {
    const { decision, providers } = await this.candidates(request);
    return { decision, provider: providers[0] };
  }

  /**
   * Ordered eligible providers. Local providers always precede remote ones; remote providers are
   * eligible only when `allowRemote` is not false. Callers may fail over along this list.
   */
  async candidates(request: RouteRequest): Promise<{ decision: RouteDecision; providers: ModelProvider[] }> {
    const strategy: RoutingStrategy = request.strategy ?? "balanced";
    const all = [...this.providers.values()];
    if (all.length === 0) throw new NoEligibleProviderError("UIOS has no model providers registered");

    if (request.provider) {
      const named = this.providers.get(request.provider);
      if (!named) throw new NoEligibleProviderError(`UIOS provider unavailable: ${request.provider}`);
      if (request.allowRemote === false && providerLocality(named) === "remote") throw new NoEligibleProviderError(`UIOS provider ${request.provider} is remote and remote routing is not permitted`, [named.id]);
      return { decision: { providerId: named.id, modelId: request.model, strategy: "explicit", candidates: [named.id] }, providers: [named] };
    }

    const capable = all.filter((provider) => !request.capability || !provider.capabilities || provider.capabilities.includes(request.capability));
    const remoteExcluded = request.allowRemote === false ? capable.filter((provider) => providerLocality(provider) === "remote").map((provider) => provider.id) : [];
    const eligible = capable.filter((provider) => !remoteExcluded.includes(provider.id));
    if (eligible.length === 0) {
      throw new NoEligibleProviderError(
        remoteExcluded.length ? "No local model provider is available and remote routing is not permitted" : `UIOS has no providers with capability ${request.capability ?? "chat"}`,
        remoteExcluded,
      );
    }
    const byLocality = (left: ModelProvider, right: ModelProvider) => (providerLocality(left) === "local" ? 0 : 1) - (providerLocality(right) === "local" ? 0 : 1);

    if (strategy === "explicit") {
      const ordered = [...eligible].sort(byLocality);
      return { decision: { providerId: ordered[0].id, modelId: request.model, strategy, candidates: ordered.map((provider) => provider.id) }, providers: ordered };
    }

    const health = await Promise.all(eligible.map(async (provider) => ({ provider, status: await this.health(provider) })));
    const healthy = health.filter(({ status }) => status.healthy);
    if (healthy.length === 0) {
      throw new NoEligibleProviderError("UIOS has no healthy model providers", remoteExcluded, health.map(({ provider }) => provider.id));
    }
    const ordered = [...healthy].sort((left, right) => {
      const locality = byLocality(left.provider, right.provider);
      if (locality !== 0) return locality;
      if (strategy === "fastest") return (left.status.latencyMs ?? Infinity) - (right.status.latencyMs ?? Infinity);
      return left.provider.id.localeCompare(right.provider.id);
    });
    return {
      decision: { providerId: ordered[0].provider.id, modelId: request.model, strategy, candidates: ordered.map(({ provider }) => provider.id) },
      providers: ordered.map(({ provider }) => provider),
    };
  }

  async route(request: RouteRequest): Promise<{ decision: RouteDecision; response: ChatResponse }> {
    const { decision, provider } = await this.select(request);
    const started = Date.now();
    const response = await provider.chat({ ...request, model: decision.modelId ?? request.model });
    return { decision, response: { ...response, latencyMs: response.latencyMs ?? Date.now() - started } };
  }
}

export function createModelRouter(providers: ModelProvider[] = []): ModelRouter {
  return providers.reduce((router, provider) => router.register(provider), new ModelRouter());
}
