## 2026-07-14T20:27:46Z

You are the Explorer for the E2E Testing Track.
Your working directory is f:/UIOS/.agents/explorer_e2e.
You need to research the codebase and design the E2E test suite.
1. Research if there are existing test suites, runners (e.g. Playwright, Jest, Vitest), or scripts (like scripts/smoke.mjs) in the repository.
2. Determine how the E2E tests should interact with the Next.js API server (e.g., via HTTP fetch requests against process.env.UIOS_BASE_URL, or using a specific test framework).
3. Design 38+ test cases satisfying the 4-tier requirement for the three feature areas (Relational/Vector Persistence, Authentication Middleware, Asynchronous Ingestion):
   - Tier 1 (Feature Coverage): 5 per feature area (15 total).
   - Tier 2 (Boundary & Corner cases): 5 per feature area (15 total).
   - Tier 3 (Cross-Feature Combinations): at least 3 covering feature interactions.
   - Tier 4 (Real-World Application Scenarios): at least 5 scenarios.
4. Specify the exact API routes, request payloads, and expected response statuses/bodies for each test case.
5. Recommend the layout of the test files and the runner integration (e.g., a node script 'scripts/e2e-tests.mjs' or similar).
Write your findings and test specification to f:/UIOS/.agents/explorer_e2e/test_design.md and then send a handoff message back to me.
