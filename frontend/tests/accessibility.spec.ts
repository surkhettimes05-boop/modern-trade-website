import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  "/",
  "/shop",
  "/product/premium-basmati-rice-5kg",
  "/account",
  "/staff-login",
  "/cart",
  "/checkout",
  "/account/orders",
  "/account/orders/00000000-0000-4000-8000-000000000001",
];

test.describe("accessibility release scan", () => {
  for (const route of pages) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      );
      console.log(`${route}: ${serious.map((violation) => `${violation.id}(${violation.nodes.length})`).join(", ") || "none"}`);
      await test.info().attach("axe-results", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      expect(serious, `${route} accessibility violations`).toEqual([]);
    });
  }
});
