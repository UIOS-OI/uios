# UIOS End-to-End Test Suite Specification

This document presents the E2E test suite design for the UIOS Backend Execution Plane (Milestones 3-5). It covers Relational/Vector Persistence, Authentication Middleware, and Asynchronous Ingestion across a 4-tier testing hierarchy totaling 39 test cases.

---

## 1. Research Findings & Existing Test Analysis

### 1.1 Existing Test Infrastructure
* **Test Runners:** There are no configured test runner suites (e.g., Jest, Vitest, Playwright runner configs) in the package dependencies (`package.json`). Although a `.playwright-cli/` folder exists, it holds diagnostic outputs (YAML page trees and console logs) rather than active test code or Playwright runner configurations.
* **Custom Scripts:**
  - `scripts/smoke.mjs`: Run using `node scripts/smoke.mjs`. It uses Node's native `fetch` to make HTTP requests against `process.env.UIOS_BASE_URL` (default: `http://127.0.0.1:3000`) and asserts statuses, headers, and responses for various API endpoints.
  - `scripts/provider-smoke.mjs`: Run using `node scripts/provider-smoke.mjs`. It spawns the Next.js server on port 3010, starts a mock HTTP gateway/Aegis server on port 4010, executes `fetch` checks against the spawned server, and shuts down all processes.

### 1.2 Identified Targets for E2E Tests
1. **Relational/Vector Persistence Layer:** Integrated into `apps/dashboard/app/lib/state-store.ts` (currently SQLite/JSON, to be migrated to PostgreSQL and `pgvector` in Milestone 3).
2. **Authentication Middleware:** SSO/Aegis auth validations wrapped via API route checks or Edge-compatible/Next.js middleware in `apps/dashboard/app/lib/runtime.ts`.
3. **Asynchronous Ingestion Loop:** Endpoints in `apps/dashboard/app/api/ingestion/` that upload documents, enqueue jobs in BullMQ (tracked in `apps/dashboard/app/lib/ingestion-worker.ts`), invoke `GatewayModelProvider.embed()`, write pgvector records, and notify clients via a Server-Sent Events (SSE) stream.

---

## 2. API Interaction and Test Runner Strategy

### 2.1 Server Interaction Method
The E2E tests should interact with the Next.js API server via **HTTP fetch requests** against `process.env.UIOS_BASE_URL`. 
* **Justification:** This approach mirrors the existing codebase conventions (e.g., `smoke.mjs` and `provider-smoke.mjs`), requires zero heavy external browser binaries or testing engines (such as Playwright UI drivers) which can fail in non-GUI CI environments, and runs efficiently with minimal overhead.

### 2.2 Test Runner Integration and Architecture
We recommend building a lightweight Node.js-based test runner script: `scripts/e2e-tests.mjs`.
* **Execution Process:**
  1. Spawns the production build of Next.js (`next start`) in a child process on a dedicated test port (e.g., `3010`).
  2. Runs a lightweight mock server in-process (`node:http`) to mimic external dependencies:
     - **AI Model Gateway API** (mocking `/v1/chat/completions`, `/v1/embeddings`, and `/v1/models`).
     - **Aegis Security Service** (mocking `/api/proxy` for authorization decision checks).
     - **Stripe Webhooks** (mocking `/api/billing/webhook` signature validation).
  3. Imports and executes modular test suites sequentially.
  4. Tears down processes, cleans up SQLite test files or resets Postgres test databases, and exits with code `0` on success or `1` on failure.

---

## 3. Recommended E2E Folder Structure & Layout

To ensure modularity and ease of maintenance, the following layout is recommended:

```
uios/
├── scripts/
│   └── e2e-tests.mjs            # Primary test runner, server orchestrator, and test harness
├── tests/
│   └── e2e/
│       ├── persistence.spec.mjs  # Tier 1 & 2 Relational/Vector Persistence tests
│       ├── auth.spec.mjs         # Tier 1 & 2 Authentication & Middleware tests
│       ├── ingestion.spec.mjs    # Tier 1 & 2 Async Ingestion & BullMQ worker tests
│       ├── scenarios.spec.mjs    # Tier 3 (Combinations) & Tier 4 (Real-World Scenarios)
│       └── helpers.mjs           # Sharing test helpers (cookie parsing, fetch wrappers)
```

---

## 4. E2E Test Suite Specification (39 Test Cases)

