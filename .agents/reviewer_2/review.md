# UIOS E2E Testing Track Review & Challenge Report

## Part 1: Quality Review Report

### Review Summary

**Verdict**: FAIL / REQUEST_CHANGES

The End-to-End (E2E) testing suite implemented for the UIOS Backend Execution Plane is highly structured and logically complete. It covers all 4 tiers of the testing hierarchy and spans all 3 target feature areas with exactly 39 test cases. The test runner (`scripts/e2e-tests.mjs`) correctly spawns a local Next.js server on port `3010` and runs a mock server on port `4010` to stub external dependencies (Aegis Security, AI Gateway, and Stripe Webhooks). Test cases perform genuine HTTP fetches using `fetch()` with custom cookies and bearer tokens.

However, a major regression was introduced during the state store's transition to asynchronous operations. Several helper functions in `runtime.ts` were converted to `async` (returning `Promise`s), but multiple Next.js API route handlers were not updated to `await` their results. This results in numerous TypeScript compiler errors, causing the production build (`corepack pnpm --filter @uios/dashboard build`) to fail. Therefore, the codebase is currently not compile-clean, and the verdict is **FAIL**.

---

### Findings

#### [Critical] Finding 1: Unawaited Async Calls causing TypeScript Compilation Failures
* **What**: Several API route files call `resolveTenantId(request)` and other async helpers from `runtime.ts` synchronously without the `await` keyword.
* **Where**: 
  * `apps/dashboard/app/api/billing/checkout/route.ts` (line 11)
  * `apps/dashboard/app/api/keys/route.ts` (lines 10, 17, 35)
  * `apps/dashboard/app/api/usage/route.ts` (line 8)
  * `apps/dashboard/app/api/workflows/run/route.ts` (line 17)
* **Why**: Since `resolveTenantId` is declared as `async` and returns a `Promise<string>`, calling it without `await` yields a Promise. This results in compile-time type mismatches when the return value is passed to functions expecting a `string` (e.g. `checkRateLimit`, `getPlanLimit`, `getUsage`). This breaks `tsc --noEmit` and stops the production build.
* **Suggestion**: Update these route handlers to properly `await` all asynchronous helpers (`resolveTenantId`, `rejectUnauthorized`, `requireRole`, `resolveAuth`, etc.).

#### [Major] Finding 2: Lack of Deleted Workspace Verification in GET /api/workspace
* **What**: The E2E test case `TC-COMB-04: Workspace Deletion Data Cascading` fails because `GET /api/workspace` returns `200 OK` with a default fallback workspace object instead of rejecting access after the workspace is deleted.
* **Where**: `apps/dashboard/app/api/workspace/route.ts` (line 13)
* **Why**: The GET handler falls back to `{ id, name: ... }` if `findWorkspace(id)` is null or undefined. After a workspace is deleted, `resolveAuth` still decrypts the tenant ID from the signed cookie (which remains cryptographically valid until its expiration time). The handler then returns a fallback workspace rather than rejecting the request or returning 404/401.
* **Suggestion**: Ensure `GET /api/workspace` returns a `404 Not Found` or `401 Unauthorized` status if `findWorkspace(id)` returns null.

#### [Minor] Finding 3: Ingestion API Endpoints Return 404 (Expected Failure)
* **What**: 11 test cases under `TC-INGEST-*` and scenario/combination tests fail with `404 Not Found` or related errors.
* **Where**: Ingestion spec `tests/e2e/ingestion.spec.mjs` and scenario spec `tests/e2e/scenarios.spec.mjs`.
* **Why**: The ingestion endpoints (`/api/ingestion/upload`, `/api/ingestion/status`, `/api/ingestion/search`) are not yet implemented in the codebase (reserved for downstream ingestion tracks). This is the expected baseline failure behavior and is correctly documented in `TEST_READY.md`.

---

### Verified Claims

