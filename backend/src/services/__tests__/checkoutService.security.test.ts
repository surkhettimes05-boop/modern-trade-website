import { getPool } from "../../database/connection.js";
import { CheckoutService } from "../checkoutService.js";

jest.mock("../../database/connection.js", () => ({ getPool: jest.fn() }));

describe("checkout query batching", () => {
  const release = jest.fn();
  const clientQuery = jest.fn();
  const checkoutInput = {
    customerId: "customer-1",
    cartId: "00000000-0000-0000-0000-000000000020",
    idempotencyKey: "12345678-idempotency",
    deliveryType: "DELIVERY" as const,
    shippingName: "Test Customer",
    shippingPhone: "+9779812345678",
    shippingAddress: "Test Street",
    shippingCity: "Kathmandu",
    shippingState: "Bagmati",
    shippingPostalCode: "44600",
    shippingCountry: "NP",
  };

  beforeEach(() => {
    release.mockReset();
    clientQuery.mockReset();
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release }),
      query: jest.fn(),
    });
  });

  it("locks a storeless cart, prices from the organization catalog, and leaves stock to PASALO", async () => {
    const productOne = "00000000-0000-0000-0000-000000000001";
    const productTwo = "00000000-0000-0000-0000-000000000002";
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM web_orders WHERE idempotency_key")) return { rows: [] };
      if (sql.includes("FROM shopping_carts")) return { rows: [{ id: "cart-1" }] };
      if (sql.includes("FROM cart_items")) {
        return { rows: [
          { product_id: productOne, name_en: "Rice", quantity: 2, authoritative_price: "100.00" },
          { product_id: productTwo, name_en: "Tea", quantity: 1, authoritative_price: "50.00" },
        ] };
      }
      if (sql.includes("INSERT INTO web_orders")) return { rows: [{ id: "order-1", status: "PENDING_PAYMENT" }] };
      return { rows: [], rowCount: 1 };
    });

    const order = await new CheckoutService().createCodOrder(checkoutInput);

    expect(order.id).toBe("order-1");
    const calls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("store_id IS NULL"))).toBe(true);
    expect(calls.some((sql) => sql.includes("batch_inventory"))).toBe(false);
    expect(calls.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(false);
    expect(calls.filter((sql) => sql.includes("INSERT INTO web_order_items"))).toHaveLength(1);
    expect(calls.filter((sql) => sql.includes("INSERT INTO stock_reservations"))).toHaveLength(0);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("replays an identical idempotent checkout without creating another order", async () => {
    const existing = {
      id: "order-1",
      store_id: null,
      cart_id: checkoutInput.cartId,
      delivery_type: checkoutInput.deliveryType,
      shipping_name: checkoutInput.shippingName,
      shipping_phone: checkoutInput.shippingPhone,
      shipping_address: checkoutInput.shippingAddress,
      shipping_city: checkoutInput.shippingCity,
      shipping_state: checkoutInput.shippingState,
      shipping_postal_code: checkoutInput.shippingPostalCode,
      shipping_country: checkoutInput.shippingCountry,
    };
    clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("FROM web_orders WHERE idempotency_key")
        ? { rows: [existing] }
        : { rows: [] },
    );

    await expect(new CheckoutService().createCodOrder(checkoutInput)).resolves.toBe(existing);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO web_orders"))).toBe(false);
  });

  it("rejects reuse of an idempotency key with a different checkout payload", async () => {
    clientQuery.mockImplementation(async (sql: string) =>
      sql.includes("FROM web_orders WHERE idempotency_key")
        ? { rows: [{
            store_id: null,
            cart_id: checkoutInput.cartId,
            delivery_type: checkoutInput.deliveryType,
            shipping_name: checkoutInput.shippingName,
            shipping_phone: checkoutInput.shippingPhone,
            shipping_address: checkoutInput.shippingAddress,
            shipping_city: "Pokhara",
            shipping_state: checkoutInput.shippingState,
            shipping_postal_code: checkoutInput.shippingPostalCode,
            shipping_country: checkoutInput.shippingCountry,
          }] }
        : { rows: [] },
    );

    await expect(new CheckoutService().createCodOrder(checkoutInput)).rejects.toThrow(
      "Idempotency key conflicts",
    );
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
