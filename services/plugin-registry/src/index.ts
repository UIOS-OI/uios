import type { ModelProvider, PluginContext, UiosPermission, UiosPlugin, UiosPluginManifest } from "@uios/contracts";

const permissionSet = new Set<UiosPermission>([
  "models:invoke", "models:embed", "tools:invoke", "memory:read", "memory:write", "network:egress", "secrets:read",
]);

export class PluginRegistry {
  private readonly plugins = new Map<string, UiosPlugin>();
  private readonly providers = new Map<string, ModelProvider>();

  async install(plugin: UiosPlugin, approvedPermissions: UiosPermission[] = []): Promise<void> {
    const { manifest } = plugin;
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(manifest.id)) throw new Error(`Invalid UIOS plugin id: ${manifest.id}`);
    if (this.plugins.has(manifest.id)) throw new Error(`UIOS plugin already installed: ${manifest.id}`);
    if (manifest.permissions.some((permission) => !permissionSet.has(permission))) throw new Error(`UIOS plugin requests an unknown permission: ${manifest.id}`);
    const approved = new Set(approvedPermissions);
    const denied = manifest.permissions.filter((permission) => !approved.has(permission));
    if (denied.length > 0) throw new Error(`UIOS plugin permissions require approval: ${denied.join(", ")}`);

    const context: PluginContext = {
      registerModelProvider: (provider) => {
        if (this.providers.has(provider.id)) throw new Error(`UIOS provider already registered: ${provider.id}`);
        this.providers.set(provider.id, provider);
      },
      log: () => undefined,
    };
    await plugin.setup(context);
    this.plugins.set(manifest.id, plugin);
  }

  uninstall(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  list(): UiosPlugin[] {
    return [...this.plugins.values()];
  }

  listManifests(): UiosPluginManifest[] {
    return this.list().map((plugin) => plugin.manifest);
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }
}
