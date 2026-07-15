# Changes Log - Milestone 4: SSO / Aegis Authentication Middleware

## Summary of Changes

Implemented Edge-compatible Next.js authentication middleware to intercept platform APIs, validating session cookies and API keys, and securely forwarding tenant identification headers downstream.

## Created Files

### 1. `apps/dashboard/middleware.ts`
- Implements standard Web Crypto-based HMAC SHA-256 validation for the `uios_workspace` session cookie.
- Detects the `Authorization: Bearer <key>` header and makes a secure internal sub-request (`fetch`) to `/api/auth/verify-key` to resolve API keys.
- Signs downstream headers `x-uios-tenant-id` and `x-uios-role` using a cryptographic signature header `x-uios-signature` containing an HMAC over the tenant/role payload.
- Enforces fail-closed behavior (returns 401 Unauthorized) if verification fails or throws an error.
- Matches paths:
  - `/api/chat/:path*`
  - `/api/memory/:path*`
  - `/api/keys/:path*`
  - `/api/usage/:path*`
  - `/api/workflows/:path*`
  - `/api/analytics/:path*`
  - `/api/plugins/:path*`

### 2. `apps/dashboard/app/api/auth/verify-key/route.ts`
- Exposes an internal POST route on Node.js runtime.
- Accepts `{ token }` in the request body, resolves the bearer token using `resolveApiKeyAuth` in `state-store.ts`, and returns `{ tenantId, role }`.

## Modified Files

### 1. `apps/dashboard/app/lib/runtime.ts`
- Refactored `resolveAuth` to inspect and verify incoming headers `x-uios-tenant-id`, `x-uios-role`, and the signature `x-uios-signature` using the workspace secret.
- If signature is valid, it trusts these headers directly as the authority.
- Otherwise, falls back to stateless cookie signature verification and database API key verification (covering local development and internal verification).

### 2. `apps/dashboard/app/api/workspace/route.ts`
- Updated the GET endpoint to check if the resolved workspace exists in the database. Returns `401 Unauthorized` if the workspace has been deleted (excluding `local-development` bypass).

### 3. `apps/dashboard/app/api/usage/route.ts`
- Marked the GET handler as `async` and properly awaited `rejectUnauthorized`, `resolveTenantId`, `getPlanLimit`, `getUsage`, `getWorkspacePlan`, and `listUsageEvents` to fix typechecking.

### 4. `apps/dashboard/app/api/plugins/route.ts`
- Marked the GET handler as `async` and properly awaited `rejectUnauthorized` and `resolveTenantId` to fix typechecking.

## Verification Run Status
- **Typecheck**: Succeeded cleanly (`corepack pnpm --filter @uios/dashboard typecheck`).
- **Production Build**: Succeeded cleanly (`corepack pnpm --filter @uios/dashboard build`).
- **E2E Tests**: Succeeded cleanly (`corepack pnpm test:e2e`), with 29 passing cases (including `TC-COMB-04` workspace deletion cascading). Ingestion tests are expected to return 404 since ingestion APIs are not yet implemented in this branch.
- **Provider Smoke Test**: Succeeded cleanly (`corepack pnpm provider-smoke`).
- **Smoke Test**: Succeeded cleanly (`corepack pnpm smoke`), passing all 49 checks.