### 4.1 Tier 1: Feature Coverage (15 Test Cases)

#### Area A: Relational & Vector Persistence

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-PERSIST-01** | Database Initialization & Schema Auto-Migration | System Startup | N/A | Env: `UIOS_STATE_DB` points to test DB | N/A | PostgreSQL/pgvector connections succeed; tables (workspaces, api_keys, memory_records, usage, usage_events, analytics_events) and vector extensions are successfully initialized. |
| **TC-PERSIST-02** | Create Workspace & Relational Integrity | `/api/workspace` | `POST` | `{"name": "Alpha Corp"}` | `200 OK` | `{"workspace":{"id":"ws_...","name":"Alpha Corp","plan":"builder",...}}`. relational DB record verified. |
| **TC-PERSIST-03** | Vector Persistence (pgvector insert) | `/api/memory` | `POST` | `{"content": "Confidential blueprint document"}` | `201 Created` | `{"id":"...","content":"Confidential blueprint document"}`. Vector coordinates inserted in `memory_records`. |
| **TC-PERSIST-04** | Cosine Similarity Vector Retrieval | `/api/memory` | `GET` | `?q=blueprint` | `200 OK` | Array containing the `"Confidential blueprint document"` record, retrieved via pgvector cosine distance match. |
| **TC-PERSIST-05** | Workspace Plan Persistence | `/api/billing/webhook` | `POST` | Stripe event body mapping plan to `"scale"`; Header: `stripe-signature` valid | `200 OK` | DB record for workspace is updated to `plan: "scale"`. Subsequent `/api/workspace` calls reflect the new plan. |

#### Area B: Authentication Middleware

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-AUTH-01** | Valid Signed Cookie Session Access | `/api/workspace` | `GET` | Cookie: `uios_workspace=VALID_SIGNED_COOKIE` | `200 OK` | `{"workspace":{...}}` mapping to the session's workspace tenant. |
| **TC-AUTH-02** | Valid Bearer API Key Authorization | `/api/usage` | `GET` | Header: `Authorization: Bearer uios_key_...` | `200 OK` | Plan-aware usage data. Header `Cache-Control: no-store` present. |
| **TC-AUTH-03** | Role-Based Access Enforcement | `/api/keys` | `DELETE` | `?id=key_id`; Header: `Authorization: Bearer VIEWER_KEY` | `403 Forbidden` | `{"error": "This action requires an elevated workspace role."}` |
| **TC-AUTH-04** | Multi-Tenant Data Isolation | `/api/memory` | `GET` | `?q=blueprint`; Cookie: `uios_workspace=TENANT_B_COOKIE` | `200 OK` | `[]` (Empty list). Tenant B cannot read Tenant A's memories. |
| **TC-AUTH-05** | Cross-Origin Mutation Protection | `/api/workspace` | `POST` | `{"name":"evil"}`; Header: `Origin: https://attacker.com` | `403 Forbidden` | `{"error": "Cross-origin mutations are not allowed."}` |

#### Area C: Asynchronous Ingestion

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-INGEST-01** | Document Upload & Job Enqueue | `/api/ingestion/upload` | `POST` | `multipart/form-data`; PDF file; Cookie: `uios_workspace=...` | `202 Accepted` | `{"jobId":"job_...","status":"queued"}`. Job enqueued in BullMQ. |
| **TC-INGEST-02** | PDF Text Extraction Processing | Ingestion Worker | N/A | Internal Worker Execution | N/A | Worker pulls job, calls `pdf-parse` library, and successfully extracts plaintext stream. |
| **TC-INGEST-03** | Embedding Generation Call | Model Gateway | `POST` | Internal Gateway fetch (embeddings call) | `200 OK` | Worker invokes `GatewayModelProvider.embed()` yielding floats representation of chunk texts. |
| **TC-INGEST-04** | Vector Persistence on Ingestion | Vector DB | N/A | Internal DB write | N/A | Vectors stored in PostgreSQL pgvector tables, matching tenant's schema. |
| **TC-INGEST-05** | SSE Real-time Progress Sequencing | `/api/ingestion/status` | `GET` | `?jobId=job_...`; Header: `Accept: text/event-stream` | `200 OK` | Event stream outputs sequential events: `status: queued`, `status: processing`, and `status: completed`. |

---

### 4.2 Tier 2: Boundary & Corner Cases (15 Test Cases)

