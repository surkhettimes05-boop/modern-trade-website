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
      await page.goto(route, { waitUntil: "domcontentloaded" });
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
    const firstCard = page.locator(".product-card").first();
    const href = await firstCard.locator("a").first().getAttribute("href");
    const productName = (await firstCard.locator("h3").textContent())?.trim();
    expect(href).toMatch(/^\/product\//);
    expect(productName).toBeTruthy();
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: productName!, exact: true })).toBeVisible({ timeout: 12_000 });
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
    await page.goto("/loyalty", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Pasalho Rewards" })).toBeVisible();
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
    await expect(page).toHaveURL(/\/operations\/dashboard$/);
    const accountMenu = page.getByRole("button", { name: /staff account menu/i });
    await expect(accountMenu).toContainText("Local Administrator");
    const isMobile = (page.viewportSize()?.width ?? 1280) < 640;
    if (!isMobile) await accountMenu.click();
    const logoutButton = page.getByRole("button", { name: /logout/i });
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();
    await expect(page).toHaveURL(/\/staff-login/);
  });
});


test("complete Pasalho COD order flow reconciles inventory and payment", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Run the transactional flow once against the shared QA database.",
  );

  const phone = process.env.QA_DEMO_OTP_PHONE || "9800000001";
  const otp = process.env.QA_DEMO_OTP_CODE || "654321";
  const qaPassword = process.env.QA_BOOTSTRAP_ADMIN_PASSWORD;
  if (!qaPassword) throw new Error("QA_BOOTSTRAP_ADMIN_PASSWORD is required");

  await page.context().clearCookies();
  await page.goto("/account?next=/shop");
  await page.getByLabel("Phone Number").fill(phone);
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByLabel("Enter OTP")).toBeVisible();
  await page.getByLabel("Enter OTP").fill(otp);
  await page.getByRole("button", { name: "Verify & Login" }).click();
  await expect(page).toHaveURL(/\/shop$/);

  await expect(page.getByText("Loading products...")).toHaveCount(0, { timeout: 12_000 });
  const product = page.locator(".product-card").first();
  await expect(product).toBeVisible();
  await product.getByRole("button", { name: /add to cart/i }).click();

  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("QA Pasalho Customer");
  await page.getByLabel("Phone", { exact: true }).fill(phone);
  await page.getByLabel("Complete address / tole / landmark").fill("QA Tole, Birendranagar");
  await expect(page.getByLabel("Municipality")).toContainText("Birendranagar Municipality");
  await page.getByLabel("Municipality").selectOption({ label: "Birendranagar Municipality" });
  await expect(page.getByLabel("Ward")).toContainText("Ward 1");
  await page.getByLabel("Ward").selectOption({ label: "Ward 1" });
  await page.getByLabel("Postal code").fill("21700");
  await expect(page.getByText(/Birendranagar launch zone/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Place COD order" }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]+$/i, { timeout: 15_000 });

  const orderId = page.url().split("/").pop();
  if (!orderId) throw new Error("Order id missing after checkout");

  const order = await page.evaluate(async (id) => {
    const response = await fetch(`/api/customer/orders/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not read order");
    return body;
  }, orderId) as {
    order_number: string;
    store_id: string;
    status: string;
    payment_status: string;
    items: Array<{ product_id: string; quantity: number }>;
  };

  expect(order.status).toBe("PENDING_PAYMENT");
  expect(order.items.length).toBeGreaterThan(0);
  const firstItem = order.items[0];

  await page.goto("/staff-login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill(qaPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/operations\/dashboard$/);

  const staffGet = async <T,>(url: string): Promise<T> =>
    page.evaluate(async (target) => {
      const csrf = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] || "";
      const response = await fetch(target, {
        credentials: "include",
        headers: { "x-csrf-token": csrf },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `GET ${target} failed`);
      return body;
    }, url) as Promise<T>;

  const reservationsBefore = await staffGet<Array<{ status: string }>>(
    `/api/web-orders/${orderId}/reservations`,
  );
  expect(reservationsBefore.every((row) => row.status === "ACTIVE")).toBe(true);

  const batchesBefore = await staffGet<Array<{ quantity: number }>>(
    `/api/batches/inventory?store_id=${order.store_id}&product_id=${firstItem.product_id}&limit=100`,
  );
  const inventoryBefore = batchesBefore.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  await page.goto("/operations/orders");
  await expect(page.getByText(order.order_number).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/SKU:/).first()).toBeVisible();

  await page.getByRole("button", { name: "ACCEPT & START ORDER" }).click();
  await expect(page.getByRole("button", { name: "Start picking" })).toBeVisible();
  await page.getByRole("button", { name: "Start picking" }).click();
  await expect(page.getByRole("button", { name: "Mark packed" })).toBeVisible();
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByRole("button", { name: "Send for delivery" })).toBeVisible();
  await page.getByRole("button", { name: "Send for delivery" }).click();
  await expect(page.getByRole("button", { name: "Confirm delivered + cash received" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm delivered + cash received" }).click();
  await expect(page.getByText(order.order_number)).toHaveCount(0, { timeout: 10_000 });

  const reservationsAfter = await staffGet<Array<{ status: string }>>(
    `/api/web-orders/${orderId}/reservations`,
  );
  expect(reservationsAfter.every((row) => row.status === "CONSUMED")).toBe(true);

  const batchesAfter = await staffGet<Array<{ quantity: number }>>(
    `/api/batches/inventory?store_id=${order.store_id}&product_id=${firstItem.product_id}&limit=100`,
  );
  const inventoryAfter = batchesAfter.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  expect(inventoryAfter).toBe(inventoryBefore - Number(firstItem.quantity));

  await page.goto(`/account/orders/${orderId}`);
  await expect(page.getByText("Status: DELIVERED")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Total: NPR/)).toBeVisible();
});
