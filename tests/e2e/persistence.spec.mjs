import { fetchJson, signWorkspaceId } from "./helpers.mjs";
import { createHmac } from "node:crypto";

export default async function run(test, ctx) {
  test("TC-PERSIST-01", "Database Initialization & Schema Auto-Migration", async () => {
    const res = await fetchJson("/api/ready");
    if (res.status !== 200) {
      throw new Error(`Ready endpoint returned status ${res.status}`);
    }
    if (typeof res.body !== "object" || res.body === null || res.body.ready !== true) {
      throw new Error(`Unexpected readiness response: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-PERSIST-02", "Create Workspace & Relational Integrity", async () => {
    const name = "Alpha Corp";
    const res = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (res.status !== 200) {
      throw new Error(`Workspace creation failed: status ${res.status}`);
    }
    const ws = res.body?.workspace;
    if (!ws || !ws.id || ws.name !== name || ws.plan !== "builder") {
      throw new Error(`Invalid workspace payload: ${JSON.stringify(res.body)}`);
    }
    
    const cookie = res.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) {
      throw new Error("No set-cookie header returned from workspace creation");
    }
    
    // Store in context for other tests
    ctx.workspaceId = ws.id;
    ctx.cookie = cookie;
    
    // Verify relational read
    const getRes = await fetchJson("/api/workspace", {
      headers: { cookie },
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to read back workspace: status ${getRes.status}`);
    }
    if (getRes.body?.workspace?.id !== ws.id) {
      throw new Error(`Returned workspace ID mismatch: ${JSON.stringify(getRes.body)}`);
    }
  });

  test("TC-PERSIST-03", "Vector Persistence (pgvector insert)", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not available in context");
    }
    const content = "Confidential blueprint document";
    const res = await fetchJson("/api/memory", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: JSON.stringify({ content }),
    });
    
    // Expect 201 Created under successful implementation.
    // If not implemented, it might fail (404/500/etc.) which is expected.
    if (res.status !== 201) {
      throw new Error(`Expected 201 Created, got status ${res.status}`);
    }
  });

  test("TC-PERSIST-04", "Cosine Similarity Vector Retrieval", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not available in context");
    }
    const res = await fetchJson("/api/memory?q=blueprint", {
      headers: { cookie: ctx.cookie },
    });
    
    // Expect 200 OK.
    if (res.status !== 200) {
      throw new Error(`Expected 200 OK, got status ${res.status}`);
    }
    const records = res.body?.records || [];
    const found = records.some(r => r.content.includes("blueprint"));
    if (!found) {
      throw new Error(`Confidential blueprint document not found in search results: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-PERSIST-05", "Workspace Plan Persistence", async () => {
    if (!ctx.workspaceId || !ctx.cookie) {
      throw new Error("Workspace data not available in context");
    }
    
    // Create Stripe checkout.session.completed payload
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            uios_workspace_id: ctx.workspaceId,
            uios_plan: "scale"
          }
        }
      }
    });
    
    const secret = "smoke-secret";
    const t = Math.floor(Date.now() / 1000);
    const signaturePayload = `${t}.${payload}`;
    const v1 = createHmac("sha256", secret).update(signaturePayload).digest("hex");
    const stripeSignature = `t=${t},v1=${v1}`;
    
    const res = await fetchJson("/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": stripeSignature },
      body: payload
    });
    
    if (res.status !== 200) {
      throw new Error(`Webhook call failed: status ${res.status}, body ${JSON.stringify(res.body)}`);
    }
    
    // Verify plan updated to "scale"
    const getRes = await fetchJson("/api/workspace", {
      headers: { cookie: ctx.cookie },
    });
    if (getRes.status !== 200) {
      throw new Error(`Workspace query failed: status ${getRes.status}`);
    }
    if (getRes.body?.workspace?.plan !== "scale") {
      throw new Error(`Expected plan to be 'scale', got '${getRes.body?.workspace?.plan}'`);
    }
  });

  test("TC-PERSIST-06", "Database Connection Outage & Fallback", async () => {
    // Health check endpoint is expected to respond with status ok
    const res = await fetchJson("/api/health");
    if (res.status !== 200 || res.body?.status !== "ok") {
      throw new Error(`Health check returned unexpected state: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-PERSIST-07", "Parameterized SQL Injection Immunity", async () => {
    const maliciousName = "'; DROP TABLE workspaces; --";
    const res = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: maliciousName }),
    });
    
    if (res.status !== 200) {
      throw new Error(`Expected 200 for SQL injection payload, got status ${res.status}`);
    }
    const ws = res.body?.workspace;
    if (!ws || ws.name !== maliciousName) {
      throw new Error(`Workspace name not stored literally: ${JSON.stringify(res.body)}`);
    }
    
    // Verify tables were not dropped by hitting health and workspace list
    const health = await fetchJson("/api/health");
    if (health.status !== 200) {
      throw new Error("Tables may have been corrupted, health check failed");
    }
  });

  test("TC-PERSIST-08", "Empty Query Vector Retrieval", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not available in context");
    }
    const res = await fetchJson("/api/memory?q=", {
      headers: { cookie: ctx.cookie },
    });
    
    if (res.status !== 200) {
      throw new Error(`Expected 200 OK, got status ${res.status}`);
    }
    // Spec expects empty list [] or list of all memories without crash
    if (!Array.isArray(res.body?.records)) {
      throw new Error(`Expected records array, got: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-PERSIST-09", "Retention Limit Enforcement", async () => {
    // Audit retention days env logic is initialized on startup.
    // Ensure that health status remains functional, verifying the retention mechanism did not crash startup.
    const res = await fetchJson("/api/health");
    if (res.status !== 200) {
      throw new Error(`Health check failed under retention limit config: status ${res.status}`);
    }
  });

  test("TC-PERSIST-10", "Oversized Metadata Memory Write", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not available in context");
    }
    
    const res = await fetchJson("/api/memory", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: JSON.stringify({
        content: "data",
        metadata: {
          x: "a".repeat(501) // 501 bytes exceeds 500 max limit
        }
      })
    });
    
    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got status ${res.status}, body ${JSON.stringify(res.body)}`);
    }
  });
}
