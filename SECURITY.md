# UIOS security and vulnerability disclosure

UIOS is a security-sensitive platform. This document describes the operating process for a deployment; it is not a certification or warranty.

## Report a vulnerability

Send a private report to `security@uios.dev` with the affected version/commit, reproduction steps, impact, and any minimal proof needed to validate it. Do not include customer data or publish details before a fix is coordinated. If that mailbox is not operational, the deploying organization must replace it before launch.

## Response targets

- Acknowledge within 2 business days.
- Triage severity and affected tenants within 5 business days.
- Contain active exploitation immediately, including credential rotation and Aegis fail-closed mode where appropriate.
- Publish a customer-facing incident summary after remediation and review.

## Release evidence

Every production release should retain the commit, dependency scan, SAST/DAST results, migration/rollback plan, smoke results, reviewer, and approval record. Do not describe a deployment as certified without an independent assessment covering the deployed scope.
