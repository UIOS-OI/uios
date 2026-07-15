import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 1. Setup paths and state DB cleanups
const dashboardDir = fileURLToPath(new URL("../apps/dashboard", import.meta.url));
const testDbFile = ".uios-data/e2e-tests.sqlite";

function cleanDbFiles() {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      rmSync(new URL(`../apps/dashboard/${testDbFile}${suffix}`, import.meta.url), { force: true });
    } catch (e) {
      // Ignore
    }
  }
}

cleanDbFiles();

// 2. Start Mock Gateway/Aegis Server on Port 4010
let aegisCalls = 0;
const gateway = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    // Aegis proxy
    if (request.url === "/api/proxy") {
      aegisCalls += 1;
      if (body.includes("malformed Aegis decision")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ allowed: true }));
      return;
    }
    
    // Gateway Embeddings
    if (request.url === "/v1/embeddings" || request.url === "/embeddings") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        data: [{ embedding: Array(1536).fill(0.1) }]
      }));
      return;
    }
    
    // Gateway Models list
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
      return;
    }
    
    // Gateway Chat completions
    if (request.url === "/v1/chat/completions") {
      response.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive" });
      response.write(`data: ${JSON.stringify({ id: "mock-1", model: "mock-model", choices: [{ delta: { content: "UIOS " } }] })}\n\n`);
      setTimeout(() => {
        response.write(`data: ${JSON.stringify({ id: "mock-1", model: "mock-model", choices: [{ delta: { content: "streamed" }, finish_reason: "stop" }] })}\n\n`);
        response.write("data: [DONE]\n\n");
        response.end();
      }, 20);
      return;
    }
    
    // Default 404
    response.writeHead(404);
    response.end();
  });
});

await new Promise((resolve) => gateway.listen(4010, "127.0.0.1", resolve));
console.log("Mock Gateway & Aegis server listening on http://127.0.0.1:4010");

// 3. Start Next.js App on Port 3010
const envVars = {
  ...process.env,
  PORT: "3010",
  UIOS_BASE_URL: "http://127.0.0.1:3010",
  UIOS_WORKSPACE_SECRET: "test-workspace-signing-secret-key-123456",
  UIOS_AEGIS_URL: "http://127.0.0.1:4010",
  UIOS_AEGIS_KEY: "mock-aegis-key",
  UIOS_AEGIS_REQUIRED: "true",
  UIOS_AEGIS_FAIL_CLOSED: "true",
  UIOS_AI_GATEWAY_URL: "http://127.0.0.1:4010/v1",
  UIOS_AI_GATEWAY_KEY: "mock-gateway-key",
  UIOS_DEFAULT_MODEL: "mock-model",
  STRIPE_WEBHOOK_SECRET: "smoke-secret",
  UIOS_STATE_FILE: "",
  UIOS_STATE_DB: testDbFile
};

const appProcess = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3010"],
  { cwd: dashboardDir, env: envVars, stdio: "ignore" }
);

// 4. Wait for Next.js Server to be Ready
let ready = false;
console.log("Waiting for Next.js dashboard to become ready...");
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const res = await fetch("http://127.0.0.1:3010/api/health");
    if (res.ok) {
      ready = true;
      break;
    }
  } catch (e) {
    // Ignore and retry
  }
}

if (!ready) {
  console.error("Dashboard failed to boot.");
  appProcess.kill();
  await new Promise((resolve) => gateway.close(resolve));
  process.exit(1);
}
console.log("Next.js dashboard ready on http://127.0.0.1:3010");

// 5. Dynamic imports of tests and execution
const testResults = [];
function registerTest(id, name, fn) {
  testResults.push({ id, name, fn, status: "pending", error: null });
}

const ctx = {};

try {
  const runPersistence = (await import("../tests/e2e/persistence.spec.mjs")).default;
  const runAuth = (await import("../tests/e2e/auth.spec.mjs")).default;
  const runIngestion = (await import("../tests/e2e/ingestion.spec.mjs")).default;
  const runScenarios = (await import("../tests/e2e/scenarios.spec.mjs")).default;
  
  await runPersistence(registerTest, ctx);
  await runAuth(registerTest, ctx);
  await runIngestion(registerTest, ctx);
  await runScenarios(registerTest, ctx);
  
  console.log(`\n=== Running ${testResults.length} E2E Test Cases ===\n`);
  
  let passedCount = 0;
  let failedCount = 0;
  
  for (const t of testResults) {
    console.log(`[ RUN  ] ${t.id}: ${t.name}`);
    try {
      await t.fn();
      t.status = "passed";
      console.log(`[ PASS ] ${t.id}: ${t.name}`);
      passedCount++;
    } catch (err) {
      t.status = "failed";
      t.error = err.message;
      console.log(`[ FAIL ] ${t.id}: ${t.name}`);
      console.log(`         Reason: ${err.message}`);
      failedCount++;
    }
  }
  
  console.log(`\n=== E2E Test Summary ===`);
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);
  
  // Write a simple JSON report for verification / handoff
  const report = {
    timestamp: new Date().toISOString(),
    total: testResults.length,
    passed: passedCount,
    failed: failedCount,
    tests: testResults.map(t => ({ id: t.id, name: t.name, status: t.status, error: t.error }))
  };
  writeFileSync(
    new URL("../.agents/worker_e2e/test-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  
} catch (err) {
  console.error("Runner execution failed:", err);
} finally {
  // 6. Cleanup
  console.log("Shutting down processes and cleaning database files...");
  if (appProcess.exitCode === null) {
    appProcess.kill();
    await new Promise((resolve) => appProcess.once("exit", resolve));
  }
  await new Promise((resolve) => gateway.close(resolve));
  cleanDbFiles();
  console.log("Cleanup completed.");
}
