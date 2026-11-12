# UIOS Living Universe, Unified Memory, Live Trace, and Independent Intelligence: Audit and Unified Plan

Status: **proposal for owner review** (2026-11-12). Builds on commit `ee1371b` (Intelligence Core Phase 0 complete).
Supersedes the phase ordering of `AUDIT_AND_ROADMAP.md` §6 (Phases 1–7). Those phases are folded into the stages below.
Decisions: [`DECISIONS.md`](DECISIONS.md) D-11 to D-18.

---

## 1. Audit: what exists today

All findings come from reading the code at `ee1371b` and running it in a Linux container. Nothing below was verified on the owner's Windows machine.

### 1.1 Rendering engine and the "solar system"

| Component | Location | Mounted? | What it does |
|---|---|---|---|
| `SceneManager` (Canvas, bloom, adaptive DPR, `PerformanceManager`, `RenderLoop`, `CameraManager`) | `packages/render-engine/src/engine` | **Yes** | Shared engine shell. Solid foundation to keep |
| `FoundationUniverse` + `FoundationExperience` | `render-engine/systems/FoundationUniverse.tsx`, `app/components/foundation-experience.tsx` | **Yes: homepage `/`** | "Aegis Unified" planet and shield. Animates **real** Aegis verdicts from `/api/foundation` (polled every 1–4 s) |
| `CosmosSandbox` (+ `cosmos-sim.ts`) | `render-engine/systems` | **Yes: `/render-engine`** | Physics sandbox (suns, black holes). No data binding |
| `GalaxyScene` (7 fixed systems: Memory, Aegis, Router, …), `SolarSystem`, `GalaxyManager` (`/api/universe/topology`), `UniverseManager`, `RegionSystem`, `StreamingManager`, `IntelligenceCurrentSystem`, `CrystalCoreSystem`, `CelestialInfoPanel`, `UniverseActivityManager` | `render-engine` | **No: not mounted on any route** | Earlier universe stages (M8–M18 in `PROJECT.md`). The orbit math, info panel, streaming and activity weather are reusable |
| `UniverseExperience` | `app/components/universe-experience.tsx` | **No** | `ARCHITECTURE.md` still calls it the "active homepage composition". It is not; the doc is stale |

**Integrity issues in the existing solar-system data path** (`app/lib/universe-documents.ts`, `buildGalaxyDescriptors`):
- `addedAt: new Date().toISOString()` is stamped on every document on every request, so the UI would claim each document was just added.
- Body IDs are array indices (`${zone}-doc-${i}`). Adding one document renumbers every later body, so identities are not persistent.
- Systems are hard-coded product zones (Aegis, Router, …), not discovered projects.
- `/api/universe/topology` returns the full text of every memory record (unbounded), and `providers` comes from the plugin registry, which is always empty.
- `/api/universe/document` and `/api/universe/body` serve allowlisted repository docs to **unauthenticated** visitors. That now includes the security audit in `docs/intelligence-core/`. This was intended for public product docs, but it should be an explicit choice.

### 1.2 AI orchestration, models, tools, memory, workspaces

| Area | State |
|---|---|
| Model access | One OpenAI-compatible gateway provider plus an optional fallback; env-only config. **No Ollama provider.** Tools are never sent to the model and tool calls are never parsed (agent tool loop cannot actually fire) |
| Agents | `AgentEngine` bounded loop; `/api/agent/run` exposes **no tools** |
| Tool execution | **None.** No file, Git, search, test, or build tools exist |
| Memory | Flat `memory_records` (Phase 0 made embeddings honest). Keyword search only on SQLite. No tiers, no conversation store, no provenance classes |
| Conversations | **Not stored.** `/api/chat` streams and forgets |
| Workspaces / tenancy | Signed workspace sessions, API keys, RBAC, rate limits, usage. This is the security boundary everything new must sit inside |
| Projects / resources | **No concept of a project or a resource.** No file, Git, or GitHub discovery. The only filesystem reads are the allowlisted `docs/` catalogue |
| Prompt UI | `UiosCommandCenter` (playground + agent lab) exists but is **not mounted on any page** |

### 1.3 Events and telemetry

