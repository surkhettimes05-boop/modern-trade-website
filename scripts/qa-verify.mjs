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

try {
  execFileSync("docker", ["version"], { stdio: "ignore" });
} catch {
  throw new Error(
    "Docker is unavailable. Install/start Docker Desktop with Linux containers, then rerun npm run qa:up.",
  );
}

function runDocker(args) {
  return execFileSync("docker", [...compose, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: composeEnv,
  }).trim();
}

async function checkHttp(label, url, attempts = 20) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return `${label}: HTTP ${response.status}`;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(
    `${label} did not become ready after ${attempts} attempts`,
    { cause: lastError },
  );
}

const results = [];
results.push(
  await checkHttp(
    "backend readiness",
    "http://localhost:53001/api/health/ready",
  ),
);
results.push(await checkHttp("frontend", "http://localhost:53000/"));
results.push(
  await checkHttp(
    "frontend-to-backend proxy",
    "http://localhost:53000/api/health/ready",
  ),
);

const postgres = runDocker([
  "exec",
  "-T",
  "postgres",
  "psql",
  "-U",
  "storesync_migrator",
  "-d",
  "storesync_qa",
  "-Atc",
  "SELECT count(*) FROM schema_migrations; SELECT to_regclass('public.order_events'); SELECT count(*) FROM stores; SELECT count(*) FROM staff;",
]);
const postgresLines = postgres
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (postgresLines.join("\n") !== "21\norder_events\n2\n1") {
  throw new Error(`Unexpected PostgreSQL QA verification output:\n${postgres}`);
}
results.push("PostgreSQL: 21 migrations, order_events, 2 stores, 1 staff");

const roleVerification = runDocker([
  "exec",
  "-T",
  "backend",
  "npm",
  "run",
  "verify:database-role",
]);
if (!roleVerification.includes("Runtime database role posture verified")) {
  throw new Error(`Runtime role verification failed:\n${roleVerification}`);
}
results.push("PostgreSQL runtime role: non-owner and DDL-restricted");

if (runDocker(["exec", "-T", "redis", "redis-cli", "ping"]) !== "PONG") {
  throw new Error("Redis did not return PONG");
}
results.push("Redis: PONG");

console.log(results.join("\n"));
