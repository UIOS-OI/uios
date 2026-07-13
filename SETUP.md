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

Open `apps/dashboard/.env.local` and set:

```dotenv
UIOS_AI_GATEWAY_KEY=your-provider-key
UIOS_DEFAULT_MODEL=your-model-id
```

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

For a provider-independent production-style check:

```powershell
corepack pnpm provider-smoke
```

## Production environment

Production requires a unique `UIOS_WORKSPACE_SECRET`, real gateway credentials/model, `UIOS_STATE_DB` on managed durable storage, and deployed Aegis settings with `UIOS_AEGIS_REQUIRED=true` and `UIOS_AEGIS_FAIL_CLOSED=true`. Run `corepack pnpm launch-audit` before accepting traffic. See `COMPLIANCE.md`, `DATA_GOVERNANCE.md`, and `LAUNCH_CHECKLIST.md` for the external identity, backup, legal, testing, and certification gates.
