import { getPool } from "../../database/connection.js";
import { WebOrderService } from "../webOrderService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));

describe("web order lifecycle integrity", () => {
  const release = jest.fn();
  const clientQuery = jest.fn();

  beforeEach(() => {
    release.mockReset();
    clientQuery.mockReset();
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release }),
    });
  });

  it("cancels atomically, releases reservations, and records the actor", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              status: "CONFIRMED",
              payment_status: "PENDING",
              cart_id: "cart-1",
            },
          ],
        };
      }
      if (sql.includes("UPDATE web_orders")) {
        return { rows: [{ id: "order-1", status: "CANCELLED" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await new WebOrderService().cancelWebOrder(
      "order-1",
      "staff-1",
      "Customer request",
    );

    expect(result.status).toBe("CANCELLED");
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE stock_reservations"),
      ),
    ).toBe(true);
    const eventCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO order_events"),
    );
    expect(eventCall?.[1]).toContain("staff-1");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("extends active reservations when an order is accepted", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              status: "PENDING_PAYMENT",
              payment_status: "PENDING",
              cart_id: "cart-1",
              store_id: "store-1",
            },
          ],
        };
      }
      if (sql.includes("UPDATE web_orders")) {
        return { rows: [{ id: "order-1", status: "CONFIRMED" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await new WebOrderService().updateWebOrderStatus(
      "order-1",
      "CONFIRMED",
      "staff-1",
    );

    expect(result.status).toBe("CONFIRMED");
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("GREATEST(expires_at"),
      ),
    ).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("deducts batch inventory and consumes reservations on delivery", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              status: "OUT_FOR_DELIVERY",
              payment_status: "PENDING",
              cart_id: "cart-1",
              store_id: "store-1",
            },
          ],
        };
      }
      if (sql.includes("FROM web_order_items")) {
        return { rows: [{ product_id: "product-1", quantity: 2 }] };
      }
      if (sql.includes("FROM batch_inventory")) {
        return { rows: [{ id: "batch-1", quantity: 5 }] };
      }
      if (sql.includes("UPDATE web_orders")) {
        return { rows: [{ id: "order-1", status: "DELIVERED" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await new WebOrderService().updateWebOrderStatus(
      "order-1",
      "DELIVERED",
      "staff-1",
    );

    expect(result.status).toBe("DELIVERED");
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("SET quantity = quantity - $1"),
      ),
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'CONSUMED'"),
      ),
    ).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects an invalid status transition and rolls back", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return { rows: [{ id: "order-1", status: "PENDING_PAYMENT" }] };
      }
      return { rows: [] };
    });

    await expect(
      new WebOrderService().updateWebOrderStatus(
        "order-1",
        "DELIVERED",
        "staff-1",
      ),
    ).rejects.toThrow("Invalid transition");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });

  it("rejects invalid payment-state jumps", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            { id: "order-1", status: "CONFIRMED", payment_status: "PENDING" },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      new WebOrderService().updatePaymentStatus(
        "order-1",
        "REFUNDED",
        "staff-1",
      ),
    ).rejects.toThrow("Invalid payment transition");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});
