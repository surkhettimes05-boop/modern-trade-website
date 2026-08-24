import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const qaEnv = {
  ...process.env,
  QA_MIGRATION_DB_PASSWORD:
    process.env.QA_MIGRATION_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_APP_DB_PASSWORD:
    process.env.QA_APP_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_BOOTSTRAP_ADMIN_PASSWORD:
    process.env.QA_BOOTSTRAP_ADMIN_PASSWORD ||
    `Qa!${crypto.randomBytes(24).toString("base64url")}9`,
  PLAYWRIGHT_BASE_URL:
    process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:53000",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: qaEnv,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

try {
  run(process.execPath, ["scripts/qa-compose.mjs", "down", "--volumes", "--remove-orphans"]);
  run(process.execPath, ["scripts/qa-compose.mjs", "up", "-d", "--build"]);
  run(process.execPath, ["scripts/qa-verify.mjs"]);
  run(npm, ["run", "test:e2e:chromium", "--prefix", "frontend"]);
} finally {
  const cleanup = spawnSync(
    process.execPath,
    ["scripts/qa-compose.mjs", "down", "--remove-orphans"],
    { stdio: "inherit", env: qaEnv, shell: process.platform === "win32" },
  );
  if (cleanup.status !== 0) {
    console.error("QA cleanup failed; inspect running containers manually");
  }
}
