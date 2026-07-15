# UIOS Codebase Investigation & Implementation Plan

## Executive Summary
This analysis presents the architectural investigation and design recommendations for incorporating PostgreSQL & pgvector persistence, strict authentication middleware, and an asynchronous document ingestion pipeline into UIOS. We verify that the codebase is healthy and fully builds/typechecks before any modifications are made.

---

## 🔍 Current State & Code Audit
1. **State persistence (`apps/dashboard/app/lib/state-store.ts`)**:
   - Uses `node:sqlite`'s `DatabaseSync` (introduced in Node 22.5.0) as a local SQL database and falls back to an in-memory/JSON-file store if the file is missing or in a production-build phase.
   - All state-store exports (e.g. `saveMemory`, `findWorkspace`, `resolveApiKeyAuth`) are **synchronous**.
2. **Authentication & Policy Validation (`apps/dashboard/app/lib/runtime.ts`)**:
   - Session verification parses cookies (`uios_workspace`) and checks HMAC signatures using `crypto.createHmac`.
   - API Keys are resolved by hashing them with `crypto.createHash` (SHA-256) and querying the SQLite `api_keys` table.
   - Aegis check executes synchronous local regex checks (blocking private keys and prompt-injections) followed by an optional HTTP `fetch` to `UIOS_AEGIS_URL/api/proxy`.
   - Checks are manually imported and invoked in each individual route handler (e.g. `rejectUnauthorized(request)`).
3. **Ingestion & Vector Retrieval**:
   - There are currently no endpoints or services for document chunking, file uploads, or vector embedding generation.
   - `GatewayModelProvider` (`services/gateway-provider`) implements the `ModelProvider` contract but does *not* implement the `embed()` method required for vector embeddings.

---

## 🐘 R1: PostgreSQL & pgvector Persistence
### Package Support
- Since Next.js API route handlers in UIOS explicitly specify `export const runtime = "nodejs";`, they execute in a full Node.js runtime. Therefore, we can safely install standard Node database drivers.
- **Dependencies to add to `apps/dashboard/package.json`**:
  ```json
  "dependencies": {
    "pg": "^8.11.0",
    "pgvector": "^0.2.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0"
  }
  ```

### Supported Environment Variables
To connect securely to a managed PostgreSQL cluster, we should support:
* `PGHOST` / `UIOS_PG_HOST`: Host address.
* `PGPORT` / `UIOS_PG_PORT`: Port (default `5432`).
* `PGUSER` / `UIOS_PG_USER`: Username.
* `PGPASSWORD` / `UIOS_PG_PASSWORD`: Password.
* `PGDATABASE` / `UIOS_PG_DATABASE`: Database name.
* `PGSSL` / `UIOS_PG_SSL`: Boolean (or `"require"`/`"prefer"`) to enable SSL connections.
* `DATABASE_URL` / `UIOS_DATABASE_URL`: Connection string (e.g. `postgres://user:pass@host:port/db?sslmode=require`).

### PostgreSQL & pgvector Schema
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(32) NOT NULL DEFAULT 'builder',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'developer',
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);

-- Usage Summary
CREATE TABLE IF NOT EXISTS usage (
  tenant_id VARCHAR(64) PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  units INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_event_id VARCHAR(64)
);

-- Usage Events
CREATE TABLE IF NOT EXISTS usage_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  units INTEGER NOT NULL,
  kind VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_events_tenant_idx ON usage_events(tenant_id, recorded_at);

-- Memory Records (pgvector integration)
CREATE TABLE IF NOT EXISTS memory_records (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  embedding VECTOR(1536) -- dimension size for text-embedding-3-small
);
CREATE INDEX IF NOT EXISTS memory_records_tenant_idx ON memory_records(tenant_id, created_at);
-- Vector HNSW index for high performance similarity search
CREATE INDEX IF NOT EXISTS memory_records_vector_idx ON memory_records USING hnsw (embedding vector_cosine_ops);

