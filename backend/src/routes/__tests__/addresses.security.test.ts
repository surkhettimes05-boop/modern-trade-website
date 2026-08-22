import Fastify from "fastify";
import { addressRoutes } from "../addresses.js";
import { AddressService } from "../../services/addressService.js";
import { errorHandler } from "../../middleware/errorHandler.js";

jest.mock("../../middleware/customerAuthentication.js", () => ({
  authenticateCustomer: async (request: any, reply: any) => {
    const id = request.headers["x-test-customer-id"];
    if (!id)
      return reply.status(401).send({ error: "Customer login required" });
    request.customerId = id;
  },
  customerId: (request: any) => request.customerId,
}));

jest.mock("../../plugins/privilegedAdministration.js", () => ({
  requirePrivilegedAdministration: async (_request: any, reply: any) =>
    reply.status(401).send({ error: "Staff authentication required" }),
}));

describe("address route ownership", () => {
  const customerA = "10000000-0000-4000-8000-000000000001";
  const customerB = "10000000-0000-4000-8000-000000000002";
  const addressId = "20000000-0000-4000-8000-000000000001";

  async function buildApp() {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(addressRoutes);
    await app.ready();
    return app;
  }

  afterEach(() => jest.restoreAllMocks());

  it("does not allow one customer to list another customer's addresses", async () => {
    const list = jest
      .spyOn(AddressService.prototype, "getCustomerAddresses")
      .mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/addresses/customer/${customerB}`,
      headers: { "x-test-customer-id": customerA },
    });
    expect(response.statusCode).toBe(404);
    expect(list).not.toHaveBeenCalled();
    await app.close();
  });

  it("derives address ownership from the authenticated session", async () => {
    const create = jest
      .spyOn(AddressService.prototype, "createAddress")
      .mockResolvedValue({ id: addressId } as any);
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/addresses",
      headers: { "x-test-customer-id": customerA },
      payload: { address_type: "HOME", street: "Durbar Marg" },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: customerA,
        created_by: customerA,
      }),
    );
    await app.close();
  });

  it("rejects client-supplied ownership and verification fields", async () => {
    const app = await buildApp();
    const createResponse = await app.inject({
      method: "POST",
      url: "/addresses",
      headers: { "x-test-customer-id": customerA },
      payload: { customer_id: customerB, street: "Injected owner" },
    });
    const updateResponse = await app.inject({
      method: "PUT",
      url: `/addresses/${addressId}`,
      headers: { "x-test-customer-id": customerA },
      payload: { is_verified: true },
    });
    expect(createResponse.statusCode).toBe(400);
    expect(updateResponse.statusCode).toBe(400);
    await app.close();
  });
});
