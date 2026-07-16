# Project: UIOS Backend Execution Plane

## Architecture
- Relational & Vector state persistence layer in `apps/dashboard/app/lib/state-store.ts` supporting PostgreSQL and pgvector.
- SSO/Aegis Auth middleware boundary check wrapper (`withAuth` or Edge-compatible middleware).
- Asynchronous event-driven document ingestion system utilizing BullMQ/Redis, pdf-parse, and SSE status streaming.
- Model embedding capability integrated into `GatewayModelProvider`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | E2E Testing Track | Design E2E test cases covering database connection, tenant isolation, authentication middleware, and async execution loop. Publish TEST_READY.md. | None | DONE |
| 2 | Model Embedding Integration | Add `embed()` to `GatewayModelProvider` and export it in contracts. | None | DONE |
| 3 | PostgreSQL & pgvector Store | Transition `state-store.ts` to async PostgreSQL & pgvector schema. | M2 | DONE |
| 4 | Security Middleware | Implement SSO / Aegis fail-closed middleware/wrapper validation. | M3 | DONE |
| 5 | Asynchronous Ingestion | Implement document upload, BullMQ background worker, embedding generation, pgvector storage, and SSE real-time notifications. | M3, M4 | DONE |
| 6 | Integration & Verification | Run the full E2E test suite and pass all checks (smoke tests, launch audit, security scan). | M1, M5 | DONE |
| 7 | UIOS Render Engine | Add a standalone modular R3F engine package with independent visual systems, GLSL shaders, and an isolated visual verification route. | None | DONE |
| 8 | Evolutionary Intelligence Universe | Promote the reusable engine to `/`, preserve the cinematic entry, add large-scale camera travel, semantic regions, adaptive quality, sector streaming, flowing currents, and authenticated provider/memory topology growth. | M7 | DONE |
| 9 | Genesis G1 — Living Intelligence Pulse | Add user-presence awareness, bounded activity routes, operation visualization, region motion personalities, intelligence weather, progressive ignition, and opt-in generative audio. | M8 | DONE |
| 10 | Genesis Spatial Hierarchy | Replace the local region cluster with astronomical star systems, parent-relative System → Planet → World → District → Building → Workspace coordinates, branch streaming, and fixed-FOV physical travel. | M9 | FOUNDATION DONE |
| 11 | Genesis v2 Recursive Universes | Treat every destination as a portal into an independently centered universe, preload the next universe, unload the previous after tunnel arrival, add universe-specific environments, and continue procedurally through Document → Graph → Token Network. | M10 | FOUNDATION DONE |
| 12 | Reality Engine v2 | Make routine navigation an instant Core-led reveal, reserve tunnels for milestone events, add intent-directed manifestation, Memory document artifacts, proximity explanations, and a safe read-only document viewer. | M11 | FOUNDATION DONE |
| 13 | Galaxy-scale knowledge worlds | Render every navigable node as a luminous galaxy entrance, brighten the Core and environments, and present Memory as an atmosphere of massive file-planets and geometric knowledge gems. | M12 | FOUNDATION DONE |
| 14 | Spatial discovery LOD | Remove fixed planet controls, compress impractical travel distances, reveal orbiting contents as the camera approaches, and keep navigation anchored to the living 3D fabric. | M13 | FOUNDATION DONE |
| 15 | Procedural astronomical realism | Generate deterministic planetary terrain, cloud bands, atmospheres, rings, stellar temperatures, galactic dust, and multi-depth star fields from topology IDs so visual variety grows with the platform. | M14 | FOUNDATION DONE |

## Code Layout
- apps/dashboard/app/lib/state-store.ts - Persistence
- apps/dashboard/app/lib/runtime.ts - Auth & middleware
- services/gateway-provider/src/index.ts - Model provider with embed()
- apps/dashboard/app/api/ingestion - Ingestion endpoints (upload, status)
- apps/dashboard/app/lib/ingestion-worker.ts - BullMQ worker
- packages/render-engine - Presentation-only WebGL engine and independent rendering systems
- apps/dashboard/app/render-engine - Isolated render-engine verification surface
- apps/dashboard/app/components/universe-experience.tsx - Active cinematic-to-universe homepage shell
- packages/render-engine/src/engine/UniverseManager.tsx - Astronomical hierarchical topology and authenticated provider worlds
- packages/render-engine/src/engine/StreamingManager.tsx - Active-branch residency and independent coordinate-space streaming
- packages/render-engine/src/systems/IntelligenceCurrentSystem.tsx - Continuous Core-to-region energy flow
- apps/dashboard/app/api/universe/topology/route.ts - Server-resolved, tenant-safe visual topology projection
- docs/GENESIS_ENGINE.md - Defining render-engine vision and milestone contract
- apps/dashboard/app/lib/universe-events.ts - Payload-free platform activity projection into the visual fabric
- packages/render-engine/src/engine/UniverseActivityManager.tsx - Living Pulse, time, and intelligence-weather state
