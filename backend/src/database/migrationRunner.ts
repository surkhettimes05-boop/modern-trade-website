import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

export const LATEST_MIGRATION_ID = "026_hash_session_tokens";

// Databases created before schema_migrations was introduced already contain
// this fixed baseline. Never derive the baseline from the current manifest:
// doing so would mark future migrations as applied without running them.
const LEGACY_BASELINE_MIGRATION_IDS = new Set([
  "001_public_content",
  "002_customer_loyalty",
  "003_ecommerce",
  "004_analytics",
  "005_payment_expansion",
  "006_commerce_expansion",
  "007_offline_devices",
  "008_operations",
  "009_pos_offline",
  "010_compliance",
  "011_capability_scope",
  "012_organization_market_configuration",
]);

export function legacyBaselineMigrations(
  migrations: Array<[string, string]>,
): Array<[string, string]> {
  return migrations.filter(([id]) => LEGACY_BASELINE_MIGRATION_IDS.has(id));
}

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
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : false,
  });
  const applied: string[] = [];
  try {
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const migrationState = await client.query(
      `SELECT COUNT(*)::int AS count,
              to_regtype('public.publication_status') IS NOT NULL AS has_legacy_schema
       FROM schema_migrations`,
    );
    if (
      migrationState.rows[0].count === 0 &&
      migrationState.rows[0].has_legacy_schema
    ) {
      // This project was initialized before schema_migrations existed. The
      // schema marker proves the numbered baseline is already present, so
      // record checksums and continue with any future migrations.
      for (const [id, relativePath] of legacyBaselineMigrations(
        canonicalMigrations,
      )) {
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
        await client.query(
          "INSERT INTO schema_migrations (migration_id, checksum) VALUES ($1, $2)",
          [id, checksum],
        );
        applied.push(id);
      }
    }
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
