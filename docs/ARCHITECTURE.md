# UIOS architecture

## Runtime shape

The reference deployment is one Next.js application:

```text
Browser / SDK
    ↓
Next.js pages + authenticated /api routes
    ↓
UIOS runtime boundary
    ├─ workspace auth, RBAC, rate limits, usage
    ├─ Aegis policy boundary
    ├─ provider-neutral router and gateway
    ├─ agent, workflow, memory, analytics services
    └─ SQLite/JSON adapter for local development
```

The service packages under `services/` and shared contracts under `packages/` are replaceable modules. Production deployments must replace local persistence with managed encrypted storage and put managed identity in front of tenant APIs.

## Request lifecycle

1. Resolve a signed workspace session or API key.
2. Enforce tenant and role authorization.
3. Apply same-origin, rate, usage, and input bounds.
4. Run Aegis policy checks.
5. Route to a healthy provider or fail closed.
6. Record usage/audit evidence and return a sanitized response.

## Visual architecture

`MyceliumField` is currently a code-native high-DPI canvas with deterministic branches, depth-aware projection, pointer parallax, provider nodes, central UIOS core, and reduced-motion handling. A future WebGL/R3F renderer may replace it only after matching accessibility, performance, and fallback behavior.
