import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

let aegisCalls = 0;
const gateway = createServer((request, response) => {
  if (request.url === "/api/proxy") {
    let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => { aegisCalls += 1; response.writeHead(200, { "content-type": "application/json" }); response.end(aegisCalls === 2 ? "{}" : JSON.stringify({ allowed: true })); }); return;
  }
  if (request.url === "/v1/models") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ id: "mock-model" }] })); return; }
  if (request.url === "/v1/chat/completions") { response.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive" }); response.write(`data: ${JSON.stringify({ id: "mock-1", model: "mock-model", choices: [{ delta: { content: "UIOS " } }] })}\n\n`); setTimeout(() => { response.write(`data: ${JSON.stringify({ id: "mock-1", model: "mock-model", choices: [{ delta: { content: "streamed" }, finish_reason: "stop" }] })}\n\n`); response.write("data: [DONE]\n\n"); response.end(); }, 20); return; }
  response.writeHead(404); response.end();
});
await new Promise((resolve) => gateway.listen(4010, "127.0.0.1", resolve));
const dashboardDir = fileURLToPath(new URL("../apps/dashboard", import.meta.url));
const providerStateDb = ".uios-data/provider-smoke.sqlite";
const start = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3010"], { cwd: dashboardDir, env: { ...process.env, UIOS_AI_GATEWAY_URL: "http://127.0.0.1:4010/v1", UIOS_AI_GATEWAY_KEY: "mock-key", UIOS_DEFAULT_MODEL: "mock-model", UIOS_AEGIS_URL: "http://127.0.0.1:4010", UIOS_AEGIS_KEY: "mock-aegis-key", UIOS_AEGIS_REQUIRED: "true", UIOS_AEGIS_FAIL_CLOSED: "true", UIOS_WORKSPACE_SECRET: "provider-smoke-workspace-secret-0123456789", STRIPE_WEBHOOK_SECRET: "smoke-secret", UIOS_STATE_FILE: "", UIOS_STATE_DB: providerStateDb }, stdio: "ignore" });
try {
  let ready = false; let health;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 500)); try { health = await fetch("http://127.0.0.1:3010/api/health"); ready = health.ok; } catch {} }
  if (!ready) throw new Error("Dashboard did not become ready.");
  const readiness = await fetch("http://127.0.0.1:3010/api/ready");
  if (readiness.status !== 200 || !(await readiness.json()).ready) throw new Error(`Production readiness assertion failed (${readiness.status})`);
  for (const [header, expected] of [["content-security-policy", true], ["x-frame-options", "DENY"], ["x-content-type-options", "nosniff"], ["strict-transport-security", true]]) if (expected === true ? !health.headers.get(header) : health.headers.get(header) !== expected) throw new Error(`Security header assertion failed (${header})`);
  const workspace = await fetch("http://127.0.0.1:3010/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "production smoke workspace" }) });
  if (workspace.status !== 200) throw new Error(`Production workspace creation assertion failed (${workspace.status})`);
  const cookie = workspace.headers.get("set-cookie")?.split(";")[0];
  const response = await fetch("http://127.0.0.1:3010/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ role: "user", content: "stream test" }] }) });
  const body = await response.text();
  if (response.status !== 200 || !body.includes("UIOS ") || !body.includes("streamed") || !body.includes("[DONE]")) throw new Error(`Streaming assertion failed (${response.status}): ${body.slice(0, 300)}`);
  const malformedAegis = await fetch("http://127.0.0.1:3010/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ role: "user", content: "malformed Aegis decision" }] }) });
  if (malformedAegis.status !== 403) throw new Error(`Aegis fail-closed contract assertion failed (${malformedAegis.status})`);
  const webhook = await fetch("http://127.0.0.1:3010/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" }, body: "{}" });
  if (webhook.status !== 400) throw new Error(`Webhook signature assertion failed (${webhook.status})`);
  const unauthenticatedUsage = await fetch("http://127.0.0.1:3010/api/usage");
  if (unauthenticatedUsage.status !== 401) throw new Error(`Production unauthenticated access assertion failed (${unauthenticatedUsage.status})`);
  const unauthenticatedWorkspace = await fetch("http://127.0.0.1:3010/api/workspace");
  if (unauthenticatedWorkspace.status !== 401) throw new Error(`Production workspace auth assertion failed (${unauthenticatedWorkspace.status})`);
  console.log(JSON.stringify({ passed: true, status: response.status, route: response.headers.get("x-uios-route"), requestId: response.headers.get("x-uios-request-id") }, null, 2));
} finally {
  if (start.exitCode === null) { start.kill(); await new Promise((resolve) => start.once("exit", resolve)); }
  await new Promise((resolve) => gateway.close(resolve));
  for (const suffix of ["", "-shm", "-wal"]) { try { rmSync(new URL(`../apps/dashboard/${providerStateDb}${suffix}`, import.meta.url), { force: true }); } catch {} }
}
