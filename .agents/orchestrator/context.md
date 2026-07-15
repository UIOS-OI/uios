# Context - UIOS Backend Execution Plane

This document records the system architecture, design decisions, and contextual constraints for the project.

## Codebase Context
- **Workspace root**: `f:/UIOS`
- **Dashboard application**: `apps/dashboard` (Next.js App Router)
- **Services**: `services/agent-engine`, `services/analytics`, `services/gateway-provider`, `services/memory`, `services/plugin-registry`, `services/router`, `services/workflow-engine`
- **Contracts package**: `packages/contracts`
- **Key files**:
  - `apps/dashboard/app/lib/state-store.ts` (currently SQLite and memory/JSON state store)
  - `apps/dashboard/app/lib/runtime.ts` (authentication, Aegis checks, rate limits)
  - `apps/dashboard/app/api/workspace/route.ts` (workspace API endpoints)
  - `apps/dashboard/app/api/memory/route.ts` (memory persistence API)

## Database Schemas (Current SQLite vs Future PostgreSQL)
- Current tables:
  - `workspaces`: `id`, `name`, `plan`, `created_at`
  - `api_keys`: `id`, `tenant_id`, `name`, `role`, `key_prefix`, `key_hash`, `created_at`, `last_used_at`, `revoked_at`
  - `usage`: `tenant_id`, `units`, `requests`, `updated_at`, `last_event_id`
  - `usage_events`: `id`, `tenant_id`, `units`, `kind`, `recorded_at`
  - `memory_records`: `id`, `tenant_id`, `content`, `metadata`, `created_at`
  - `analytics_events`: `id`, `tenant_id`, `name`, `properties`, `timestamp`

- Future PostgreSQL tables will need equivalent schemas but with pgvector support for document chunk embeddings.
