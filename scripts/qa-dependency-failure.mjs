import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const compose = ["compose", "-f", "docker-compose.qa.yml"];
const composeEnv = {
  ...process.env,
  QA_MIGRATION_DB_PASSWORD:
    process.env.QA_MIGRATION_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_APP_DB_PASSWORD:
    process.env.QA_APP_DB_PASSWORD || crypto.randomBytes(24).toString("hex"),
  QA_BOOTSTRAP_ADMIN_PASSWORD:
    process.env.QA_BOOTSTRAP_ADMIN_PASSWORD ||
    `Qa!${crypto.randomBytes(24).toString("base64url")}9`,
};
const docker = (args) =>
  execFileSync("docker", [...compose, ...args], {
    stdio: "inherit",
    env: composeEnv,
  });

async function waitForStatus(url, expected, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === expected) return;
    } catch {
      if (expected === 503) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not reach expected status ${expected}`);
}

try {
  docker(["stop", "redis"]);
  await waitForStatus("http://localhost:53001/api/health/ready", 503);
  console.log("Redis failure: readiness stopped accepting traffic");
} finally {
  docker(["start", "redis"]);
  await waitForStatus("http://localhost:53001/api/health/ready", 200);
}

try {
  docker(["stop", "postgres"]);
  await waitForStatus("http://localhost:53001/api/health/ready", 503);
  console.log("PostgreSQL failure: readiness stopped accepting traffic");
} finally {
  docker(["start", "postgres"]);
  docker(["restart", "backend"]);
  await waitForStatus("http://localhost:53001/api/health/ready", 200);
}

console.log("Dependency failure and recovery checks passed");
