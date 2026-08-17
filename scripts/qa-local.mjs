import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";

const root = process.cwd();
const backend = `${root}/backend`;
const frontend = `${root}/frontend`;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const databaseName = process.env.LOCAL_QA_DATABASE || "storesync_local_qa";
const databaseUrl = process.env.LOCAL_QA_DATABASE_URL || `postgresql://postgres@127.0.0.1:5432/${databaseName}`;
const backendPort = 3001;
const frontendPort = 3032;

if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName)) {
  throw new Error(`Invalid LOCAL_QA_DATABASE name: ${databaseName}`);
}

const localEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: "false",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  REDIS_NAMESPACE: "storesync-local-qa",
  PORT: String(backendPort),
  HOST: "127.0.0.1",
  CORS_ORIGIN: `http://127.0.0.1:${frontendPort}`,
  ENABLE_ADMIN_API: "true",
  JWT_SECRET: process.env.LOCAL_QA_JWT_SECRET || "local-qa-jwt-secret-do-not-use-in-production",
  COOKIE_SECRET: process.env.LOCAL_QA_COOKIE_SECRET || "local-qa-cookie-secret-do-not-use-in-production",
  ENCRYPTION_KEY: process.env.LOCAL_QA_ENCRYPTION_KEY || "local-qa-encryption-key-32-bytes!",
  SIGNATURE_SECRET: process.env.LOCAL_QA_SIGNATURE_SECRET || "local-qa-signature-secret-32-bytes!",
  PAYMENT_ENCRYPTION_KEY: process.env.LOCAL_QA_PAYMENT_ENCRYPTION_KEY || "0".repeat(64),
};

function run(command, args, cwd, env = localEnv, options = {}) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function runQuiet(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`${label}: HTTP ${response.status}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms (${lastError})`);
}

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" });
  child.on("error", (error) => console.error(`${command} failed:`, error));
  return child;
}

const children = [];
const cleanup = async () => {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill();
  }
  await Promise.all(children.map((child) => once(child, "exit").catch(() => undefined)));
};

try {
  if (!runQuiet("pg_isready", ["-h", "127.0.0.1", "-p", "5432", "-d", "postgres"])) {
    throw new Error("PostgreSQL is not ready on 127.0.0.1:5432");
  }
  if (runQuiet("memurai-cli", ["ping"]) !== "PONG") throw new Error("Memurai did not return PONG");
  console.log("Native services: PostgreSQL ready; Memurai PONG");

  try {
    runQuiet("psql", ["-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", "postgres", "-Atc", `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`]);
  } catch {
    throw new Error("Could not connect to PostgreSQL as postgres. Check the local service authentication.");
  }
  const exists = runQuiet("psql", ["-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", "postgres", "-Atc", `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`]);
  if (exists !== "1") run("psql", ["-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE ${databaseName}`], root);

  run(npm, ["run", "db:migrate"], backend, localEnv);
  run(npm, ["run", "seed"], backend, localEnv);

  children.push(start(npm, ["run", "dev"], backend, localEnv));
  await waitFor(`http://127.0.0.1:${backendPort}/api/health/ready`, "Backend readiness");

  const frontendEnv = { ...process.env, API_URL: `http://127.0.0.1:${backendPort}`, NODE_ENV: "production", NEXT_LOCAL_QA: "1" };
  run(npm, ["run", "build"], frontend, frontendEnv, { timeout: 180_000 });
  children.push(start(npm, ["run", "start:next", "--", "-p", String(frontendPort)], frontend, frontendEnv));
  await waitFor(`http://127.0.0.1:${frontendPort}/`, "Frontend");
  await waitFor(`http://127.0.0.1:${frontendPort}/api/health/ready`, "Frontend-to-backend proxy");

  const browserEnv = { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${frontendPort}` };
  run(npm, ["exec", "--", "playwright", "test", "--project=chromium-desktop", "--reporter=line"], frontend, browserEnv, { timeout: 180_000 });
  run(npm, ["exec", "--", "playwright", "test", "tests/accessibility.spec.ts", "--project=chromium-desktop", "--reporter=line"], frontend, browserEnv, { timeout: 180_000 });
  console.log("Native QA verification passed");
} finally {
  await cleanup();
}
