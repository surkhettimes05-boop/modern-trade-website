import { query } from "../../database/connection.js";
import { ShoppingCartService } from "../shoppingCartService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

describe("shopping cart price authority", () => {
  it("ignores client price and discount values", async () => {
    const mockedQuery = query as jest.Mock;
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ price: "100", availability_status: "AVAILABLE" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            unit_price: 100,
            discount_amount: 0,
            line_total: 200,
          },
        ],
      });

    await new ShoppingCartService().addToCart({
      cart_id: "cart-1",
      product_id: "product-1",
      quantity: 2,
      unit_price: 0,
      discount_amount: undefined,
    });

    const insertParams = mockedQuery.mock.calls[2][1] as unknown[];
    expect(insertParams[3]).toBe(100);
    expect(insertParams[4]).toBe(0);
    expect(insertParams[5]).toBe(200);
  });
});
