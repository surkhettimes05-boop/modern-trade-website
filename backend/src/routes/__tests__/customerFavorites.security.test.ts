import Fastify from "fastify";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CustomerFavoriteService } from "../../services/customerFavoriteService.js";
import { customerFavoritesRoutes } from "../customerFavorites.js";

jest.mock("../../middleware/customerAuthentication.js", () => ({
  authenticateCustomer: async (request: any, reply: any) => {
    const id = request.headers["x-test-customer-id"];
    if (!id)
      return reply.status(401).send({ error: "Customer login required" });
    request.customerId = id;
  },
  customerId: (request: any) => request.customerId,
}));

describe("customer favorites ownership", () => {
  const customerA = "10000000-0000-4000-8000-000000000001";
  const customerB = "10000000-0000-4000-8000-000000000002";
  const productId = "20000000-0000-4000-8000-000000000001";

  async function buildApp() {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(customerFavoritesRoutes);
    await app.ready();
    return app;
  }

  afterEach(() => jest.restoreAllMocks());

  it("requires an authenticated customer session", async () => {
    const list = jest
      .spyOn(CustomerFavoriteService.prototype, "list")
      .mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/customer/favorites",
    });
    expect(response.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();
    await app.close();
  });

  it("derives list and mutations from the authenticated customer", async () => {
    const list = jest
      .spyOn(CustomerFavoriteService.prototype, "list")
      .mockResolvedValue([productId]);
    const add = jest
      .spyOn(CustomerFavoriteService.prototype, "add")
      .mockResolvedValue();
    const remove = jest
      .spyOn(CustomerFavoriteService.prototype, "remove")
      .mockResolvedValue();
    const app = await buildApp();

    const headers = { "x-test-customer-id": customerA };
    const listed = await app.inject({
      method: "GET",
      url: "/customer/favorites",
      headers,
    });
    const added = await app.inject({
      method: "PUT",
      url: `/customer/favorites/${productId}`,
      headers,
    });
    const removed = await app.inject({
      method: "DELETE",
      url: `/customer/favorites/${productId}`,
      headers,
    });

    expect(listed.json()).toEqual({ product_ids: [productId] });
    expect(added.statusCode).toBe(204);
    expect(removed.statusCode).toBe(204);
    expect(list).toHaveBeenCalledWith(customerA);
    expect(add).toHaveBeenCalledWith(customerA, productId);
    expect(remove).toHaveBeenCalledWith(customerA, productId);
    expect(list).not.toHaveBeenCalledWith(customerB);
    await app.close();
  });

  it("rejects malformed product identifiers", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PUT",
      url: "/customer/favorites/not-a-uuid",
      headers: { "x-test-customer-id": customerA },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
