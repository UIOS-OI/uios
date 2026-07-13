# UIOS project source of truth

## Product

UIOS — Universal Intelligence Operating System

Theme: **The Fabric of Intelligence**

UIOS is a vendor-neutral AI operating layer and control plane. It coordinates models, agents, knowledge, tools, workflows, governance, observability, and Aegis security through one stable contract. It is not a desktop operating system.

## Current status

- **Blueprint:** complete
- **Architecture:** foundation implemented
- **Prototype:** running locally and on `UIOS-OI/uios`
- **Alpha:** next milestone
- **Beta/Public launch:** blocked on external identity, infrastructure, legal, testing, and certification gates

## Shipped foundation

- Fabric of Intelligence mycelium visualization with high-DPI rendering, pointer parallax, depth projection, provider nodes, and reduced-motion support.
- Dedicated `/platform`, `/security`, `/products`, `/pricing`, and `/connect` pages.
- Workspace session creation/logout, signed expiring cookies, API keys, RBAC, tenant isolation, export/deletion, usage metering, and rate limits.
- Aegis checks across model, agent, workflow, and memory boundaries with explicit fail-closed external decisions.
- Human approval tokens for sensitive workflows.
- SQLite/JSON local persistence with configurable audit retention.
- Production readiness probe, OpenAPI contract, launch audit, dependency audit, security scan, and smoke/provider verification.

## Current sprint: Sprint 002 product landing experience

Objective: turn the cinematic experience into a clear, credible early-access funnel without weakening the platform safety boundary.

Definition of done:

- The primary CTA opens `/connect` and explains exactly what happens next.
- Platform, Aegis, products, pricing, and connect topics have dedicated pages.
- The local setup is reproducible from a fresh checkout.
- Build, typecheck, full smoke, provider smoke, dependency audit, and security scan pass.
- No unsupported certification or provider claims are made.

Sprint 002 decisions:

- The R3F fabric remains a fixed, always-live background layer; the product surface fades in after the scene reaches its final phase instead of replacing the canvas.
- Product content is a client-only presentation layer. The waitlist stores a versioned, local-only record in `localStorage` and keeps the form boundary shaped for a future API, so no backend or tenant data path is introduced in this sprint.
- Capability cards use CSS perspective transforms driven by pointer events rather than per-frame React state, keeping hover motion cheap and preserving the 60 FPS target.

## Next priority

Integrate a managed enterprise identity provider and managed durable database before customer traffic. Keep the local signed workspace/API-key boundary as a development and service-level defense, not as a claim of enterprise SSO/MFA/SCIM compliance.

## Working loop

1. Read `AGENTS.md`, this file, and `README.md`.
2. Inspect the current repository and preserve user changes.
3. Select one highest-priority task from this document.
4. Implement the smallest complete change.
5. Update this file when status or architecture changes.
6. Run the relevant verification commands.
7. Commit with a descriptive message and push only when authorized.
