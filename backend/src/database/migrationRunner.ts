import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

export async function runMigrations(
  connectionString: string,
): Promise<string[]> {
  const candidates = [
    resolve(process.cwd(), "src/database/migrations.json"),
    resolve(process.cwd(), "dist/database/migrations.json"),
  ];
  let manifestPath = candidates[0];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      manifestPath = candidate;
      break;
    } catch {
      /* try next layout */
    }
  }
  const canonicalMigrations = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Array<[string, string]>;
  const client = new pg.Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });
  const applied: string[] = [];
  try {
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const [id, relativePath] of canonicalMigrations) {
      const sqlPath = relativePath.startsWith("../database/")
        ? resolve(
            process.cwd(),
            "..",
            "database",
            relativePath.replace("../database/", ""),
          )
        : relativePath.startsWith("src/database/") &&
            manifestPath.includes(`${resolve(process.cwd(), "dist")}`)
          ? resolve(
              process.cwd(),
              "dist/database",
              relativePath.replace("src/database/", ""),
            )
          : resolve(process.cwd(), relativePath);
      const sql = await readFile(sqlPath, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const prior = await client.query(
        "SELECT checksum FROM schema_migrations WHERE migration_id = $1",
        [id],
      );
      if (prior.rowCount) {
        if (prior.rows[0].checksum !== checksum)
          throw new Error(`Checksum mismatch for applied migration ${id}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (migration_id, checksum) VALUES ($1, $2)",
          [id, checksum],
        );
        await client.query("COMMIT");
        applied.push(id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}
