import Fastify from "fastify";
import { addressRoutes } from "../addresses.js";
import { AddressService } from "../../services/addressService.js";
import { errorHandler } from "../../middleware/errorHandler.js";

describe("address division query IDs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("coerces HTTP query strings to numeric IDs", async () => {
    const districts = jest
      .spyOn(AddressService.prototype, "getDistricts")
      .mockResolvedValue([]);
    const municipalities = jest
      .spyOn(AddressService.prototype, "getMunicipalities")
      .mockResolvedValue([]);
    const wards = jest
      .spyOn(AddressService.prototype, "getWards")
      .mockResolvedValue([]);
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(addressRoutes);
    await app.ready();

    const districtResponse = await app.inject({
      method: "GET",
      url: "/admin/divisions/districts?province_id=6",
    });
    const municipalityResponse = await app.inject({
      method: "GET",
      url: "/admin/divisions/municipalities?district_id=45",
    });
    const wardResponse = await app.inject({
      method: "GET",
      url: "/admin/divisions/wards?municipality_id=123",
    });

    expect(districtResponse.statusCode).toBe(200);
    expect(municipalityResponse.statusCode).toBe(200);
    expect(wardResponse.statusCode).toBe(200);
    expect(districts).toHaveBeenCalledWith(6);
    expect(municipalities).toHaveBeenCalledWith(45);
    expect(wards).toHaveBeenCalledWith(123);
    await app.close();
  });
});
