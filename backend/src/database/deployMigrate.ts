import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { getMigrationDatabaseUrl } from "../config/environment.js";
import { runMigrations } from "./migrationRunner.js";

const execFileAsync = promisify(execFile);
const connectionString = getMigrationDatabaseUrl();
const backupDir = process.env.DATABASE_BACKUP_DIR || "/var/backups/storesync";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDir}/storesync-${stamp}.dump`;

await mkdir(backupDir, { recursive: true });
const databaseUrl = new URL(connectionString);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
const sslMode =
  databaseUrl.searchParams.get("sslmode") ??
  (process.env.DATABASE_SSL === "true" ? "require" : undefined);

await execFileAsync(
  process.env.PG_DUMP_BIN || "pg_dump",
  ["--format=custom", "--schema=public", "--file", backupPath],
  {
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PGHOST: databaseUrl.hostname,
      PGPORT: databaseUrl.port || "5432",
      PGUSER: decodeURIComponent(databaseUrl.username),
      PGPASSWORD: decodeURIComponent(databaseUrl.password),
      PGDATABASE: databaseName,
      ...(sslMode ? { PGSSLMODE: sslMode } : {}),
    },
  },
);
const applied = await runMigrations(connectionString);
console.log(
  JSON.stringify({ event: "database_migration_complete", backupPath, applied }),
);
