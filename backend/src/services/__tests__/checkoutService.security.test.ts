import { getPool } from "../../database/connection.js";
import { CheckoutService } from "../checkoutService.js";

jest.mock("../../database/connection.js", () => ({ getPool: jest.fn() }));

describe("checkout query batching", () => {
  const release = jest.fn();
  const clientQuery = jest.fn();

  beforeEach(() => {
    release.mockReset();
    clientQuery.mockReset();
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release }),
      query: jest.fn(),
    });
  });

  it("locks, validates, inserts items, and reserves stock in fixed query batches", async () => {
    const productOne = "00000000-0000-0000-0000-000000000001";
    const productTwo = "00000000-0000-0000-0000-000000000002";
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM web_orders WHERE idempotency_key")) {
        return { rows: [] };
      }
      if (sql.includes("FROM stores")) {
        return {
          rows: [
            {
              id: "00000000-0000-0000-0000-000000000010",
              address_en: "Pasalho Store",
              is_temporarily_closed: false,
            },
          ],
        };
      }
      if (sql.includes("FROM shopping_carts")) {
        return { rows: [{ id: "cart-1" }] };
      }
      if (sql.includes("FROM cart_items")) {
        return {
          rows: [
            {
              product_id: productOne,
              name_en: "Rice",
              product_status: "PUBLISHED",
              quantity: 2,
              authoritative_price: "100.00",
            },
            {
              product_id: productTwo,
              name_en: "Tea",
              product_status: "PUBLISHED",
              quantity: 1,
              authoritative_price: "50.00",
            },
          ],
        };
      }
      if (sql.includes("COALESCE(inventory.stock")) {
        return {
          rows: [
            { product_id: productOne, stock: 10, reserved: 1 },
            { product_id: productTwo, stock: 5, reserved: 0 },
          ],
        };
      }
      if (sql.includes("INSERT INTO web_orders")) {
        return { rows: [{ id: "order-1", status: "PENDING_PAYMENT" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const order = await new CheckoutService().createCodOrder({
      customerId: "customer-1",
      storeId: "00000000-0000-0000-0000-000000000010",
      cartId: "00000000-0000-0000-0000-000000000020",
      idempotencyKey: "12345678-idempotency",
      deliveryType: "PICKUP",
      shippingName: "Test Customer",
      shippingPhone: "+9779812345678",
    });

    expect(order.id).toBe("order-1");
    const calls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(
      calls.filter((sql) => sql.includes("pg_advisory_xact_lock")),
    ).toHaveLength(2);
    expect(
      calls.filter((sql) => sql.includes("COALESCE(inventory.stock")),
    ).toHaveLength(1);
    expect(
      calls.filter((sql) => sql.includes("INSERT INTO web_order_items")),
    ).toHaveLength(1);
    expect(
      calls.filter((sql) => sql.includes("INSERT INTO stock_reservations")),
    ).toHaveLength(1);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
