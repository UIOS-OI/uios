# Change Log — E2E Testing Track

The following changes were made to implement the genuine 4-tier E2E testing suite.

## 1. Added Files

### `tests/e2e/helpers.mjs`
* Created test helper module containing base URL configuration, custom fetch wrapper (`fetchJson`), and cryptographic cookie signature helpers to mock authentic cookie generation.

### `tests/e2e/persistence.spec.mjs`
* Implemented Tier 1 & Tier 2 tests for Relational & Vector Persistence (`TC-PERSIST-01` through `TC-PERSIST-10`).
* Covers database initialization, workspace creation, vector writing/similarity retrieval, Stripe webhook plan sync, connection outages, SQL injections, and metadata limits.

### `tests/e2e/auth.spec.mjs`
* Implemented Tier 1 & Tier 2 tests for Authentication Middleware (`TC-AUTH-01` through `TC-AUTH-10`).
* Covers valid/invalid/tampered/expired session cookies, API key Bearer authorization, role-based access control, tenant isolation, cross-origin mutations, and malformed headers.

### `tests/e2e/ingestion.spec.mjs`
* Implemented Tier 1 & Tier 2 tests for Asynchronous Ingestion (`TC-INGEST-01` through `TC-INGEST-10`).
* Covers PDF document upload form data parsing, background queue processing, gateway embedding calls, vector persistence, SSE stream tracking, limit throttling, and chunk splits.

### `tests/e2e/scenarios.spec.mjs`
* Implemented Tier 3 (Cross-Feature Combinations) and Tier 4 (Real-World Scenarios).
* Covers permissions checks, cross-tenant isolation, key revocation mid-job, cascade deletes, end-to-end pipelines, leak attack simulations, outage recovery, role lifecycles, and concurrency stress.

### `scripts/e2e-tests.mjs`
* Created E2E test suite runner. It:
  * Resets test SQLite DB files.
  * Spins up an in-process mock server (on port 4010) simulating the model gateway, Aegis proxy, and Stripe webhook provider.
  * Spawns Next.js (`next start`) on port 3010.
  * Polls health check until the dashboard is fully ready.
  * Executes the 39 test cases sequentially and records results.
  * Tears down processes and cleans up temporary database files.

### `TEST_INFRA.md`
* Created root document outlining the test suite layout, execution commands, and specifications for all 39 test cases.

### `TEST_READY.md`
* Created root file detailing the test command, run outputs, and failure analysis for the E2E verification step.

## 2. Modified Files

### `package.json`
* Added `"test:e2e": "node scripts/e2e-tests.mjs"` to the root scripts block.

## 3. Verification Commands & Outputs
* Build command: `corepack pnpm --filter @uios/dashboard build` (Passed)
* Test command: `corepack pnpm test:e2e` (Ran 39 tests; 28 Passed, 11 Failed as expected due to missing ingestion and pgvector APIs).
