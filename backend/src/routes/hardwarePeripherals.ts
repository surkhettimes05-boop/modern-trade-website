import { FastifyInstance } from "fastify";
import { z } from "zod";
import { hardwarePeripheralService } from "../services/hardwarePeripheralService.js";

export async function hardwarePeripheralRoutes(fastify: FastifyInstance) {
  // Hardware: Register peripheral
  fastify.post("/hardware/peripherals", async (request, reply) => {
    const schema = z.object({
      device_id: z.string().uuid(),
      peripheral_type: z.enum([
        "PRINTER",
        "SCANNER",
        "CASH_DRAWER",
        "CARD_READER",
        "DISPLAY",
        "SCALE",
      ]),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      serial_number: z.string().optional(),
      connection_type: z.string().optional(),
      port_identifier: z.string().optional(),
      config: z.any().optional(),
      metadata: z.any().optional(),
    });

    const peripheralData = schema.parse(request.body);

    try {
      const peripheral =
        await hardwarePeripheralService.registerPeripheral(peripheralData);
      return reply.status(201).send(peripheral);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to register hardware peripheral" });
    }
  });

  // Hardware: Get peripheral
  fastify.get("/hardware/peripherals/:peripheralId", async (request, reply) => {
    const schema = z.object({
      peripheralId: z.string(),
    });

    const { peripheralId } = schema.parse(request.params);

    try {
      const peripheral =
        await hardwarePeripheralService.getPeripheral(peripheralId);
      if (!peripheral) {
        return reply
          .status(404)
          .send({ error: "Hardware peripheral not found" });
      }
      return reply.send(peripheral);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get hardware peripheral" });
    }
  });

  // Hardware: Get peripherals for device
  fastify.get(
    "/hardware/peripherals/device/:deviceId",
    async (request, reply) => {
      const schema = z.object({
        deviceId: z.string().uuid(),
        include_inactive: z.coerce.boolean().optional(),
      });

      const { deviceId, include_inactive = false } = schema.parse(
        request.params,
      );

      try {
        const peripherals =
          await hardwarePeripheralService.getPeripheralsForDevice(
            deviceId,
            include_inactive,
          );
        return reply.send(peripherals);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get hardware peripherals" });
      }
    },
  );

  // Hardware: Get peripherals by type
  fastify.get(
    "/hardware/peripherals/device/:deviceId/type/:peripheralType",
    async (request, reply) => {
      const schema = z.object({
        deviceId: z.string().uuid(),
        peripheralType: z.enum([
          "PRINTER",
          "SCANNER",
          "CASH_DRAWER",
          "CARD_READER",
          "DISPLAY",
          "SCALE",
        ]),
      });

      const { deviceId, peripheralType } = schema.parse(request.params);

      try {
        const peripherals =
          await hardwarePeripheralService.getPeripheralsByType(
            deviceId,
            peripheralType,
          );
        return reply.send(peripherals);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to get hardware peripherals by type" });
      }
    },
  );

  // Hardware: Update peripheral status
  fastify.put(
    "/hardware/peripherals/:peripheralId/status",
    async (request, reply) => {
      const paramsSchema = z.object({
        peripheralId: z.string(),
      });

      const bodySchema = z.object({
        status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR"]),
      });

      const { peripheralId } = paramsSchema.parse(request.params);
      const { status } = bodySchema.parse(request.body);

      try {
        const peripheral =
          await hardwarePeripheralService.updatePeripheralStatus(
            peripheralId,
            status,
          );
        return reply.send(peripheral);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Peripheral not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update peripheral status" });
      }
    },
  );

  // Hardware: Update peripheral config
  fastify.put(
    "/hardware/peripherals/:peripheralId/config",
    async (request, reply) => {
      const paramsSchema = z.object({
        peripheralId: z.string(),
      });

      const bodySchema = z.object({
        config: z.any(),
      });

      const { peripheralId } = paramsSchema.parse(request.params);
      const { config } = bodySchema.parse(request.body);

      try {
        const peripheral =
          await hardwarePeripheralService.updatePeripheralConfig(
            peripheralId,
            config,
          );
        return reply.send(peripheral);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Peripheral not found"
        ) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update peripheral config" });
      }
    },
  );

  // Hardware: Delete peripheral
  fastify.delete(
    "/hardware/peripherals/:peripheralId",
    async (request, reply) => {
      const schema = z.object({
        peripheralId: z.string(),
      });

      const { peripheralId } = schema.parse(request.params);

      try {
        await hardwarePeripheralService.deletePeripheral(peripheralId);
        return reply.status(204).send();
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to delete hardware peripheral" });
      }
    },
  );
}
