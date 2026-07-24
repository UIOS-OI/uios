import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: ["@uios/render-engine", "three"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  experimental: {
    cpus: 2,
  },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/api/universe/document": ["../../docs/**/*", "../../*.md"],
    "/api/universe/topology": ["../../docs/**/*", "../../*.md"],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const csp = `default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
    const securityHeaders = [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: csp },
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, ...securityHeaders] },
    ];
  },
};

export default nextConfig;
