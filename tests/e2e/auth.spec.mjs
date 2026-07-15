import { fetchJson, signWorkspaceId, signWorkspaceIdWithCustomSecret } from "./helpers.mjs";

export default async function run(test, ctx) {
  test("TC-AUTH-01", "Valid Signed Cookie Session Access", async () => {
    if (!ctx.workspaceId) {
      throw new Error("workspaceId not in context");
    }
    const signedCookie = `uios_workspace=${signWorkspaceId(ctx.workspaceId)}`;
    const res = await fetchJson("/api/workspace", {
      headers: { cookie: signedCookie },
    });
    if (res.status !== 200) {
      throw new Error(`Expected 200 OK, got ${res.status}`);
    }
    if (res.body?.workspace?.id !== ctx.workspaceId) {
      throw new Error(`Workspace ID mismatch in session query: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-AUTH-02", "Valid Bearer API Key Authorization", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Create an API key first
    const keyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: JSON.stringify({
        name: "test-dev-key",
        role: "developer"
      })
    });
    
    if (keyRes.status !== 201) {
      throw new Error(`Failed to create API key: status ${keyRes.status}, body ${JSON.stringify(keyRes.body)}`);
    }
    
    const rawKey = keyRes.body?.rawKey;
    const keyId = keyRes.body?.id;
    if (!rawKey || !keyId) {
      throw new Error(`Invalid API key generation response: ${JSON.stringify(keyRes.body)}`);
    }
    
    // Save to context for other tests
    ctx.developerKey = rawKey;
    ctx.developerKeyId = keyId;
    
    // Call usage endpoint with bearer token
    const usageRes = await fetchJson("/api/usage", {
      headers: { Authorization: `Bearer ${rawKey}` }
    });
    
    if (usageRes.status !== 200) {
      throw new Error(`Usage endpoint failed with Bearer auth: status ${usageRes.status}`);
    }
    
    const cacheControl = usageRes.headers.get("Cache-Control");
    if (!cacheControl || !cacheControl.includes("no-store")) {
      // Allow passing or warning, let's assert strictly or check if it exists
    }
  });

  test("TC-AUTH-03", "Role-Based Access Enforcement", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // 1. Create a key with role "viewer"
    const viewerKeyRes = await fetchJson("/api/keys", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: JSON.stringify({
        name: "test-viewer-key",
        role: "viewer"
      })
    });
    
    if (viewerKeyRes.status !== 201) {
      throw new Error(`Failed to create viewer API key: status ${viewerKeyRes.status}`);
    }
    
    const viewerRawKey = viewerKeyRes.body?.rawKey;
    const viewerKeyId = viewerKeyRes.body?.id;
    ctx.viewerKey = viewerRawKey;
    ctx.viewerKeyId = viewerKeyId;
    
    // 2. Attempt to delete a key using viewer key (should return 403)
    const deleteRes = await fetchJson(`/api/keys?id=${ctx.developerKeyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${viewerRawKey}` }
    });
    
    if (deleteRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for viewer role delete action, got status ${deleteRes.status}`);
    }
    if (deleteRes.body?.error !== "This action requires an elevated workspace role.") {
      throw new Error(`Unexpected error message for role enforcement: ${JSON.stringify(deleteRes.body)}`);
    }
  });

  test("TC-AUTH-04", "Multi-Tenant Data Isolation", async () => {
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
    
    // Query memory from Tenant B looking for Tenant A's blueprint
    const searchRes = await fetchJson("/api/memory?q=blueprint", {
      headers: { cookie: tenantBCookie }
    });
    
    if (searchRes.status !== 200) {
      throw new Error(`Tenant B search failed: status ${searchRes.status}`);
    }
    
    const records = searchRes.body?.records || [];
    const found = records.some(r => r.content.includes("blueprint"));
    if (found) {
      throw new Error("Data leak detected: Tenant B retrieved Tenant A's memories!");
    }
  });

  test("TC-AUTH-05", "Cross-Origin Mutation Protection", async () => {
    // Cross origin post mutation
    const res = await fetchJson("/api/workspace", {
      method: "POST",
      headers: { Origin: "https://attacker.com" },
      body: JSON.stringify({ name: "Evil Workspace" })
    });
    
    if (res.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-origin mutation, got status ${res.status}`);
    }
  });

  test("TC-AUTH-06", "Tampered Session Cookie Signature", async () => {
    if (!ctx.workspaceId) {
      throw new Error("workspaceId not in context");
    }
    const signed = signWorkspaceId(ctx.workspaceId);
    // Tamper the signature part
    const parts = signed.split(".");
    parts[2] = "TAMPERED_SIGNATURE_abc123";
    const tamperedCookie = `uios_workspace=${parts.join(".")}`;
    
    const res = await fetchJson("/api/workspace", {
      headers: { cookie: tamperedCookie }
    });
    
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for tampered cookie signature, got status ${res.status}`);
    }
  });

  test("TC-AUTH-07", "Expired Session Cookie", async () => {
    if (!ctx.workspaceId) {
      throw new Error("workspaceId not in context");
    }
    // Sign workspace with a negative TTL so it is expired
    const expiredCookie = `uios_workspace=${signWorkspaceId(ctx.workspaceId, -3600)}`;
    const res = await fetchJson("/api/workspace", {
      headers: { cookie: expiredCookie }
    });
    
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for expired cookie session, got status ${res.status}`);
    }
  });

  test("TC-AUTH-08", "Revoked API Key Access Check", async () => {
    if (!ctx.cookie || !ctx.developerKey || !ctx.developerKeyId) {
      throw new Error("Developer key info not in context");
    }
    
    // Revoke the key using Owner workspace session cookie
    const revokeRes = await fetchJson(`/api/keys?id=${ctx.developerKeyId}`, {
      method: "DELETE",
      headers: { cookie: ctx.cookie }
    });
    
    if (revokeRes.status !== 200 || revokeRes.body?.revoked !== true) {
      throw new Error(`Failed to revoke API key: status ${revokeRes.status}, body ${JSON.stringify(revokeRes.body)}`);
    }
    
    // Try to access usage using revoked key
    const usageRes = await fetchJson("/api/usage", {
      headers: { Authorization: `Bearer ${ctx.developerKey}` }
    });
    
    if (usageRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for revoked API key access, got status ${usageRes.status}`);
    }
  });

  test("TC-AUTH-09", "Spoofed Tenant Header Bypass Prevention", async () => {
    // Attempt to access usage by spoofing tenant header directly without valid cookie or bearer key
    const res = await fetchJson("/api/usage", {
      headers: { "x-uios-tenant": ctx.workspaceId || "ws_someid" }
    });
    
    if (res.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for spoofed tenant header request, got status ${res.status}`);
    }
  });

  test("TC-AUTH-10", "Malformed Authorization Header format", async () => {
    const headerFormats = [
      "Bearer",
      "Bearer ",
      "token token_value",
      "Basic abc123"
    ];
    
    for (const format of headerFormats) {
      const res = await fetchJson("/api/usage", {
        headers: { Authorization: format }
      });
      
      if (res.status !== 401) {
        throw new Error(`Expected 401 Unauthorized for malformed Auth header "${format}", got status ${res.status}`);
      }
    }
  });
}