#### Area A: Relational & Vector Persistence

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-PERSIST-06** | Database Connection Outage & Fallback | `/api/health` | `GET` | Env: `UIOS_STATE_DB` invalid or server stopped | `500 Server Error` or `200 OK` (fallback) | Graceful error response or seamless fallback to SQLite/In-memory store as defined by fallback configuration. |
| **TC-PERSIST-07** | Parameterized SQL Injection Immunity | `/api/workspace` | `POST` | `{"name": "'; DROP TABLE workspaces; --"}` | `200 OK` or `400 Bad Request` | Workspace is created with literal name. Database tables are NOT dropped (verifying parameterization). |
| **TC-PERSIST-08** | Empty Query Vector Retrieval | `/api/memory` | `GET` | `?q=` | `200 OK` | `[]` (Empty list) is returned gracefully without application crash. |
| **TC-PERSIST-09** | Retention Limit Enforcement | Database Daemon | N/A | Timer triggers audit cleanup | N/A | Analytics and usage events older than `UIOS_AUDIT_RETENTION_DAYS` (default 365) are permanently deleted. |
| **TC-PERSIST-10** | Oversized Metadata Memory Write | `/api/memory` | `POST` | `{"content": "data", "metadata": {"x": "[501 bytes string]"}}` | `400 Bad Request` | `{"error": "Memory metadata boundary exceeded"}` (protects state storage exhaustion). |

#### Area B: Authentication Middleware

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-AUTH-06** | Tampered Session Cookie Signature | `/api/workspace` | `GET` | Cookie: `uios_workspace=ws_123.expires.TAMPERED_SIGNATURE` | `401 Unauthorized` | `{"error": "A signed workspace session or UIOS API key is required."}` |
| **TC-AUTH-07** | Expired Session Cookie | `/api/workspace` | `GET` | Cookie: `uios_workspace=ws_123.PAST_TIMESTAMP.SIGNATURE` | `401 Unauthorized` | `{"error": "A signed workspace session or UIOS API key is required."}` (re-verification fails due to TTL expiry). |
| **TC-AUTH-08** | Revoked API Key Access Check | `/api/usage` | `GET` | Header: `Authorization: Bearer REVOKED_API_KEY` | `401 Unauthorized` | `{"error": "Invalid or revoked UIOS API key."}` |
| **TC-AUTH-09** | Spoofed Tenant Header Bypass Prevention | `/api/usage` | `GET` | Header: `x-uios-tenant: victim_tenant` | `401 Unauthorized` | Tenant context resolved strictly from cookie or key validation. Access to `victim_tenant` is rejected. |
| **TC-AUTH-10** | Malformed Authorization Header format | `/api/usage` | `GET` | Headers: `Authorization: Bearer`, `Authorization: token`, or missing spaces | `401 Unauthorized` | Handled gracefully without crash, returning appropriate authentication error message. |

#### Area C: Asynchronous Ingestion

| ID | Test Case | Target API / Resource | Method | Payload / Headers | Expected Status | Expected Body / Outcome |
|---|---|---|---|---|---|---|
| **TC-INGEST-06** | Corrupted or Zero-Byte PDF Upload | `/api/ingestion/upload` | `POST` | `multipart/form-data`; empty file or corrupted binary | `400 Bad Request` | `{"error": "Invalid or empty PDF file payload."}` |
| **TC-INGEST-07** | Embedding Provider Outage & Retry | `/api/ingestion/status` | `GET` | Mock gateway endpoint triggers 500 error / timeout | `200 OK` (SSE) | Job state reflects retry logs. If retries exceed configuration, state ends in `status: failed`. |
| **TC-INGEST-08** | Concurrency Throttling & Ingestion Limit | `/api/ingestion/upload` | `POST` | 100 concurrent POST uploads | `429 Too Many Requests` or `202 Accepted` | Queue handles backpressure. Excess calls throttled per tenant. Database connection pools remain healthy. |
| **TC-INGEST-09** | Large File Chunk Boundary Splitting | `/api/ingestion/upload` | `POST` | PDF of 100+ pages; Cookie: `uios_workspace=...` | `202 Accepted` | Document splits cleanly into chunks under model token thresholds (e.g., max 1000 characters per chunk). |
| **TC-INGEST-10** | SSE Connection Disconnect & Resume | `/api/ingestion/status` | `GET` | Connect -> Interrupt Client -> Reconnect | `200 OK` | Status resumes streaming from current state without re-running ingestion worker task. |

