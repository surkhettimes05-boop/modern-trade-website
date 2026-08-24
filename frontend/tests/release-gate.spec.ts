import { expect, test } from "@playwright/test";

const criticalRoutes = [
  "/",
  "/shop",
  "/products",
  "/offers",
  "/loyalty",
  "/cart",
  "/checkout",
  "/whatsapp-order",
  "/account",
  "/account/addresses",
  "/account/dashboard",
  "/account/orders",
];

test.describe("release browser gate", () => {
  test("critical routes load without browser errors or failed requests", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedClientErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText || "failed";
      const isCancelledNextPrefetch = errorText.includes("ERR_ABORTED") && request.url().includes("_rsc=");
      if (!isCancelledNextPrefetch) failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      if (
        response.status() >= 400 &&
        response.status() < 500 &&
        !([401, 403].includes(response.status()) && /\/api\/(auth|customer)\/|\/api\/loyalty\/me/.test(response.url()))
      ) {
        unexpectedClientErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    for (const route of criticalRoutes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
    }

    await test.info().attach("runtime-issues", {
      body: JSON.stringify({ consoleErrors, pageErrors, failedRequests, unexpectedClientErrors, serverErrors }, null, 2),
      contentType: "application/json",
    });
    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(pageErrors, "uncaught page exceptions").toEqual([]);
    expect(failedRequests, "failed network requests").toEqual([]);
    expect(unexpectedClientErrors, "unexpected HTTP 400 responses").toEqual([]);
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
    await expect(page.getByRole("button", { name: /cart.*1/i })).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /increase quantity/i }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /decrease quantity/i })).toBeVisible();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("guest can prepare a complete WhatsApp order request", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading products...")).toHaveCount(0, { timeout: 12_000 });
    await page.locator(".product-card").first().getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/whatsapp-order");

    await page.getByLabel("Full name").fill("Ram Sharma");
    await page.getByLabel("Delivery phone").fill("9812345678");
    await page.getByLabel("Complete address").fill("Baneshwor, Kathmandu");
    await page.getByLabel(/Google Maps link/i).fill("https://maps.google.com/?q=27.6915,85.3420");
    await page.getByLabel(/Delivery notes/i).fill("Call before delivery");
    await page.getByRole("button", { name: "Review WhatsApp message" }).click();

    await expect(page.getByRole("heading", { name: "Ready to open WhatsApp" })).toBeVisible();
    await expect(page.getByLabel("Prepared WhatsApp message")).toContainText("Ram Sharma");
    await expect(page.getByLabel("Prepared WhatsApp message")).toContainText("Baneshwor, Kathmandu");
    const href = await page.getByRole("link", { name: /Open WhatsApp/i }).getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/9779822403262\?text=/);
    expect(decodeURIComponent(href || "")).toContain("Delivery charge: To be confirmed");
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

  test("loyalty is active and fails closed without a verified customer session", async ({ page }) => {
    await page.goto("/loyalty", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "StoreSync Rewards" })).toBeVisible();
    await expect(page.getByText("Sign in with your Nepal mobile number and OTP to view loyalty.", { exact: true })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  });

  test("staff pages reject a request without a staff session cookie", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/operations");
    await expect(page).toHaveURL(/\/staff-login\?next=%2Foperations$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/staff-login\?next=%2Fadmin$/);
  });

  test("staff can sign in, access scoped operations, and sign out", async ({ page }) => {
    const qaPassword = process.env.QA_BOOTSTRAP_ADMIN_PASSWORD;
    if (!qaPassword) {
      throw new Error("QA_BOOTSTRAP_ADMIN_PASSWORD is required for the staff release gate");
    }
    await page.goto("/staff-login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill(qaPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/operations/);
    const accountMenu = page.getByRole("button", { name: /staff account menu/i });
    await expect(accountMenu).toContainText("Local Administrator");
    await accountMenu.click();
    await page.getByRole("button", { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/staff-login/);
  });
});