| Source | Observed by server? | Persisted? | Fields |
|---|---|---|---|
| `analytics.track(...)` in chat, agent, workflow routes | Yes | Yes (per tenant, retention-bounded) | Event name and a few properties. No correlation ID, resource ID, agent/model attribution (except model on chat), or duration (except chat latency) |
| `projectFoundationTraffic` | Yes (Aegis verdicts only) | **No** (in memory, last 48 per tenant, only while "connected") | kind, verdict, threat class |
| `uios:activity` browser events (`app/lib/universe-events.ts`) | **No** | sessionStorage only | Emitted by UI components around their own `fetch` calls with **hard-coded** routes (e.g. `["core","router","workspace"]`). These describe the path the UI assumes, not an observed one. They must not feed Live Trace (D-13) |

**Bottom line:** the engine shell, the security boundary, the Aegis foundation scene and the honest-empty-state discipline are solid. Resource discovery, project identity, conversation storage, tool execution, local models, and server-side tracing do not exist yet.

---

## 2. Target architecture

```text
 Browser (DOM-first, 3D optional)
  ├─ Universal prompt bar · Resource explorer/search · Activity feed · Timeline   ← accessible, works without WebGL
  └─ /universe  (render-engine)  Intelligence Core star · project suns · planets/moons/satellites
                 Live Trace layer (toggle = subscribe/render only)                 ← reads the same APIs
                         ▲ REST (paged graph, search)   ▲ SSE (trace stream)
 ────────────────────────┴──────────────────────────────┴──────────────────────────────────────────
 UIOS server (Next.js route handlers; tenant from resolveAuth only; Aegis on every boundary)
  ├─ Intelligence Core: identity · planner/task state · agents · context assembler
  ├─ Model gateway: provider-ollama (local, default) · gateway-provider (cloud, consent-gated)
  ├─ Tool runtime: registry · risk tiers · approvals · fs/git/search/test tools
  ├─ Knowledge: resource graph · memory (provenance classes) · FTS5 + vectors + relations
  ├─ Connectors: uios-internal · local-folders · local-git · github · (reported: external agents)
  └─ Trace bus: every instrumented operation → trace_events (append-only) → SSE
 ──────────────────────────────────────────────────────────────────────────────────────────────────
 SQLite (node:sqlite, WAL, FTS5 verified available) — numbered migrations; Postgres adapter later
```

### 2.1 Canonical resource identity (D-12)

Every universe object is a row in `resources`, keyed by a **stable URN derived from the source**, never from array position or render order:

| Kind | URN example | Source of truth |
|---|---|---|
| Project | `uios:project:<uuid>` | UIOS (proposed by discovery, confirmed by the user) |
| GitHub repo / branch / PR / issue / commit | `github:UIOS-OI/uios`, `…#branch:main`, `…#pr:1`, `…#commit:<sha>` | GitHub API |
| Local folder / file | `fs:<rootId>:<posix-relative-path>` | Registered root on the user's machine |
| Local Git repo | `git:<rootId>:<path>`, linked to `github:*` via remote URL | `git` CLI (`execFile`, no shell) |
| Conversation / message | `uios:conversation:<uuid>` | UIOS conversation store |
| Memory / decision | `uios:memory:<uuid>` | UIOS memory |
| Model / agent / tool | `model:ollama:qwen3.5:2b`, `uios:agent:<id>`, `uios:tool:<id>` | Router / Ollama `/api/tags` / tool registry |

Fields: `kind`, `label`, `connector`, `locator` (non-secret), `project_id`, `first_seen_at`, `last_seen_at`, `source_created_at` / `source_modified_at` (null when the source gives none, never invented), `status` (`active | archived | deleted`), `content_hash`, `sensitivity`.
`relations(from, to, type, evidence: declared | observed | inferred, confidence, source, created_at)`. Discovered facts and inferred relationships are stored and displayed differently.
Projects support `merge` (alias table, redirects old URNs), `split`, `rename`, and `archive`. Each is an audited, approval-gated operation.

### 2.2 Trace events (D-13, D-14)

`trace_events`: `id`, `ts_start`, `ts_end`, `duration_ms`, `trace_id` (correlation), `parent_id`, `tenant_id`, `project_id`, `agent_id`, `model_id`, `operation` (`fs.read | fs.write | fs.create | fs.delete | git.* | github.* | memory.read | memory.write | conversation.read | tool.call | api.call | model.request | test.run | build.run | deploy.*`), `resource_urn`, `destination` (`local | remote:<host>`), `status` (`ok | error | denied | cancelled`), `result_meta` (sizes, counts, exit codes, hashes; **never** content, secrets, or tokens), `observer` (`uios` = observed in-process; `reported:<agent>` = self-reported by an external agent).
- Recording happens in the server pipeline regardless of UI. The Live Trace toggle only subscribes and renders, so execution behavior cannot change when it is toggled (D-14).
- Each connector and operation family declares its telemetry coverage. The UI shows "not instrumented" or "telemetry unavailable" explicitly instead of showing nothing.
- Colour convention as specified: blue read, green create, amber modify, purple tool, red failure or denied.