---

### 4.3 Tier 3: Cross-Feature Combinations (4 Test Cases)

These cases test the critical boundaries and integration points where features intersect.

#### Area: Ingestion Auth, Vector Isolation, and Lifecycle

| ID | Test Case | Description | API Route / Methods | Payloads / Headers | Expected Outcome |
|---|---|---|---|---|---|
| **TC-COMB-01** | Ingestion Upload Role Verification | Verify that only authorized roles can ingest files, while read-only keys are restricted. | `POST /api/ingestion/upload` | Header: `Authorization: Bearer VIEWER_KEY` | `403 Forbidden` (`{"error": "This action requires an elevated workspace role."}`). |
| **TC-COMB-02** | Vector Query Tenant Isolation | Ensure uploaded document vectors are isolated. Tenant B must not see Tenant A's documents, even via vector matching. | `POST /api/ingestion/upload` (Tenant A)<br>`GET /api/ingestion/search?q=...` (Tenant B) | Cookie: Tenant A's Workspace<br>Header: Tenant B's API Key | Ingestion succeeds for Tenant A. Search query from Tenant B returns an empty array `[]`. |
| **TC-COMB-03** | Ingestion State Check during Key Revocation | Revoking a tenant API key mid-ingestion must instantly cut off status tracking and ingestion queries. | `GET /api/ingestion/status?jobId=...`<br>`DELETE /api/keys?id=...` | Header: `Authorization: Bearer DEVELOPER_KEY` | Worker continues backend processing, but status streams and query routes immediately return `401 Unauthorized` for revoked key. |
| **TC-COMB-04** | Workspace Deletion Data Cascading | Deleting a workspace must cascade and purge associated pgvector chunks and active BullMQ jobs. | `DELETE /api/workspace`<br>`GET /api/ingestion/search` | Cookie: Owner Workspace Session | Deletion returns `200 OK`. Subsequent vector searches return empty results. Relational tables verify row count is zero for tenant. |

---

### 4.4 Tier 4: Real-World Application Scenarios (5 Test Cases)

These tests validate end-to-end user workflows and complex multi-step scenarios in a realistic runtime environment.

#### TC-SCEN-01: End-to-End Enterprise Ingestion and Search Pipeline
* **User Flow:**
  1. Enterprise tenant registers workspace via `POST /api/workspace` with body `{"name": "Enterprise Hub"}`.
  2. Workspace plan is verified as upgraded via Stripe webhook mock payload to `enterprise`.
  3. API key is generated via `POST /api/keys` with role `developer`.
  4. User uploads `corporate_policy.pdf` using the developer API key to `POST /api/ingestion/upload`.
  5. User connects to the `/api/ingestion/status?jobId=...` event stream using `EventSource` (Accept: `text/event-stream`) and waits for `status: "completed"`.
  6. User calls `GET /api/ingestion/search?q=expense%20reimbursement` using the API key.
* **Assertions:**
  - Workspace creation returns `200 OK` and sets cookie.
  - Upload returns `202 Accepted` with a valid Job ID.
  - SSE outputs events: `queued` -> `processing` -> `completed`.
  - Search query returns `200 OK` with text chunks matching expense policies with similarity score > `0.70`.

#### TC-SCEN-02: Multi-Tenant Data Leakage Attack Attempt
* **User Flow:**
  1. Tenant A uploads a PDF containing secret keys: `secret_keys.pdf`. Ingestion finishes successfully.
  2. Tenant B (attacker) creates a separate workspace and retrieves an API key.
  3. Tenant B attempts to call `/api/ingestion/status?jobId=TENANT_A_JOB_ID` using Tenant B's credentials.
  4. Tenant B attempts to call `/api/ingestion/search?q=secret` by injecting headers `x-uios-tenant: tenant_a_id`.
  5. Tenant B attempts to invoke `/api/workspace` delete route targeting Tenant A's workspace ID.
* **Assertions:**
  - Ingestion status query returns `403 Forbidden` or `404 Not Found`.
  - Ingestion search query with spoofed headers is processed under Tenant B's context, returning `[]`.
  - Cross-tenant delete call returns `403 Forbidden` or blocks the mutation. No Tenant A data is lost or leaked.

