import { execFileSync } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { postgresBinary } from "./database-config";

export default async function globalTeardown() {
  if (process.env.TEST_DATABASE_URL) return;
  try {
    const dataPath = (await readFile(`${process.cwd()}/.test-postgres-data-path`, "utf8")).trim();
    execFileSync(postgresBinary("pg_ctl"), ["-D", dataPath, "-m", "fast", "stop"], { timeout: 30_000 });
    await unlink(`${process.cwd()}/.test-postgres-data-path`);
  } catch {
    // The cluster may already be stopped; the marker is intentionally retained for diagnosis.
  }
}
