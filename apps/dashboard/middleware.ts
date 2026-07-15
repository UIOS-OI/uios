import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyHmacBase64Url(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const expectedSignature = arrayBufferToBase64Url(signatureBuffer);
  return safeCompare(signature, expectedSignature);
}

async function signHeaders(tenantId: string, role: string, secret: string): Promise<string> {
  const payload = `${tenantId}:${role}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return arrayBufferToBase64Url(signatureBuffer);
}

export async function middleware(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const signed = request.cookies.get("uios_workspace")?.value;
    
    let authInfo: { tenantId: string; role: string } | null = null;
    
    const secret = process.env.UIOS_WORKSPACE_SECRET ?? (process.env.NODE_ENV === "production" ? null : "uios-development-workspace-secret");
    if (!secret) {
      return NextResponse.json({ error: "UIOS_WORKSPACE_SECRET must be configured in production." }, { status: 401 });
    }
    
    if (authorization) {
      if (!authorization.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Malformed Authorization header format." }, { status: 401 });
      }
      const token = authorization.slice(7).trim();
      if (!token) {
        return NextResponse.json({ error: "Token is required." }, { status: 401 });
      }
      
      const verifyUrl = new URL("/api/auth/verify-key", request.url).toString();
      const res = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      
      if (!res.ok) {
        return NextResponse.json({ error: "Invalid or revoked UIOS API key." }, { status: 401 });
      }
      const data = await res.json();
      if (data && data.tenantId && data.role) {
        authInfo = { tenantId: data.tenantId, role: data.role };
      } else {
        return NextResponse.json({ error: "Invalid key verification response." }, { status: 401 });
      }
    } else if (signed) {
      const signatureSeparator = signed.lastIndexOf(".");
      const expirySeparator = signed.lastIndexOf(".", signatureSeparator - 1);
      if (signatureSeparator < 1 || expirySeparator < 1) {
        return NextResponse.json({ error: "Invalid session cookie signature format" }, { status: 401 });
      }
      const workspaceId = signed.slice(0, expirySeparator);
      const expiresAt = Number(signed.slice(expirySeparator + 1, signatureSeparator));
      if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
        return NextResponse.json({ error: "Session cookie has expired" }, { status: 401 });
      }
      const payload = `${workspaceId}.${expiresAt}`;
      const provided = signed.slice(signatureSeparator + 1);
      
      const isValid = await verifyHmacBase64Url(payload, provided, secret);
      if (isValid) {
        authInfo = { tenantId: workspaceId, role: "owner" };
      } else {
        return NextResponse.json({ error: "Invalid session cookie signature" }, { status: 401 });
      }
    }
    
    if (!authInfo) {
      return NextResponse.json(
        { error: "A signed workspace session or UIOS API key is required." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      );
    }
    
    // Sign the forwarded headers to prevent spoofing.
    const signature = await signHeaders(authInfo.tenantId, authInfo.role, secret);
    
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-uios-tenant-id", authInfo.tenantId);
    requestHeaders.set("x-uios-role", authInfo.role);
    requestHeaders.set("x-uios-signature", signature);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal authentication error" }, { status: 401 });
  }
}

export const config = {
  matcher: [
    "/api/chat/:path*",
    "/api/memory/:path*",
    "/api/keys/:path*",
    "/api/usage/:path*",
    "/api/workflows/:path*",
    "/api/analytics/:path*",
    "/api/plugins/:path*",
  ],
};
