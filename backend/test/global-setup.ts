import pg from "pg";
import { mkdtemp, writeFile, open, readFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertDedicatedTestTarget, postgresBinary, TEST_PG_PORT, testUrl } from "./database-config";
import { runMigrations } from "../src/database/migrationRunner";

const sleep = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  assertDedicatedTestTarget(testUrl);
  if (process.env.TEST_DATABASE_URL) {
    await runMigrations(testUrl);
    return;
  }
  const initdb = postgresBinary("initdb");
  const pgIsReady = postgresBinary("pg_isready");
  const postgres = postgresBinary("postgres");
  const dataPath = await mkdtemp(join(tmpdir(), "storesync-jest-postgres-"));
  await writeFile(join(process.cwd(), ".test-postgres-data-path"), dataPath, "utf8");
  execFileSync(initdb, ["-D", dataPath, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { timeout: 180_000 });
  const logPath = join(dataPath, "postgres-startup.log");
  const logFile = await open(logPath, "a");
  let ready = false;
  let exitDetails: string | null = null;
  let portAlreadyAccepting = false;
  try {
    execFileSync(pgIsReady, ["-h", "127.0.0.1", "-p", String(TEST_PG_PORT), "-d", "postgres"], { timeout: 3_000 });
    portAlreadyAccepting = true;
  } catch {}
  if (portAlreadyAccepting) {
    await logFile.close();
    throw new Error(`Dedicated PostgreSQL test port ${TEST_PG_PORT} is already accepting connections; refusing to reuse an unverified server.`);
  }
  // A port conflict or startup error must be visible in the test output.
  const server = spawn(postgres, ["-D", dataPath, "-p", String(TEST_PG_PORT), "-h", "127.0.0.1", "-c", "logging_collector=off"], {
    detached: true,
    stdio: ["ignore", logFile.fd, logFile.fd],
    windowsHide: true,
  });
  server.on("error", (error) => { exitDetails = `spawn error: ${error.message}`; });
  server.on("exit", (code, signal) => { exitDetails = `exit code=${code}, signal=${signal}`; });
  server.unref();
  await logFile.close();
  for (let attempt = 0; attempt < 240 && !ready; attempt++) {
    if (exitDetails) break;
    await sleep(250);
    try {
      execFileSync(pgIsReady, ["-h", "127.0.0.1", "-p", String(TEST_PG_PORT), "-d", "postgres"], { timeout: 1_000 });
      ready = true;
    } catch {}
  }
  if (!ready) {
    const log = await readFile(logPath, "utf8").catch(() => "<unable to read PostgreSQL log>");
    throw new Error(`Dedicated PostgreSQL test cluster did not become ready within 60 seconds.${exitDetails ? ` Server ${exitDetails}.` : ""}\nPostgreSQL startup log:\n${log}`);
  }
  const admin = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${TEST_PG_PORT}/postgres` });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'storesync_jest_test'");
    if (!existing.rowCount) await admin.query("CREATE DATABASE storesync_jest_test");
  } finally {
    await admin.end();
  }
  await runMigrations(testUrl);
}
