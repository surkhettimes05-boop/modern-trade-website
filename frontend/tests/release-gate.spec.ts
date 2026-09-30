import { expect, test, type Page } from "@playwright/test";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const BRANCH_ID = "44444444-4444-4444-8444-444444444444";
const ZONE_ID = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ID = "66666666-6666-4666-8666-666666666666";
const CART_TOKEN = "77777777-7777-4777-8777-777777777777";
const CART_ITEM_ID = "88888888-8888-4888-8888-888888888888";
const ADDRESS_ID = "99999999-9999-4999-8999-999999999999";
const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function envelope(data: unknown) {
  return { success: true, data };
}

async function mockPasalhoCommerce(
  page: Page,
  options: { authenticated?: boolean } = {},
) {
  let authenticated = options.authenticated ?? false;
  let cartQty = 0;
  let hasAddress = false;
  let orderPlaced = false;

  const rawProduct = {
    id: PRODUCT_ID,
    skuCode: "WW-NOODLES-75G",
    slug: "wai-wai-quick-noodles-75g",
    name: "Wai Wai Quick Noodles 75g",
    shortDescription: "Everyday instant noodles.",
    imageUrl: "/placeholder-product.svg",
    defaultUnitId: UNIT_ID,
    packLabel: "75 g",
    category: { id: CATEGORY_ID, name: "Instant noodles", slug: "instant-noodles" },
    brand: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Wai Wai" },
    price: { sellingPrice: 25, mrp: 30 },
    availability: {
      state: "AVAILABLE",
      sellableBaseQuantity: 100,
      maxOrderQuantity: 10,
    },
  };

  const cart = () => ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    cartToken: CART_TOKEN,
    customerId: authenticated ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd" : null,
    inventoryLocationId: LOCATION_ID,
    serviceZoneId: ZONE_ID,
    status: "ACTIVE",
    currency: "NPR",
    items:
      cartQty > 0
        ? [
            {
              id: CART_ITEM_ID,
              productId: PRODUCT_ID,
              unitId: UNIT_ID,
              quantity: cartQty,
              product: {
                id: PRODUCT_ID,
                name: rawProduct.name,
                skuCode: rawProduct.skuCode,
                imageUrl: rawProduct.imageUrl,
              },
              unit: { id: UNIT_ID, symbol: "pcs", name: "Piece" },
              price: { sellingPrice: 25, mrp: 30 },
              availability: { state: "AVAILABLE", maxOrderQuantity: 10 },
              lineTotal: cartQty * 25,
            },
          ]
        : [],
    subtotal: cartQty * 25,
    discountTotal: 0,
    deliveryFee: 50,
    grandTotal: cartQty * 25 + (cartQty ? 50 : 0),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    changes: [],
    checkoutAllowed: cartQty > 0,
  });

  const customer = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    phone: "+9779812345678",
    fullName: "Ram Sharma",
    email: null,
    status: "ACTIVE",
  };

  const address = {
    id: ADDRESS_ID,
    customerId: customer.id,
    label: "HOME",
    customLabel: null,
    recipientName: "Ram Sharma",
    phone: customer.phone,
    province: "Karnali Province",
    district: "Surkhet",
    municipality: "Birendranagar",
    ward: "6",
    area: "Itram",
    street: null,
    landmark: "Near main road",
    latitude: 28.6,
    longitude: 81.6,
    instructions: null,
    isDefault: true,
  };

  const order = () => ({
    id: ORDER_ID,
    orderNo: "ORD-TEST-1",
    status: orderPlaced ? "PLACED" : "PLACED",
    grandTotal: 75,
    deliveryFee: 50,
    createdAt: new Date().toISOString(),
    placedAt: new Date().toISOString(),
    fulfillmentLocation: { id: LOCATION_ID, name: "Pasalho Birendranagar" },
    items: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        quantity: 1,
        lineTotal: 25,
        product: {
          id: PRODUCT_ID,
          name: rawProduct.name,
          imageUrl: rawProduct.imageUrl,
        },
        unit: { symbol: "pcs", name: "Piece" },
      },
    ],
    statusEvents: [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        fromStatus: null,
        toStatus: "PLACED",
        createdAt: new Date().toISOString(),
        note: null,
      },
    ],
  });

  await page.route("**/api/commerce/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/commerce\/?/, "");
    const method = request.method();

    const ok = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(envelope(data)),
      });
    const error = (message: string, status: number) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: { message } }),
      });

    if (path === "serviceability/resolve" && method === "POST") {
      return ok({
        serviceable: true,
        serviceZone: { id: ZONE_ID, code: "BIR-PILOT", name: "Birendranagar Pilot" },
        fulfillment: {
          locationId: LOCATION_ID,
          branchId: BRANCH_ID,
          storeName: "Pasalho Birendranagar",
          branchName: "Pasalho Birendranagar",
        },
        delivery: {
          etaMinMinutes: 30,
          etaMaxMinutes: 45,
          deliveryFee: 50,
          freeDeliveryThreshold: 999,
          minOrder: 0,
        },
      });
    }

    if (path === "categories" && method === "GET") {
      return ok([
        {
          id: CATEGORY_ID,
          name: "Instant noodles",
          slug: "instant-noodles",
          imageUrl: null,
        },
      ]);
    }

    if ((path === "products" || path === "search") && method === "GET") {
      return ok({ items: [rawProduct], total: 1, page: 1, limit: 60 });
    }

    if (path === "carts" && method === "POST") return ok(cart(), 201);
    if (path === `carts/${CART_TOKEN}` && method === "GET") return ok(cart());

    if (path === `carts/${CART_TOKEN}/items` && method === "POST") {
      const body = request.postDataJSON() as { quantity?: number };
      cartQty += Number(body.quantity || 1);
      return ok(cart());
    }

    if (
      path === `carts/${CART_TOKEN}/items/${CART_ITEM_ID}` &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON() as { quantity?: number };
      cartQty = Number(body.quantity || 0);
      return ok(cart());
    }

    if (
      path === `carts/${CART_TOKEN}/items/${CART_ITEM_ID}` &&
      method === "DELETE"
    ) {
      cartQty = 0;
      return ok(cart());
    }

    if (path === "auth/request-otp" && method === "POST") {
      return ok({ challengeId: "otp-challenge", expiresInSeconds: 300 });
    }

    if (path === "auth/verify-otp" && method === "POST") {
      authenticated = true;
      return ok({ customer });
    }

    if (path === "auth/refresh" && method === "POST") {
      return authenticated ? ok({}) : error("Customer authentication required", 401);
    }

    if (path === "auth/logout" && method === "POST") {
      authenticated = false;
      return ok({ message: "Logged out" });
    }

    if (path === "me" && method === "GET") {
      return authenticated ? ok(customer) : error("Sign in to continue.", 401);
    }

    if (path === "me/addresses" && method === "GET") {
      return authenticated ? ok(hasAddress ? [address] : []) : error("Sign in to continue.", 401);
    }

    if (path === "me/addresses" && method === "POST") {
      if (!authenticated) return error("Sign in to continue.", 401);
      hasAddress = true;
      return ok(address, 201);
    }

    if (path === "checkout/preview" && method === "POST") {
      return ok({
        fulfillmentLocationId: LOCATION_ID,
        serviceZoneId: ZONE_ID,
        items: [],
        subtotal: 25,
        discountTotal: 0,
        deliveryFee: 50,
        handlingFee: 0,
        grandTotal: 75,
        etaMinMinutes: 30,
        etaMaxMinutes: 45,
        paymentMethod: "COD",
        checkoutToken: "checkout-token-for-test",
      });
    }

    if (path === "orders" && method === "POST") {
      orderPlaced = true;
      cartQty = 0;
      return ok(
        {
          id: ORDER_ID,
          orderNo: "ORD-TEST-1",
          status: "PLACED",
          grandTotal: 75,
        },
        201,
      );
    }

    if (path === "orders" && method === "GET") {
      return authenticated
        ? ok({ items: orderPlaced ? [order()] : [], total: orderPlaced ? 1 : 0, page: 1, limit: 30 })
        : error("Sign in to continue.", 401);
    }

    if (path === `orders/${ORDER_ID}` && method === "GET") {
      return authenticated ? ok(order()) : error("Sign in to continue.", 401);
    }

    if (path === `orders/${ORDER_ID}/cancel` && method === "POST") {
      return ok({ id: ORDER_ID, orderNo: "ORD-TEST-1", status: "CANCELLED" });
    }

    return error(`Unhandled test commerce route: ${method} ${path}`, 500);
  });

  return {
    authenticate() {
      authenticated = true;
    },
  };
}

