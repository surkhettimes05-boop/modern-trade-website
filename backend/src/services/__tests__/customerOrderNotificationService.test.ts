import { query } from "../../database/connection.js";
import { CustomerOrderNotificationService } from "../customerOrderNotificationService.js";

jest.mock("../../database/connection.js", () => ({
  query: jest.fn(),
}));

describe("customer order notification service", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns only the customer's supported lifecycle updates", async () => {
    const rows = [
      {
        notification_id: "event-1",
        order_id: "order-1",
        order_number: "WO-123",
        order_status: "PACKED",
        total_amount: 100,
      },
    ];
    jest.mocked(query).mockResolvedValue({ rows } as never);

    const result = await new CustomerOrderNotificationService().list(
      "customer-1",
    );

    expect(result).toEqual(rows);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DISTINCT ON (oe.order_id, oe.to_status)"),
      [
        "customer-1",
        ["CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("wo.customer_id = $1"),
      expect.any(Array),
    );
  });
});
