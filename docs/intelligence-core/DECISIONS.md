# UIOS Intelligence Core — Architecture Decision Log

Each entry records the context, the decision, alternatives considered, and what would cause the decision to be revisited. Status values: **Proposed** (awaiting owner review), **Accepted**, **Superseded**.

---

## D-01: Run the Intelligence Core in-process, behind service packages

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** The current deployment is one Next.js process (SETUP.md: "no second backend process"). Learning consolidation and skill evaluation are background work.
- **Decision:** Implement the core as `services/*` packages with no Next.js imports, called from `/api/intelligence/*` routes. Background jobs start as in-process timers that yield to request work.
- **Alternatives:** A separate Node daemon now. It is cleaner for background work but adds process management on Windows and a second auth boundary before it is needed.
- **Revisit when:** measured chat p95 latency degrades while consolidation runs, or multi-instance deployment is required.

## D-02: Native Ollama API adapter instead of the OpenAI-compatible endpoint

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** Ollama's `/v1` OpenAI-compatible endpoint would work with the existing `gateway-provider`. It does not expose per-request `num_ctx`, `keep_alive`, or `think`, and it gives less model metadata.
- **Decision:** Add `services/provider-ollama` using `/api/chat`, `/api/embed`, `/api/tags`, and `/api/show`. Set `num_ctx` from `UIOS_OLLAMA_NUM_CTX` (8192). Return reasoning text separately from answer content. Default `think: false` for chat and extraction.
- **Alternatives:** Reuse `gateway-provider` against `/v1`. This means less code, but the context window would depend on server or Modelfile defaults.
- **Revisit when:** Ollama's OpenAI-compatible API supports these options per request.

## D-03: New intelligence store module with its own migrations

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** `apps/dashboard/app/lib/state-store.ts` mixes three backends in 613 lines, with schema created inline.
- **Decision:** New Intelligence Core tables live in `services/intelligence-store` with numbered migrations and a narrow repository interface. Every query takes `tenantId` as a required parameter. The existing state store is left in place for workspaces, keys, usage, and billing.
- **Revisit when:** the platform moves to managed Postgres. The repository interface is the seam for that move.

## D-04: Embeddings are stored with their model and dimension, and are never fabricated

- **Status:** Accepted (owner, 2026-11-12). Phase 0 implements the no-fabrication and provenance parts; the per-model `memory_vectors` table arrives in Phase 2
- **Context:** Current ingestion writes constant `0.1` vectors when no embedder exists. The Postgres column is fixed at 1536 dimensions; `nomic-embed-text` produces 768.
- **Decision:** Store vectors in `memory_vectors(memory_id, model, dims, vector)`. Search only within one model's vectors. A record without a vector is `unembedded` and is found lexically. Apply `nomic-embed-text` task prefixes (`search_document:` / `search_query:`).
- **Revisit when:** a single platform-wide embedding model is mandated.

## D-05: Learning means governed, evidence-backed records, not model weight updates

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Observations → candidate learnings (with evidence links, confidence, extractor model and prompt version) → review policy → committed memory, procedure, or skill draft. Every transition is written to a hash-chained append-only audit ledger. Model-inferred items always require approval; only facts the user states explicitly may auto-commit (owner decision, 2026-11-12).
- **Alternatives:** LoRA or fine-tuning on the local machine. This is out of scope: it is hard to audit, hard to revert, and hard to run on this hardware.

## D-06: Persistent identity is approved, versioned configuration

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** A global base charter (versioned in the repository) plus a per-tenant overlay stored in the intelligence store. Each version is hash-chained and activated only with an owner/admin approval token. The identity is injected as the first context segment. The product describes it as configuration, not sentience.

## D-07: One approval primitive for identity, skills, tools, and learnings

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** `signWorkflowApproval` already provides tenant-bound, expiring HMAC tokens.
- **Decision:** Generalize it to `signApproval({ purpose, tenantId, subjectId, subjectHash, ttl })` with a key derived per purpose (HKDF from `UIOS_WORKSPACE_SECRET`). Binding to `subjectHash` means an approved skill or identity version cannot be swapped after approval. Single use is enforced by recording consumed token IDs in the ledger.

## D-08: Tools are capability-scoped, risk-tiered, and read-only in v1

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Tool registry with JSON-Schema I/O, `riskTier`, required `UiosPermission`s, timeout, and output caps. Write, egress, and privileged tiers require approval or an expiring grant. Aegis checks tool input and output. v1 ships no shell or filesystem-write tools, and UIOS claims no OS-level sandbox on Windows.

## D-09: Routing policy is explicit and local-first in development

- **Status:** Superseded by D-11 (owner brief, 2026-11-12). Originally accepted 2026-11-12
- **Decision:** `UIOS_ROUTING_POLICY = local-only | local-first | cloud-allowed`. Development defaults to `local-first`. Production requires an explicit per-tenant setting before any cloud fallback. Failover happens on request error, not only on the health precheck.

