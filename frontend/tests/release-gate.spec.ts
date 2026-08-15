import { expect, test } from "@playwright/test";

const criticalRoutes = [
  "/",
  "/shop",
  "/products",
  "/offers",
  "/cart",
  "/checkout",
  "/account",
  "/account/dashboard",
  "/account/orders",
];

test.describe("release browser gate", () => {
  test("critical routes load without browser errors or failed requests", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const serverErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });

    for (const route of criticalRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
    }

    await test.info().attach("runtime-issues", {
      body: JSON.stringify({ consoleErrors, pageErrors, failedRequests, serverErrors }, null, 2),
      contentType: "application/json",
    });
    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(pageErrors, "uncaught page exceptions").toEqual([]);
    expect(failedRequests, "failed network requests").toEqual([]);
    expect(serverErrors, "HTTP 500+ responses").toEqual([]);
  });

  test("storefront browsing and cart persistence work", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    const firstProduct = page.locator(".product-card").first();
    await expect(page.getByText("Loading products...")).toHaveCount(0, { timeout: 12_000 });
    await expect(firstProduct).toBeVisible({ timeout: 12_000 });
    const productHref = await firstProduct.locator("a").first().getAttribute("href");
    expect(productHref).toMatch(/^\/product\//);
    await firstProduct.getByRole("button", { name: /add to cart/i }).click();
    await expect(page.getByRole("button", { name: /cart with 1 item/i })).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await page.getByRole("button", { name: /increase quantity/i }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /decrease quantity/i })).toBeVisible();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("product detail, navigation, protected-page redirect, and keyboard focus work", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByText("Loading products...")).toHaveCount(0, { timeout: 12_000 });
    const href = await page.locator(".product-card a").first().getAttribute("href");
    expect(href).toMatch(/^\/product\//);
    await page.goto("/product/premium-basmati-rice-5kg", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /premium basmati rice/i })).toBeVisible({ timeout: 12_000 });
    await page.getByRole("button", { name: /zoom product image/i }).click();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Close" })).toBeHidden();

    await page.goto("/account/dashboard");
    await expect(page).toHaveURL(/\/account(?:\?next=\/account\/dashboard)?$/);
    await page.goto("/account");
    await page.getByLabel(/phone/i).focus();
    await expect(page.getByLabel(/phone/i)).toBeFocused();
  });
});
