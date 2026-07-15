# UIOS E2E Testing Infrastructure

This document defines the E2E testing infrastructure for the UIOS Backend Execution Plane. The E2E tests are implemented as dynamic, genuine HTTP fetch calls targeting the UIOS API server, running in coordination with an in-process mock server for external dependencies (Aegis Security Service, AI Model Gateway, and Stripe Webhooks).

## 1. Test Architecture

The E2E test infrastructure runs local server processes to perform black-box testing of the UIOS Next.js API endpoints.

```
+-------------------------------------------------------+
|                    E2E Test Runner                    |
|                (scripts/e2e-tests.mjs)                |
+-------+-------------------+-------------------+-------+
        |                   |                   |
        | Spawns            | Starts            | Imports
        v                   v                   v
+---------------+   +---------------+   +---------------+
| Next.js App   |   | Mock Services |   | Test Suites   |
| (Port 3010)   |   | (Port 4010)   |   | (tests/e2e/)  |
+-------+-------+   +---------------+   +-------+-------+
        |                                       ^
        |          Genuinely HTTP Fetches       |
        +---------------------------------------+
```

### Components:
1. **Next.js API Server:** Spawned in a production build (`next start`) on dedicated test port `3010`.
2. **Mock Gateway & Aegis Server:** A lightweight, in-process Node.js `http` server on port `4010` that stubs third-party integration points (Aegis `/api/proxy` authorization decisions, Gateway `/embeddings` and `/v1/chat/completions` API calls, and Stripe `/api/billing/webhook` signature validation).
3. **E2E Test Specifications:** Dynamic ES module test files located under `tests/e2e/` executing sequential fetch assertions against the target server.

---

## 2. Test Execution & Integration

The E2E test suite can be run from the root of the project:

```bash
# Production build & run E2E tests
pnpm build
pnpm test:e2e
```

The runner:
1. Spawns the Next.js server on port 3010.
2. Runs the mock server on port 4010.
3. Polls the `/api/health` endpoint of Next.js until it is ready (up to 15 seconds).
4. Sequentially executes the test files from `tests/e2e/`.
5. Cleans up temporary test databases and kills the Next.js and mock servers.
6. Returns exit code `0` on success, or `1` if any test fails.

---

## 3. Systematic 4-Tier Test Suite Structure

The test suite covers exactly 39 test cases organized in a 4-tier hierarchy.

### Tier 1: Feature Coverage (15 Test Cases)

#### Relational & Vector Persistence
* **TC-PERSIST-01: Database Initialization & Schema Auto-Migration**
  Verifies that PostgreSQL/pgvector connections succeed and system tables (workspaces, api_keys, memory_records, usage, usage_events, analytics_events) and extensions are correctly initialized.
* **TC-PERSIST-02: Create Workspace & Relational Integrity**
  Verifies that `POST /api/workspace` correctly creates a workspace and returns 200 OK.
* **TC-PERSIST-03: Vector Persistence (pgvector insert)**
  Verifies that `POST /api/memory` successfully saves raw text and vector coordinate pairings in `memory_records`.
* **TC-PERSIST-04: Cosine Similarity Vector Retrieval**
  Verifies that `GET /api/memory?q=...` returns records matching search queries using pgvector cosine distance.
* **TC-PERSIST-05: Workspace Plan Persistence**
  Verifies that Stripe webhooks successfully upgrade tenant workspace plans to `scale` or `enterprise`.

#### Authentication Middleware
* **TC-AUTH-01: Valid Signed Cookie Session Access**
  Verifies that requests carrying a valid `uios_workspace` session cookie can access `/api/workspace`.
* **TC-AUTH-02: Valid Bearer API Key Authorization**
  Verifies that requests using a valid Bearer token can fetch `/api/usage`.
* **TC-AUTH-03: Role-Based Access Enforcement**
  Verifies that delete operations require elevated workspace roles, returning `403 Forbidden` for viewer keys.
* **TC-AUTH-04: Multi-Tenant Data Isolation**
  Verifies that memory search queries do not return records belonging to other tenants.
* **TC-AUTH-05: Cross-Origin Mutation Protection**
  Verifies that mutation calls with mismatched `Origin` headers are blocked with `403 Forbidden`.

#### Asynchronous Ingestion
* **TC-INGEST-01: Document Upload & Job Enqueue**
  Verifies that `POST /api/ingestion/upload` accepts PDF files, returns `202 Accepted` and enqueues jobs in BullMQ.
* **TC-INGEST-02: PDF Text Extraction Processing**
  Verifies that the ingestion worker processes jobs, parsing PDF contents with `pdf-parse`.
* **TC-INGEST-03: Embedding Generation Call**
  Verifies that the worker calls `GatewayModelProvider.embed()` to convert chunk texts to vector floats.
