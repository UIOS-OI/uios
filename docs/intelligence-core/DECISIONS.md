# UIOS Intelligence Core — Architecture Decision Log

Each entry records the context, the decision, alternatives considered, and what would cause the decision to be revisited. Status values: **Proposed** (awaiting owner review), **Accepted**, **Superseded**.

---

## D-01: Run the Intelligence Core in-process, behind service packages

- **Status:** Proposed
- **Context:** The current deployment is one Next.js process (SETUP.md: "no second backend process"). Learning consolidation and skill evaluation are background work.
- **Decision:** Implement the core as `services/*` packages with no Next.js imports, called from `/api/intelligence/*` routes. Background jobs start as in-process timers that yield to request work.
- **Alternatives:** A separate Node daemon now. It is cleaner for background work but adds process management on Windows and a second auth boundary before it is needed.
- **Revisit when:** measured chat p95 latency degrades while consolidation runs, or multi-instance deployment is required.

## D-02: Native Ollama API adapter instead of the OpenAI-compatible endpoint

- **Status:** Proposed
- **Context:** Ollama's `/v1` OpenAI-compatible endpoint would work with the existing `gateway-provider`. It does not expose per-request `num_ctx`, `keep_alive`, or `think`, and it gives less model metadata.
- **Decision:** Add `services/provider-ollama` using `/api/chat`, `/api/embed`, `/api/tags`, and `/api/show`. Set `num_ctx` from `UIOS_OLLAMA_NUM_CTX` (8192). Return reasoning text separately from answer content. Default `think: false` for chat and extraction.
- **Alternatives:** Reuse `gateway-provider` against `/v1`. This means less code, but the context window would depend on server or Modelfile defaults.
- **Revisit when:** Ollama's OpenAI-compatible API supports these options per request.

## D-03: New intelligence store module with its own migrations

- **Status:** Proposed
- **Context:** `apps/dashboard/app/lib/state-store.ts` mixes three backends in 613 lines, with schema created inline.
- **Decision:** New Intelligence Core tables live in `services/intelligence-store` with numbered migrations and a narrow repository interface. Every query takes `tenantId` as a required parameter. The existing state store is left in place for workspaces, keys, usage, and billing.
- **Revisit when:** the platform moves to managed Postgres. The repository interface is the seam for that move.

## D-04: Embeddings are stored with their model and dimension, and are never fabricated

- **Status:** Proposed
- **Context:** Current ingestion writes constant `0.1` vectors when no embedder exists. The Postgres column is fixed at 1536 dimensions; `nomic-embed-text` produces 768.
- **Decision:** Store vectors in `memory_vectors(memory_id, model, dims, vector)`. Search only within one model's vectors. A record without a vector is `unembedded` and is found lexically. Apply `nomic-embed-text` task prefixes (`search_document:` / `search_query:`).
- **Revisit when:** a single platform-wide embedding model is mandated.

## D-05: Learning means governed, evidence-backed records, not model weight updates

- **Status:** Proposed
- **Decision:** Observations → candidate learnings (with evidence links, confidence, extractor model and prompt version) → review policy → committed memory, procedure, or skill draft. Every transition is written to a hash-chained append-only audit ledger. Model-inferred items require approval by default.
- **Alternatives:** LoRA or fine-tuning on the local machine. This is out of scope: it is hard to audit, hard to revert, and hard to run on this hardware.

## D-06: Persistent identity is approved, versioned configuration

- **Status:** Proposed
- **Decision:** A global base charter (versioned in the repository) plus a per-tenant overlay stored in the intelligence store. Each version is hash-chained and activated only with an owner/admin approval token. The identity is injected as the first context segment. The product describes it as configuration, not sentience.

## D-07: One approval primitive for identity, skills, tools, and learnings

- **Status:** Proposed
- **Context:** `signWorkflowApproval` already provides tenant-bound, expiring HMAC tokens.
- **Decision:** Generalize it to `signApproval({ purpose, tenantId, subjectId, subjectHash, ttl })` with a key derived per purpose (HKDF from `UIOS_WORKSPACE_SECRET`). Binding to `subjectHash` means an approved skill or identity version cannot be swapped after approval. Single use is enforced by recording consumed token IDs in the ledger.

## D-08: Tools are capability-scoped, risk-tiered, and read-only in v1

- **Status:** Proposed
- **Decision:** Tool registry with JSON-Schema I/O, `riskTier`, required `UiosPermission`s, timeout, and output caps. Write, egress, and privileged tiers require approval or an expiring grant. Aegis checks tool input and output. v1 ships no shell or filesystem-write tools, and UIOS claims no OS-level sandbox on Windows.

## D-09: Routing policy is explicit and local-first in development

- **Status:** Proposed
- **Decision:** `UIOS_ROUTING_POLICY = local-only | local-first | cloud-allowed`. Development defaults to `local-first`. Production requires an explicit per-tenant setting before any cloud fallback. Failover happens on request error, not only on the health precheck.

## D-10: The Universe receives aggregates only

- **Status:** Proposed
- **Decision:** `/api/intelligence/overview` exposes counts, states, versions, and health. It never exposes memory content, prompts, or tool payloads. Detail views are DOM overlays that call authenticated, tenant-scoped endpoints. This extends the existing `universe-events.ts` rule that activity is payload-free.
