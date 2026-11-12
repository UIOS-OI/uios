# UIOS Intelligence Core — Repository Audit and Implementation Roadmap

Status: **approved by owner 2026-11-12**; Phase 0 in progress.
Audit date: 2026-11-12. Audited commit: `780ddad` (merge of PR #1), branch `claude/bold-curie-xvcxpf`, clean working tree.

Companion decision log: [`DECISIONS.md`](DECISIONS.md).

---

## 1. What was verified, and how

Everything in this section was run in a Linux cloud container (Node 22.23.4, pnpm 10.34.2). It was **not** run on the target Windows machine, and Ollama was **not** reachable from the container, so no local model behavior has been observed yet.

| Check | Command | Result |
|---|---|---|
| Install | `corepack pnpm install --frozen-lockfile` | OK (build script for `msgpackr-extract` ignored by pnpm policy) |
| Typecheck | `corepack pnpm --filter @uios/dashboard typecheck` | Pass, 0 errors |
| Production build | `corepack pnpm --filter @uios/dashboard build` | Pass |
| E2E suite | `corepack pnpm test:e2e` | **39/39 pass**, but the runner then throws `ENOENT` writing `.agents/worker_e2e/test-report.json` (gitignored directory that does not exist in a fresh clone). *Correction (Phase 0):* the runner swallows that error and also never sets a failing exit code when tests fail, so it always exited 0 |
| Provider smoke | `corepack pnpm provider-smoke` | Pass (mock OpenAI-compatible gateway) |
| Smoke | `node scripts/smoke.mjs` against `next start` | Pass with `UIOS_WORKSPACE_SECRET` set. Without it, workspace creation correctly returns 503 (fail-closed) |
| Security scan | `corepack pnpm security-scan` | 204 files, 0 findings |
| Dependency audit | `corepack pnpm audit --prod` | **25 advisories (3 critical, 13 high, 9 moderate)**: `next@15.5.20` (patched ≥15.5.27), `postcss` (root override pins `8.5.10`; patched ≥8.5.12), `sharp`, `nanoid`, `source-map-js`, `zod`, `fflate` |
| Host-header key-verification probe | forged `Host` / `X-Forwarded-Host` pointing middleware's `verify-key` self-fetch at a fake verifier | **Not reproduced** on local `next start` (fake verifier never contacted, 401 returned). Behavior behind a reverse proxy is untested |

`TEST_READY.md` still reports "28 passed / 11 failed (2026-07-14)". That is stale: the suite now passes 39/39.

---

## 2. Current architecture (as built)

```text
apps/dashboard (Next.js 15, single process: UI + /api route handlers)
 ├─ middleware.ts            cookie/API-key auth → HMAC-signed x-uios-* headers (subset of routes)
 ├─ app/lib/runtime.ts       resolveAuth, RBAC, rate limit, usage, local Aegis regex + remote Aegis proxy
 ├─ app/lib/state-store.ts   SQLite (node:sqlite) | JSON file | PostgreSQL+pgvector adapter (613 lines)
 ├─ app/lib/platform-services.ts  singletons: memory, analytics, agent, workflow, plugins, router
 ├─ app/lib/ingestion-queue.ts    in-process queue (not BullMQ), chunk → embed → saveMemory
 └─ app/api/*                chat (SSE), agent/run, workflows/run|approve, memory, ingestion/*,
                             keys, usage, workspace, billing, universe/*, foundation/*
packages/contracts           provider-neutral types (ModelProvider, ChatRequest, ToolCall, Plugin…)
packages/render-engine       R3F Universe (presentation only, ~30 files)
services/* (611 lines total)
 ├─ router            registry; strategies explicit/fastest/balanced; 5 s health cache
 ├─ gateway-provider  OpenAI-compatible chat/stream/embed over fetch
 ├─ agent-engine      bounded tool loop (max 32 steps)
 ├─ memory            in-memory cache + keyword-overlap search
 ├─ workflow-engine   DAG executor (topological)
 ├─ plugin-registry   manifest + permission approval
 └─ analytics         event collector
```

### Strengths to preserve

- **Tenant derivation is server-side.** `resolveAuth` never trusts a bare tenant header; the smoke test confirms a spoofed `x-uios-tenant` is rejected.
- **Fail-closed defaults.** Production refuses to sign sessions without `UIOS_WORKSPACE_SECRET`; Aegis can be made required and fail-closed.
- **Expiring, tenant-bound approvals.** `signWorkflowApproval`/`verifyWorkflowApproval` (HMAC, 30–900 s TTL, sorted node IDs) is the right pattern to reuse for skill and tool approvals.
- **Provider-neutral contract.** `ModelProvider` keeps vendor SDKs out of the router. An Ollama adapter fits without touching callers.
- **Honest Universe topology.** Unauthenticated visitors get `connected:false` and empty providers; nothing is fabricated in the visual layer.
- **Real E2E harness** with a mock gateway/Aegis server, which can be extended for Intelligence Core APIs.

---

## 3. Gap analysis against the eight objectives

| # | Objective | What exists today | Gap |
|---|---|---|---|
| 1 | Persistent identity | None. There is no system identity, charter, or persona; `system` prompts are caller-supplied | Entire capability |
| 2 | Short- and long-term memory | One flat `memory_records` table; keyword search on SQLite/JSON; vector search only on Postgres; `MemoryStore` caches **all tenants'** records in process memory (up to 100k) | No conversation/session store, no tiers, no provenance, no consolidation, no context-window budgeting, no local vector search |
| 3 | Learning engine with evidence | None | Entire capability |
| 4 | Skill development and approval | Workflows plus workflow approval tokens; plugin permission approval | No skill artifact, versioning, evaluation, or lifecycle |
| 5 | Provider-independent gateway | Contract, router, OpenAI-compatible provider, fallback provider env | Tools are **not sent** to providers and `tool_calls` are **not parsed**, so `ChatResponse.toolCalls` is always empty. No failover on mid-request error (health precheck only). No capability-based routing. Router config is env-only |
| 6 | Local Ollama inference | Handbook mentions an Ollama adapter; none exists | Adapter, model discovery, context control, embedding dimension handling |
| 7 | Secure tool execution and permissions | `AgentTool` type; `UiosPermission` enum; plugin permission approval | No tool registry, schemas, risk tiers, per-call authorization, audit, timeouts, or Aegis check on tool I/O. `/api/agent/run` exposes no tools |
| 8 | Intelligence dashboard in the Universe | Universe topology API; activity events (`uios:activity`); Memory planet | No intelligence data surfaces. Topology reports `pluginRegistry.listProviders()`, which is always empty because real providers register on `modelRouter`. Topology returns full content for every memory record (unbounded payload) |

---

## 4. Defects and risks found (fix before building on top)

Severity reflects impact on the Intelligence Core work, not a formal CVSS rating.

**P0: integrity issues the new core would inherit**

1. **Fabricated embeddings.** `ingestion-queue.ts` returns `Array(1536).fill(0.1)` when no provider is configured, and substitutes `embeddings[0]` or the same constant when a provider returns fewer vectors than requested. Records are stored as if they were embedded. This violates the "do not fabricate" rule and corrupts similarity search. Fix: store the record as `unembedded` and fall back to lexical search.
2. **Test hook in production code.** The literal `"fail-generation-content"` in an uploaded document forces a simulated outage (`TC-INGEST-07`). Move it behind the mock gateway instead.
3. **Hard-coded vector dimension.** Postgres uses `vector(1536)`. `nomic-embed-text` produces 768-dimensional vectors, so local embeddings cannot be stored in the current schema.
4. **Dependency advisories.** `next@15.5.20` has critical advisories. The root `pnpm.overrides.postcss: 8.5.10` actively pins a vulnerable version.

**P1: security hardening**

5. **Internal auth headers.** Middleware forwards `x-uios-tenant-id`/`x-uios-role` with `HMAC(secret, "tenant:role")`. The signature has no timestamp or nonce, uses the same key as session cookies and approvals (no domain separation), and in development the key is the public constant `uios-development-workspace-secret`. Routes outside the middleware matcher (`/api/agent/run`, `/api/ingestion/*`, `/api/workspace`) also accept these headers straight from the client. Exploitation requires the secret, so production risk is bounded, but development tenants are forgeable. Fix: derive per-purpose keys (HKDF), add expiry, and strip inbound `x-uios-*` headers on every request before middleware sets them.
6. **Middleware self-fetch for API keys.** Each Bearer request makes an HTTP call to `/api/auth/verify-key`. The Host-header redirection probe did not reproduce locally, but this is an extra network hop and depends on deployment proxy behavior. Prefer verifying in the Node runtime.
7. **Cross-tenant in-process caches.** `MemoryStore` and `AnalyticsCollector` load every tenant's rows at startup. That is a memory/perf issue and a blast-radius issue. The new core should query per tenant from the store.

**P2: hygiene**

8. The E2E runner crashes writing its report after the tests finish, and it exits 0 even when tests fail, so CI cannot detect E2E failures.
9. `TEST_READY.md` is stale, and `PROJECT.md` says "BullMQ" although the queue is in-process.
10. `.playwright-cli/*.yml` page snapshots are committed.
11. `state-store.ts` is a 613-line three-backend file. New Intelligence Core tables should not be added to it (see D-03).

---

## 5. Target architecture

```text
                         ┌──────────── Universe (render-engine, presentation only) ────────────┐
                         │  Intelligence system: Identity core · Memory strata · Skill forge ·  │
                         │  Learning ledger · Tool constellation · Gateway/provider worlds       │
                         └──────────────▲───────────────── bounded, payload-free projections ───┘
                                        │ /api/intelligence/*  (tenant from resolveAuth only)
┌───────────────────────────────────────┴───────────────────────────────────────────────────────┐
│ Intelligence Core orchestrator  (services/intelligence-core)                                    │
│   turn pipeline: authorize → Aegis(in) → assemble context → route → tool loop → Aegis(out)      │
│                  → persist episode → emit observations → usage/audit                            │
│   ┌──────────┐ ┌────────────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────────────┐  │
│   │ identity │ │ memory             │ │ learning     │ │ skills      │ │ tool-runtime       │  │
│   │ charter, │ │ working · episodic │ │ observation→ │ │ manifest,   │ │ registry, schema,  │  │
│   │ versions │ │ · semantic ·       │ │ candidate →  │ │ eval, life- │ │ risk tier, grants, │  │
│   │ (signed) │ │ provenance, budget │ │ evidence →   │ │ cycle,      │ │ approval, audit    │  │
│   └──────────┘ └────────────────────┘ │ approval     │ │ approval    │ └────────────────────┘  │
│                                       └──────────────┘ └─────────────┘                          │
│   Aegis checkpoints on: model in/out, memory write, learning commit, skill activation, tool call │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        │ ModelProvider contract (extended: tools, reasoning, caps)
                         ┌──────────────┴──────────────┐
                         │ router: capability + policy │  local-only | local-first | cloud-allowed
                         └───┬──────────────────┬──────┘
                 provider-ollama (native API)   gateway-provider (OpenAI-compatible, existing)
                 qwen3.5:2b chat, nomic-embed   cloud / fallback
                 http://127.0.0.1:11434
                                        │
                ┌───────────────────────┴───────────────────────┐
                │ intelligence store (new module, own migrations)│  SQLite first; Postgres adapter later
                └───────────────────────────────────────────────┘
```

Principles:

- **Learning is a governed data pipeline, not weight updates.** UIOS "learns" by committing evidence-backed records (facts, preferences, procedures, skills) through review. No fine-tuning is in scope. Any future fine-tuning would be a separate ADR.
- **Every durable item carries provenance:** source type and ID, actor, model and version that produced it, timestamp, confidence, and the evidence links it depends on.
- **Approval gates sit where behavior changes:** identity edits, skill activation, high-risk tool grants, and promotion of model-inferred learnings. They reuse the existing tenant-bound, expiring, signed-token pattern.
- **Local-first is a routing policy**, not a hard fork. The same core runs on Ollama or a cloud gateway.
- **The Universe stays presentation-only.** It consumes counts, states, and IDs, never prompts, memory content, or tool payloads, consistent with `universe-events.ts`.

### Context budget for an 8192-token window (starting point, to be tuned with measurements)

| Segment | Tokens |
|---|---|
| Identity charter + operating rules | ≤ 600 |
| Active skill instructions + tool schemas | ≤ 1,000 |
| Retrieved long-term memory (with source tags) | ≤ 1,600 |
| Conversation (recent turns verbatim + rolling summary) | ≤ 3,000 |
| Reserved for model output | 1,500 |
| Safety margin (tokenizer estimate error) | ~490 |

Token counts will initially be estimated (chars/≈3.5) and then calibrated against `prompt_eval_count` returned by Ollama. That calibration is one of the Phase 1 deliverables.

---

## 6. Phased roadmap

Each phase is independently shippable, keeps the Universe working, and ends with the AGENTS.md verification set (typecheck, build, smoke, provider-smoke, audit, security-scan, E2E) plus new tests for the phase.

### Phase 0: Stabilize the foundation (small, prerequisite)

- Upgrade `next` to ≥15.5.27, fix the `postcss` override, and re-run `audit --prod` until no critical or high advisories remain, or document each remaining one.
- Remove fabricated embeddings and the `fail-generation-content` hook. Store `embedding_model` and `embedding_dims`, and mark records `unembedded` when no embedder is available.
- Make the E2E runner create its report directory; refresh `TEST_READY.md`; correct the BullMQ claim in `PROJECT.md`.
- Strip inbound `x-uios-*` headers for all routes; add an expiry and a purpose-derived key to the internal header signature.
- Add a unit-test runner for `services/*` (Node's built-in `node:test` with `tsx`, so there is no new framework dependency). Today services have no unit tests.

**Exit:** all checks green; zero fabricated vectors; E2E exit code 0.

**Phase 0 result (2026-11-12, Linux container, Node 22.23.4): complete.**

| Item | Change | Evidence |
|---|---|---|
| Dependencies | `next` ^15.5.29; `postcss` override 8.5.32; `sharp` ≥0.35.5 (accepted by Next 15.5.29) and `fflate` ≥0.6.11 via range overrides; removed the unused `ai` package | `pnpm audit --prod`: no known vulnerabilities (was 25) |
| Embeddings | No placeholder vectors. Chunks without an embedder are stored with `embeddingStatus: unembedded`; wrong vector counts or malformed vectors fail the job; `embeddingModel`/`embeddingDims` recorded; Postgres never pads or truncates to fit `vector(1536)`; search without a query vector ranks lexically. `UIOS_EMBEDDING_MODEL` added | E2E ingestion tests pass against a mock that now returns one vector per input |
| Test hook | `fail-generation-content` handling moved from app code to the mock gateway (HTTP 503) | `TC-INGEST-07` now waits for a terminal state and requires `failed` |
| Internal auth headers | Middleware runs on all `/api/*` routes and strips client-supplied `x-uios-*` headers; signature uses a purpose-derived key, a role allowlist and a 60 s expiry | New `TC-AUTH-11`. Negative control on the previous code: `/api/workspace` accepted forged legacy headers (200) |
| E2E runner | Creates its report directory; exits 1 on any failure (previously always 0) | Negative control run exited 1 |
| Unit tests | `corepack pnpm test:unit`: `node:test` with native type stripping, no new dependencies; router, agent engine, workflow engine, memory, plugin registry, gateway provider | 31/31 pass; tenant-filter mutation in memory search is caught |
| Full set | typecheck, build, unit, E2E, provider-smoke, smoke, audit, security-scan | all pass (E2E 40/40, smoke 63/63 checks, security-scan 0 findings) |

Not done in Phase 0, by design: the Postgres column is still `vector(1536)` (per-model vector storage arrives with the Phase 2 store); `bullmq` remains an unused declared dependency; the middleware still verifies API keys with an HTTP self-call (item 6).

### Phase 1: Local inference via Ollama (gateway)

- New `services/provider-ollama` implementing `ModelProvider` on Ollama's **native** API (`/api/chat`, `/api/embed`, `/api/tags`, `/api/show`, `/api/version`) with `options.num_ctx = 8192`, configurable `keep_alive`, streaming NDJSON, and `think` handling. Reasoning text is separated from the answer instead of leaking into it (see D-02).
- Extend contracts without breaking callers: `ChatRequest.tools`, `ChatResponse.reasoning`, `ModelDescriptor.embeddingDims`, `ProviderHealth.models`.
- Fix `gateway-provider` to send `tools` and parse `tool_calls`.
- Router: capability-aware selection (`chat`/`embed`/`tools`), a `UIOS_ROUTING_POLICY` of `local-only | local-first | cloud-allowed`, and failover on request error, not only on precheck.
- Env: `UIOS_OLLAMA_URL=http://127.0.0.1:11434`, `UIOS_OLLAMA_CHAT_MODEL=qwen3.5:2b`, `UIOS_OLLAMA_EMBED_MODEL=nomic-embed-text`, `UIOS_OLLAMA_NUM_CTX=8192`. The model store on `J:` is Ollama's own concern (`OLLAMA_MODELS`); UIOS never reads model files.
- Register providers so the Universe topology reports real router providers (fixes the always-empty provider list).
- `scripts/ollama-smoke.mjs`: reports Ollama version, installed models, a real chat round trip with measured latency and token counts, and the embedding dimension. **It must be run on the Windows machine.** Results are recorded only from actual output.

**Exit:** `/api/chat` streams from `qwen3.5:2b` locally with no cloud key configured; embeddings stored with their true dimension; the mock-based CI path still passes.

### Phase 2: Intelligence store and memory tiers

- New `services/intelligence-store` with numbered SQL migrations (SQLite now, Postgres adapter later) and tenant ID as a mandatory column and query parameter on every table.
- Tables: `conversations`, `messages` (episodic), `memories` (semantic: kind, content, status, confidence, provenance JSON, `embedding_model`), `memory_vectors` (per-model dimension), `memory_links` (evidence graph), `audit_ledger` (hash-chained, append-only).
- Local vector search: brute-force cosine in Node over the tenant's vectors (adequate up to roughly 10⁴–10⁵ vectors on this hardware; to be measured), keeping pgvector for Postgres. Hybrid ranking combines lexical, vector, and recency scores.
- Context assembler implementing the token budget above, with a rolling conversation summary produced by the local model and stored with provenance (`source: model_summary`, model ID).
- Migrate `/api/memory` to the new store behind the existing API shape; existing records are imported with `provenance.source = "legacy"`.

**Exit:** a multi-turn chat retrieves a fact stated earlier in a different session, with the source shown; tenant-isolation E2E tests added for every new table.

### Phase 3: Persistent identity

- `identity` record per tenant: name, purpose, charter/values, operating constraints, voice, and a capability manifest. Versioned, hash-chained, and changed only through an owner/admin approval token.
- Injected by the context assembler as the first system segment within its budget.
- Identity is stated configuration, not a claim of sentience. The UI labels it as such.
- API: `GET/POST /api/intelligence/identity` (propose), `POST /api/intelligence/identity/approve`.

**Exit:** identity survives restarts, every version is auditable, and unapproved edits cannot take effect (tested).

### Phase 4: Secure tool runtime

- `services/tool-runtime`: registry of tools with JSON-Schema input/output, `riskTier` (`read`, `write`, `egress`, `privileged`), required `UiosPermission`s, timeout, and output size cap.
- Per-call decision: tenant grant check → Aegis input check → approval required for `write`/`egress`/`privileged` unless a standing, expiring grant exists → execute → Aegis output check → audit-ledger entry with hashes of input and output.
- Initial built-in tools are read-only: memory search, current time, calculator, and an allowlisted document reader. **No shell or filesystem-write tools in v1.** No sandbox isolation is claimed on Windows.
- Agent engine uses the extended contract; `/api/agent/run` accepts a tool allowlist.

**Exit:** the local model invokes a read tool end to end; a write-tier tool is blocked without approval (tested); every call appears in the ledger.

### Phase 5: Learning engine

- **Observations** (append-only): user corrections, explicit "remember this", task outcomes, tool results, and feedback signals. Each has a source pointer.
- **Extraction:** the local model proposes candidate learnings (fact, preference, procedure) from observations. Output is schema-validated. Candidates are `pending` with confidence and evidence links, and the extracting model and prompt version are recorded.
- **Review policy:** user-stated facts may auto-commit; model-inferred items require approval. Conflicts with existing memory are flagged, not overwritten. Every commit or rejection is a ledger entry.
- **Consolidation job:** dedupe, merge, and decay of short-term into long-term memory. It runs in-process on a timer at first; a separate worker is introduced only if timings show interference with chat latency (D-01).
- An honest quality gate: extraction precision is measured on a small hand-labelled fixture set and published in the phase report. A 2B model is expected to be imperfect, so the defaults stay conservative.

**Exit:** a correction made in one session changes behavior in a later session, with the evidence chain viewable. No learning exists without an observation behind it.

### Phase 6: Skill development and approval

- Skill = versioned manifest: name, description, trigger/intent examples, instruction template, tool allowlist, input schema, and an **evaluation set** of cases with expected properties.
- Lifecycle: `draft → evaluated → approved → active → deprecated`. Drafts can be authored by users or proposed by the learning engine from repeated procedures. Evaluation runs against the configured model, and the actual outputs and pass/fail are stored. Activation requires an owner/admin approval token bound to the skill's version hash.
- The router selects active skills by intent similarity (embeddings), within the skills context budget.

**Exit:** a proposed skill cannot run until it is evaluated and approved; eval results are reproducible from stored records.

### Phase 7: Intelligence dashboard in the Universe

- `/api/intelligence/overview` returns bounded, tenant-scoped aggregates: identity version, memory counts by tier/status, pending approvals, skill states, tool-call counts by verdict, provider health, and latency percentiles. No content.
- Render-engine: an **Intelligence** system near the Core. Identity is the nucleus; memory strata are orbital shells sized by counts; skills are crystalline forge bodies coloured by lifecycle; the learning ledger is a current with pending items as unlit nodes; provider worlds show real router providers, with local Ollama distinguished from cloud.
- DOM overlay (accessible, not WebGL-only) for the approval queue, memory inspector with provenance, and skill eval results. Activity is emitted through the existing `uios:activity` events using new kinds.
- Preserve every existing route and Universe behavior. The smoke checks for the landing page markers must stay green.

**Exit:** a Playwright visual check of the Intelligence system; approval actions work from the overlay; no memory content appears in topology payloads.

---

## 7. Testing strategy

- **Unit** (`node:test`) per service: router policy, budgeter, provenance validation, approval token verification, tool authorization matrix, ledger hash-chain verification.
- **Contract tests** for `ModelProvider` run against the mock gateway in CI and against real Ollama on the Windows machine (opt-in `UIOS_OLLAMA_LIVE=1`).
- **E2E** extended with Intelligence Core scenarios, including cross-tenant probes on every new endpoint.
- **Evidence rule:** reports quote actual command output. Live-model results are labelled with model ID, Ollama version, hardware, and date. Mock results are never presented as model behavior.

## 8. Risks and open questions

| Risk / question | Mitigation or decision needed |
|---|---|
| `qwen3.5:2b` capability for tool calling and structured extraction is unverified | Phase 1 smoke measures it. Keep the cloud gateway as an optional fallback; design prompts for small models (short schemas, retries with validation) |
| Qwen3-family "thinking" output consumes the 8k budget | Default `think:false` for chat and extraction; make it configurable per skill (D-02) |
| Integrated GPU (Iris Xe): Ollama will likely run on CPU, so latency may be seconds per response | Measure in Phase 1; stream responses; keep extraction and consolidation off the request path |
| Single Next.js process for background learning | In-process first; separate worker only on measured need (D-01) |
| `node:sqlite` is still marked experimental in Node 22 | Already in use; pin Node major in `engines`; keep the adapter boundary so the store can change |
| Should model-inferred learnings ever auto-commit? | **Decided (owner, 2026-11-12):** never. Only explicit user statements auto-commit (D-05) |
| Identity per tenant, or global with tenant overlays? | **Decided (owner, 2026-11-12):** global base charter (repo-versioned) + per-tenant approved overlay (D-06) |
| Cloud fallback when Ollama is down? | **Decided (owner, 2026-11-12):** `local-first` in development; explicit per-tenant opt-in in production (D-09) |

## 9. Proposed first implementation slice (after approval)

Phase 0 in full, then Phase 1 up to a verified `ollama-smoke` run on the Windows machine. This is the smallest slice that gives the rest of the core a trustworthy foundation: honest embeddings, patched dependencies, and real local inference.