-- Analytics Events
CREATE TABLE IF NOT EXISTS analytics_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_tenant_idx ON analytics_events(tenant_id, timestamp);
```

### Critical Refactoring Caveat: Sync to Async Storage API
Because database pool queries in `pg` are asynchronous and return Promises, we must refactor `state-store.ts` exports to return `Promise<T>` rather than synchronous values.
Example comparison:
* **Before (Sync)**:
  ```typescript
  export function findWorkspace(id: string): StoredWorkspace | undefined { ... }
  ```
* **After (Async)**:
  ```typescript
  export async function findWorkspace(id: string): Promise<StoredWorkspace | undefined> {
    if (pgPool) {
      const { rows } = await pgPool.query(
        "SELECT id, name, plan, created_at AS \"createdAt\" FROM workspaces WHERE id = $1",
        [id]
      );
      return rows[0];
    }
    // Fallback to sqlite/json...
  }
  ```
Since all API route handlers calling `state-store.ts` are already async, we simply need to append `await` to each storage call (e.g. `await findWorkspace(id)`).

---

## 🔒 R2: Edge SSO & Aegis Middleware
### Current Flow & Vulnerabilities
- Each route handler currently imports validation utilities and explicitly executes them:
  ```typescript
  const authError = rejectUnauthorized(request); if (authError) return authError;
  ```
- **Vulnerabilities**: A developer could create a new route and forget to call this, exposing sensitive actions. There is no fallback security baseline.

### Next.js Edge Middleware Constraints
Next.js `middleware.ts` runs inside the Edge Runtime. The Edge Runtime restricts imports of Node.js-specific modules (like `node:fs` and `node:sqlite` used by `state-store.ts`). This makes querying API Keys inside a global middleware challenging if the DB client cannot run on the Edge.

### Proposed Enforcing Designs
We present three design options:

#### Design A: Edge-Compatible DB Client (Recommended for Cloud Deployments)
- Use a database provider accessible via HTTP/WebSockets (e.g., Neon serverless or an HTTP-proxy/caching tier like Redis/Upstash).
- Middleware intercepts requests, verifies HMAC signatures of the `uios_workspace` cookie (using Edge-supported Web Crypto API), and queries API Keys directly via the Edge-compatible client.
- **Pros**: Intercepts requests early at the global Edge router.
- **Cons**: Requires Edge-compatible database drivers and networks.

#### Design B: Hybrid Middleware with Auth Endpoint
- Global Next.js `middleware.ts` verifies session cookies (only requires `UIOS_WORKSPACE_SECRET` and Web Crypto).
- For API Keys, the middleware issues an internal HTTP `fetch` to `/api/auth/verify-key` (which runs on the Node runtime with full DB access).
- If validation succeeds, the middleware forwards the request with validated tenant headers.
- **Pros**: Retains local SQLite/Node database capabilities.
- **Cons**: Adds latency due to internal HTTP fetch loop.

#### Design C: Higher-Order Function (HOF) Wrapper (Recommended for Local/Monolith)
- Wrap all route handlers in a secure HOF `withAuth`:
  ```typescript
  export function withAuth(
    handler: (req: NextRequest) => Promise<Response>,
    requiredRoles: ApiKeyRole[] = ["owner", "admin", "developer"]
  ) {
    return async (req: NextRequest) => {
      const originError = rejectCrossOriginMutation(req); if (originError) return originError;
      const authError = rejectUnauthorized(req); if (authError) return authError;
      const roleError = requireRole(req, requiredRoles); if (roleError) return roleError;
      return handler(req);
    };
  }
  ```
- **Usage**:
  ```typescript
  export const POST = withAuth(async (request) => { ... });
  ```
- **Pros**: Runs in the Node runtime, zero compilation issues, simple, robust, fail-closed by default.
- **Cons**: Developers must still remember to wrap the route, though a linter/SAST rule can easily assert that all `route.ts` exports use `withAuth`.

---

## ⚡ R3: Asynchronous Ingestion System
We propose an asynchronous ingestion pipeline designed to scale under load:

```mermaid
sequenceDiagram
    participant Client
    participant API as Upload Route
    participant Storage as Object Storage (S3)
    participant Redis as Redis / BullMQ
    participant Worker as Background Worker
    participant DB as Postgres (pgvector)

    Client->>API: POST /api/ingestion/upload (File payload)
    API->>Storage: Store file (returns fileUrl)
    API->>Redis: Enqueue ingestion job {fileUrl, tenantId}
    API-->>Client: 202 Accepted {jobId, status: "pending"}
    
    Worker->>Redis: Poll & dequeue job
    Worker->>Storage: Download file
    Worker->>Worker: Parse text & chunk
    Worker->>Worker: Call embedding API (text-embedding-3-small)
    Worker->>DB: Save chunks with embeddings (pgvector)
    Worker->>Client: Send SSE notification ("document.completed")
