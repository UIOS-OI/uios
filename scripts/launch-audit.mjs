import { existsSync } from "node:fs";
import { resolve } from "node:path";

const production = process.env.NODE_ENV === "production" || process.env.UIOS_LAUNCH_AUDIT === "production";
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); }
function required(name, predicate, detail) { check(name, !production || predicate, production && !predicate ? detail : "configured"); }

required("workspace signing secret", (process.env.UIOS_WORKSPACE_SECRET ?? "").length >= 32 && !/replace-with|development-workspace-secret/i.test(process.env.UIOS_WORKSPACE_SECRET ?? ""), "UIOS_WORKSPACE_SECRET must be a unique secret of at least 32 characters");
required("Aegis URL", Boolean(process.env.UIOS_AEGIS_URL), "UIOS_AEGIS_URL is required in production");
required("Aegis key", Boolean(process.env.UIOS_AEGIS_KEY), "UIOS_AEGIS_KEY is required in production");
required("Aegis required mode", process.env.UIOS_AEGIS_REQUIRED === "true", "UIOS_AEGIS_REQUIRED=true is required in production");
required("Aegis fail-closed mode", process.env.UIOS_AEGIS_FAIL_CLOSED === "true", "UIOS_AEGIS_FAIL_CLOSED=true is required in production");
required("AI gateway key", Boolean(process.env.UIOS_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY), "Configure a gateway API key");
required("default model", Boolean(process.env.UIOS_DEFAULT_MODEL), "UIOS_DEFAULT_MODEL is required in production");
required("durable database", Boolean(process.env.UIOS_STATE_DB), "UIOS_STATE_DB must point to a managed persistent database/volume");
required("security disclosure contact", /^(mailto:|https:\/\/)/i.test(process.env.UIOS_SECURITY_CONTACT ?? ""), "UIOS_SECURITY_CONTACT must be a mailto: or HTTPS URL in production");
required("security disclosure policy", /^(\/|https:\/\/)/i.test(process.env.UIOS_SECURITY_POLICY_URL ?? ""), "UIOS_SECURITY_POLICY_URL must be an internal path or HTTPS URL in production");
if (process.env.UIOS_BILLING_REQUIRED === "true") {
  required("Stripe secret", Boolean(process.env.STRIPE_SECRET_KEY), "STRIPE_SECRET_KEY is required when billing is enabled");
  required("Stripe webhook secret", Boolean(process.env.STRIPE_WEBHOOK_SECRET), "STRIPE_WEBHOOK_SECRET is required when billing is enabled");
}
for (const file of ["COMPLIANCE.md", "SECURITY.md", "INCIDENT_RESPONSE.md", "DATA_GOVERNANCE.md", "LAUNCH_CHECKLIST.md"]) check(`artifact ${file}`, existsSync(resolve(process.cwd(), file)), "repository artifact present");

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ production, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length > 0) process.exitCode = 1;
