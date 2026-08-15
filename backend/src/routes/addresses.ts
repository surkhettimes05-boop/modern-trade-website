import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AddressService } from "../services/addressService.js";

const addressService = new AddressService();

export async function addressRoutes(fastify: FastifyInstance) {
  // Address: Create address
  fastify.post("/addresses", async (request, reply) => {
    const schema = z.object({
      customer_id: z.string().uuid(),
      province_id: z.number().optional(),
      district_id: z.number().optional(),
      municipality_id: z.number().optional(),
      ward_id: z.number().optional(),
      tole_locality: z.string().optional(),
      landmark: z.string().optional(),
      street: z.string().optional(),
      house_number: z.string().optional(),
      postal_code: z.string().optional(),
      phone: z.string().optional(),
      delivery_instructions: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address_type: z.enum(["HOME", "WORK", "OTHER"]).optional(),
      is_default: z.boolean().optional(),
      map_provider: z.string().optional(),
      map_reference_id: z.string().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const addressData = schema.parse(request.body);

    try {
      const address = await addressService.createAddress(addressData);
      return reply.status(201).send(address);
    } catch {
      return reply.status(500).send({ error: "Failed to create address" });
    }
  });

  // Address: Get address by ID
  fastify.get("/addresses/:addressId", async (request, reply) => {
    const schema = z.object({
      addressId: z.string().uuid(),
    });

    const { addressId } = schema.parse(request.params);

    try {
      const address = await addressService.getAddress(addressId);
      if (!address) {
        return reply.status(404).send({ error: "Address not found" });
      }
      return reply.send(address);
    } catch {
      return reply.status(500).send({ error: "Failed to get address" });
    }
  });

  // Address: Get customer addresses
  fastify.get("/addresses/customer/:customerId", async (request, reply) => {
    const schema = z.object({
      customerId: z.string().uuid(),
    });

    const { customerId } = schema.parse(request.params);

    try {
      const addresses = await addressService.getCustomerAddresses(customerId);
      return reply.send(addresses);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get customer addresses" });
    }
  });

  // Address: Get default address
  fastify.get(
    "/addresses/customer/:customerId/default",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
      });

      const { customerId } = schema.parse(request.params);

      try {
        const address = await addressService.getDefaultAddress(customerId);
        if (!address) {
          return reply.status(404).send({ error: "Default address not found" });
        }
        return reply.send(address);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get default address" });
      }
    },
  );

  // Address: Update address
  fastify.put("/addresses/:addressId", async (request, reply) => {
    const paramsSchema = z.object({
      addressId: z.string().uuid(),
    });

    const bodySchema = z.object({
      province_id: z.number().optional(),
      district_id: z.number().optional(),
      municipality_id: z.number().optional(),
      ward_id: z.number().optional(),
      tole_locality: z.string().optional(),
      landmark: z.string().optional(),
      street: z.string().optional(),
      house_number: z.string().optional(),
      postal_code: z.string().optional(),
      phone: z.string().optional(),
      delivery_instructions: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address_type: z.enum(["HOME", "WORK", "OTHER"]).optional(),
      is_default: z.boolean().optional(),
      is_verified: z.boolean().optional(),
      verification_status: z.enum(["PENDING", "VERIFIED", "FAILED"]).optional(),
      map_provider: z.string().optional(),
      map_reference_id: z.string().optional(),
      is_serviceable: z.boolean().optional(),
      serviceability_result: z.any().optional(),
      metadata: z.any().optional(),
    });

    const { addressId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const address = await addressService.updateAddress(addressId, updates);
      return reply.send(address);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update address" });
    }
  });

  // Address: Set default address
  fastify.post(
    "/addresses/customer/:customerId/default/:addressId",
    async (request, reply) => {
      const schema = z.object({
        customerId: z.string().uuid(),
        addressId: z.string().uuid(),
      });

      const { customerId, addressId } = schema.parse(request.params);

      try {
        const address = await addressService.setDefaultAddress(
          customerId,
          addressId,
        );
        return reply.send(address);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to set default address" });
      }
    },
  );

  // Address: Delete address
  fastify.delete("/addresses/:addressId", async (request, reply) => {
    const schema = z.object({
      addressId: z.string().uuid(),
    });

    const { addressId } = schema.parse(request.params);

    try {
      await addressService.deleteAddress(addressId);
      return reply.send({ message: "Address deleted" });
    } catch {
      return reply.status(500).send({ error: "Failed to delete address" });
    }
  });

  // Address: Verify address
  fastify.post("/addresses/:addressId/verify", async (request, reply) => {
    const paramsSchema = z.object({
      addressId: z.string().uuid(),
    });

    const bodySchema = z.object({
      verification_status: z.enum(["PENDING", "VERIFIED", "FAILED"]),
      map_provider: z.string().optional(),
      map_reference_id: z.string().optional(),
      serviceability_result: z.any().optional(),
    });

    const { addressId } = paramsSchema.parse(request.params);
    const verificationData = bodySchema.parse(request.body);

    try {
      const address = await addressService.verifyAddress(
        addressId,
        verificationData,
      );
      return reply.send(address);
    } catch {
      return reply.status(500).send({ error: "Failed to verify address" });
    }
  });

  // Administrative divisions: Get provinces
  fastify.get("/admin/divisions/provinces", async (_request, reply) => {
    try {
      const provinces = await addressService.getProvinces();
      return reply.send(provinces);
    } catch {
      return reply.status(500).send({ error: "Failed to get provinces" });
    }
  });

  // Administrative divisions: Get districts
  fastify.get("/admin/divisions/districts", async (request, reply) => {
    const schema = z.object({
      province_id: z.number().optional(),
    });

    const { province_id } = schema.parse(request.query);

    try {
      const districts = await addressService.getDistricts(province_id);
      return reply.send(districts);
    } catch {
      return reply.status(500).send({ error: "Failed to get districts" });
    }
  });

  // Administrative divisions: Get municipalities
  fastify.get("/admin/divisions/municipalities", async (request, reply) => {
    const schema = z.object({
      district_id: z.number().optional(),
    });

    const { district_id } = schema.parse(request.query);

    try {
      const municipalities =
        await addressService.getMunicipalities(district_id);
      return reply.send(municipalities);
    } catch {
      return reply.status(500).send({ error: "Failed to get municipalities" });
    }
  });

  // Administrative divisions: Get wards
  fastify.get("/admin/divisions/wards", async (request, reply) => {
    const schema = z.object({
      municipality_id: z.number().optional(),
    });

    const { municipality_id } = schema.parse(request.query);

    try {
      const wards = await addressService.getWards(municipality_id);
      return reply.send(wards);
    } catch {
      return reply.status(500).send({ error: "Failed to get wards" });
    }
  });
}
