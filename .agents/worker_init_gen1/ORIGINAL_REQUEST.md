## 2026-07-14T20:08:11Z

You are teamwork_preview_worker. Your working directory is f:/UIOS/.agents/worker_init_gen1.
Your task is to take over the work from worker_init (which encountered resource exhaustion).
You must:
1. Update apps/dashboard/package.json to add the following dependencies:
   In "dependencies":
   - "pg": "^8.11.0"
   - "pgvector": "^0.2.0"
   - "bullmq": "^5.0.0"
   - "pdf-parse": "^1.1.1"
   In "devDependencies":
   - "@types/pg": "^8.11.0"
2. Run `pnpm install` or `pnpm install --offline` at the root/apps/dashboard to install these dependencies cleanly. Use --offline if there are network blocks in this environment.
3. Verify that the project typechecks and builds (pnpm typecheck, pnpm build).
4. Write your analysis/status to f:/UIOS/.agents/worker_init_gen1/analysis.md and write your handoff report to f:/UIOS/.agents/worker_init_gen1/handoff.md.

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
