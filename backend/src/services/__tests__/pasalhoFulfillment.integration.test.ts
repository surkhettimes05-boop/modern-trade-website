import axios from "axios";
import { getPool } from "../../database/connection.js";
import { CheckoutService } from "../checkoutService.js";

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: jest.fn(() => false),
  },
}));
jest.mock("../../database/connection.js", () => ({ getPool: jest.fn() }));

const axiosMock = axios as jest.Mocked<typeof axios>;

describe("commerce to PASALO fulfillment handoff", () => {
  const release = jest.fn();
  const clientQuery = jest.fn();
  const poolQuery = jest.fn();
  const originalUrl = process.env.PASALHO_API_URL;
  const originalKey = process.env.PASALHO_API_KEY;
  const input = {
    customerId: "00000000-0000-0000-0000-000000000001",
    storeId: "00000000-0000-0000-0000-000000000010",
    cartId: "00000000-0000-0000-0000-000000000020",
    idempotencyKey: "checkout-12345678",
    deliveryType: "DELIVERY" as const,
    shippingName: "A Customer",
    shippingPhone: "+9779812345678",
    shippingAddress: "Street 1",
    shippingCity: "Kathmandu",
    shippingState: "Bagmati",
    shippingPostalCode: "44600",
    shippingCountry: "NP",
  };

  beforeEach(() => {
    process.env.PASALHO_API_URL = "https://pasalo.example.test/api/v1";
    process.env.PASALHO_API_KEY = "integration-test-secret";
    release.mockReset();
    clientQuery.mockReset();
    poolQuery.mockReset();
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release }),
      query: poolQuery,
    });
    (axiosMock.post as jest.Mock).mockReset();
    (axiosMock.get as jest.Mock).mockReset();
    (axiosMock.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });

  afterAll(() => {
    process.env.PASALHO_API_URL = originalUrl;
    process.env.PASALHO_API_KEY = originalKey;
  });

  function setupCheckout(order: any = {
    id: "00000000-0000-0000-0000-000000000099",
    status: "PENDING_PAYMENT",
    store_id: input.storeId,
    cart_id: input.cartId,
    shipping_name: input.shippingName,
    shipping_phone: input.shippingPhone,
    shipping_address: input.shippingAddress,
    shipping_city: input.shippingCity,
    shipping_state: input.shippingState,
    shipping_postal_code: input.shippingPostalCode,
    shipping_country: input.shippingCountry,
    delivery_type: input.deliveryType,
    fulfillment_status: "PENDING",
  }) {
    const productId = "00000000-0000-0000-0000-000000000002";
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM web_orders WHERE idempotency_key")) return { rows: [] };
      if (sql.includes("FROM shopping_carts")) return { rows: [{ id: input.cartId }] };
      if (sql.includes("FROM cart_items")) return { rows: [{ product_id: productId, name_en: "Coke", quantity: 2, authoritative_price: "100" }] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("COALESCE(inventory.stock")) return { rows: [{ product_id: productId, stock: 30, reserved: 0 }] };
      if (sql.includes("INSERT INTO web_orders")) return { rows: [order] };
      return { rows: [], rowCount: 1 };
    });
    poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("pasalo_branch_id")) return { rows: [{ pasalo_branch_id: "00000000-0000-0000-0000-000000000011" }] };
      if (sql.includes("pasalo_product_id")) return { rows: [{ product_id: productId, quantity: 2, pasalo_product_id: "00000000-0000-0000-0000-000000000012" }] };
      if (sql.includes("SET fulfillment_status = $1")) return { rows: [{ ...order, fulfillment_status: params?.[0], fulfillment_error: params?.[1] }] };
      if (sql.includes("UPDATE web_orders")) return { rows: [{ ...order, fulfillment_status: "ACCEPTED", fulfillment_order_id: "00000000-0000-0000-0000-000000000088", status: "CONFIRMED" }] };
      return { rows: [order] };
    });
  }

  it("creates one commerce order and one PASALO fulfillment order", async () => {
    setupCheckout();
    (axiosMock.post as jest.Mock).mockResolvedValue({ data: { id: "00000000-0000-0000-0000-000000000088", orderNo: "ORD-1", status: "CONFIRMED", grandTotal: 200 } });

    const result = await new CheckoutService().createCodOrder(input);

    expect(result.fulfillment_status).toBe("ACCEPTED");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect((axiosMock.post as jest.Mock).mock.calls[0][0]).toContain("/sales-orders/public/checkout");
    expect((axiosMock.post as jest.Mock).mock.calls[0][1]).toMatchObject({
      branchId: "00000000-0000-0000-0000-000000000011",
      externalOrderId: "00000000-0000-0000-0000-000000000099",
      idempotencyKey: "commerce-order:00000000-0000-0000-0000-000000000099",
    });
  });

  it("replays the same checkout without creating a second fulfillment order", async () => {
    const order = { id: "00000000-0000-0000-0000-000000000099", status: "CONFIRMED", store_id: input.storeId, cart_id: input.cartId, shipping_name: input.shippingName, shipping_phone: input.shippingPhone, shipping_address: input.shippingAddress, shipping_city: input.shippingCity, shipping_state: input.shippingState, shipping_postal_code: input.shippingPostalCode, shipping_country: input.shippingCountry, delivery_type: input.deliveryType, fulfillment_status: "ACCEPTED" };
    setupCheckout(order);
    clientQuery.mockImplementation(async (sql: string) => sql === "BEGIN" || sql === "COMMIT" ? { rows: [] } : sql.includes("FROM web_orders WHERE idempotency_key") ? { rows: [order] } : { rows: [] });

    const result = await new CheckoutService().createCodOrder(input);

    expect(result).toBe(order);
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  it("keeps the order retryable when PASALO is unavailable, then retries safely", async () => {
    setupCheckout();
    (axiosMock.post as jest.Mock).mockRejectedValue(new Error("network down"));
    const service = new CheckoutService();

    const first = await service.createCodOrder(input);
    expect(first.fulfillment_status).toBe("FAILED_RETRYABLE");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);

    const persisted = { id: "00000000-0000-0000-0000-000000000099", status: "PENDING_PAYMENT", fulfillment_status: "FAILED_RETRYABLE", store_id: input.storeId, shipping_name: input.shippingName, shipping_phone: input.shippingPhone, shipping_address: input.shippingAddress, shipping_city: input.shippingCity, shipping_state: input.shippingState, shipping_postal_code: input.shippingPostalCode, shipping_country: input.shippingCountry, delivery_type: input.deliveryType };
    poolQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT * FROM web_orders") ? { rows: [persisted] } : sql.includes("pasalo_branch_id") ? { rows: [{ pasalo_branch_id: "00000000-0000-0000-0000-000000000011" }] } : sql.includes("pasalo_product_id") ? { rows: [{ quantity: 2, pasalo_product_id: "00000000-0000-0000-0000-000000000012" }] } : { rows: [{ ...persisted, fulfillment_status: "ACCEPTED", status: "CONFIRMED" }] });
    (axiosMock.post as jest.Mock).mockResolvedValue({ data: { id: "00000000-0000-0000-0000-000000000088", orderNo: "ORD-1", status: "CONFIRMED" } });

    const retried = await service.retryFulfillment(persisted.id, input.customerId);
    expect(retried.fulfillment_status).toBe("ACCEPTED");
    expect(axiosMock.post).toHaveBeenCalledTimes(2);
  });

  it("fails permanently without a store mapping and never sends a wrong-store order", async () => {
    setupCheckout();
    poolQuery.mockImplementation(async (sql: string) => sql.includes("pasalo_branch_id") ? { rows: [] } : { rows: [] });

    const result = await new CheckoutService().createCodOrder(input);

    expect(result.fulfillment_status).toBe("FAILED_PERMANENT");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  it("fails permanently without a product mapping and never sends a wrong-product order", async () => {
    setupCheckout();
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("pasalo_branch_id")) return { rows: [{ pasalo_branch_id: "00000000-0000-0000-0000-000000000011" }] };
      if (sql.includes("pasalo_product_id")) return { rows: [{ product_id: "00000000-0000-0000-0000-000000000002", quantity: 2, pasalo_product_id: null }] };
      return { rows: [] };
    });

    const result = await new CheckoutService().createCodOrder(input);

    expect(result.fulfillment_status).toBe("FAILED_PERMANENT");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  it("synchronizes a delivered PASALO order into Commerce order history", async () => {
    const order = {
      id: "00000000-0000-0000-0000-000000000099",
      status: "CONFIRMED",
      fulfillment_status: "ACCEPTED",
      fulfillment_order_id: "00000000-0000-0000-0000-000000000088",
      customer_id: input.customerId,
    };
    poolQuery.mockImplementation(async (sql: string) => sql.includes("SELECT * FROM web_orders") ? { rows: [order] } : { rows: [] });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("UPDATE web_orders")) return { rows: [{ ...order, status: "DELIVERED" }] };
      return { rows: [] };
    });
    (axiosMock.get as jest.Mock).mockResolvedValue({ data: { id: order.fulfillment_order_id, status: "DELIVERED" } });

    const result = await new CheckoutService().syncFulfillmentStatus(order.id, input.customerId);

    expect(result?.status).toBe("DELIVERED");
    expect(axiosMock.get).toHaveBeenCalledTimes(1);
  });
});
