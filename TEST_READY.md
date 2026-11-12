# UIOS E2E Test Suite Status

The dynamic HTTP-based End-to-End (E2E) test suite for the UIOS Backend Execution Plane has been successfully implemented and integrated.

## Running the E2E Test Suite

To build the dashboard and run the entire 4-tier E2E test suite, run the following command from the project root:

```bash
# Compile/typecheck application and run E2E test suite
pnpm build && pnpm test:e2e
```

*Note: Since `pnpm` is not in the system's PATH on some environments, you can also run it via:*
```bash
corepack pnpm --filter @uios/dashboard build && corepack pnpm test:e2e
```

## E2E Test Coverage Summary

A total of **52 test cases** are implemented: 39 original cases, `TC-AUTH-11` (Phase 0), and 12 Intelligence Core cases in `tests/e2e/intelligence.spec.mjs` (local routing, cloud consent, trace history/stream/report/coverage, models, private docs, local embeddings).

| Test Tier | Total Cases | Target Areas |
|---|---|---|
| **Tier 1 (Feature Coverage)** | 15 | Relational/Vector Persistence, Authentication Middleware, Asynchronous Ingestion |
| **Tier 2 (Boundary & Corner cases)** | 16 | Fallbacks, SQL Injection, Expiry, Revocations, Corrupted Payloads, forged internal auth headers |
| **Tier 3 (Cross-Feature Combinations)** | 4 | Ingestion role checks, multi-tenant vector isolation, key revocation mid-job, cascade deletion |
| **Tier 4 (Real-World Scenarios)** | 5 | End-to-end user workflows, leak attacks, outage recovery, concurrent load stress |
| **Intelligence Core (Stage 1)** | 12 | Local-first chat, consent disclosure/tamper/cross-tenant, trace persistence/isolation/SSE/report/coverage, models, private docs, local ingestion embeddings |
| **Total** | **52** | |

## Last Execution Report (2026-11-12, Stage 1, Linux CI-style container, Node 22.23.4)

The mock server also emulates Ollama's native API (`/api/version`, `/api/tags`, `/api/show`, `/api/chat`, `/api/embed`) and exposes `/__mock/stats`, so tests can prove that no request reached the cloud gateway before consent. Unit tests: `corepack pnpm test:unit` (68 passing).

* **Total Executed:** 52
* **Passed:** 52
* **Failed:** 0
* **Runner exit code:** 0

The runner now exits non-zero when any test fails or the runner itself errors, and creates its report directory (`.agents/worker_e2e/`, gitignored) on demand. Before Intelligence Core Phase 0 it always exited 0.

`TC-INGEST-07` now waits for the job to reach a terminal state and requires `failed`. The embedding outage is simulated by the mock gateway (HTTP 503), not by application code.

`TC-AUTH-11` forges internal `x-uios-*` auth headers with a valid signature, in both the current and the pre-Phase 0 format, and requires 401 on `/api/workspace`, `/api/usage`, and `/api/agent/run`. Negative control: against the pre-Phase 0 middleware and runtime, this test fails with `/api/workspace` returning 200.
