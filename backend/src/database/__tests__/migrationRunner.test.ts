import {
  LATEST_MIGRATION_ID,
  legacyBaselineMigrations,
} from "../migrationRunner.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legacy migration baseline", () => {
  it("never marks post-baseline migrations as already applied", () => {
    const manifest: Array<[string, string]> = [
      ["001_public_content", "001.sql"],
      ["012_organization_market_configuration", "012.sql"],
      ["013_storefront_catalog", "013.sql"],
      [LATEST_MIGRATION_ID, "026.sql"],
      ["027_future_security_change", "027.sql"],
    ];

    expect(legacyBaselineMigrations(manifest).map(([id]) => id)).toEqual([
      "001_public_content",
      "012_organization_market_configuration",
    ]);
  });
});

describe("deployed payment migration continuity", () => {
  it("keeps the original applied migration ID, file, and checksum", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/database/migrations.json"), "utf8"),
    ) as Array<[string, string]>;
    const migrationId = "042_payment_intent_runtime_contract";
    const matches = manifest.filter(([id]) => id === migrationId);
    expect(matches).toEqual([
      [migrationId, "../database/042_payment_intent_runtime_contract.sql"],
    ]);
    const sql = readFileSync(
      resolve(process.cwd(), "../database/042_payment_intent_runtime_contract.sql"),
      "utf8",
    );
    // Changing this deployed SQL would invalidate existing schema_migrations checksums.
    expect(createHash("sha256").update(sql).digest("hex")).toBe(
      "ee026ed68a5cc10bedaf9e9d6aa904d747ff5c7e38246c21d5ddabe58afeff44",
    );
    expect(new Set(manifest.map(([id]) => id)).size).toBe(manifest.length);
  });
});
