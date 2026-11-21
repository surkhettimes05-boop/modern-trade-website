import { getPool, query } from "../../database/connection.js";
import { createHash } from "node:crypto";
import { CheckoutService } from "../checkoutService.js";
import { resolveMemberPricing } from "../memberPricingService.js";
import { validateMemberPricingQuote } from "../memberPricingQuoteService.js";

jest.mock("../../database/connection.js", () => ({
  getPool: jest.fn(),
  query: jest.fn(),
}));
jest.mock("../memberPricingService.js", () => ({
  ...jest.requireActual("../memberPricingService.js"),
  resolveMemberPricing: jest.fn(),
}));
jest.mock("../memberPricingQuoteService.js", () => ({
  ...jest.requireActual("../memberPricingQuoteService.js"),
  validateMemberPricingQuote: jest.fn(),
}));

const databaseQuery = query as jest.Mock;
const getPoolMock = getPool as jest.Mock;
const customerId = "00000000-0000-0000-0000-000000000001";
const addressId = "00000000-0000-0000-0000-000000000002";
const cartId = "00000000-0000-0000-0000-000000000003";
const serverStoreId = "00000000-0000-0000-0000-000000000004";
const wrongClientStoreId = "00000000-0000-0000-0000-000000000099";
const productId = "00000000-0000-0000-0000-000000000005";

