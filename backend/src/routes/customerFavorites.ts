import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";
import {
  CustomerFavoriteService,
  FavoriteProductNotFoundError,
} from "../services/customerFavoriteService.js";

const favoriteService = new CustomerFavoriteService();

export async function customerFavoritesRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/customer/favorites",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      try {
        return { product_ids: await favoriteService.list(customerId(request)) };
      } catch {
        return reply
          .status(500)
          .send({ error: "Could not load saved products" });
      }
    },
  );

  fastify.put(
    "/customer/favorites/:productId",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      const { productId } = z
        .object({ productId: z.string().uuid() })
        .parse(request.params);
      try {
        await favoriteService.add(customerId(request), productId);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof FavoriteProductNotFoundError) {
          return reply.status(404).send({ error: "Product not found" });
        }
        return reply.status(500).send({ error: "Could not save product" });
      }
    },
  );

  fastify.delete(
    "/customer/favorites/:productId",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      const { productId } = z
        .object({ productId: z.string().uuid() })
        .parse(request.params);
      try {
        await favoriteService.remove(customerId(request), productId);
        return reply.status(204).send();
      } catch {
        return reply
          .status(500)
          .send({ error: "Could not remove saved product" });
      }
    },
  );
}
