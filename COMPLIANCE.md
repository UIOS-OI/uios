# UIOS launch compliance baseline

This is a readiness checklist, not a certification. UIOS must not claim SOC 2, ISO 27001, GDPR compliance, HIPAA eligibility, FedRAMP authorization, or other regulated status until an independent assessment and required contracts are complete.

## Implemented safeguards

- Tenant-scoped API keys stored as SHA-256 hashes; one-time secret display and revocation.
- Role-based API authorization with owner/admin/developer/viewer keys and elevated-action checks.
- Viewer keys are read-only; model, agent, workflow, and memory-write execution requires developer, admin, or owner authorization.
- Workflows with `human_approval` nodes pause by default and require a tenant-bound, expiring token issued by an owner or admin before execution.
- Tenant identity is accepted only from signed workspace cookies or validated API keys; spoofable tenant headers are not trusted.
- Owner-key lifecycle is protected: only owners can mint or revoke owner-level credentials.
- Signed workspace cookies with production secret enforcement.
- Same-origin and Fetch Metadata checks reject cross-origin cookie-authenticated mutations.
- Production requests without a signed workspace or API key resolve to an unauthenticated viewer and are rejected on protected APIs; development fallback is isolated to non-production mode.
- Aegis policy checks on model, agent, workflow, and memory boundaries.
- Prompt-injection and credential-like material blocking at the local policy boundary.
- Durable usage, memory, analytics, and audit-oriented event records.
- Rate limits, usage limits, request IDs, security headers, and provider health checks.
- Bounded in-process rate-limit state with stale-window eviction to avoid unbounded memory growth.
- Bounded in-process analytics and memory caches; durable persistence remains the source of record.
- Dedicated rate buckets protect workspace creation, API-key lifecycle, and approval-token issuance from abuse.
- Browser security headers including CSP, clickjacking protection, referrer controls, and production HSTS.
- Explicit workflow bounds and provider-neutral routing contracts.
- Client-facing provider, agent, and workflow failures are sanitized; internal diagnostics remain server-side for operations review.
- Repository launch artifacts define vulnerability disclosure, incident response, release evidence, retention, deletion/export, provider governance, and high-impact-use review.
- A tracked-source security scan checks for private-key/token patterns, unsafe HTML injection, and required local secret/state ignore rules.
- `LAUNCH_CHECKLIST.md` maps each product, security, privacy, operations, and certification requirement to evidence and an explicit pre-production gate.
- Production security disclosure contact and policy URL are deployment-configured and checked by the launch audit.
- Tenant export endpoint returning workspace data without raw credentials or key hashes.
- Owner-authorized tenant deletion endpoint that purges workspace, credentials, usage, memory, and analytics records and clears in-process caches.

## Launch gates

1. Establish a legal entity, privacy notice, terms, DPA/subprocessor list, retention policy, and incident-response contact.
2. Integrate managed OIDC/SAML SSO, MFA, SCIM, least-privilege roles, and an external authorization policy store.
3. Replace single-instance SQLite with a managed encrypted database and tested backups for multi-region operation.
4. Run threat modeling, dependency scanning, SAST/DAST, penetration testing, key-rotation drills, restore drills, and abuse monitoring.
5. Define data residency, deletion/export, model-provider processing, human approval, and high-impact-use restrictions; validate the deletion flow against the production datastore and backups.
6. Engage qualified auditors and counsel for any SOC 2, ISO 27001, GDPR, HIPAA, or sector-specific certification claim.
7. Pass `UIOS_LAUNCH_AUDIT=production corepack pnpm launch-audit` with deployment secrets present before accepting customer traffic.

The starter is designed to make these controls attachable; it is not itself evidence of certification.
