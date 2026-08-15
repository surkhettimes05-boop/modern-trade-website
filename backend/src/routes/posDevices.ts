import { FastifyInstance } from "fastify";
import { z } from "zod";
import { posDeviceService } from "../services/posDeviceService.js";

export async function posDeviceRoutes(fastify: FastifyInstance) {
  // POS Devices: Register device
  fastify.post("/pos-devices", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      device_name: z.string(),
      device_type: z.enum(["DESKTOP", "TABLET", "MOBILE", "KIOSK"]),
      operating_system: z.string().optional(),
      os_version: z.string().optional(),
      app_version: z.string().optional(),
      hardware_profile: z.any().optional(),
      location_name: z.string().optional(),
      location_lat: z.number().optional(),
      location_lng: z.number().optional(),
      config: z.any().optional(),
      registered_by: z.string().optional(),
      metadata: z.any().optional(),
    });

    const deviceData = schema.parse(request.body);

    try {
      const device = await posDeviceService.registerDevice(deviceData);
      return reply.status(201).send(device);
    } catch {
      return reply.status(500).send({ error: "Failed to register POS device" });
    }
  });

  // POS Devices: Get device
  fastify.get("/pos-devices/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      const device = await posDeviceService.getDevice(deviceId);
      if (!device) {
        return reply.status(404).send({ error: "POS device not found" });
      }
      return reply.send(device);
    } catch {
      return reply.status(500).send({ error: "Failed to get POS device" });
    }
  });

  // POS Devices: Get devices for store
  fastify.get("/pos-devices/store/:storeId", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
      include_inactive: z.coerce.boolean().optional(),
    });

    const { storeId, include_inactive = false } = schema.parse(request.params);

    try {
      const devices = await posDeviceService.getDevicesForStore(
        storeId,
        include_inactive,
      );
      return reply.send(devices);
    } catch {
      return reply.status(500).send({ error: "Failed to get POS devices" });
    }
  });

  // POS Devices: Update heartbeat
  fastify.post("/pos-devices/:deviceId/heartbeat", async (request, reply) => {
    const paramsSchema = z.object({
      deviceId: z.string(),
    });

    const bodySchema = z.object({
      is_online: z.boolean().optional(),
    });

    const { deviceId } = paramsSchema.parse(request.params);
    const { is_online = true } = bodySchema.parse(request.body);

    try {
      const device = await posDeviceService.updateHeartbeat(
        deviceId,
        is_online,
      );
      return reply.send(device);
    } catch (error) {
      if (error instanceof Error && error.message === "Device not found") {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to update heartbeat" });
    }
  });

  // POS Devices: Update device status
  fastify.put("/pos-devices/:deviceId/status", async (request, reply) => {
    const paramsSchema = z.object({
      deviceId: z.string(),
    });

    const bodySchema = z.object({
      is_active: z.boolean().optional(),
      is_online: z.boolean().optional(),
      config: z.any().optional(),
    });

    const { deviceId } = paramsSchema.parse(request.params);
    const statusData = bodySchema.parse(request.body);

    try {
      const device = await posDeviceService.updateDeviceStatus(
        deviceId,
        statusData,
      );
      return reply.send(device);
    } catch (error) {
      if (error instanceof Error && error.message === "Device not found") {
        return reply.status(404).send({ error: error.message });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update device status" });
    }
  });

  // POS Devices: Get offline devices
  fastify.get("/pos-devices/offline", async (request, reply) => {
    const schema = z.object({
      threshold_minutes: z.coerce.number().int().positive().optional(),
    });

    const { threshold_minutes = 15 } = schema.parse(request.query);

    try {
      const devices =
        await posDeviceService.getOfflineDevices(threshold_minutes);
      return reply.send(devices);
    } catch {
      return reply.status(500).send({ error: "Failed to get offline devices" });
    }
  });

  // POS Devices: Mark offline devices
  fastify.post("/pos-devices/mark-offline", async (request, reply) => {
    const schema = z.object({
      threshold_minutes: z.coerce.number().int().positive().optional(),
    });

    const { threshold_minutes = 15 } = schema.parse(request.body);

    try {
      const count =
        await posDeviceService.markOfflineDevices(threshold_minutes);
      return reply.send({ marked_offline: count });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to mark offline devices" });
    }
  });

  // POS Devices: Delete device
  fastify.delete("/pos-devices/:deviceId", async (request, reply) => {
    const schema = z.object({
      deviceId: z.string(),
    });

    const { deviceId } = schema.parse(request.params);

    try {
      await posDeviceService.deleteDevice(deviceId);
      return reply.status(204).send();
    } catch {
      return reply.status(500).send({ error: "Failed to delete POS device" });
    }
  });
}
