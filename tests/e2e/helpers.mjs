import { createHmac } from "node:crypto";

export const baseUrl = process.env.UIOS_BASE_URL || "http://127.0.0.1:3010";
export const workspaceSecret = process.env.UIOS_WORKSPACE_SECRET || "test-workspace-signing-secret-key-123456";

export function signWorkspaceId(workspaceId, ttlSeconds = 60 * 60 * 8) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${workspaceId}.${expiresAt}`;
  const signature = createHmac("sha256", workspaceSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function signWorkspaceIdWithCustomSecret(workspaceId, secret, ttlSeconds = 60 * 60 * 8) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${workspaceId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function fetchJson(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  let body = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch (e) {
      // Ignore
    }
  } else {
    try {
      body = await response.text();
    } catch (e) {
      // Ignore
    }
  }
  
  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}
