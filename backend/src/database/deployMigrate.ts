import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { getDatabaseUrl, getMigrationDatabaseUrl } from "../config/environment.js";
import { runMigrations } from "./migrationRunner.js";

const execFileAsync = promisify(execFile);
const connectionString = getMigrationDatabaseUrl();
const backupConnectionString = getDatabaseUrl();
const backupDir = process.env.DATABASE_BACKUP_DIR || "/var/backups/storesync";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDir}/storesync-${stamp}.dump`;

await mkdir(backupDir, { recursive: true });
await execFileAsync(
  process.env.PG_DUMP_BIN || "pg_dump",
  [
    "--dbname",
    backupConnectionString,
    "--format=custom",
    "--schema=public",
    "--file",
    backupPath,
  ],
  {
    maxBuffer: 1024 * 1024,
    env: process.env,
  },
);
const applied = await runMigrations(connectionString);
console.log(
  JSON.stringify({ event: "database_migration_complete", backupPath, applied }),
);
