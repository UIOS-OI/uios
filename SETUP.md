# UIOS local setup

UIOS uses one Next.js application for the reference frontend and backend control plane:

- Frontend: `apps/dashboard/app` (React/Next pages and the Fabric of Intelligence UI)
- Backend: `apps/dashboard/app/api` (authenticated route handlers)
- Services: `services/*` and `packages/contracts` (routing, gateway, memory, analytics, workflows, and shared contracts)
- Local persistence: SQLite at `apps/dashboard/.uios-data/uios.sqlite` when `UIOS_STATE_DB` is configured

There is no second backend process required for local development.

## Windows quick start

From the repository root:

```powershell
corepack pnpm install
corepack pnpm setup:local
```

`setup:local` writes `apps/dashboard/.env.local` with local inference enabled by default:

```dotenv
UIOS_OLLAMA_URL=http://127.0.0.1:11434
UIOS_OLLAMA_CHAT_MODEL=qwen3.5:2b
UIOS_OLLAMA_EMBED_MODEL=nomic-embed-text
UIOS_OLLAMA_NUM_CTX=8192
UIOS_ROUTING_POLICY=consent
```

Make sure both models are pulled (`ollama pull qwen3.5:2b`, `ollama pull nomic-embed-text`). Ollama manages its own model directory, for example via `OLLAMA_MODELS` on another drive; UIOS only talks to the Ollama HTTP API. Then verify local inference on this machine:

```powershell
corepack pnpm ollama-smoke
```

The smoke test reports only what it observes (Ollama version, installed models, round-trip latency, tokens per second, tool-call behaviour, embedding dimension) and writes a JSON report to `apps/dashboard/.uios-data/`. To also check the UIOS request path, set `UIOS_BASE_URL` and `UIOS_API_KEY` (a key from `POST /api/keys`) before running it.

Cloud gateways are optional. With `UIOS_ROUTING_POLICY=consent`, UIOS never sends data to a cloud model automatically: if local inference fails, `/api/chat` returns HTTP 409 describing the provider, host, model, and message sizes, and only a repeat of the same request with the returned `cloudConsent` token goes to the cloud. `local-only` disables cloud entirely; `cloud-allowed` is for operators who pre-authorize their configured gateways.

Then start the frontend and backend together:

```powershell
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create the secure workspace session from the session bar, then use the prompt playground. The top navigation routes to `/platform`, `/security`, `/products`, `/pricing`, and `/connect`.

## Verify the wiring

In another terminal:

```powershell
corepack pnpm typecheck
corepack pnpm build
corepack pnpm smoke
```

Run the service unit tests (no Ollama needed; they use mock servers):

```powershell
corepack pnpm test:unit
```

For a provider-independent production-style check:

```powershell
corepack pnpm provider-smoke
```

## Production environment

Production requires a unique `UIOS_WORKSPACE_SECRET`, real gateway credentials/model, `UIOS_STATE_DB` on managed durable storage, and deployed Aegis settings with `UIOS_AEGIS_REQUIRED=true` and `UIOS_AEGIS_FAIL_CLOSED=true`. Run `corepack pnpm launch-audit` before accepting traffic. See `COMPLIANCE.md`, `DATA_GOVERNANCE.md`, and `LAUNCH_CHECKLIST.md` for the external identity, backup, legal, testing, and certification gates.
