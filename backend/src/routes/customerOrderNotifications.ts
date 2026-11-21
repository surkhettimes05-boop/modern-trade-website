import { FastifyInstance } from "fastify";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import { CustomerOrderNotificationService } from "../services/customerOrderNotificationService.js";

const notifications = new CustomerOrderNotificationService();

export async function customerOrderNotificationRoutes(
  fastify: FastifyInstance,
) {
  fastify.get(
    "/customer/notifications/order-status",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      try {
        return await notifications.list(customerId(request));
      } catch (error) {
        request.log.error({ error }, "Failed to load customer order updates");
        return reply
          .status(500)
          .send({ error: "Could not load order updates" });
      }
    },
  );
}
