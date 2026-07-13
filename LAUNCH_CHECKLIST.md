# UIOS launch evidence checklist

Use this checklist for each deployment. A passing local test is evidence for the code path only; it is not a certification.

| Area | Current evidence | Status before production |
| --- | --- | --- |
| Fabric visual | `apps/dashboard/app/components/mycelium-field.tsx`, high-DPI/reduced-motion canvas, landing smoke assertion | Code complete; browser visual review required on target devices |
| Model/provider path | `scripts/provider-smoke.mjs`, clean Next production build | Code verified; configure real providers and contracts |
| Aegis policy | Aegis checks on model, agent, workflow, memory boundaries; fail-closed production audit | Configure deployed Aegis URL/key and test outage behavior |
| Tenant/auth | Signed workspace cookies, hashed/revocable keys, owner/admin/developer/viewer RBAC, no spoofed tenant header | Integrate managed OIDC/SAML, MFA, SCIM, and policy store |
| Approvals | Owner/admin-issued expiring workflow tokens; pause/tamper/viewer regressions | Define approver roster, segregation of duties, and evidence retention |
| Data rights | Tenant-scoped export and owner deletion with durable-store/cache purge tests | Validate against production DB, backups, logs, and subprocessors |
| Runtime security | CSP, HSTS, frame/content-type/referrer/permissions headers; bounded rate limits | Verify TLS, WAF, dependency/SAST/DAST, and penetration test |
| Operations | `SECURITY.md`, `INCIDENT_RESPONSE.md`, `DATA_GOVERNANCE.md`, `security.txt` | Fill deployment contacts, escalation paths, RTO/RPO, retention, and DPA |
| Billing | Stripe checkout/webhook signature validation and plan metering | Configure live Stripe products, tax/legal terms, and reconciliation |
| Certifications | `COMPLIANCE.md` explicitly avoids unsupported claims | Independent SOC 2/ISO/GDPR/HIPAA or sector assessment as applicable |

The deployment owner must attach the launch-audit JSON, build identifier, smoke output, security scan output, review approvals, and external assessment evidence to the release record.
