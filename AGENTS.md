# UIOS engineering guidance

## Role

Act as the implementation and verification agent for UIOS. Treat the product vision and architecture decisions supplied by the project owner as authoritative, but do not invent credentials, certifications, customer data, provider health, or deployment evidence.

## Product boundaries

- UIOS is an AI operating layer/control plane, not a desktop operating system.
- The Fabric of Intelligence/mycelium visual is the signature experience.
- FieldIQ OS is a product inside UIOS.
- Aegis is the built-in security plane, while the AegisAgent repository remains separate.

## Safety and authorization

- Preserve tenant isolation and never trust a user-supplied tenant header.
- Keep production authentication fail-closed; signed workspace sessions and API keys are service-level defenses, not a substitute for managed OIDC/SAML/MFA/SCIM.
- Route model, agent, workflow, and memory boundaries through Aegis checks.
- Keep human-approval workflows expiring, tenant-bound, and tamper-resistant.
- Never claim SOC 2, ISO, GDPR, HIPAA, FedRAMP, or other certification without independent evidence.
- Do not commit `.env.local`, provider keys, state databases, logs, or generated build output.

## Change workflow

1. Inspect `git status` and preserve existing user changes.
2. Prefer small, reversible changes with explicit tenant and role checks.
3. Use `apply_patch` for edits.
4. Run `corepack pnpm --filter @uios/dashboard typecheck` and a production build after application changes.
5. Run `corepack pnpm smoke`, `corepack pnpm provider-smoke`, `corepack pnpm audit --prod`, and `corepack pnpm security-scan` when the change affects runtime, dependencies, or security.
6. Report external launch gates separately from locally verified evidence.

## Repository map

- Frontend and backend control plane: `apps/dashboard/app`
- Shared contracts: `packages/contracts`
- Platform services: `services/*`
- Compliance and launch evidence: `COMPLIANCE.md`, `SECURITY.md`, `DATA_GOVERNANCE.md`, `INCIDENT_RESPONSE.md`, `LAUNCH_CHECKLIST.md`
