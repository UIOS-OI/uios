export const runtime = "nodejs";

export function GET() {
  return Response.json({ openapi: "3.1.0", info: { title: "UIOS Control Plane API", version: "0.1.0", description: "Provider-neutral enterprise intelligence, security, memory, workflow, and usage APIs." }, servers: [{ url: "/" }], security: [{ bearerAuth: [] }], components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Workspace-scoped uios_live key." } } }, paths: {
    "/api/chat": { post: { summary: "Stream a routed model response", responses: { "200": { description: "Server-sent events" }, "403": { description: "Aegis blocked" }, "402": { description: "Usage limit" } } } },
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
