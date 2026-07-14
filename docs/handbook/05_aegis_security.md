# Layer 5 — Aegis Security Plane

Aegis is the security engine embedded within the UIOS routing and service execution boundaries. No component, model call, memory lookup, or connector sync can bypass Aegis.

---

## 🛡️ Aegis Execution Pipeline

Every request is scanned and validated through progressive security layers:

```text
Incoming Request
   ↓
[Identity Verification]      Verify workspace session token or cryptographically signed API key.
   ↓
[Tenant Isolation]          Ensure X-Tenant-ID matches organization and workspace parameters.
   ↓
[RBAC Authorization]         Validate user/agent role permissions (Owner, Admin, Member, Viewer).
   ↓
[API Key Validation]        Validate caller credentials and token lifetimes.
   ↓
[Rate Limit Enforcer]       Scan Redis limits matching client tier (IP/User bounds).
   ↓
[Content Policy Check]      Inspect inputs for prompt injections, credentials, or PII.
   ↓
[Audit Log Verification]    Record execution evidence before processing.
   ↓
[Safe Execution Sandbox]    Execute within isolated container limits.
```

---

## 🔒 Mandatory Security Checkpoints

Every API controller, service routine, or event receiver must validate:

1. **Who is making the request?**: Authenticate user session credentials or API signatures.
2. **Which organization owns the data?**: Perform strict database isolation check (tenant checks) on every query.
3. **Is the user authorized?**: Confirm that the user's role permits the target action.
4. **Is the action logged?**: Record access, failures, and modifications to the secure audit logs.
5. **Is sensitive data encrypted?**: Encrypt data at rest (database fields, vector nodes) and in transit (SSL/TLS).
6. **Can the action be audited?**: Ensure logs have tamper-resistant hashing.
7. **Can permissions be revoked?**: Enable immediate token or key invalidation via Redis eviction.

---

## ⛔ Rate Limiting & Content Control

- **Rate Limits**: Rate limits are stored in Redis using a token bucket algorithm to support sliding window limits matching plan tiers.
- **Prompt Injection Filters**: Aegis runs pre-routing checks to intercept system override instructions or key harvesting scripts, returning a `403 Forbidden` response.
- **Fail-Closed Strategy**: Any error in database checks, session verification, or logging causes the transaction to abort and fail-closed immediately.
