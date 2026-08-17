import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ShoppingCartService } from "../services/shoppingCartService.js";
import { authenticateCustomer, customerId } from "../middleware/customerAuthentication.js";
import { query } from "../database/connection.js";

const shoppingCartService = new ShoppingCartService();

export async function shoppingCartRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", authenticateCustomer);
  async function assertCartOwner(cartId: string, request: Parameters<typeof authenticateCustomer>[0]) {
    const result = await query("SELECT 1 FROM shopping_carts WHERE id = $1 AND customer_id = $2 AND status = 'ACTIVE'", [cartId, customerId(request)]);
    if (!result.rowCount) throw new Error("Cart not found");
  }
  // Shopping Cart: Get or create cart
  fastify.post("/shopping-cart", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
    });

    const cartData = schema.parse(request.body);

    try {
      const cart = await shoppingCartService.getOrCreateCart({ customer_id: customerId(request), store_id: cartData.store_id });
      return reply.send(cart);
    } catch {
      return reply.status(500).send({ error: "Failed to get or create cart" });
    }
  });

  // Shopping Cart: Get cart by ID
  fastify.get("/shopping-cart/:cartId", async (request, reply) => {
    const schema = z.object({
      cartId: z.string().uuid(),
    });

    const { cartId } = schema.parse(request.params);

    try {
      await assertCartOwner(cartId, request);
      const cart = await shoppingCartService.getCart(cartId);
      if (!cart) {
        return reply.status(404).send({ error: "Cart not found" });
      }
      return reply.send(cart);
    } catch {
      return reply.status(500).send({ error: "Failed to get cart" });
    }
  });

  // Shopping Cart: Get cart items
  fastify.get("/shopping-cart/:cartId/items", async (request, reply) => {
    const schema = z.object({
      cartId: z.string().uuid(),
    });

    const { cartId } = schema.parse(request.params);

    try {
      await assertCartOwner(cartId, request);
      const items = await shoppingCartService.getCartItems(cartId);
      return reply.send(items);
    } catch {
      return reply.status(500).send({ error: "Failed to get cart items" });
    }
  });

  // Shopping Cart: Add item to cart
  fastify.post("/shopping-cart/:cartId/items", async (request, reply) => {
    const paramsSchema = z.object({
      cartId: z.string().uuid(),
    });

    const bodySchema = z.object({
      product_id: z.string().uuid(),
      quantity: z.number().positive(),
      metadata: z.any().optional(),
    });

    const { cartId } = paramsSchema.parse(request.params);
    const itemData = bodySchema.parse(request.body);

    try {
      await assertCartOwner(cartId, request);
      const item = await shoppingCartService.addToCart({
        product_id: itemData.product_id,
        quantity: itemData.quantity,
        metadata: itemData.metadata,
        cart_id: cartId,
      });
      return reply.status(201).send(item);
    } catch {
      return reply.status(500).send({ error: "Failed to add item to cart" });
    }
  });

  // Shopping Cart: Update cart item
  fastify.put("/shopping-cart/items/:itemId", async (request, reply) => {
    const paramsSchema = z.object({
      itemId: z.string().uuid(),
    });

    const bodySchema = z.object({
      quantity: z.number().positive().optional(),
    });

    const { itemId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const owner = await query("SELECT 1 FROM cart_items ci JOIN shopping_carts sc ON sc.id = ci.cart_id WHERE ci.id = $1 AND sc.customer_id = $2 AND sc.status = 'ACTIVE'", [itemId, customerId(request)]);
      if (!owner.rowCount) return reply.status(404).send({ error: "Cart item not found" });
      const item = await shoppingCartService.updateCartItem(itemId, updates);
      return reply.send(item);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update cart item" });
    }
  });

  // Shopping Cart: Remove item from cart
  fastify.delete("/shopping-cart/items/:itemId", async (request, reply) => {
    const schema = z.object({
      itemId: z.string().uuid(),
    });

    const { itemId } = schema.parse(request.params);

    try {
      const owner = await query("SELECT 1 FROM cart_items ci JOIN shopping_carts sc ON sc.id = ci.cart_id WHERE ci.id = $1 AND sc.customer_id = $2 AND sc.status = 'ACTIVE'", [itemId, customerId(request)]);
      if (!owner.rowCount) return reply.status(404).send({ error: "Cart item not found" });
      await shoppingCartService.removeFromCart(itemId);
      return reply.send({ message: "Item removed from cart" });
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to remove item from cart" });
    }
  });

  // Shopping Cart: Clear cart
  fastify.post("/shopping-cart/:cartId/clear", async (request, reply) => {
    const schema = z.object({
      cartId: z.string().uuid(),
    });

    const { cartId } = schema.parse(request.params);

    try {
      await assertCartOwner(cartId, request);
      await shoppingCartService.clearCart(cartId);
      return reply.send({ message: "Cart cleared" });
    } catch {
      return reply.status(500).send({ error: "Failed to clear cart" });
    }
  });

  // Shopping Cart: Update cart status
  fastify.put("/shopping-cart/:cartId/status", async (request, reply) => {
    const paramsSchema = z.object({
      cartId: z.string().uuid(),
    });

    const bodySchema = z.object({
      status: z.enum(["ACTIVE", "CONVERTED", "ABANDONED", "EXPIRED"]),
    });

    const { cartId } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);

    try {
      await assertCartOwner(cartId, request);
      const cart = await shoppingCartService.updateCartStatus(cartId, status);
      return reply.send(cart);
    } catch {
      return reply.status(500).send({ error: "Failed to update cart status" });
    }
  });

  // Shopping Cart: Get cart total
  fastify.get("/shopping-cart/:cartId/total", async (request, reply) => {
    const schema = z.object({
      cartId: z.string().uuid(),
    });

    const { cartId } = schema.parse(request.params);

    try {
      await assertCartOwner(cartId, request);
      const total = await shoppingCartService.getCartTotal(cartId);
      return reply.send(total);
    } catch {
      return reply.status(500).send({ error: "Failed to get cart total" });
    }
  });

  // Shopping Cart: Merge carts
  fastify.post("/shopping-cart/merge", async (request, reply) => {
    const schema = z.object({
      session_cart_id: z.string().uuid(),
      customer_cart_id: z.string().uuid(),
    });

    const { session_cart_id, customer_cart_id } = schema.parse(request.body);

    try {
      await assertCartOwner(session_cart_id, request);
      await assertCartOwner(customer_cart_id, request);
      await shoppingCartService.mergeCarts(session_cart_id, customer_cart_id);
      return reply.send({ message: "Carts merged successfully" });
    } catch {
      return reply.status(500).send({ error: "Failed to merge carts" });
    }
  });

  // Shopping Cart: Cleanup expired carts
  fastify.post("/shopping-cart/cleanup", async (_request, reply) => {
    return reply.status(403).send({ error: "Cart cleanup is an internal operation" });
  });
}