async function selectDeliveryLocation(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 28.6, longitude: 81.6 });
  await page.getByRole("button", { name: /choose your area|set delivery location/i }).first().click();
  await page.getByRole("button", { name: /use my current location/i }).click();
  await expect(page.getByText("Pasalho Birendranagar").first()).toBeVisible();
}

const criticalRoutes = [
  "/",
  "/shop",
  "/offers",
  "/stores",
  "/cart",
  "/checkout",
  "/account",
  "/account/orders",
  "/faq",
  "/services",
  "/staff-login",
];

test.describe("release browser gate", () => {
  test("critical routes load without browser errors or failed requests", async ({ page }) => {
    await mockPasalhoCommerce(page, { authenticated: true });

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
      const isCancelledNextPrefetch =
        errorText.includes("ERR_ABORTED") && request.url().includes("_rsc=");
      if (!isCancelledNextPrefetch) {
        failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
      if (
        response.status() >= 400 &&
        response.status() < 500 &&
        !(
          [401, 403].includes(response.status()) &&
          /\/api\/(auth|customer|commerce)\//.test(response.url())
        )
      ) {
        unexpectedClientErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    for (const route of criticalRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
    }

    await test.info().attach("runtime-issues", {
      body: JSON.stringify(
        { consoleErrors, pageErrors, failedRequests, unexpectedClientErrors, serverErrors },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(pageErrors, "uncaught page exceptions").toEqual([]);
    expect(failedRequests, "failed network requests").toEqual([]);
    expect(unexpectedClientErrors, "unexpected HTTP 400 responses").toEqual([]);
    expect(serverErrors, "HTTP 500+ responses").toEqual([]);
  });

  test("location-scoped catalog and server cart persist across reload", async ({ page }) => {
    await mockPasalhoCommerce(page);
    await page.goto("/shop", { waitUntil: "domcontentloaded" });

    await selectDeliveryLocation(page);
    const firstProduct = page.locator(".product-card").first();
    await expect(firstProduct).toContainText("Wai Wai Quick Noodles 75g");
    await firstProduct.getByRole("button", { name: "ADD" }).click();
    await expect(page.getByRole("button", { name: /cart with 1 item/i })).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Review your items" })).toBeVisible();
    await page.getByRole("button", { name: /increase quantity/i }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /decrease quantity/i })).toBeVisible();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await page.getByRole("button", { name: /decrease quantity/i }).click();
    await expect(page.getByRole("heading", { name: /basket is empty/i })).toBeVisible();
  });

  test("customer can sign in and place an idempotent COD order", async ({ page }) => {
    await mockPasalhoCommerce(page);
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await selectDeliveryLocation(page);

    await page.locator(".product-card").first().getByRole("button", { name: "ADD" }).click();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Sign in to checkout" })).toBeVisible();
    await page.getByRole("link", { name: /sign in with otp/i }).click();

    await page.getByLabel("Mobile number").fill("9812345678");
    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.getByLabel("6-digit OTP").fill("123456");
    await page.getByRole("button", { name: /verify & continue/i }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await page.getByLabel("Recipient name").fill("Ram Sharma");
    await page.getByLabel("Area / tole").fill("Itram");
    await page.getByLabel("Landmark").fill("Near main road");
    await page.getByRole("button", { name: "Save address" }).click();

    await expect(page.getByText(/30–45 min estimate/i)).toBeVisible();
    await page.getByRole("button", { name: "Place COD order" }).click();

    await expect(page).toHaveURL(new RegExp(`/account/orders/${ORDER_ID}$`));
    await expect(page.getByRole("heading", { name: "ORD-TEST-1" })).toBeVisible();
    await expect(page.getByText("PLACED", { exact: true }).first()).toBeVisible();
  });

  test("staff pages reject a request without a staff session cookie", async ({ page }) => {
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
