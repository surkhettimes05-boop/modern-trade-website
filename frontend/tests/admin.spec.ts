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

async function mockAdmin(page: import("@playwright/test").Page) {
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
    route.fulfill({ json: session }),
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
});
