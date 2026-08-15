import { FastifyInstance } from "fastify";
import { z } from "zod";
import { DeliveryZoneService } from "../services/deliveryZoneService.js";

const deliveryZoneService = new DeliveryZoneService();

export async function deliveryZoneRoutes(fastify: FastifyInstance) {
  // Delivery Zone: Create zone
  fastify.post("/delivery-zones", async (request, reply) => {
    const schema = z.object({
      zone_name: z.string().min(1),
      store_id: z.string().uuid(),
      zone_type: z.enum(["STANDARD", "EXPRESS", "RESTRICTED"]).optional(),
      included_municipalities: z.array(z.number()).optional(),
      included_wards: z.array(z.number()).optional(),
      excluded_areas: z.array(z.string()).optional(),
      base_fee: z.number().nonnegative(),
      surcharge: z.number().nonnegative().optional(),
      free_delivery_threshold: z.number().nonnegative().optional(),
      minimum_order_value: z.number().nonnegative().optional(),
      estimated_delivery_hours: z.number().optional(),
      delivery_time_slots: z.any().optional(),
      effective_date: z.coerce.date().optional(),
      expiry_date: z.coerce.date().optional(),
      created_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const zoneData = schema.parse(request.body);

    try {
      const zone = await deliveryZoneService.createDeliveryZone(zoneData);
      return reply.status(201).send(zone);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create delivery zone" });
    }
  });

  // Delivery Zone: Get zone by ID
  fastify.get("/delivery-zones/:zoneId", async (request, reply) => {
    const schema = z.object({
      zoneId: z.string().uuid(),
    });

    const { zoneId } = schema.parse(request.params);

    try {
      const zone = await deliveryZoneService.getDeliveryZone(zoneId);
      if (!zone) {
        return reply.status(404).send({ error: "Delivery zone not found" });
      }
      return reply.send(zone);
    } catch {
      return reply.status(500).send({ error: "Failed to get delivery zone" });
    }
  });

  // Delivery Zone: Get store zones
  fastify.get("/delivery-zones/store/:storeId", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
    });

    const querySchema = z.object({
      active_only: z.coerce.boolean().optional(),
    });

    const { storeId } = schema.parse(request.params);
    const { active_only } = querySchema.parse(request.query);

    try {
      const zones = await deliveryZoneService.getStoreDeliveryZones(
        storeId,
        active_only !== false,
      );
      return reply.send(zones);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get store delivery zones" });
    }
  });

  // Delivery Zone: Get delivery quote
  fastify.post("/delivery-zones/quote", async (request, reply) => {
    const schema = z.object({
      municipality_id: z.number().optional(),
      ward_id: z.number().optional(),
      store_id: z.string().uuid(),
      order_value: z.number().optional(),
    });

    const addressData = schema.parse(request.body);

    try {
      const quote = await deliveryZoneService.getDeliveryQuote(addressData);
      return reply.send(quote);
    } catch {
      return reply.status(500).send({ error: "Failed to get delivery quote" });
    }
  });

  // Delivery Zone: Update zone
  fastify.put("/delivery-zones/:zoneId", async (request, reply) => {
    const paramsSchema = z.object({
      zoneId: z.string().uuid(),
    });

    const bodySchema = z.object({
      zone_name: z.string().min(1).optional(),
      zone_type: z.enum(["STANDARD", "EXPRESS", "RESTRICTED"]).optional(),
      included_municipalities: z.array(z.number()).optional(),
      included_wards: z.array(z.number()).optional(),
      excluded_areas: z.array(z.string()).optional(),
      base_fee: z.number().nonnegative().optional(),
      surcharge: z.number().nonnegative().optional(),
      free_delivery_threshold: z.number().nonnegative().optional(),
      minimum_order_value: z.number().nonnegative().optional(),
      estimated_delivery_hours: z.number().optional(),
      delivery_time_slots: z.any().optional(),
      is_active: z.boolean().optional(),
      effective_date: z.coerce.date().optional(),
      expiry_date: z.coerce.date().optional(),
      metadata: z.any().optional(),
    });

    const { zoneId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const zone = await deliveryZoneService.updateDeliveryZone(
        zoneId,
        updates,
      );
      return reply.send(zone);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update delivery zone" });
    }
  });

  // Delivery Zone: Delete zone
  fastify.delete("/delivery-zones/:zoneId", async (request, reply) => {
    const schema = z.object({
      zoneId: z.string().uuid(),
    });

    const { zoneId } = schema.parse(request.params);

    try {
      await deliveryZoneService.deleteDeliveryZone(zoneId);
      return reply.send({ message: "Delivery zone deleted" });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to delete delivery zone" });
    }
  });
}