## D-10: The Universe receives aggregates only

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** `/api/intelligence/overview` exposes counts, states, versions, and health. It never exposes memory content, prompts, or tool payloads. Detail views are DOM overlays that call authenticated, tenant-scoped endpoints. This extends the existing `universe-events.ts` rule that activity is payload-free.

## D-11: No automatic cloud fallback; consent with disclosure (supersedes D-09)

- **Status:** Accepted (owner brief, 2026-11-12)
- **Decision:** Local Ollama is the default and only automatic route. If local execution fails, the request fails visibly. A cloud call requires explicit consent, per request or as a time-boxed workspace grant, after the UI discloses the provider, the model, and the exact context segments (resource URNs and sizes) to be sent. Every cloud call is traced with `destination: remote:<host>`. This applies in all environments.

## D-12: Canonical resource identity is a source-derived URN

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** Current universe bodies use array-index IDs and request-time timestamps.
- **Decision:** Every universe object is a `resources` row keyed by a stable URN derived from its source (`github:owner/repo#pr:1`, `fs:<rootId>:<path>`, `uios:conversation:<uuid>`, …). Source timestamps are stored only when the source provides them; first/last-seen times are recorded separately. Relations carry `evidence: declared | observed | inferred` and a confidence. Project merges keep aliases so old URNs resolve.

## D-13: Live Trace shows only server-recorded events

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** `uios:activity` browser events carry hard-coded routes chosen by UI components, not observed paths.
- **Decision:** Live Trace renders only `trace_events` written by the server pipeline (`observer: uios`) or explicitly self-reported by an external agent (`observer: reported:<agent>`, visually distinct). Browser-side activity events are retired as a trace source. Each operation family declares telemetry coverage, so gaps show as "not instrumented" or "unavailable". Events store metadata only (sizes, counts, hashes, exit codes), never content or secrets.

## D-14: Recording is independent of visualization

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Instrumentation is always on, at low cost, in the execution pipeline. The Live Trace toggle only subscribes to and renders the stream, so it cannot change execution behavior. Historical playback reads the same stored events.

## D-15: New universe at `/universe`, existing scenes preserved

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Project solar systems are built at `/universe` using the existing engine shell and reusable systems (orbit math, camera, performance, streaming, info panel). `/` (Aegis foundation) and `/render-engine` stay unchanged until parity and an owner decision. Rendering uses levels of detail and paged graph queries; objects beyond the current level are shown as counts.

## D-16: Connectors are scoped, read-first, and metadata-first

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Local folders are indexed only under user-registered roots, honoring `.gitignore` and secret-pattern exclusions (`.env*`, keys, credentials). Content indexing is opt-in per root. Git is read via `execFile("git", …)`, with no shell. GitHub uses a read-only token held on the user's machine. Write operations go only through the tool runtime with approval (D-08).

## D-17: Memory items carry a provenance class

- **Status:** Accepted (owner, 2026-11-12)
- **Decision:** Each memory has a class: `verified_fact`, `user_instruction`, `approved_decision`, `model_suggestion`, or `assumption`. Only user instructions and observed facts auto-commit (consistent with D-05). Corrections create a new version linked to the old one, with nothing overwritten. All providers retrieve through the same permission-checked context assembler.

## D-18: Keyword search uses SQLite FTS5

- **Status:** Accepted (owner, 2026-11-12)
- **Context:** FTS5 is available in Node's built-in SQLite (verified on Node 22.23.4: `CREATE VIRTUAL TABLE … USING fts5` and `bm25()` work).
- **Decision:** Resource metadata, memory, and indexed content use FTS5 with BM25 ranking, combined with per-model vectors and relation traversal. FTS5 availability is checked at startup on the deployed Node version, and failure is reported rather than silently degraded.

## D-19: Owner answers to the Living Universe plan (§4)

- **Status:** Accepted (owner, 2026-11-12)
- **Decisions:**
  1. Build the new universe at `/universe`. `/` (Aegis foundation) and `/render-engine` stay unchanged until parity and a separate owner decision.
  2. No local roots are indexed until the user registers them in UIOS. Indexing is metadata-only until content indexing is enabled per root.
  3. The GitHub connector uses a fine-grained, read-only personal access token in `apps/dashboard/.env.local` on the user's machine (`UIOS_GITHUB_TOKEN`). It is never committed or logged.
  4. `/api/universe/document` and `/api/universe/body` serve an explicit public allowlist to unauthenticated visitors. Everything else in the catalogue requires a workspace session or API key.
  5. External agents may report their operations (e.g. Claude Code hooks) to UIOS. Those events are stored with `observer: reported:<agent>` and rendered distinctly from UIOS-observed events.
