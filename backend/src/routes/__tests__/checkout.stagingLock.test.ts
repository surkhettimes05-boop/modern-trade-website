import Fastify from "fastify";
import { checkoutRoutes } from "../checkout.js";
import { CheckoutService } from "../../services/checkoutService.js";
import { errorHandler } from "../../middleware/errorHandler.js";

jest.mock("../../middleware/customerAuthentication.js", () => ({
  authenticateCustomer: async (request: any, reply: any) => {
    if (request.headers["x-test-customer-id"] !== "qa-customer") {
      return reply.status(401).send({ error: "Customer login required" });
    }
    request.customerId = "qa-customer";
  },
  customerId: (request: any) => request.customerId,
}));

describe("public staging checkout lock", () => {
  const oldValue = process.env.STAGING_DISABLE_CUSTOMER_ORDERS;

  afterEach(() => {
    if (oldValue === undefined) delete process.env.STAGING_DISABLE_CUSTOMER_ORDERS;
    else process.env.STAGING_DISABLE_CUSTOMER_ORDERS = oldValue;
    jest.restoreAllMocks();
  });

  async function app() {
    const instance = Fastify();
    instance.setErrorHandler(errorHandler);
    await instance.register(checkoutRoutes, { prefix: "/api" });
    await instance.ready();
    return instance;
  }

  it.each(["/api/checkout/cod", "/api/app/checkout/cod"])(
    "blocks %s without touching payment, inventory or order services",
    async (url) => {
      process.env.STAGING_DISABLE_CUSTOMER_ORDERS = "true";
      const createOrder = jest.spyOn(CheckoutService.prototype, "createCodOrder");
      const instance = await app();
      try {
        const response = await instance.inject({
          method: "POST",
          url,
          headers: { "x-test-customer-id": "qa-customer" },
          payload: {},
        });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ code: "STAGING_ORDERS_DISABLED" });
        expect(createOrder).not.toHaveBeenCalled();
      } finally {
        await instance.close();
      }
    },
  );

  it("does not bypass customer authentication", async () => {
    process.env.STAGING_DISABLE_CUSTOMER_ORDERS = "true";
    const instance = await app();
    try {
      const response = await instance.inject({
        method: "POST",
        url: "/api/checkout/cod",
        payload: {},
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await instance.close();
    }
  });

  it("preserves the normal checkout validation when staging lock is absent", async () => {
    delete process.env.STAGING_DISABLE_CUSTOMER_ORDERS;
    const createOrder = jest.spyOn(CheckoutService.prototype, "createCodOrder");
    const instance = await app();
    try {
      const response = await instance.inject({
        method: "POST",
        url: "/api/checkout/cod",
        headers: { "x-test-customer-id": "qa-customer" },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(createOrder).not.toHaveBeenCalled();
    } finally {
      await instance.close();
    }
  });
});
