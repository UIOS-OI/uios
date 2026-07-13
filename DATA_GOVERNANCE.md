# UIOS data governance baseline

This is an implementation checklist, not legal advice. A counsel-reviewed privacy notice and data-processing agreement must define the final terms.

- **Tenant boundary:** workspace cookies and API keys resolve one tenant; persistence queries are tenant-scoped.
- **Sensitive inputs:** Aegis blocks common credential material and prompt-injection patterns before model/memory boundaries. Do not send secrets or regulated data without an approved deployment design.
- **Retention:** the durable store prunes analytics and usage events using `UIOS_AUDIT_RETENTION_DAYS` (bounded to 1–3,650 days; default 365). Define tenant- and record-specific retention with counsel before production. The owner-only workspace deletion endpoint purges workspace, keys, usage, memory, and analytics data from the configured store and process caches.
- **Rights:** export is available at `/api/workspace/export`; deletion is available with `DELETE /api/workspace`. Validate both against the production database, backups, logs, and subprocessors.
- **Providers:** document model providers, regions, subprocessors, training/retention settings, transfer mechanisms, and customer opt-out controls.
- **High-impact use:** require human review and sector-specific authorization for employment, credit, housing, healthcare, education, safety, or other high-impact decisions.
