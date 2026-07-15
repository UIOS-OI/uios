# Project: UIOS Backend Execution Plane

## Architecture
- Relational & Vector state persistence layer in `apps/dashboard/app/lib/state-store.ts` supporting PostgreSQL and pgvector.
- SSO/Aegis Auth middleware boundary check wrapper (`withAuth` or Edge-compatible middleware).
- Asynchronous event-driven document ingestion system utilizing BullMQ/Redis, pdf-parse, and SSE status streaming.
- Model embedding capability integrated into `GatewayModelProvider`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | E2E Testing Track | Design E2E test cases covering database connection, tenant isolation, authentication middleware, and async execution loop. Publish TEST_READY.md. | None | PLANNED |
| 2 | Model Embedding Integration | Add `embed()` to `GatewayModelProvider` and export it in contracts. | None | PLANNED |
| 3 | PostgreSQL & pgvector Store | Transition `state-store.ts` to async PostgreSQL & pgvector schema. | M2 | DONE |
| 4 | Security Middleware | Implement SSO / Aegis fail-closed middleware/wrapper validation. | M3 | DONE |
| 5 | Asynchronous Ingestion | Implement document upload, BullMQ background worker, embedding generation, pgvector storage, and SSE real-time notifications. | M3, M4 | IN_PROGRESS |
| 6 | Integration & Verification | Run the full E2E test suite and pass all checks (smoke tests, launch audit, security scan). | M1, M5 | PLANNED |

## Code Layout
- apps/dashboard/app/lib/state-store.ts - Persistence
- apps/dashboard/app/lib/runtime.ts - Auth & middleware
- services/gateway-provider/src/index.ts - Model provider with embed()
- apps/dashboard/app/api/ingestion - Ingestion endpoints (upload, status)
- apps/dashboard/app/lib/ingestion-worker.ts - BullMQ worker
