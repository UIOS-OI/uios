# UIOS

UIOS is the platform repository: the Universal Intelligence Operating System for orchestrating models, agents, tools, memory, workflows and enterprise integrations through one interface.

UIOS is not a desktop operating system like Windows. It is an enterprise AI operating layer and control plane—closer to AWS or Kubernetes—through which applications coordinate intelligence, automation and governance.

UIOS is the umbrella platform. Products built on or inside UIOS keep their own identity, roadmap and boundaries.

## Built-in security

[AegisAgent](F:/Agent-Secure-Gateway/Agent-Secure-Gateway/README.md) is the stock security system for UIOS. UIOS services should use AegisAgent by default for authentication boundaries, policy enforcement, prompt-injection defense, data-loss prevention, agent action approval, deception detection and audit receipts.

AegisAgent remains a separate project so it can also protect non-UIOS applications, but UIOS treats it as a first-class platform service rather than an optional add-on.

## First platform primitive

The initial infrastructure slice is the provider-neutral model contract in `packages/contracts`, the registry-based router in `services/router`, and the OpenAI-compatible streaming implementation in `services/gateway-provider`. Provider plugins implement `ModelProvider`; the core router never imports a vendor SDK.

The platform services now also include `services/agent-engine` for bounded tool loops, `services/memory` for tenant-scoped retrieval, and `services/analytics` for execution events and summaries.

## Local configuration

Copy `apps/dashboard/.env.example` to `apps/dashboard/.env.local` and configure the UIOS gateway model/key. Set `UIOS_AEGIS_REQUIRED=true` in production when the deployed Aegis service is reachable. Stripe checkout is enabled by setting `STRIPE_SECRET_KEY` and `STRIPE_PRICE_SCALE`.

For local or single-instance persistence, set `UIOS_STATE_DB` to a writable persistent-volume path. UIOS uses SQLite WAL transactions when configured and falls back to JSON through `UIOS_STATE_FILE`; multi-region production can replace the same adapter with Postgres/Redis.

Server integrations can create a workspace-scoped `uios_live_...` key through `POST /api/keys` and send it as `Authorization: Bearer ...`. UIOS stores only the key hash and returns the raw key once.

The machine-readable control-plane contract is available at `GET /api/openapi` after the dashboard is running. It describes the chat, agent, workflow, memory, usage, key, plugin, provider-health and billing surfaces.

## Production runbook

1. Install with `corepack pnpm install --frozen-lockfile`.
2. Set the gateway, Aegis, persistence, routing and Stripe variables from [`apps/dashboard/.env.example`](apps/dashboard/.env.example).
3. Use a persistent volume for `UIOS_STATE_DB` on a single instance, or replace the state-store adapter with Postgres/Redis before multi-region deployment.
4. Configure the Stripe endpoint at `/api/billing/webhook` and set `STRIPE_WEBHOOK_SECRET`; checkout metadata maps subscriptions back to the UIOS workspace.
5. Run `corepack pnpm build`, start with `corepack pnpm start`, then run `corepack pnpm smoke` against the deployed URL using `UIOS_BASE_URL`.
6. Before accepting customer data, complete [`SECURITY.md`](SECURITY.md), [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md), and [`DATA_GOVERNANCE.md`](DATA_GOVERNANCE.md) with the deploying organization's contacts, retention, subprocessors, and tested recovery evidence.
7. Run `UIOS_LAUNCH_AUDIT=production corepack pnpm launch-audit` in the deployment environment; treat any failure as a launch blocker.
8. Run `corepack pnpm security-scan` in CI and review every finding before release.

For local CI-style verification, run `corepack pnpm provider-smoke` after a build. It starts a local OpenAI-compatible gateway and verifies that the production dashboard streams provider output through UIOS.

The default `UIOS_ROUTING_STRATEGY=explicit` keeps first-token latency low. Set `fastest` or `balanced` when multiple gateways are configured and health-aware selection is preferred. `UIOS_FALLBACK_GATEWAY_*` enables a second OpenAI-compatible provider without changing application code.

## Platform boundaries

The dashboard is the reference control plane, not the complete enterprise identity layer. Production deployments should put SSO/OIDC and a managed database in front of the tenant APIs, while retaining the signed workspace cookie and API-key revocation checks as service-level defenses. This keeps the local starter useful without presenting development persistence as a multi-region guarantee.

## Products

- [FieldIQ OS](products/fieldiq-os/README.md) — the enterprise AI orchestration product built on UIOS.

## Repository boundary

This repository is independent from AegisAgent. AegisAgent remains a separate security gateway project. UIOS and FieldIQ work will be defined and implemented here.
