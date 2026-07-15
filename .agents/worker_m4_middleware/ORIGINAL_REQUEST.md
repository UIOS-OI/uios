## 2026-07-14T20:35:22Z
You are teamwork_preview_worker. Your working directory is f:/UIOS/.agents/worker_m4_middleware.
Your task is to implement Milestone 4: SSO / Aegis Authentication Middleware:
1. Create Next.js middleware at `apps/dashboard/middleware.ts`.
2. The middleware must intercept requests to platform API endpoints (e.g. matching `/api/chat`, `/api/memory`, `/api/keys`, `/api/usage`, `/api/workflows`, `/api/analytics`, `/api/plugins`).
3. For cookie-based authentication, verify the session token (`uios_workspace` cookie) at the edge using `UIOS_WORKSPACE_SECRET` and standard Web Crypto APIs (since Node's `crypto` is not available in edge middleware).
4. For header-based authentication, detect the `Authorization: Bearer <key>` header. Since database access is not available at the edge, verify the key by making an internal sub-request (`fetch` call) to `/api/auth/verify-key` (which you should implement as a new API route in `apps/dashboard/app/api/auth/verify-key/route.ts`).
5. Create `apps/dashboard/app/api/auth/verify-key/route.ts` to expose an internal POST route that accepts a bearer token, resolves it via `resolveApiKeyAuth` in `state-store.ts`, and returns the `{ tenantId, role }`.
6. Enforce that all validations are fail-closed. If verification fails or throws an error, return `401 Unauthorized` or `403 Forbidden` immediately from the middleware.
7. Forward the authenticated `x-uios-tenant-id` and `x-uios-role` headers to the downstream routes.
8. Refactor `resolveAuth` in `apps/dashboard/app/lib/runtime.ts` to trust and use these headers as the authority if present, fallback to cookie/key validation if running locally without middleware or for verification.
9. Verify that all workspace packages typecheck and build cleanly.

Document the changes in f:/UIOS/.agents/worker_m4_middleware/changes.md and write a handoff report in f:/UIOS/.agents/worker_m4_middleware/handoff.md.

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
