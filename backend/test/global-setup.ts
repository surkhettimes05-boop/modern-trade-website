import pg from "pg";
import { mkdtemp, writeFile } from "node:fs/promises";
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
  execFileSync(initdb, ["-D", dataPath, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { timeout: 60_000 });
  let ready = false;
  try {
    execFileSync(pgIsReady, ["-h", "127.0.0.1", "-p", String(TEST_PG_PORT), "-d", "postgres"], { timeout: 3_000 });
    ready = true;
  } catch {
    const server = spawn(postgres, ["-D", dataPath, "-p", String(TEST_PG_PORT), "-h", "127.0.0.1", "-c", "logging_collector=off"], { detached: true, stdio: "ignore", windowsHide: true });
    server.unref();
  }
  // PostgreSQL may need time for crash recovery on Windows after a killed test run.
  // Keep this bounded while allowing the recovery window to complete.
  for (let attempt = 0; attempt < 240 && !ready; attempt++) {
    await sleep(250);
    try {
      execFileSync(pgIsReady, ["-h", "127.0.0.1", "-p", String(TEST_PG_PORT), "-d", "postgres"], { timeout: 1_000 });
      ready = true;
    } catch {}
  }
  if (!ready) throw new Error("Dedicated PostgreSQL test cluster did not become ready within 60 seconds");
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