#### TC-SCEN-03: System Recovery from Database and Provider Outages
* **User Flow:**
  1. Tenant uploads `recovery_test.pdf` via `POST /api/ingestion/upload`.
  2. Ingestion worker starts and processes text extraction.
  3. Test runner simulates PostgreSQL database outage (e.g., dropping socket connection or blocking port 5432).
  4. Worker catches DB connectivity issue, pauses processing, and retries the job.
  5. Test runner restores database port/socket.
  6. Worker successfully reconnects, completes vector calculations, and writes chunks to pgvector store.
* **Assertions:**
  - Ingestion endpoint accepts upload (`202 Accepted`).
  - Worker logs reflect database reconnection and successful execution of the retried BullMQ job.
  - Vector search returns the successfully embedded chunks.

#### TC-SCEN-04: API Key Lifecycle with Granular Roles
* **User Flow:**
  1. Workspace Owner creates a workspace session.
  2. Owner creates an API key with the role `developer` and a second key with the role `viewer`.
  3. Developer key is used to execute a memory write `POST /api/memory` (payload: `{"content": "developer note"}`).
  4. Viewer key is used to attempt a memory write `POST /api/memory` (payload: `{"content": "viewer block"}`).
  5. Viewer key is used to query `/api/memory?q=developer`.
  6. Owner revokes the Developer key via `DELETE /api/keys?id=...`.
  7. Developer key attempts to write/read.
* **Assertions:**
  - Developer write succeeds (`201 Created`).
  - Viewer write fails (`403 Forbidden`).
  - Viewer read succeeds (`200 OK`), returning `"developer note"`.
  - Revoked developer key is rejected with `401 Unauthorized` on all endpoints.

#### TC-SCEN-05: High-Concurrency Stress and Throttling Scenario
* **User Flow:**
  1. 10 separate tenants concurrently generate workspaces.
  2. Each tenant triggers 5 simultaneous document ingestion tasks (50 total parallel tasks).
  3. Each tenant executes chat API requests (`POST /api/chat`) concurrently at a rate exceeding `UIOS_RATE_LIMIT_PER_MINUTE`.
* **Assertions:**
  - Rate limiting triggers `429 Too Many Requests` status codes with `Retry-After` headers once per-tenant limits are breached.
  - Non-throttled ingestion requests are queued in BullMQ and executed sequentially without worker collapse.
  - Relational database connections remain stable under pool capacity limits.

---

## 5. Implementer Integration Guidance

### 5.1 Test Execution Script Blueprint (`scripts/e2e-tests.mjs`)
The following outline represents the implementation structure for the E2E test runner:

```javascript
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { rmSync } from "node:fs";

// 1. Start Mock Gateway/Aegis Server
const mockServices = createServer((req, res) => {
  if (req.url === "/api/proxy") {
    // Mock Aegis authorization check
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ allowed: true }));
  } else if (req.url === "/embeddings") {
    // Mock Vector Embedding Generator
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: [{ embedding: Array(1536).fill(0.1) }]
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => mockServices.listen(4010, "127.0.0.1", resolve));

// 2. Start Next.js App
const uiosApp = spawn("node", ["node_modules/next/dist/bin/next", "start", "--port", "3010"], {
  env: {
    ...process.env,
    PORT: "3010",
    UIOS_BASE_URL: "http://127.0.0.1:3010",
    UIOS_WORKSPACE_SECRET: "test-workspace-signing-secret-key-123456",
    UIOS_AEGIS_URL: "http://127.0.0.1:4010",
    UIOS_AEGIS_KEY: "mock-aegis-key",
    UIOS_AI_GATEWAY_URL: "http://127.0.0.1:4010",
    UIOS_AI_GATEWAY_KEY: "mock-gateway-key",
    UIOS_DEFAULT_MODEL: "mock-model"
  }
});

// 3. Wait for Readiness
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch("http://127.0.0.1:3010/api/health");
    if (res.ok) { ready = true; break; }
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}

if (!ready) {
  console.error("Dashboard failed to boot.");
  process.exit(1);
}

// 4. Run Test Specs
try {
  console.log("Running E2E tests...");
  // Import and run test files dynamically or sequentially
  // e.g., await import("../tests/e2e/persistence.spec.mjs");
  console.log("All E2E tests passed!");
} catch (err) {
  console.error("Test failure:", err);
  process.exitCode = 1;
} finally {
  // 5. Cleanup and Shutdown
  uiosApp.kill();
  mockServices.close();
}
```