```

### Detailed Ingestion Steps
1. **Upload Handler (`POST /api/ingestion/upload`)**:
   - Authenticaten via session/key, checks upload rate limits.
   - Accepts PDF, Markdown, TXT (up to 10MB).
   - Uploads file buffer to S3/Object Storage, producing a unique URL.
   - Enqueues job to a Redis-backed queue (**BullMQ**).
   - Immediately returns a `202 Accepted` status with `{ jobId, documentId, status: "pending" }`.

2. **Text Parsing & Chunking**:
   - For PDFs, uses `pdf-parse`. For Markdown/TXT, decodes buffers directly.
   - Splits content into segments using a sliding-window text chunker (e.g. 500 characters, 50 characters overlap).

3. **Embedding Generation**:
   - We must first implement the `embed()` method in `GatewayModelProvider`:
     ```typescript
     async embed(inputs: string[]): Promise<number[][]> {
       const response = await fetch(`${this.baseUrl}/embeddings`, {
         method: "POST",
         headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
         body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
         signal: AbortSignal.timeout(this.timeoutMs),
       });
       if (!response.ok) throw new Error("Embedding call failed");
       const json = await response.json();
       return json.data.map((item: any) => item.embedding);
     }
     ```
   - Worker queries the embedding model for the text chunks.

4. **Vector Storage**:
   - Saves chunk records to `memory_records` in PostgreSQL. Each record gets its text content, metadata (containing source document ID), and the raw `1536`-dimensional vector.

5. **Client Notification**:
   - Create a Server-Sent Events (SSE) route `GET /api/ingestion/status?tenantId=...`.
   - When the worker finishes chunking/vectorizing, it publishes a notification event to Redis Pub/Sub, which is picked up by the SSE connection to notify the client in real-time without polling.

---

## 🛠️ Verification Logs & Compilation Check
Before making modifications, all validation checks and compilations were run. The workspace is **100% clean and compile checks pass**.

### 1. Typescript Compilation Check (`corepack pnpm --filter @uios/dashboard typecheck`)
```powershell
corepack pnpm --filter @uios/dashboard typecheck
```
*Output*:
```text
> @uios/dashboard@0.1.0 typecheck F:\UIOS\apps\dashboard
> tsc --noEmit

(Completed successfully with code 0)
```

### 2. Next.js Production Build (`corepack pnpm --filter @uios/dashboard build`)
```powershell
corepack pnpm --filter @uios/dashboard build
```
*Output*:
```text
> @uios/dashboard@0.1.0 build F:\UIOS\apps\dashboard
> next build

   ▲ Next.js 15.5.20
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 17.5s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/33) ...
 ✓ Generating static pages (33/33)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                     340 kB         442 kB
├ ○ /_not-found                            205 B         102 kB
├ ƒ /.well-known/security.txt              205 B         102 kB
├ ƒ /api/agent/run                         205 B         102 kB
...
├ ƒ /api/workspace                         205 B         102 kB
├ ƒ /api/workspace/export                  205 B         102 kB
└ ○ /terms                                 205 B         102 kB
+ First Load JS shared by all             102 kB
  ├ chunks/3177-b1a439421d6d9dd9.js      45.7 kB
  ├ chunks/567e3fde-4535a0b846b714d7.js  54.2 kB
  └ other shared chunks (total)          1.96 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

(Completed successfully with code 0)
```

### 3. Repository Security Scan (`corepack pnpm security-scan`)
```powershell
corepack pnpm security-scan
```
*Output*:
```text
> uios@0.1.0 security-scan F:\UIOS
> node scripts/security-scan.mjs

{
  "filesScanned": 123,
  "findings": []
}

(Completed successfully with code 0)
```

### 4. System Launch Audit (`corepack pnpm launch-audit`)
```powershell
corepack pnpm launch-audit
```
*Output*:
```text
> uios@0.1.0 launch-audit F:\UIOS
> node scripts/launch-audit.mjs

{
  "production": false,
  "passed": 15,
  "failed": 0,
  "checks": [
    { "name": "workspace signing secret", "ok": true, "detail": "configured" },
    { "name": "Aegis URL", "ok": true, "detail": "configured" },
    { "name": "Aegis key", "ok": true, "detail": "configured" },
    { "name": "Aegis required mode", "ok": true, "detail": "configured" },
    { "name": "Aegis fail-closed mode", "ok": true, "detail": "configured" },
    { "name": "AI gateway key", "ok": true, "detail": "configured" },
    { "name": "default model", "ok": true, "detail": "configured" },
    { "name": "durable database", "ok": true, "detail": "configured" },
    { "name": "security disclosure contact", "ok": true, "detail": "configured" },
    { "name": "security disclosure policy", "ok": true, "detail": "configured" },
    { "name": "artifact COMPLIANCE.md", "ok": true, "detail": "repository artifact present" },
    { "name": "artifact SECURITY.md", "ok": true, "detail": "repository artifact present" },
    { "name": "artifact INCIDENT_RESPONSE.md", "ok": true, "detail": "repository artifact present" },
    { "name": "artifact DATA_GOVERNANCE.md", "ok": true, "detail": "repository artifact present" },
    { "name": "artifact LAUNCH_CHECKLIST.md", "ok": true, "detail": "repository artifact present" }
  ]
}

(Completed successfully with code 0)
```

### 5. Provider End-to-End Smoke Test (`corepack pnpm provider-smoke`)
```powershell
corepack pnpm provider-smoke
```
*Output*:
```text
> uios@0.1.0 provider-smoke F:\UIOS
> node scripts/provider-smoke.mjs

{
  "passed": true,
  "status": 200,
  "route": "uios-gateway:mock-model",
  "requestId": "cb798aeb-318b-435e-95dd-5120c3434d10"
}

(Completed successfully with code 0)
```
