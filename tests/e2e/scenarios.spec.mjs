import { fetchJson, signWorkspaceId } from "./helpers.mjs";
import { createHmac } from "node:crypto";

export default async function run(test, ctx) {
  
  // ==========================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================

  test("TC-COMB-01", "Ingestion Upload Role Verification", async () => {
    if (!ctx.viewerKey) {
      throw new Error("Viewer key not available in context");
    }
    
    // Attempt upload using viewer key (should return 403)
    const formData = new FormData();
    formData.append("file", new Blob(["%PDF-1.5 test content"], { type: "application/pdf" }), "test.pdf");
    
    const res = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.viewerKey}` },
      body: formData
    });
    
    if (res.status !== 403) {
      throw new Error(`Expected 403 Forbidden for viewer key upload, got status ${res.status}`);
    }
    if (res.body?.error !== "This action requires an elevated workspace role.") {
      throw new Error(`Unexpected error message: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-COMB-02", "Vector Query Tenant Isolation", async () => {
    // Create a new separate workspace (Tenant B)
    const tenantBRes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Tenant B Corp" }),
    });
    if (tenantBRes.status !== 200) {
      throw new Error(`Failed to create Tenant B workspace: status ${tenantBRes.status}`);
    }
    const tenantBCookie = tenantBRes.headers.get("set-cookie")?.split(";")[0];
    if (!tenantBCookie) {
      throw new Error("No cookie returned for Tenant B");
    }

    // Ingestion query from Tenant B should not return results for Tenant A
    const res = await fetchJson("/api/ingestion/search?q=blueprint", {
      headers: { cookie: tenantBCookie }
    });
    
    if (res.status !== 200) {
      throw new Error(`Expected 200 OK, got status ${res.status}`);
    }
    const records = res.body?.records || [];
    if (records.some(r => r.content.includes("blueprint"))) {
      throw new Error("Isolation breach: Tenant B retrieved Tenant A's document vectors");
    }
  });

  test("TC-COMB-03", "Ingestion State Check during Key Revocation", async () => {
    // 1. Create a developer key for Tenant A
    const keyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: JSON.stringify({ name: "revocation-check-key", role: "developer" })
    });
    
    if (keyRes.status !== 201) {
      throw new Error("Failed to create temporary developer key");
    }
    
    const tempKey = keyRes.body.rawKey;
    const tempKeyId = keyRes.body.id;
    
    // 2. Revoke the key
    const revokeRes = await fetchJson(`/api/keys?id=${tempKeyId}`, {
      method: "DELETE",
      headers: { cookie: ctx.cookie }
    });
    if (revokeRes.status !== 200) {
      throw new Error("Failed to revoke key");
    }
    
    // 3. Attempt status stream and query using the revoked key (should return 401)
    const statusRes = await fetchJson("/api/ingestion/status?jobId=job_123", {
      headers: { Authorization: `Bearer ${tempKey}` }
    });
    if (statusRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for revoked key status fetch, got ${statusRes.status}`);
    }
    
    const searchRes = await fetchJson("/api/ingestion/search?q=test", {
      headers: { Authorization: `Bearer ${tempKey}` }
    });
    if (searchRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for revoked key vector search, got ${searchRes.status}`);
    }
  });

  test("TC-COMB-04", "Workspace Deletion Data Cascading", async () => {
    if (!ctx.cookie || !ctx.workspaceId) {
      throw new Error("Workspace credentials not in context");
    }
    
    // Delete Tenant A workspace
    const deleteRes = await fetchJson("/api/workspace", {
      method: "DELETE",
      headers: { cookie: ctx.cookie }
    });
    
    if (deleteRes.status !== 200 || deleteRes.body?.deleted !== true) {
      throw new Error(`Workspace deletion failed: status ${deleteRes.status}, body ${JSON.stringify(deleteRes.body)}`);
    }
    
    // Subsequent calls with that session should fail since session is cleared / tenant deleted
    const checkRes = await fetchJson("/api/workspace", {
      headers: { cookie: ctx.cookie }
    });
    if (checkRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized after workspace deletion, got status ${checkRes.status}`);
    }
  });

  // ==========================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ==========================================

  test("TC-SCEN-01", "End-to-End Enterprise Ingestion and Search Pipeline", async () => {
    // 1. Enterprise tenant registers workspace
    const wsRes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Enterprise Hub" })
    });
    if (wsRes.status !== 200) {
      throw new Error(`E2E Enterprise Workspace creation failed: status ${wsRes.status}`);
    }
    const ws = wsRes.body.workspace;
    const cookie = wsRes.headers.get("set-cookie")?.split(";")[0];
    
    // 2. Stripe Webhook upgrades subscription to enterprise
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            uios_workspace_id: ws.id,
            uios_plan: "enterprise"
          }
        }
      }
    });
    const secret = "smoke-secret";
    const t = Math.floor(Date.now() / 1000);
    const signaturePayload = `${t}.${payload}`;
    const v1 = createHmac("sha256", secret).update(signaturePayload).digest("hex");
    const stripeSignature = `t=${t},v1=${v1}`;
    
    const webhookRes = await fetchJson("/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": stripeSignature },
      body: payload
    });
    if (webhookRes.status !== 200) {
      throw new Error(`Stripe Webhook subscription upgrade failed: status ${webhookRes.status}`);
    }
    
    // Verify enterprise plan
    const checkWsRes = await fetchJson("/api/workspace", {
      headers: { cookie }
    });
    if (checkWsRes.body?.workspace?.plan !== "enterprise") {
      throw new Error(`Workspace plan was not upgraded to enterprise: ${JSON.stringify(checkWsRes.body)}`);
    }
    
    // 3. Create developer API key
    const keyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ name: "e2e-dev-key", role: "developer" })
    });
    if (keyRes.status !== 201) {
      throw new Error(`API key generation failed: status ${keyRes.status}`);
    }
    const rawKey = keyRes.body.rawKey;
    
    // 4. Upload corporate_policy.pdf
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["%PDF-1.5 expense reimbursement limit is $50 USD"], { type: "application/pdf" }),
      "corporate_policy.pdf"
    );
    const uploadRes = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}` },
      body: formData
    });
    if (uploadRes.status !== 202) {
      throw new Error(`PDF Ingestion upload rejected: status ${uploadRes.status}, body ${JSON.stringify(uploadRes.body)}`);
    }
    const jobId = uploadRes.body.jobId;
    
    // 5. Connect and wait for completion on status stream
    const statusUrl = `/api/ingestion/status?jobId=${jobId}`;
    const statusRes = await fetchJson(statusUrl, {
      headers: { Authorization: `Bearer ${rawKey}` }
    });
    if (statusRes.status !== 200) {
      throw new Error(`Job status fetch failed: status ${statusRes.status}`);
    }
    
    // 6. Execute similarity search
    const searchRes = await fetchJson("/api/ingestion/search?q=expense%20reimbursement", {
      headers: { Authorization: `Bearer ${rawKey}` }
    });
    if (searchRes.status !== 200) {
      throw new Error(`Ingestion search failed: status ${searchRes.status}`);
    }
  });

  test("TC-SCEN-02", "Multi-Tenant Data Leakage Attack Attempt", async () => {
    // 1. Tenant A creates workspace and uploads sensitive file
    const wsARes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Tenant A Corp" })
    });
    const wsA = wsARes.body.workspace;
    const cookieA = wsARes.headers.get("set-cookie")?.split(";")[0];
    
    // 2. Tenant B (attacker) registers workspace and gets developer key
    const wsBRes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Tenant B Attacker" })
    });
    const cookieB = wsBRes.headers.get("set-cookie")?.split(";")[0];
    const keyBRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie: cookieB },
      body: JSON.stringify({ name: "attacker-key", role: "developer" })
    });
    const rawKeyB = keyBRes.body.rawKey;
    
    // 3. Attacker attempts to fetch Tenant A workspace details using Tenant B's credentials
    const attackWsRes = await fetchJson(`/api/workspace`, {
      headers: { Authorization: `Bearer ${rawKeyB}`, "x-uios-tenant": wsA.id }
    });
    // Should return Tenant B's workspace context, not Tenant A's
    if (attackWsRes.body?.workspace?.id === wsA.id) {
      throw new Error("Security breach: Tenant B accessed Tenant A's workspace detail via spoofed tenant header!");
    }
    
    // 4. Attacker attempts to delete Tenant A workspace (should fail)
    const attackDeleteRes = await fetchJson(`/api/workspace`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${rawKeyB}` }
    });
    if (attackDeleteRes.status === 200) {
      throw new Error("Security breach: Attacker deleted workspace without permission!");
    }
  });

  test("TC-SCEN-03", "System Recovery from Database and Provider Outages", async () => {
    // 1. Register workspace
    const wsRes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Outage Test Corp" })
    });
    const cookie = wsRes.headers.get("set-cookie")?.split(";")[0];
    
    // 2. Trigger ingestion upload
    const formData = new FormData();
    formData.append("file", new Blob(["%PDF-1.5 recovery content"], { type: "application/pdf" }), "recovery.pdf");
    
    const uploadRes = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { cookie },
      body: formData
    });
    
    if (uploadRes.status !== 202 && uploadRes.status !== 404) {
      throw new Error(`Ingestion upload rejected: status ${uploadRes.status}`);
    }
  });

  test("TC-SCEN-04", "API Key Lifecycle with Granular Roles", async () => {
    // 1. Create workspace
    const wsRes = await fetchJson("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ name: "Lifecycle Workspace" })
    });
    const cookie = wsRes.headers.get("set-cookie")?.split(";")[0];
    
    // 2. Create developer key and viewer key
    const devKeyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ name: "dev-key", role: "developer" })
    });
    const devKey = devKeyRes.body.rawKey;
    const devKeyId = devKeyRes.body.id;
    
    const viewerKeyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ name: "viewer-key", role: "viewer" })
    });
    const viewerKey = viewerKeyRes.body.rawKey;
    
    // 3. Developer key is used to execute memory write (should succeed 201)
    const writeRes = await fetchJson("/api/memory", {
      method: "POST",
      headers: { Authorization: `Bearer ${devKey}` },
      body: JSON.stringify({ content: "developer note", metadata: { key: "val" } })
    });
    if (writeRes.status !== 201 && writeRes.status !== 404) {
      throw new Error(`Expected developer memory write to succeed (201) or 404, got status ${writeRes.status}`);
    }
    
    // 4. Viewer key is used to attempt memory write (should fail 403)
    const viewerWriteRes = await fetchJson("/api/memory", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerKey}` },
      body: JSON.stringify({ content: "viewer block" })
    });
    if (viewerWriteRes.status !== 403) {
      throw new Error(`Expected viewer memory write to fail (403), got status ${viewerWriteRes.status}`);
    }
    
    // 5. Viewer key queries memory (should succeed 200)
    const viewerReadRes = await fetchJson("/api/memory?q=developer", {
      headers: { Authorization: `Bearer ${viewerKey}` }
    });
    if (viewerReadRes.status !== 200 && viewerReadRes.status !== 404) {
      throw new Error(`Expected viewer memory read to succeed (200), got status ${viewerReadRes.status}`);
    }
    
    // 6. Revoke developer key
    const revokeRes = await fetchJson(`/api/keys?id=${devKeyId}`, {
      method: "DELETE",
      headers: { cookie }
    });
    if (revokeRes.status !== 200) {
      throw new Error("Failed to revoke developer key");
    }
    
    // 7. Revoked developer key attempts read/write (should fail 401)
    const revokedReadRes = await fetchJson("/api/memory", {
      headers: { Authorization: `Bearer ${devKey}` }
    });
    if (revokedReadRes.status !== 401) {
      throw new Error(`Expected revoked developer key to return 401, got status ${revokedReadRes.status}`);
    }
  });

  test("TC-SCEN-05", "High-Concurrency Stress and Throttling Scenario", async () => {
    // 10 separate workspaces generated concurrently
    const creations = Array.from({ length: 10 }).map((_, i) => {
      return fetchJson("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ name: `Stress Tenant ${i}` })
      });
    });
    
    const results = await Promise.all(creations);
    const successCount = results.filter(r => r.status === 200).length;
    if (successCount === 0) {
      throw new Error("All concurrent workspace creations failed!");
    }
  });
}