### 2.3 Memory and knowledge provenance (extends D-05)

Every memory item has a `class`: `verified_fact` (backed by an observed resource or tool result), `user_instruction` (stated by the user), `approved_decision`, `model_suggestion`, or `assumption` (unresolved). Only `user_instruction` and observations auto-commit. Model output stays `model_suggestion` until approved. Records carry the source URN, actor, model, timestamp, confidence, version, and supersedes-link (for correction and conflict resolution).
Retrieval combines FTS5 (BM25), vectors (per-model tables, D-04), relation traversal from the resource graph, and recency. Every provider, local or cloud, receives the same assembled context through the same permission check. UIOS never claims access to an external model's internal memory.

### 2.4 Model routing and cloud consent (D-11, supersedes D-09)

Local Ollama is the default and only automatic route. If local execution fails, the request **fails visibly**. A cloud attempt requires explicit consent (per request, or a time-boxed per-workspace grant). Before sending, the UI discloses the provider, the model, and the exact context segments (with resource URNs and sizes) that will leave the machine. Each cloud call is a trace event with `destination: remote:<host>`.

### 2.5 Rendering at scale (D-15)

- New route `/universe`. The homepage (`/`, Aegis foundation) and `/render-engine` stay untouched until the new universe reaches parity and you approve a switch.
- Levels of detail: universe view shows the Intelligence Core plus project suns (aggregated counts); system view shows planets (repos/apps) and satellites (tools/agents/models) as instanced meshes; planet view shows moons (modules/folders); close view shows files as instanced points. Objects beyond the current level are **counts, not meshes**. The client pages the graph by `(project, parent, level)`. The server never ships millions of nodes.
- Layout positions are deterministic functions of URN hashes plus hierarchy, so an object keeps its place across sessions. The existing `SolarSystem` orbit math, `CameraManager`, `PerformanceManager`, `StreamingManager`, and `CelestialInfoPanel` are reused.
- Reduced-motion users get static layouts, and every 3D interaction has a DOM equivalent (explorer, search, feed, timeline).

---

## 3. Unified staged plan

Each stage ships real functionality with unit and E2E tests and a written list of limitations. After each stage the full AGENTS.md check set runs and existing routes must keep passing smoke. Stages map to the brief's Phases A–F and the earlier Intelligence Core phases as shown.

| Stage | Scope | Maps to | Acceptance criteria advanced |
|---|---|---|---|
| **1. Local intelligence + trace backbone** | `services/provider-ollama` (native API, `num_ctx` 8192, `think` off by default, model discovery via `/api/tags`); capability routing; consent-gated cloud fallback with disclosure (D-11); gateway tool-call support; `trace_events` store + trace bus + SSE stream; instrument model requests, memory read/write, ingestion; retire the hard-coded browser activity routes as a trace source; `scripts/ollama-smoke.mjs` for your machine | IC Phase 1, Phase D (backbone) | #3 local operation, groundwork for #7 |
| **2. Resource discovery + project identity** | `services/intelligence-store` migrations; `resources`, `relations`, `projects`, aliases; connectors: uios-internal (models, agents, tools, memories), local-folders (registered roots only, metadata first, `.gitignore` + secret-pattern exclusions), local-git (branches, commits, remotes), github (read-only token: repos, branches, PRs, issues, commits); project proposals from evidence (Git remotes, package manifests, folder roots) → user confirmation; merge/split/rename/archive; DOM resource explorer + search (FTS5 over metadata); every discovery operation traced | Phase A | foundation for #1 |
| **3. Unified memory, knowledge, identity** | Conversation store; memory tiers with provenance classes; opt-in content indexing per root (chunk + `nomic-embed-text` via Ollama, secrets excluded); hybrid retrieval; context assembler (8192 budget); approved-memory API usable by every provider; persistent identity (global charter + approved workspace overlay, D-06) | IC Phases 2–3, Phase E | #1 project Q&A, #2 cross-session recall, #5 cross-provider sharing, #6 survives restart |
| **4. Living Universe v1** | `/universe`: Intelligence Core star, project solar systems from the resource graph, LOD + paging, deterministic layout, contextual panels (source, project, dates, branch, related conversations, dependencies, activity, actions), navigation conversation → file → repo → project, search/filter/zoom/project picker | Phases B + C | visual surface for #1–#7 |
| **5. Tool runtime + Live Trace** | Tool registry with risk tiers and approvals (D-08); read tools (fs read, git log/diff/status, resource search, memory search); gated write tools (fs write/create in registered roots, git commit on a branch) with approval; test runner tool (allowlisted scripts only); Live Trace layer: animated streams from the acting agent to resource URNs, click-through to the event, activity feed with filters, live / paused / historical playback | IC Phase 4, Phase D | #4 authorized tool operation, #7 real activity in Live Trace |
| **6. Universal prompt + agents** | Prompt bar available on every page; planner with persisted task state; specialized agents sharing the knowledge layer; approval before consequential operations; cancellation; execution history; cloud fallback consent prompt in the flow | §5 of brief, IC reasoning | end-to-end demonstration of #1–#8 |
| **7. Learning, skills, timeline** | Observation → candidate → approval pipeline (D-05); skills with evals and approval; timeline across resources/commits/conversations/decisions/trace; historical snapshots and replay from stored timestamps; retention for archived/deleted references | IC Phases 5–6, Phase F | #8 no fabricated knowledge (audited) |

