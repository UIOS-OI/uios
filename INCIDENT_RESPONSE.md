# UIOS incident response runbook

This runbook is a launch baseline and must be adapted to the operating organization's on-call and legal obligations.

1. **Detect and preserve evidence.** Record request IDs, tenant scope, timestamps, provider, Aegis decisions, and relevant audit events. Do not copy prompt or credential contents into tickets.
2. **Classify.** Determine whether the event is availability, unauthorized access, data exposure, policy bypass, provider compromise, or billing abuse. Assign an incident commander and communications owner.
3. **Contain.** Revoke affected API keys, rotate workspace/provider/Aegis secrets, disable a plugin or route, enable Aegis fail-closed mode, and isolate affected tenants as needed.
4. **Eradicate and recover.** Patch or roll back, verify backups, restore into an isolated environment, rerun smoke/security checks, and monitor for recurrence.
5. **Notify and learn.** Follow contractual and legal notification timelines, document decisions, complete a post-incident review, and track corrective actions to closure.

Production owners must attach contacts, escalation paths, retention rules, provider/subprocessor obligations, and tested recovery time/data-loss objectives before launch.
