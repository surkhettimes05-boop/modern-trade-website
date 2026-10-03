import { getPool } from "../../database/connection.js";
import { WebOrderService } from "../webOrderService.js";
import { orderRealtimeService } from "../orderRealtimeService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));
jest.mock("../orderRealtimeService.js", () => ({
  orderRealtimeService: { safePublish: jest.fn() },
}));

describe("web order lifecycle integrity", () => {
  const release = jest.fn();
  const clientQuery = jest.fn();

  beforeEach(() => {
    release.mockReset();
    clientQuery.mockReset();
    (orderRealtimeService.safePublish as jest.Mock).mockReset();
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

  it("finalizes reserved inventory atomically only when delivery completes", async () => {
    const productId = "00000000-0000-0000-0000-000000000001";
    const storeId = "00000000-0000-0000-0000-000000000010";
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              order_number: "WO-1",
              status: "OUT_FOR_DELIVERY",
              store_id: storeId,
              total_amount: "500.00",
              currency: "NPR",
              delivery_type: "DELIVERY",
            },
          ],
        };
      }
      if (sql.includes("FROM stock_reservations")) {
        return {
          rows: [
            {
              id: "reservation-row-1",
              product_id: productId,
              store_id: storeId,
              quantity: 3,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM batch_inventory")) {
        return {
          rows: [
            { id: "batch-1", quantity: 2 },
            { id: "batch-2", quantity: 5 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes("UPDATE web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              order_number: "WO-1",
              status: "DELIVERED",
              store_id: storeId,
              total_amount: "500.00",
              currency: "NPR",
              delivery_type: "DELIVERY",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await new WebOrderService().updateWebOrderStatus(
      "order-1",
      "DELIVERED",
      "staff-1",
    );

    expect(result.status).toBe("DELIVERED");
    const calls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(
      calls.filter((sql) => sql.includes("UPDATE batch_inventory")),
    ).toHaveLength(2);
    expect(
      calls.some(
        (sql) =>
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("status = 'CONSUMED'"),
      ),
    ).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(orderRealtimeService.safePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ORDER_STATUS_CHANGED",
        store_id: storeId,
        order: expect.objectContaining({ status: "DELIVERED" }),
      }),
    );
  });

  it("keeps reservations active while an order is only being confirmed", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              order_number: "WO-1",
              status: "PENDING_PAYMENT",
              store_id: "00000000-0000-0000-0000-000000000010",
            },
          ],
        };
      }
      if (sql.includes("UPDATE web_orders")) {
        return {
          rows: [
            {
              id: "order-1",
              order_number: "WO-1",
              status: "CONFIRMED",
              store_id: "00000000-0000-0000-0000-000000000010",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await new WebOrderService().updateWebOrderStatus(
      "order-1",
      "CONFIRMED",
      "staff-1",
    );

    const calls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes("FROM batch_inventory"))).toBe(false);
    expect(
      calls.some(
        (sql) =>
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("CONSUMED"),
      ),
    ).toBe(false);
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