describe("COD checkout fulfillment authority", () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const clientQuery = jest.fn();
  const release = jest.fn();

  beforeEach(() => {
    calls.length = 0;
    clientQuery.mockReset();
    release.mockReset();
    databaseQuery.mockReset();
    jest.mocked(resolveMemberPricing).mockReset().mockResolvedValue([{
      product_id: productId,
      sku: "RICE",
      product_name: "Rice",
      regular_price: "100.00",
      final_price: "100.00",
      discount_per_unit: "0.00",
      promotion_id: null,
    }]);
    jest.mocked(validateMemberPricingQuote).mockReset().mockResolvedValue({
      quoteId: "00000000-0000-0000-0000-000000000040",
      channel: "WEB",
      storeReference: serverStoreId,
      customerReference: customerId,
      membershipNumber: null,
      membershipTier: null,
      membershipStatus: "NOT_MEMBER",
      customerStatus: "ACTIVE",
      items: [{
        sku: "RICE",
        quantity: "1",
        regularUnitPrice: "100.00",
        appliedUnitPrice: "100.00",
        lineDiscount: "0.00",
        lineTotal: "100.00",
        promotionReference: null,
        promotionSnapshot: null,
      }],
      subtotal: "100.00",
      discountTotal: "0.00",
      finalTotal: "100.00",
      currency: "NPR",
      pricingRuleVersion: 1,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
    databaseQuery.mockImplementation(
      async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM stores"))
          return { rows: [{ id: serverStoreId }] };
        if (sql.includes("FROM delivery_zones")) {
          return {
            rows: [
              {
                id: "zone-1",
                store_id: serverStoreId,
                zone_name: "Surkhet",
                included_municipalities: [10],
                included_wards: [20],
                excluded_areas: [],
                base_fee: 100,
                surcharge: 0,
                free_delivery_threshold: null,
                minimum_order_value: 0,
                estimated_delivery_hours: 4,
                delivery_time_slots: [],
              },
            ],
          };
        }
        throw new Error(`Unexpected database query: ${sql} ${params}`);
      },
    );
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM web_orders WHERE idempotency_key")) {
        return { rows: [] };
      }
      if (sql.includes("FROM customer_addresses")) {
        return {
          rows: [
            {
              id: addressId,
              municipality_id: 10,
              ward_id: 20,
              house_number: "12",
              street: "Main Road",
              tole_locality: "Surkhet",
              landmark: null,
              postal_code: "21700",
            },
          ],
        };
      }
      if (sql.includes("FROM nepal_wards")) return { rows: [{ id: 20 }] };
      if (sql.includes("FROM stores")) {
        expect(params?.[0]).toBe(serverStoreId);
        return {
          rows: [
            {
              id: serverStoreId,
              address_en: "Server-assigned store",
              is_temporarily_closed: false,
            },
          ],
        };
      }
      if (sql.includes("FROM shopping_carts")) {
        expect(params).toEqual([cartId, customerId, serverStoreId]);
        return { rows: [{ id: cartId }] };
      }
      if (sql.includes("FROM cart_items")) {
        return { rows: [{ product_id: productId, quantity: 1 }] };
      }
      if (sql.includes("p.name_en")) {
        return {
          rows: [{ product_id: productId, sku: "RICE", name_en: "Rice", product_status: "PUBLISHED", authoritative_price: "100.00" }],
        };
      }
      if (sql.includes("FROM customers")) {
        return { rows: [{ phone_normalized: "+9779812345678" }], rowCount: 1 };
      }
      if (sql.includes("FROM member_pricing_policies")) {
        return { rows: [{ pricing_rule_version: 1 }], rowCount: 1 };
      }
      if (sql.includes("COALESCE(inventory.stock")) {
        expect(params?.[1]).toBe(serverStoreId);
        return { rows: [{ product_id: productId, stock: 5, reserved: 0 }] };
      }
      if (sql.includes("FROM nepal_municipalities")) {
        return {
          rows: [
            {
              municipality_id: 10,
              municipality_name: "Birendranagar",
              district_name: "Surkhet",
              province_name: "Karnali",
              ward_id: 20,
              ward_number: 1,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO web_orders")) {
        expect(params?.[2]).toBe(serverStoreId);
        return { rows: [{ id: "order-1", order_number: "WO-1" }] };
      }
      if (sql.includes("INSERT INTO stock_reservations")) {
        expect(params?.[1]).toBe(serverStoreId);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    getPoolMock.mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release }),
      query: jest.fn(),
    });
  });

  it("ignores an arbitrary client store and creates the COD order at the address-assigned store", async () => {
    const order = await new CheckoutService().createCodOrder({
      customerId,
      storeId: wrongClientStoreId,
      addressId,
      cartId,
      idempotencyKey: "same-order-attempt-123",
      signedQuoteToken: "signed-qa-quote",
      channel: "WEB",
      deliveryType: "DELIVERY",
      shippingName: "Customer",
      shippingPhone: "+9779812345678",
      shippingAddress: "Client supplied address is ignored",
      shippingMunicipalityId: 999,
      shippingWardId: 999,
      shippingPostalCode: "00000",
      shippingCountry: "NP",
    });

    expect(order.id).toBe("order-1");
    expect(
      calls.find((item) => item.sql.includes("FROM shopping_carts"))?.params,
    ).toEqual([cartId, customerId, serverStoreId]);
    const insertOrder = calls.find((item) =>
      item.sql.includes("INSERT INTO web_orders"),
    );
    expect(insertOrder?.params?.[2]).toBe(serverStoreId);
    expect(insertOrder?.params?.[12]).toBe("12, Main Road, Surkhet");
    expect(insertOrder?.params?.[15]).toBe("21700");
    expect(insertOrder?.params?.[17]).toBe(10);
    expect(insertOrder?.params?.[18]).toBe(20);
    expect(
      calls.some((item) => item.params?.includes(wrongClientStoreId)),
    ).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("returns the existing order for an idempotent retry without another reservation", async () => {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          customerId,
          cartId,
          cart: [],
          addressId,
          deliveryType: "DELIVERY",
          shippingName: "Customer",
          shippingPhone: "+9779812345678",
          shippingAddress: null,
          shippingMunicipalityId: null,
          shippingWardId: null,
          shippingPostalCode: null,
          shippingCountry: null,
          notes: null,
        }),
      )
      .digest("hex");
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM web_orders WHERE idempotency_key")) {
        return {
          rows: [
            {
              id: "existing-order",
              order_number: "WO-OLD",
              idempotency_request_fingerprint: fingerprint,
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const order = await new CheckoutService().createCodOrder({
      customerId,
      storeId: wrongClientStoreId,
      addressId,
      cartId,
      idempotencyKey: "same-order-attempt-123",
      signedQuoteToken: "signed-qa-quote",
      channel: "WEB",
      deliveryType: "DELIVERY",
      shippingName: "Customer",
      shippingPhone: "+9779812345678",
    });

    expect(order.id).toBe("existing-order");
    expect(
      calls.some((item) => item.sql.includes("INSERT INTO web_orders")),
    ).toBe(false);
    expect(
      calls.some((item) => item.sql.includes("INSERT INTO stock_reservations")),
    ).toBe(false);
  });

  it("rejects reuse of a key for a materially different request", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM web_orders WHERE idempotency_key")) {
        return {
          rows: [
            {
              id: "existing-order",
              idempotency_request_fingerprint: "0".repeat(64),
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(
      new CheckoutService().createCodOrder({
        customerId,
        storeId: wrongClientStoreId,
        addressId,
        cartId,
        idempotencyKey: "same-order-attempt-123",
        signedQuoteToken: "signed-qa-quote",
        channel: "WEB",
        deliveryType: "DELIVERY",
        shippingName: "Changed customer name",
        shippingPhone: "+9779812345678",
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
});
