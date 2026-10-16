import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { getMigrationDatabaseUrl } from "../config/environment.js";
import { runMigrations } from "./migrationRunner.js";

const execFileAsync = promisify(execFile);
const connectionString = getMigrationDatabaseUrl();
const backupConnectionString = process.env.DATABASE_BACKUP_URL;
if (!backupConnectionString) {
  throw new Error("DATABASE_BACKUP_URL is required for guarded production migrations");
}
const backupUrl = new URL(backupConnectionString);
const backupPassword = decodeURIComponent(backupUrl.password);
backupUrl.password = "";
const backupDir = process.env.DATABASE_BACKUP_DIR || "/var/backups/storesync";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDir}/storesync-${stamp}.dump`;

await mkdir(backupDir, { recursive: true });
await execFileAsync(
  process.env.PG_DUMP_BIN || "pg_dump",
  [
    "--dbname",
    backupUrl.toString(),
    "--format=custom",
    "--schema=public",
    "--file",
    backupPath,
  ],
  {
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PGPASSWORD: backupPassword },
  },
);
const applied = await runMigrations(connectionString);
console.log(
  JSON.stringify({ event: "database_migration_complete", backupPath, applied }),
);