* **TC-INGEST-04: Vector Persistence on Ingestion**
  Verifies that the worker writes calculated vector embeddings to pgvector tables.
* **TC-INGEST-05: SSE Real-time Progress Sequencing**
  Verifies that `GET /api/ingestion/status?jobId=...` streams real-time events (`queued` -> `processing` -> `completed`).

### Tier 2: Boundary & Corner Cases (15 Test Cases)

#### Relational & Vector Persistence
* **TC-PERSIST-06: Database Connection Outage & Fallback**
  Verifies that the system falls back gracefully to SQLite/In-memory when the primary DB is offline.
* **TC-PERSIST-07: Parameterized SQL Injection Immunity**
  Verifies that workspaces and API keys reject or escape SQL injection payloads (no tables dropped).
* **TC-PERSIST-08: Empty Query Vector Retrieval**
  Verifies that search queries with empty or null query strings return an empty list without crashing.
* **TC-PERSIST-09: Retention Limit Enforcement**
  Verifies that the database daemon audits and purges logs older than the retention period.
* **TC-PERSIST-10: Oversized Metadata Memory Write**
  Verifies that memory writes carrying metadata keys/values exceeding limits are rejected with `400 Bad Request`.

#### Authentication Middleware
* **TC-AUTH-06: Tampered Session Cookie Signature**
  Verifies that requests with altered cookie signatures are rejected with `401 Unauthorized`.
* **TC-AUTH-07: Expired Session Cookie**
  Verifies that cookie sessions past their expiry time fail validation.
* **TC-AUTH-08: Revoked API Key Access Check**
  Verifies that revoked API keys immediately return `401 Unauthorized`.
* **TC-AUTH-09: Spoofed Tenant Header Bypass Prevention**
  Verifies that header injections like `x-uios-tenant` do not bypass session/key verification context.
* **TC-AUTH-10: Malformed Authorization Header format**
  Verifies that headers without `Bearer` prefix or missing space fail authentication gracefully.

#### Asynchronous Ingestion
* **TC-INGEST-06: Corrupted or Zero-Byte PDF Upload**
  Verifies that empty files or invalid binaries are rejected at upload with `400 Bad Request`.
* **TC-INGEST-07: Embedding Provider Outage & Retry**
  Verifies that the BullMQ job registers retry logs and gracefully ends in `failed` if providers time out.
* **TC-INGEST-08: Concurrency Throttling & Ingestion Limit**
  Verifies that the queue controls backpressure and limits tenant uploads under heavy concurrent load.
* **TC-INGEST-09: Large File Chunk Boundary Splitting**
  Verifies that large files are chunked into segment lengths under token thresholds (e.g. 1000 characters).
* **TC-INGEST-10: SSE Connection Disconnect & Resume**
  Verifies that clients can reconnect to job streams and resume tracking without re-triggering ingestion.

### Tier 3: Cross-Feature Combinations (4 Test Cases)

* **TC-COMB-01: Ingestion Upload Role Verification**
  Verifies that upload ingestion requires elevated permissions and read-only viewer keys are rejected with `403 Forbidden`.
* **TC-COMB-02: Vector Query Tenant Isolation**
  Verifies that B's search query does not match vectors uploaded by A, even with high semantic similarity.
* **TC-COMB-03: Ingestion State Check during Key Revocation**
  Verifies that revoking a tenant key mid-ingestion cuts off API status tracking streams immediately while the background job processes.
* **TC-COMB-04: Workspace Deletion Data Cascading**
  Verifies that deleting a workspace cascades and purges all keys, memories, usage events, and active jobs.

### Tier 4: Real-World Application Scenarios (5 Test Cases)

* **TC-SCEN-01: End-to-End Enterprise Ingestion and Search Pipeline**
  Full multi-step scenario: tenant registration, Stripe webhook subscription upgrade, developer key generation, PDF document upload, SSE completion tracking, and semantic search verify.
* **TC-SCEN-02: Multi-Tenant Data Leakage Attack Attempt**
  An attacker tenant attempts to access another tenant's ingestion status, spoof tenant ID headers, and trigger deletion requests on their workspace.
* **TC-SCEN-03: System Recovery from Database and Provider Outages**
  Verifies BullMQ job pausing, retry logic, and recovery after database reconnection.
* **TC-SCEN-04: API Key Lifecycle with Granular Roles**
  Simulates workspace key setup (developer/viewer), verifies write permission checks, reads developer content with viewer keys, and blocks revoked keys.
* **TC-SCEN-05: High-Concurrency Stress and Throttling Scenario**
  Simulates 10 tenants executing concurrent workspace, ingestion, and chat requests to verify rate limits and DB connection stability.
