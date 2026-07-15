## 2026-07-14T20:30:09Z
You are teamwork_preview_worker. Your working directory is f:/UIOS/.agents/worker_m3_postgres.
Your task is to implement Milestone 3: PostgreSQL & pgvector Integration:
1. Examine apps/dashboard/app/lib/state-store.ts. You need to transition it from SQLite/JSON to PostgreSQL with pgvector.
2. Support connecting to PostgreSQL using a `Pool` from the `pg` package. Connect when `process.env.DATABASE_URL` or `process.env.UIOS_STATE_DB` starts with `postgres://` or `postgresql://`. If not configured or not a postgres URL, you can fall back to the existing SQLite/JSON implementation to preserve development mode.
3. Automatically initialize the database schemas if they do not exist:
   - Enable the `vector` extension if not enabled: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Create tables: `workspaces`, `api_keys`, `usage`, `usage_events`, `memory_records` (with an `embedding vector(1536)` column), `analytics_events`.
   - Index fields for fast lookups (e.g. `key_hash`, `tenant_id`, and HNSW vector index).
4. Restrict all queries to the caller's specific workspace boundary (`tenant_id`).
5. Since PostgreSQL queries are asynchronous, refactor all exports in `state-store.ts` to be async and return Promises.
6. Examine `@uios/memory` (services/memory/src/index.ts) and `@uios/analytics` (services/analytics/src/index.ts). Refactor their constructors, list, save/track, search/summary, and clear methods to be async.
7. Update all callers in the apps/dashboard app to await the async functions. Check the following files:
   - apps/dashboard/app/api/billing/webhook/route.ts
   - apps/dashboard/app/api/keys/route.ts
   - apps/dashboard/app/api/workspace/export/route.ts
   - apps/dashboard/app/api/workspace/route.ts
   - apps/dashboard/app/api/memory/route.ts
   - apps/dashboard/app/api/analytics/route.ts
   - apps/dashboard/app/lib/runtime.ts
   - apps/dashboard/app/lib/platform-services.ts
8. Run recursive typecheck (`corepack pnpm --recursive exec tsc --noEmit`) and build (`corepack pnpm build`) to ensure the entire workspace compiles cleanly.

Document the changes in f:/UIOS/.agents/worker_m3_postgres/changes.md and write a handoff report in f:/UIOS/.agents/worker_m3_postgres/handoff.md.

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
