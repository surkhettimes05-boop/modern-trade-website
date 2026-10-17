import { query } from "../../database/connection.js";
import { CartValidationService } from "../cartValidationService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

const databaseQuery = query as jest.Mock;
const productId = "00000000-0000-0000-0000-000000000001";
const addressId = "00000000-0000-0000-0000-000000000002";
const secondAddressId = "00000000-0000-0000-0000-000000000005";
const storeA = "00000000-0000-0000-0000-000000000003";
const storeB = "00000000-0000-0000-0000-000000000004";

describe("pre-checkout cart validation", () => {
  let service: CartValidationService;
  let zones: { resolveFulfillmentStore: jest.Mock; getDeliveryQuote: jest.Mock };
  const executedSql: string[] = [];
  let productStatus = "PUBLISHED";
  let canonicalPrice = 120;
  let stock = 8;
  let reserved = 0;
  let selectedStore = storeA;
  let validAddress = true;

  beforeEach(() => {
    executedSql.length = 0;
    productStatus = "PUBLISHED";
    canonicalPrice = 120;
    stock = 8;
    reserved = 0;
    selectedStore = storeA;
    validAddress = true;
    databaseQuery.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
      executedSql.push(sql);
      if (sql.includes("FROM customer_addresses")) {
        return { rows: [{ id: params?.[0], municipality_id: 10, ward_id: params?.[0] === secondAddressId ? 21 : 20 }] };
      }
      if (sql.includes("FROM nepal_wards")) {
        return { rows: validAddress ? [{ id: 20 }] : [] };
      }
      if (sql.includes("FROM unnest($1::uuid[]) AS requested(product_id)")) {
        if (sql.includes("p.name_en")) {
          return {
            rows: [
              {
                product_id: productId,
                name_en: "Rice",
                product_status: productStatus,
                authoritative_price: canonicalPrice,
              },
            ],
          };
        }
        return {
          rows: [{ product_id: productId, stock, reserved }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    zones = {
      resolveFulfillmentStore: jest.fn(async () => ({
      serviceable: true,
      fulfillment_store_id: selectedStore,
      delivery_fee: 30,
      estimated_delivery_hours: 3,
      })),
      getDeliveryQuote: jest.fn(async ({ order_value }) => ({
        serviceable: true,
        delivery_fee: order_value && order_value >= 200 ? 0 : 30,
        zone_id: "zone",
      })),
    };
    service = new CartValidationService(zones as any);
  });

  const run = (quantity = 2, clientPrice = 120, selectedAddressId = addressId) =>
    service.validate({
      customerId: "customer",
      addressId: selectedAddressId,
      items: [{ product_id: productId, quantity, client_unit_price: clientPrice }],
    });

  it("returns READY for a serviceable address and valid cart without reserving stock", async () => {
    const result = await run();
    expect(result).toMatchObject({
      status: "READY",
      fulfillment_store_id: storeA,
      subtotal: 240,
      delivery_fee: 0,
      total: 240,
      items: [{ status: "VALID", available_quantity: 8 }],
    });
    expect(executedSql.some((sql) => /INSERT INTO stock_reservations|UPDATE stock_reservations/i.test(sql))).toBe(false);
  });

  it("reconciles stale client prices to the canonical current price", async () => {
    canonicalPrice = 135;
    const result = await run(2, 120);
    expect(result.status).toBe("CHANGES_REQUIRED");
    expect(result.items![0]).toMatchObject({
      client_unit_price: 120,
      current_unit_price: 135,
      line_total: 270,
      issues: [{ code: "PRICE_CHANGED" }],
    });
  });

  it.each(["DRAFT", "MISSING"])("returns explicit unavailable issue for product state %s", async (status) => {
    productStatus = status;
    if (status === "MISSING") {
      databaseQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM customer_addresses")) return { rows: [{ id: addressId, municipality_id: 10, ward_id: 20 }] };
        if (sql.includes("FROM nepal_wards")) return { rows: [{ id: 20 }] };
        if (sql.includes("p.name_en")) return { rows: [{ product_id: productId, name_en: null, product_status: null, authoritative_price: null }] };
        if (sql.includes("FROM unnest")) return { rows: [{ product_id: productId, stock: 0, reserved: 0 }] };
        throw new Error(sql);
      });
    }
    const result = await run();
    expect(result.status).toBe("BLOCKED");
    expect(result.items![0].issues[0].code).toBe(status === "DRAFT" ? "PRODUCT_INACTIVE" : "PRODUCT_UNAVAILABLE");
  });

  it("blocks zero stock and reduces excessive requested quantity visibly", async () => {
    stock = 0;
    let result = await run();
    expect(result.status).toBe("BLOCKED");
    expect(result.items![0].issues).toContainEqual({ code: "OUT_OF_STOCK" });
    stock = 3;
    reserved = 1;
    result = await run(5);
    expect(result.status).toBe("CHANGES_REQUIRED");
    expect(result.items![0]).toMatchObject({
      requested_quantity: 5,
      validated_quantity: 2,
      available_quantity: 2,
      issues: [{ code: "INSUFFICIENT_STOCK" }],
    });
  });

  it("blocks invalid geography and resolves a changed address against the new assigned store", async () => {
    validAddress = false;
    expect((await run()).status).toBe("BLOCKED");
    validAddress = true;
    zones.resolveFulfillmentStore.mockImplementation(async ({ ward_id }) => ({
      serviceable: true,
      fulfillment_store_id: ward_id === 21 ? storeB : storeA,
    }) as any);
    const result = await run(2, 120, secondAddressId);
    expect(result.fulfillment_store_id).toBe(storeB);
  });

  it("blocks an address outside all delivery zones", async () => {
    zones.resolveFulfillmentStore.mockResolvedValue({
      serviceable: false,
      fulfillment_store_id: null,
      reason: "Address not in service area",
    } as any);
    const result = await run();
    expect(result.status).toBe("BLOCKED");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "ADDRESS_UNSERVICEABLE" }),
    );
  });
});