**Acceptance criterion #8** (no invented knowledge, fake memory, or claimed training) is enforced in every stage. Each stage carries tests asserting that empty sources produce explicit empty or unavailable states, not placeholder data.

### 3.1 What can and cannot be verified, and where

| Capability | Verifiable in the cloud container | Needs your Windows machine |
|---|---|---|
| Resource graph, local-git connector | Yes, against this real `uios` checkout | Your other projects (BizBetter, NextDoorScore, …) |
| GitHub connector | Only if a read-only GitHub token is supplied to this environment | Yes, with your token |
| Ollama chat/embeddings, `qwen3.5:2b` quality, latency | **No** (unreachable from here); mock-tested only | **Yes**, required for acceptance #3 |
| Local folders on `C:`/`J:` | No | Yes |
| Rendering quality / FPS on Iris Xe | Headless screenshots only | Yes |

Reports will label every result as *observed (where)* or *mock-tested*.

### 3.2 Hard limits to state up front

- **External chat histories** (Claude, ChatGPT, Gemini) are not readable unless you export them or the provider offers an API. UIOS indexes its own conversations, plus any exports you import.
- **External agents' operations** (e.g. Claude Code editing files on your machine) are not observable by UIOS unless that agent reports them. Claude Code hooks can POST tool events to a UIOS endpoint. Those would appear as `observer: reported:<agent>`, visually distinct from UIOS-observed events. This is optional and proposed for Stage 5.
- **"Applications and development environments"** are discoverable only through concrete evidence (manifests, workspace files, running local services you register). UIOS will not scan arbitrary system locations.
- **Scale:** FTS5 and the resource graph should handle millions of rows on SQLite. Brute-force vector search is practical to roughly 10⁵ chunks. Beyond that needs an ANN index (`sqlite-vec` or pgvector), which is a later decision. These numbers will be measured, not assumed.
- **No model training.** Knowledge accumulates in the store; model weights never change unless a separate, explicit fine-tuning project is approved.

---

## 4. Decisions needed from the owner

1. **Where the new universe lives.** Proposed: build at `/universe`; keep `/` (Aegis foundation) as is until parity, then you decide whether `/` switches. Also confirm what "the existing UIOS solar system" refers to for you: the live Aegis scene on `/`, or the unmounted `GalaxyScene` (7 product systems).
2. **First local roots to index** (e.g. a projects folder on `C:` or `J:`). Proposed default: none until you register them in the UI; metadata only until you enable content indexing per root.
3. **GitHub access for the connector.** Proposed: a fine-grained, read-only personal access token (metadata, contents, pull requests, issues) stored in `.env.local` on your machine. Not committed, never logged.
4. **Public docs endpoint.** Should `/api/universe/document` keep serving `docs/` to unauthenticated visitors? Proposed: restrict to an explicit public list and require a session for everything else.
5. **External agent reporting** (Claude Code hooks → UIOS trace) in Stage 5: yes or no.

## 5. Proposed next step

Start **Stage 1**. It doesn't depend on any of the decisions above, and it delivers the two foundations every later stage needs: local model execution with consent-gated cloud fallback, and a real, server-observed trace backbone.
