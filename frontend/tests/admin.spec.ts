import { expect, test } from "@playwright/test";

const session = {
  authenticated: true,
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    username: "manager",
    name: "Maya Manager",
    staffNumber: "ST-001",
  },
  role: { key: "store_manager", name: "Store manager", level: 3 },
  capabilities: [
    "dashboard.read",
    "catalog.read",
    "catalog.write",
    "orders.read",
    "orders.fulfil",
    "orders.cancel",
    "customers.read",
    "stores.read",
    "inventory.read",
    "procurement.read",
    "staff.read",
    "audit.read",
  ],
  scope: {
    type: "ORGANIZATION",
    organizationId: "20000000-0000-4000-8000-000000000001",
    storeIds: [],
  },
  storeAssignment: {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Kathmandu",
    code: "KTM",
    currencyCode: "NPR",
    locale: "en-NP",
    timezone: "Asia/Kathmandu",
  },
  organization: {
    id: "20000000-0000-4000-8000-000000000001",
    name: "NOVA MART",
    countryCode: "NP",
    currencyCode: "NPR",
    locale: "en-NP",
    timezone: "Asia/Kathmandu",
  },
};

async function mockAdmin(
  page: import("@playwright/test").Page,
  sessionData = session,
) {
  await page.context().addCookies([
    {
      name: "ops_session",
      value: "browser-test-session",
      url: "http://127.0.0.1:3032",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/operations-auth/session", (route) =>
    route.fulfill({ json: sessionData }),
  );
  await page.route("**/api/admin/context/stores", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            name: "Kathmandu",
            code: "KTM",
          },
          {
            id: "30000000-0000-4000-8000-000000000002",
            name: "Pokhara",
            code: "PKR",
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/notifications**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/admin/dashboard**", (route) =>
    route.fulfill({
      json: {
        metrics: {
          revenue: 125000,
          orders: 32,
          average_order_value: 3906.25,
          cancelled_orders: 1,
          low_stock: 4,
          out_of_stock: 1,
          open_purchase_orders: 3,
          overdue_purchase_orders: 1,
          new_customers: 8,
          returning_customers: 14,
          inventory_value: 890000,
          incoming_units: 120,
        },
        revenueTrend: [
          { date: "2026-08-30", revenue: 42000 },
          { date: "2026-08-31", revenue: 83000 },
        ],
        scopeLabel: new URL(route.request().url()).searchParams.get("store_id")
          ? "Selected store"
          : "2 authorized stores",
        currencyCode: "NPR",
      },
    }),
  );
  await page.route("**/api/admin/products**", (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        json: {
          id: "40000000-0000-4000-8000-000000000001",
          sku: "TEA-01",
          name_en: "Nepal Tea",
          status: "DRAFT",
        },
      });
    return route.fulfill({
      json: {
        items: [
          {
            id: "40000000-0000-4000-8000-000000000001",
            sku: "RICE-5KG",
            name_en: "Basmati Rice",
            category_name: "Rice",
            price: 1299,
            currency_code: "NPR",
            price_valid_from: "2026-08-01T00:00:00Z",
            next_price: 1399,
            next_price_valid_from: "2026-12-01T03:15:00Z",
            stock: 18,
            status: "PUBLISHED",
            updated_at: "2026-08-31T00:00:00Z",
          },
        ],
        total: 1,
      },
    });
  });
}

