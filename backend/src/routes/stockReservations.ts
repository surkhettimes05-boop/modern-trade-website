import { FastifyInstance } from "fastify";
import { z } from "zod";
import { StockReservationService } from "../services/stockReservationService.js";

const stockReservationService = new StockReservationService();

export async function stockReservationRoutes(fastify: FastifyInstance) {
  // Stock Reservation: Create reservation
  fastify.post("/stock-reservations", async (request, reply) => {
    const schema = z.object({
      cart_id: z.string().uuid().optional(),
      order_id: z.string().uuid().optional(),
      product_id: z.string().uuid(),
      store_id: z.string().uuid(),
      batch_id: z.string().optional(),
      quantity: z.number().positive(),
      expires_in_minutes: z.number().optional(),
    });

    const reservationData = schema.parse(request.body);

    try {
      const reservation =
        await stockReservationService.createReservation(reservationData);
      return reply.status(201).send(reservation);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Insufficient stock")
      ) {
        return reply.status(400).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to create reservation" });
    }
  });

  // Stock Reservation: Get reservation by ID
  fastify.get("/stock-reservations/:reservationId", async (request, reply) => {
    const schema = z.object({
      reservationId: z.string(),
    });

    const { reservationId } = schema.parse(request.params);

    try {
      const reservation =
        await stockReservationService.getReservation(reservationId);
      if (!reservation) {
        return reply.status(404).send({ error: "Reservation not found" });
      }
      return reply.send(reservation);
    } catch {
      return reply.status(500).send({ error: "Failed to get reservation" });
    }
  });

  // Stock Reservation: Get cart reservations
  fastify.get("/stock-reservations/cart/:cartId", async (request, reply) => {
    const schema = z.object({
      cartId: z.string().uuid(),
    });

    const { cartId } = schema.parse(request.params);

    try {
      const reservations =
        await stockReservationService.getCartReservations(cartId);
      return reply.send(reservations);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get cart reservations" });
    }
  });

  // Stock Reservation: Get order reservations
  fastify.get("/stock-reservations/order/:orderId", async (request, reply) => {
    const schema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = schema.parse(request.params);

    try {
      const reservations =
        await stockReservationService.getOrderReservations(orderId);
      return reply.send(reservations);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get order reservations" });
    }
  });

  // Stock Reservation: Consume reservation
  fastify.post(
    "/stock-reservations/:reservationId/consume",
    async (request, reply) => {
      const schema = z.object({
        reservationId: z.string(),
      });

      const { reservationId } = schema.parse(request.params);

      try {
        const reservation =
          await stockReservationService.consumeReservation(reservationId);
        return reply.send(reservation);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("not found or already")
        ) {
          return reply.status(400).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to consume reservation" });
      }
    },
  );

  // Stock Reservation: Cancel reservation
  fastify.post(
    "/stock-reservations/:reservationId/cancel",
    async (request, reply) => {
      const schema = z.object({
        reservationId: z.string(),
      });

      const { reservationId } = schema.parse(request.params);

      try {
        const reservation =
          await stockReservationService.cancelReservation(reservationId);
        return reply.send(reservation);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("not found or already")
        ) {
          return reply.status(400).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: "Failed to cancel reservation" });
      }
    },
  );

  // Stock Reservation: Cancel cart reservations
  fastify.post(
    "/stock-reservations/cart/:cartId/cancel",
    async (request, reply) => {
      const schema = z.object({
        cartId: z.string().uuid(),
      });

      const { cartId } = schema.parse(request.params);

      try {
        const count =
          await stockReservationService.cancelCartReservations(cartId);
        return reply.send({ cancelled: count });
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to cancel cart reservations" });
      }
    },
  );

  // Stock Reservation: Transfer to order
  fastify.post("/stock-reservations/transfer", async (request, reply) => {
    const schema = z.object({
      cart_id: z.string().uuid(),
      order_id: z.string().uuid(),
    });

    const { cart_id, order_id } = schema.parse(request.body);

    try {
      await stockReservationService.transferReservationsToOrder(
        cart_id,
        order_id,
      );
      return reply.send({ message: "Reservations transferred successfully" });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to transfer reservations" });
    }
  });

  // Stock Reservation: Expire old reservations
  fastify.post("/stock-reservations/expire", async (_request, reply) => {
    try {
      const count = await stockReservationService.expireReservations();
      return reply.send({ expired: count });
    } catch {
      return reply.status(500).send({ error: "Failed to expire reservations" });
    }
  });
}
