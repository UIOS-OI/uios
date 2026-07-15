# Changes: Milestone 3 - PostgreSQL & pgvector Integration

We have transitioned the persistence layer from SQLite/JSON to PostgreSQL with pgvector, refactored state persistence methods to be asynchronous, updated dependent services to handle async operations, and updated all callers in the dashboard application.

## State Store (`apps/dashboard/app/lib/state-store.ts`)
- Configured PostgreSQL connection using a `Pool` from the `pg` package.
- Evaluated `process.env.DATABASE_URL` or `process.env.UIOS_STATE_DB` to conditionally activate PostgreSQL when starting with `postgres://` or `postgresql://`. If not configured, falls back to the existing SQLite/JSON implementation.
- Automated database schema initialization for PostgreSQL:
  - Enabled the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector;`).
  - Created tables: `workspaces`, `api_keys`, `usage`, `usage_events`, `memory_records` (with `embedding vector(1536)`), and `analytics_events`.
  - Added indexes on `tenant_id`, `key_hash`, and a cosine distance HNSW index on the vector embedding column.
- Restricted all queries to the caller's specific `tenant_id` to enforce workspace boundaries.
- Refactored all exports to return Promises, aligning with async PostgreSQL queries.

## Memory Service (`services/memory/src/index.ts`)
- Refactored the `MemoryPersistence` contract to return Promises.
- Refactored the `MemoryStore` constructor to asynchronously load persistence data into cache records without blocking constructor execution.
- Refactored all `MemoryStore` methods (`save`, `search`, `list`, `clear`) to be async and return Promises.

## Analytics Service (`services/analytics/src/index.ts`)
- Refactored the `AnalyticsPersistence` contract to return Promises.
- Refactored the `AnalyticsCollector` constructor to asynchronously load persistence data.
- Refactored all `AnalyticsCollector` methods (`refresh`, `track`, `summary`, `recent`, `clear`) to be async and return Promises.

## Runtime Helpers (`apps/dashboard/app/lib/runtime.ts`)
- Updated functions (`resolveTenantId`, `resolveAuth`, `rejectInvalidApiKey`, `rejectUnauthorized`, `requireRole`, `recordUsage`, `getUsage`, `getPlanLimit`, `getWorkspacePlan`, `listUsageEvents`) to be `async` and await state-store calls.

## Route Handler Callers
Updated the following route handlers to await the async runtime and state-store helper functions:
- `apps/dashboard/app/api/billing/checkout/route.ts`
- `apps/dashboard/app/api/billing/webhook/route.ts`
- `apps/dashboard/app/api/keys/route.ts`
- `apps/dashboard/app/api/workspace/export/route.ts`
- `apps/dashboard/app/api/workspace/route.ts`
- `apps/dashboard/app/api/memory/route.ts`
- `apps/dashboard/app/api/analytics/route.ts`
- `apps/dashboard/app/api/agent/run/route.ts`
- `apps/dashboard/app/api/chat/route.ts`
- `apps/dashboard/app/api/workflows/approve/route.ts`
- `apps/dashboard/app/api/workflows/run/route.ts`
- `apps/dashboard/app/api/plugins/route.ts`
- `apps/dashboard/app/api/usage/route.ts`
