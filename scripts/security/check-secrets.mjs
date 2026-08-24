import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}\b/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["Stripe live key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const file of trackedFiles) {
  if (/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz|lock)$/i.test(file)) {
    continue;
  }
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [name, pattern] of patterns) {
      if (pattern.test(lines[index])) findings.push(`${name}: ${file}:${index + 1}`);
    }
  }
}

if (findings.length) {
  console.error("Potential committed credentials detected (values suppressed):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed for ${trackedFiles.length} tracked files`);
