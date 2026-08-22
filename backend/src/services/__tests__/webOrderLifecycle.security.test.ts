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
