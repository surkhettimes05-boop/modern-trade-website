import { execFileSync } from "node:child_process";

const compose = ["compose", "-f", "docker-compose.qa.yml"];

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
  }).trim();
}

async function checkHttp(label, url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${label} returned HTTP ${response.status}`);
  return `${label}: HTTP ${response.status}`;
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
  "storesync_qa",
  "-d",
  "storesync_qa",
  "-Atc",
  "SELECT count(*) FROM schema_migrations; SELECT to_regclass('public.order_events'); SELECT count(*) FROM stores; SELECT count(*) FROM staff;",
]);
const postgresLines = postgres
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (postgresLines.join("\n") !== "17\norder_events\n2\n1") {
  throw new Error(`Unexpected PostgreSQL QA verification output:\n${postgres}`);
}
results.push("PostgreSQL: 17 migrations, order_events, 2 stores, 1 staff");

if (runDocker(["exec", "-T", "redis", "redis-cli", "ping"]) !== "PONG") {
  throw new Error("Redis did not return PONG");
}
results.push("Redis: PONG");

console.log(results.join("\n"));
