# UIOS Backend Execution Plane — E2E Test Strategy

This document outlines the Playwright End-to-End (E2E) testing strategy for the UIOS Backend Execution Plane (Milestones 3-5). These tests will validate the critical path for the new PostgreSQL/pgvector database, SSO/Aegis middleware, and the BullMQ asynchronous document ingestion pipeline.

## 1. Database Connection & Resilience
**Objective:** Verify that the application correctly interacts with PostgreSQL/pgvector and gracefully handles connection issues.

- **TC-DB-01: Initialization:** Verify that the `state-store` correctly connects to PostgreSQL and applies the necessary pgvector schema on startup.
- **TC-DB-02: Fallback behavior:** Verify that if the PostgreSQL connection string is invalid or the database is unreachable, the application falls back to the JSON/memory store (if configured) or fails gracefully.
- **TC-DB-03: Vector Persistence:** Verify that generated embedding vectors can be stored, queried via cosine distance, and retrieved correctly for a specific tenant.

## 2. Tenant Data Isolation
**Objective:** Ensure that data (memory, vectors, api keys, workspace details) from one tenant cannot be accessed or modified by another.

- **TC-ISO-01: Vector Isolation:** Ingest a document for Tenant A and a document for Tenant B. Perform a semantic search as Tenant A and verify that only Tenant A's document chunks are returned.
- **TC-ISO-02: Workspace Export/Delete:** Verify that exporting/deleting Tenant A's workspace purges all of Tenant A's data (including pgvector records and BullMQ jobs) without affecting Tenant B.
- **TC-ISO-03: API Key Scoping:** Attempt to access Tenant A's ingestion API using Tenant B's API key. Verify a 401/403 response.

## 3. Authentication Middleware (SSO/Aegis)
**Objective:** Verify the fail-closed security boundary wrapped around the ingestion and API routes.

- **TC-AUTH-01: Valid Session:** Verify that a request with a valid `uios_workspace` cookie or API key succeeds.
- **TC-AUTH-02: Expired Session:** Verify that an expired signed cookie is immediately rejected and the user is redirected to login.
- **TC-AUTH-03: Aegis Fail-Closed:** Simulate an Aegis API timeout or 500 error. Verify that the middleware blocks the ingestion request (fail-closed) if `UIOS_AEGIS_FAIL_CLOSED=true`.
- **TC-AUTH-04: Aegis Rejection:** Simulate an Aegis block decision for a malicious file upload. Verify the request is rejected with the appropriate reason.

## 4. Asynchronous Execution Loop (Ingestion & Queueing)
**Objective:** Validate the background processing loop that parses PDFs, generates embeddings, and updates status.

- **TC-ASYNC-01: Job Enqueue:** Upload a valid PDF file. Verify that the ingestion API returns a job ID immediately (202 Accepted) and enqueues the task in BullMQ.
- **TC-ASYNC-02: Worker Processing:** Verify the background worker successfully pulls the job, parses the PDF text using `pdf-parse`, and generates embeddings via the `GatewayModelProvider.embed()` method.
- **TC-ASYNC-03: SSE Status Updates:** Connect to the SSE status endpoint. Verify that the client receives real-time updates (`queued` -> `processing` -> `completed`) as the background worker progresses.
- **TC-ASYNC-04: Failure Recovery:** Simulate a Gateway provider failure during embedding generation. Verify that BullMQ retries the job according to the backoff policy and eventually marks it as `failed` if retries are exhausted.
- **TC-ASYNC-05: Rate Limiting/Throttling:** Enqueue 100 documents simultaneously. Verify that BullMQ respects concurrency limits and does not exhaust PostgreSQL connection pools or Gateway rate limits.
