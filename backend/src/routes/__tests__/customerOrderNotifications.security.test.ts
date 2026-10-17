import Fastify from "fastify";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CustomerOrderNotificationService } from "../../services/customerOrderNotificationService.js";
import { customerOrderNotificationRoutes } from "../customerOrderNotifications.js";

jest.mock("../../middleware/customerAuthentication.js", () => ({
  authenticateCustomer: async (request: any, reply: any) => {
    const id = request.headers["x-test-customer-id"];
    if (!id)
      return reply.status(401).send({ error: "Customer login required" });
    request.customerId = id;
  },
  customerId: (request: any) => request.customerId,
}));

describe("customer order notification ownership", () => {
  const customerA = "10000000-0000-4000-8000-000000000001";
  const customerB = "10000000-0000-4000-8000-000000000002";

  async function buildApp() {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(customerOrderNotificationRoutes);
    await app.ready();
    return app;
  }

  afterEach(() => jest.restoreAllMocks());

  it("requires an authenticated customer session", async () => {
    const list = jest
      .spyOn(CustomerOrderNotificationService.prototype, "list")
      .mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/customer/notifications/order-status",
    });
    expect(response.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();
    await app.close();
  });

  it("only loads notifications for the authenticated customer", async () => {
    const list = jest
      .spyOn(CustomerOrderNotificationService.prototype, "list")
      .mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/customer/notifications/order-status",
      headers: { "x-test-customer-id": customerA },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    expect(list).toHaveBeenCalledWith(customerA);
    expect(list).not.toHaveBeenCalledWith(customerB);
    await app.close();
  });
});