* **39 E2E Test Cases** → verified via inspecting files in `tests/e2e/`. Exactly 39 test cases cover all 4 tiers (Feature Coverage, Boundary/Corner, Cross-Feature, Scenarios) and 3 feature areas (Persistence, Auth Middleware, Ingestion). → **PASS**
* **Genuine HTTP fetches** → verified via inspecting `helpers.mjs`. Tests utilize `fetch()` to call the Next.js API server running on port `3010`. → **PASS**
* **External Dependency Stubbing/Mocking** → verified by checking the Node.js HTTP server configured in `scripts/e2e-tests.mjs` on port `4010`. It successfully stubs Aegis decision proxying, Gateway embeddings/chat, and Stripe webhook payloads. → **PASS**
* **Documentation Verification** → verified that `TEST_INFRA.md` and `TEST_READY.md` exist and contain accurate architecture diagrams, commands, and failure analyses. → **PASS**
* **Compile-Clean System** → tested via `corepack pnpm --filter @uios/dashboard typecheck` and `corepack pnpm --filter @uios/dashboard build`. → **FAIL** (TypeScript compilation errors).

---

### Coverage Gaps

* **SQLite Vector Support**: The SQLite database fallback has schema definition for `memory_records` with a string `metadata` column, but does not support vector embeddings since SQLite lacks native pgvector. While the test runner falls back gracefully, this introduces a slight divergence in capability between PG and SQLite modes. (Risk: Low/Medium - recommend accepting risk since pgvector is targeted for production).

---

### Unverified Items

* **Stripe Webhook signature validation logic**: Not fully verified because we stubbed the stripe webhook in the mock server on port 4010, but the signature validation itself relies on `crypto` in the API endpoint. We checked that the webhook endpoint successfully runs under mock payloads.

---

## Part 2: Adversarial Challenge Report

### Challenge Summary

**Overall risk assessment**: MEDIUM

While the E2E test framework uses genuine HTTP calls and has excellent logical coverage, the application has severe type-safety leaks that caused build failures. A key assumption of the E2E test runner is that the Next.js application will successfully build and start, but the compiler errors block any fresh production builds.

---

### Challenges

#### [High] Challenge 1: Unawaited Promise Evaluation in Security Middleware
* **Assumption challenged**: The system assumes that calling `resolveTenantId(request)` synchronously in rate limit checking or usage queries will fail-safe or cause immediate compiler noise.
* **Attack scenario**: In `app/api/billing/checkout/route.ts`, the tenant ID is resolved via `resolveTenantId(request)` without `await`. Since `resolveTenantId` returns a Promise, the `tenantId` variable evaluates to `Promise { <pending> }`. If this is used as a lookup key for rate limiting or tenant context, it may resolve to string representation `"[object Promise]"` or cause rate limiting checks to bypass entirely or crash the process. Under some JS engines, evaluating a Promise as a string can lead to multi-tenant bypass (if multiple requests share the same `"[object Promise]"` key).
* **Blast radius**: Multi-tenant data leakage or rate limit bypass.
* **Mitigation**: Standardize on type-safe, compile-time checks that reject unawaited Promises.

#### [Medium] Challenge 2: Session Replay via Deleted Workspaces
* **Assumption challenged**: The system assumes that deleting a workspace fully revokes access.
* **Attack scenario**: When a workspace is deleted, its database records are deleted (`deleteWorkspaceData`). However, if an attacker has a previously signed cookie, they can still authenticate because `resolveAuth` verifies the cryptographic signature of the cookie, which does not check the database for the workspace's existence. The GET `/api/workspace` endpoint then returns a default fallback workspace.
* **Blast radius**: Read/write access to fallback structures post-deletion.
* **Mitigation**: Update `resolveAuth` or individual endpoints to verify the tenant exists in the `workspaces` table, or maintain a blacklist of revoked workspace IDs.

---

### Stress Test Results

* **Workspace Deletion Cascade check** → Expected: `GET /api/workspace` returns 401 after deletion → Actual: returns 200 with default fallback → **FAIL**
* **Type-Safety and Build check** → Expected: compilation passes clean → Actual: fails with 40+ TypeScript errors → **FAIL**
