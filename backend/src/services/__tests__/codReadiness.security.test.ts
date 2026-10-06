import { getPool, query } from "../../database/connection.js";
import { ShoppingCartService } from "../shoppingCartService.js";
import { CheckoutService } from "../checkoutService.js";
import { POSService } from "../posService.js";
import { OTPService } from "../otpService.js";
import {
  startTwilioSmsVerification,
  checkTwilioSmsVerification,
} from "../twilioVerifyService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));
jest.mock("../twilioVerifyService.js", () => ({
  startTwilioSmsVerification: jest.fn(),
  checkTwilioSmsVerification: jest.fn(),
}));
const db = jest.fn();
const release = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockReturnValue({
    connect: async () => ({ query: db, release }),
  });
  db.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM shopping_carts"))
      return { rowCount: 1, rows: [{ store_id: "store" }] };
    if (sql.includes("FROM products"))
      return {
        rowCount: 1,
        rows: [{ price: "125.50", sku: "RICE", name_en: "Rice" }],
      };
    return { rowCount: 1, rows: [] };
  });
});

test("cart snapshots replace rather than increment quantities on retries", async () => {
  const cart = new ShoppingCartService();
  for (let i = 0; i < 2; i++)
    await cart.replaceItems("cart", "customer", [
      { product_id: "rice", quantity: 2 },
    ]);
  const inserts = db.mock.calls.filter(([sql]) =>
    sql.includes("INSERT INTO cart_items"),
  );
  expect(inserts.map(([, params]) => params)).toEqual([
    ["cart", "rice", 2, 125.5],
    ["cart", "rice", 2, 125.5],
  ]);
  expect(
    db.mock.calls.filter(([sql]) => sql.includes("DELETE FROM cart_items")),
  ).toHaveLength(2);
  expect(db).toHaveBeenCalledWith("COMMIT");
});

test("cart replacement verifies ownership before deleting and rolls back on denial", async () => {
  db.mockImplementation(async () => ({ rowCount: 0, rows: [] }));
  await expect(
    new ShoppingCartService().replaceItems("cart", "intruder", [
      { product_id: "rice", quantity: 2 },
    ]),
  ).rejects.toThrow("Cart not found");
  expect(db.mock.calls.some(([sql]) => sql.includes("DELETE"))).toBe(false);
  expect(db).toHaveBeenCalledWith("ROLLBACK");
});

test("checkout replay locks its key and returns the existing order without stock mutation", async () => {
  db.mockImplementation(async (sql: string) => ({
    rows: sql.includes("FROM web_orders") ? [{ id: "order" }] : [],
  }));
  const order = await new CheckoutService().createCodOrder({
    cartId: "cart",
    customerId: "customer",
    storeId: "store",
    idempotencyKey: "retry-key",
    deliveryType: "PICKUP",
    shippingName: "Test",
    shippingPhone: "9812345678",
  });
  expect(order.id).toBe("order");
  expect(db.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
  expect(db.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
});

test("POS derives all amounts from catalog and atomically creates cash NPR draft", async () => {
  const base = db.getMockImplementation()!;
  db.mockImplementation(async (sql: string, params: unknown[]) =>
    sql.includes("INSERT INTO sales")
      ? { rows: [{ id: "sale", sale_status: "DRAFT" }] }
      : base(sql, params),
  );
  await new POSService().createSale({
    sale_number: "S1",
    store_id: "store",
    total_amount: 1,
    currency: "NPR",
    payment_method: "CASH",
    created_by: "staff",
    idempotency_key: "pos-key",
    items: [
      {
        product_id: "rice",
        quantity: 2,
        unit_price: 1,
        line_total: 1,
        discount_amount: 100,
      },
    ],
  });
  const sale = db.mock.calls.find(([sql]) => sql.includes("INSERT INTO sales"));
  expect(sale?.[1][3]).toBe(251);
  const item = db.mock.calls.find(([sql]) =>
    sql.includes("INSERT INTO sale_items"),
  );
  expect(item?.[1].slice(4)).toEqual([2, "125.50", 251]);
  expect(db).toHaveBeenCalledWith("COMMIT");
});

test("POS completion preserves stock reserved for online orders", async () => {
  db.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM sales"))
      return {
        rows: [
          {
            sale_status: "DRAFT",
            payment_method: "CASH",
            currency: "NPR",
            store_id: "store",
          },
        ],
      };
    if (sql.includes("FROM sale_items"))
      return { rows: [{ product_id: "rice", quantity: 2 }] };
    if (sql.includes("FROM batch_inventory"))
      return { rows: [{ id: "batch", quantity: 5 }] };
    if (sql.includes("FROM stock_reservations"))
      return { rows: [{ quantity: 4 }] };
    return { rows: [] };
  });
  await expect(
    new POSService().updateSaleStatus("sale", "COMPLETED", "staff"),
  ).rejects.toThrow("Insufficient unreserved stock");
  expect(db).toHaveBeenCalledWith("ROLLBACK");
  expect(
    db.mock.calls.some(([sql]) => sql.includes("UPDATE batch_inventory")),
  ).toBe(false);
});

test("configured development Twilio uses provider delivery/check, never a local-code fallback", async () => {
  const oldEnv = { ...process.env };
  try {
    process.env.NODE_ENV = "development";
    process.env.SMS_PROVIDER = "twilio_verify";
    (query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ count: "0" }] };
      if (sql.includes("SELECT * FROM customer_otp"))
        return {
          rows: [{ id: "otp", attempt_count: 0, otp_code: "not-a-code" }],
        };
      return { rows: [], rowCount: 0 };
    });
    (startTwilioSmsVerification as jest.Mock).mockResolvedValue(undefined);
    (checkTwilioSmsVerification as jest.Mock).mockResolvedValue(false);
    await new OTPService().createOTP({ phone: "9812345678", purpose: "LOGIN" });
    expect(startTwilioSmsVerification).toHaveBeenCalledWith("9812345678");
    expect(
      await new OTPService().verifyOTP({
        phone: "9812345678",
        purpose: "LOGIN",
        otp_code: "123456",
      }),
    ).toEqual({ valid: false });
    expect(checkTwilioSmsVerification).toHaveBeenCalledWith(
      "9812345678",
      "123456",
    );
  } finally {
    process.env = oldEnv;
  }
});
