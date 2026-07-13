import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const findings = [];
const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, "private-key material"],
  [/(?:sk|rk|ghp|xox[baprs])_[A-Za-z0-9_-]{18,}/, "live provider/token pattern"],
  [/dangerouslySetInnerHTML/, "unsafe HTML injection"],
];
for (const file of files) {
  if (/^(?:pnpm-lock\.yaml|.*\.map)$/.test(file)) continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const [pattern, name] of patterns) if (pattern.test(content)) findings.push({ file, name });
}
const gitignore = readFileSync(".gitignore", "utf8");
if (!gitignore.includes(".env") || !gitignore.includes(".uios-data")) findings.push({ file: ".gitignore", name: "required local secret/state ignore rule missing" });
console.log(JSON.stringify({ filesScanned: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
