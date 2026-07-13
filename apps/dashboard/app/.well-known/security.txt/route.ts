export const runtime = "nodejs";

export function GET() {
  const body = [
    `Contact: ${process.env.UIOS_SECURITY_CONTACT ?? "mailto:security@uios.dev"}`,
    `Policy: ${process.env.UIOS_SECURITY_POLICY_URL ?? "/security"}`,
    "Preferred-Languages: en",
    "Canonical: /.well-known/security.txt",
  ].join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