test.describe("admin workspace", () => {
  test("renders live dashboard, capability navigation, command palette, and store scope", async ({
    page,
  }) => {
    await mockAdmin(page);
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("NPR 125,000.00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Roles" })).toHaveCount(0);

    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+K" : "Control+K",
    );
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await page.getByPlaceholder(/Search products/).fill("create product");
    await expect(
      page.getByRole("option", { name: /Create product/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/catalog\/products\?create=1/);
    await expect(
      page.getByRole("dialog", { name: /Create product/i }),
    ).toBeVisible();

    await page
      .getByLabel("Store scope")
      .selectOption("30000000-0000-4000-8000-000000000002");
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("storesync.admin.store-scope"),
        ),
      )
      .toBe("30000000-0000-4000-8000-000000000002");
  });

  test("creates a product once and refreshes the dedicated product table", async ({
    page,
  }) => {
    await mockAdmin(page);
    let creates = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/admin/products")
      )
        creates += 1;
    });
    await page.goto("/admin/catalog/products?create=1");
    await page.getByLabel("SKU").fill("TEA-01");
    await page.getByLabel("Product name").fill("Nepal Tea");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "created successfully",
    );
    expect(creates).toBe(1);
    await expect(
      page.getByRole("cell", { name: "Basmati Rice" }),
    ).toBeVisible();
  });

  test("submits a scheduled product price with its effective window", async ({
    page,
  }) => {
    await mockAdmin(page);
    let submitted: Record<string, unknown> | undefined;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/admin/products")
      ) {
        submitted = request.postDataJSON() as Record<string, unknown>;
      }
    });
    await page.goto("/admin/catalog/products?create=1");
    await page.getByLabel("SKU").fill("SCHEDULED-TEA");
    await page.getByLabel("Product name").fill("Scheduled Tea");
    await page.getByLabel("Selling price (NPR)").fill("120.50");
    await page.getByLabel("Price effective from").fill("2026-12-01T09:00");
    await page.getByLabel("Price effective until").fill("2026-12-31T23:59");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "created successfully",
    );
    expect(submitted).toMatchObject({ sku: "SCHEDULED-TEA", price: "120.50" });
    expect(new Date(String(submitted?.valid_from)).toISOString()).toBe(
      submitted?.valid_from,
    );
    expect(new Date(String(submitted?.valid_to)).toISOString()).toBe(
      submitted?.valid_to,
    );
    expect(new Date(String(submitted?.valid_to)).getTime()).toBeGreaterThan(
      new Date(String(submitted?.valid_from)).getTime(),
    );
    await expect(
      page.getByRole("cell", { name: /Next NPR 1,399\.00/ }),
    ).toBeVisible();
  });

  test("edits a draft member-price promotion and clears its stale preview", async ({
    page,
  }) => {
    const pricingSession = {
      ...session,
      capabilities: [...session.capabilities, "pricing.read", "pricing.write", "pricing.approve"],
    };
    const promotion = {
      id: "50000000-0000-4000-8000-000000000001",
      organization_id: session.organization.id,
      name: "Member tea price",
      status: "DRAFT",
      starts_at: "2026-12-01T00:00:00Z",
      ends_at: "2026-12-31T00:00:00Z",
      reason: "Approved launch test",
      version: 1,
      products: [{ sku: "TEA-01", member_price: "95.00" }],
      tiers: ["REGISTERED_MEMBER"],
      channels: ["WEB"],
    };
    await mockAdmin(page, pricingSession);
    let updateBody: Record<string, unknown> | undefined;
    let currentPromotion = promotion;
    await page.route("**/api/admin/member-pricing/promotions**", async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        updateBody = request.postDataJSON() as Record<string, unknown>;
        currentPromotion = { ...promotion, name: "Updated member tea price", version: 2 };
        return route.fulfill({
          json: { promotion: currentPromotion },
        });
      }
      if (request.method() === "POST") {
        return route.fulfill({
          json: { valid: true, promotion: { version: 1 }, issues: [] },
        });
      }
      return route.fulfill({ json: { items: [currentPromotion] } });
    });
    await page.goto("/admin/member-pricing");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/Preview passed/)).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Promotion name").fill("Updated member tea price");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status")).toContainText("updated");
    expect(updateBody).toMatchObject({
      name: "Updated member tea price",
      reason: "Approved launch test",
      products: [{ sku: "TEA-01", member_price: "95.00" }],
    });
    await expect(page.getByRole("button", { name: "Activate" })).toBeDisabled();
  });
});
