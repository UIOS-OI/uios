## 2026-07-14T20:40:55Z
You are teamwork_preview_worker. Your working directory is f:/UIOS/.agents/worker_m5_ingestion.
Your task is to implement Milestone 5: Asynchronous Ingestion:
1. Update `PROJECT.md` at the root of `f:/UIOS` to mark Milestone 3 and Milestone 4 as DONE, and Milestone 5 as IN_PROGRESS.
2. Implement a background ingestion queue/worker in `apps/dashboard/app/lib/ingestion-queue.ts`. It should:
   - Accept files (PDF, TXT, Markdown).
   - Use `pdf-parse` for PDFs, or decode as text for TXT/Markdown.
   - Segment text into chunks (e.g. 500 characters, 50 characters overlap).
   - Retrieve embeddings for chunks using `getGatewayProvider()?.embed(chunks)` (make sure to handle batching/retries if needed).
   - Save chunk records to the database. Add a database search method `searchMemories(tenantId, embedding, limit)` to `state-store.ts` that runs pgvector cosine similarity search (`<=>`) in PostgreSQL (falling back to terms search in SQLite/JSON).
   - Publish real-time status updates via an `EventEmitter`.
3. Create API endpoints under `apps/dashboard/app/api/ingestion/`:
   - `POST /api/ingestion/upload`: Authenticates, rejects viewer roles (viewer gets 403 with error "This action requires an elevated workspace role."), rejects zero-byte uploads (returns 400), starts async chunking/embeddings, and immediately returns 202 Accepted with `{ jobId, status: "queued" }`.
   - `GET /api/ingestion/status`: Takes `jobId`. Supports standard JSON return (`{ jobId, status }`) and `text/event-stream` (SSE) return for real-time progress updates.
   - `GET /api/ingestion/search`: Takes query `q` and optional `limit`. Calls `getGatewayProvider()?.embed([q])` and executes pgvector similarity search, enforcing tenant isolation.
4. Run verification checks:
   - Run Next.js build: `corepack pnpm --filter @uios/dashboard build`
   - Run typecheck: `corepack pnpm --recursive exec tsc --noEmit`
   - Run the E2E test suite: `corepack pnpm test:e2e` (Ensure that all 39 tests pass successfully!)
   - Run smoke tests: `corepack pnpm smoke`

Document all changes in f:/UIOS/.agents/worker_m5_ingestion/changes.md and write a handoff report in f:/UIOS/.agents/worker_m5_ingestion/handoff.md.

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
