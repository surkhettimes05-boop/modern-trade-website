import { execFileSync } from "node:child_process";

const compose = ["compose", "-f", "docker-compose.qa.yml"];
const docker = (args) =>
  execFileSync("docker", [...compose, ...args], { stdio: "inherit" });

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
