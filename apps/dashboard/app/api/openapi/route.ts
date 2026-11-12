export const runtime = "nodejs";

export function GET() {
  return Response.json({ openapi: "3.1.0", info: { title: "UIOS Control Plane API", version: "0.1.0", description: "Provider-neutral enterprise intelligence, security, memory, workflow, and usage APIs." }, servers: [{ url: "/" }], security: [{ bearerAuth: [] }], components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Workspace-scoped uios_live key." } } }, paths: {
    "/api/foundation": { get: { summary: "Read the Aegis Unified foundation universe for the signed-in workspace" }, post: { summary: "Connect an LLM and a firewall, proxy, or sidecar defence layer" }, delete: { summary: "Disconnect the foundation universe" } },
    "/api/foundation/witness": { post: { summary: "Classify a sample through Aegis and project the decision into the foundation universe without storing the sample" } },
    "/api/chat": { post: { summary: "Stream a model response. Local providers first; a remote provider is used only under the cloud-allowed policy or with `cloudConsent` set to a token from a 409 disclosure", responses: { "200": { description: "Server-sent events. X-UIOS-Locality is local or remote; X-UIOS-Trace-Id links to /api/trace/events" }, "403": { description: "Aegis blocked, or consent invalid/expired/mismatched" }, "402": { description: "Usage limit" }, "409": { description: "Local inference unavailable; body discloses provider, host, model and message sizes, plus a consentToken bound to these exact messages (5 minutes)" }, "502": { description: "All permitted providers failed" }, "503": { description: "No permitted provider" } } } },
    "/api/models": { get: { summary: "Configured providers with locality, live health, and models reported by each provider" } },
    "/api/trace/events": { get: { summary: "Persisted trace events for this workspace (filters: operation, status, agent, model, project, trace, observer, since, until; cursor pagination)" } },
    "/api/trace/stream": { get: { summary: "Live trace signals (Server-Sent Events): start and end of each instrumented operation" } },
    "/api/trace/coverage": { get: { summary: "Which operations are instrumented, and whether trace recording is durable" } },
    "/api/trace/report": { post: { summary: "Report operations performed by an external agent; stored as observer reported:<agent>" } },
    "/api/agent/run": { post: { summary: "Run a bounded agent" } },
    "/api/workflows/run": { post: { summary: "Execute a bounded workflow" } },
    "/api/workflows/approve": { post: { summary: "Issue an expiring owner/admin approval token for a workflow" } },
    "/api/memory": { get: { summary: "Search tenant memory" }, post: { summary: "Write tenant memory" } },
    "/api/usage": { get: { summary: "Read plan and usage events" } },
    "/api/workspace": { get: { summary: "Read the current workspace" }, post: { summary: "Create a workspace" }, delete: { summary: "Permanently delete workspace data (owner only)" } },
    "/api/workspace/export": { get: { summary: "Export tenant-scoped workspace data" } },
    "/api/keys": { get: { summary: "List keys" }, post: { summary: "Create a key" }, delete: { summary: "Revoke a key" } },
    "/api/auth/logout": { post: { summary: "End the current workspace session" } },
    "/api/plugins": { get: { summary: "Inspect plugin manifests and providers" } },
    "/api/provider/health": { get: { summary: "Check provider reachability" } },
    "/api/ready": { get: { summary: "Check production readiness configuration" } },
    "/api/billing/checkout": { post: { summary: "Create a Stripe checkout session" } },
  } }, { headers: { "Cache-Control": "public, max-age=300" } });
}
