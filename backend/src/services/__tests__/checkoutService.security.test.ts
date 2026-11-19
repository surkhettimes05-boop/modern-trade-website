import { getPool, query } from "../../database/connection.js";
import { CheckoutService } from "../checkoutService.js";
import { resolveMemberPricing } from "../memberPricingService.js";
import { validateMemberPricingQuote } from "../memberPricingQuoteService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));

jest.mock("../memberPricingService.js", () => {
  const actual = jest.requireActual("../memberPricingService.js");
  return { ...actual, resolveMemberPricing: jest.fn() };
});

jest.mock("../memberPricingQuoteService.js", () => {
  const actual = jest.requireActual("../memberPricingQuoteService.js");
  return { ...actual, validateMemberPricingQuote: jest.fn() };
});

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
    (query as jest.Mock).mockResolvedValue({
      rows: [{ id: "00000000-0000-0000-0000-000000000010" }],
    });
  });

  it("locks, validates, inserts items, and reserves stock in fixed query batches", async () => {
    const productOne = "00000000-0000-0000-0000-000000000001";
    const productTwo = "00000000-0000-0000-0000-000000000002";
    jest.mocked(resolveMemberPricing).mockResolvedValue([
      {
        product_id: productOne,
        sku: "RICE",
        product_name: "Rice",
        regular_price: "100.00",
        final_price: "90.00",
        discount_per_unit: "10.00",
        promotion_id: "00000000-0000-0000-0000-000000000030",
      },
      {
        product_id: productTwo,
        sku: "TEA",
        product_name: "Tea",
        regular_price: "50.00",
        final_price: "50.00",
        discount_per_unit: "0.00",
        promotion_id: null,
      },
    ]);
    jest.mocked(validateMemberPricingQuote).mockResolvedValue({
      quoteId: "00000000-0000-0000-0000-000000000040",
      channel: "WEB",
      storeReference: "00000000-0000-0000-0000-000000000010",
      customerReference: "customer-1",
      membershipNumber: null,
      membershipTier: null,
      membershipStatus: "NOT_MEMBER",
      customerStatus: "ACTIVE",
      items: [
        {
          sku: "RICE",
          quantity: "2",
          regularUnitPrice: "100.00",
          appliedUnitPrice: "90.00",
          lineDiscount: "20.00",
          lineTotal: "180.00",
          promotionReference: "00000000-0000-0000-0000-000000000030",
          promotionSnapshot: {
            id: "00000000-0000-0000-0000-000000000030",
            name: "Rice promotion",
            version: 1,
          },
        },
        {
          sku: "TEA",
          quantity: "1",
          regularUnitPrice: "50.00",
          appliedUnitPrice: "50.00",
          lineDiscount: "0.00",
          lineTotal: "50.00",
          promotionReference: null,
          promotionSnapshot: null,
        },
      ],
      subtotal: "250.00",
      discountTotal: "20.00",
      finalTotal: "230.00",
      currency: "NPR",
      pricingRuleVersion: 1,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
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
            { product_id: productOne, quantity: 2 },
            { product_id: productTwo, quantity: 1 },
          ],
        };
      }
      if (sql.includes("FROM customers")) {
        return { rows: [{ phone_normalized: "+9779812345678" }], rowCount: 1 };
      }
      if (sql.includes("p.name_en")) {
        return {
          rows: [
            { product_id: productOne, sku: "RICE", name_en: "Rice", product_status: "PUBLISHED", authoritative_price: "100.00" },
            { product_id: productTwo, sku: "TEA", name_en: "Tea", product_status: "PUBLISHED", authoritative_price: "50.00" },
          ],
        };
      }
      if (sql.includes("FROM member_pricing_promotions")) {
        return {
          rows: [{
            id: "00000000-0000-0000-0000-000000000030",
            name: "Rice promotion",
            version: 1,
          }],
        };
      }
      if (sql.includes("FROM member_pricing_policies")) {
        return { rows: [{ pricing_rule_version: 1 }], rowCount: 1 };
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
        return { rows: [{ id: "order-1", status: "RECEIVED" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const order = await new CheckoutService().createCodOrder({
      customerId: "customer-1",
      storeId: "00000000-0000-0000-0000-000000000010",
      cartId: "00000000-0000-0000-0000-000000000020",
      idempotencyKey: "12345678-idempotency",
      signedQuoteToken: "test-signed-quote-token",
      channel: "WEB",
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
    const itemInsert = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO web_order_items"),
    );
    expect(itemInsert?.[1][0]).toBe("order-1");
    expect(JSON.parse(String(itemInsert?.[1][1]))).toEqual([
      {
        product_id: productOne,
        product_name: "Rice",
        quantity: 2,
        unit_price: "100.00",
        discount_amount: "20.00",
        line_total: "180.00",
        tax_amount: 0,
        line_total_with_tax: "180.00",
        member_pricing_promotion_id: "00000000-0000-0000-0000-000000000030",
        regular_unit_price: "100.00",
        applied_unit_price: "90.00",
        promotion_snapshot: {
          id: "00000000-0000-0000-0000-000000000030",
          name: "Rice promotion",
          version: 1,
        },
        currency: "NPR",
      },
      {
        product_id: productTwo,
        product_name: "Tea",
        quantity: 1,
        unit_price: "50.00",
        discount_amount: "0.00",
        line_total: "50.00",
        tax_amount: 0,
        line_total_with_tax: "50.00",
        member_pricing_promotion_id: null,
        regular_unit_price: "50.00",
        applied_unit_price: "50.00",
        promotion_snapshot: null,
        currency: "NPR",
      },
    ]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
