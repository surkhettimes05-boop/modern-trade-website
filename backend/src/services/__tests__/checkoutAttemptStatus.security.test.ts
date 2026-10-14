import { getPool } from "../../database/connection.js";
import { CheckoutService } from "../checkoutService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));

describe("order attempt status ownership", () => {
  const poolQuery = jest.fn();

  beforeEach(() => {
    poolQuery.mockReset();
    (getPool as jest.Mock).mockReturnValue({ query: poolQuery });
  });

  it("returns only an order matching both the authenticated customer and key", async () => {
    const order = { id: "order-a", order_number: "WO-A" };
    poolQuery.mockResolvedValue({ rows: [order] });

    await expect(
      new CheckoutService().getOrderAttempt("customer-a", "attempt-key-123"),
    ).resolves.toEqual(order);
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE customer_id = $1 AND idempotency_key = $2"),
      ["customer-a", "attempt-key-123"],
    );
  });

  it("returns no order for an unknown attempt", async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await expect(
      new CheckoutService().getOrderAttempt("customer-a", "missing-key-123"),
    ).resolves.toBeNull();
  });
});
