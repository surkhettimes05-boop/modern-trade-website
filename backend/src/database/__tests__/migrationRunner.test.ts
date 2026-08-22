import {
  LATEST_MIGRATION_ID,
  legacyBaselineMigrations,
} from "../migrationRunner.js";

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
