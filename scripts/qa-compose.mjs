import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  QA_MIGRATION_DB_PASSWORD:
    process.env.QA_MIGRATION_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_APP_DB_PASSWORD:
    process.env.QA_APP_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_BOOTSTRAP_ADMIN_PASSWORD:
    process.env.QA_BOOTSTRAP_ADMIN_PASSWORD ||
    `Qa!${crypto.randomBytes(24).toString("base64url")}9`,
};
const result = spawnSync(
  "docker",
  ["compose", "-f", "docker-compose.qa.yml", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
