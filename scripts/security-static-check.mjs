import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.startsWith(".local-run/"));

const forbiddenNames = [
  /(^|\/)\.env$/i,
  /(^|\/)(id_rsa|id_ed25519)$/i,
  /\.(pem|p12|pfx|key)$/i,
  /(^|\/)service[-_]?account.*\.json$/i,
];
const secretPatterns = [
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
];
const textExtensions = new Set([
  "", ".cjs", ".css", ".dart", ".env", ".example", ".html", ".js",
  ".json", ".jsx", ".kts", ".md", ".mjs", ".plist", ".properties",
  ".sh", ".sql", ".swift", ".ts", ".tsx", ".txt", ".xcconfig", ".xml",
  ".yaml", ".yml",
]);
const findings = [];

for (const file of files) {
  const normalized = file.replaceAll("\\", "/");
  if (forbiddenNames.some((pattern) => pattern.test(normalized))) {
    findings.push(`${normalized}: forbidden sensitive filename`);
  }
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of secretPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${normalized}:${line}: ${label}`);
    }
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|DATABASE|KEY)/.test(content)) {
    findings.push(`${normalized}: browser-public variable has a sensitive name`);
  }
}

for (const workflow of files.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file))) {
  const content = readFileSync(workflow, "utf8");
  if (/\bpull_request_target\s*:/.test(content)) {
    findings.push(`${workflow}: pull_request_target requires explicit security review`);
  }
  for (const match of content.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*/gm)) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const revision = reference.split("@").at(-1) || "";
    if (!/^[a-f0-9]{40}$/i.test(revision)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${workflow}:${line}: action is not pinned to a full commit SHA`);
    }
  }
}

if (findings.length) {
  console.error("Security static check failed:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Security static check passed (${files.length} repository files inspected)`);
