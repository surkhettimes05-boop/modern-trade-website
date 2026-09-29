import { FastifyInstance } from "fastify";
import { z } from "zod";
import { retailerOrderService } from "../services/retailerOrderService.js";
import { authenticateStaff } from "../middleware/authentication.js";
import { csrfMatches } from "../utils/csrf.js";
import { requireCapability } from "../plugins/authorization.js";
import { bindAuthenticatedAuditActor } from "../utils/auditActor.js";

// ============================================
// ZOD SCHEMAS
// ============================================

const createRetailerOrderSchema = z.object({
  retailer_id: z.string().uuid(),
  store_id: z.string().uuid().optional(),
  warehouse_id: z.string().uuid().optional(),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().positive(),
      unit_price: z.number().nonnegative(),
      discount_amount: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }),
  ).min(1),
  delivery_type: z.string().optional(),
  requested_delivery_date: z.string().optional(),
  requested_delivery_time_slot: z.string().optional(),
  delivery_address: z.string().optional(),
  delivery_contact_name: z.string().optional(),
  delivery_contact_phone: z.string().optional(),
  internal_notes: z.string().optional(),
  customer_notes: z.string().optional(),
  idempotency_key: z.string().optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "SUBMITTED",
    "CONFIRMED",
    "PROCESSING",
    "READY_FOR_PICKUP",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]),
});

export async function retailerOrderRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook("onRequest", authenticateStaff);

  // CSRF validation for write operations
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.method !== "GET" && !csrfMatches(request)) {
      return reply.status(403).send({
        error: "CSRF validation failed",
        code: "CSRF_INVALID",
      });
    }
    bindAuthenticatedAuditActor(request);
  });

  // ============================================
  // SALES REPRESENTATIVE ENDPOINTS
  // ============================================

  // GET assigned retailers
  fastify.get(
    "/sales-rep/retailers",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailers.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { id: string };
      const retailers = await retailerOrderService.getAssignedRetailers(user.id);
      reply.send({ retailers });
    },
  );

  // GET sales rep orders
  fastify.get(
    "/sales-rep/orders",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { id: string };
      const query = request.query as {
        status?: string;
        retailer_id?: string;
        limit?: string;
        offset?: string;
      };

      const orders = await retailerOrderService.getSalesRepOrders(user.id, {
        status: query.status,
        retailer_id: query.retailer_id,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      });

      reply.send({ orders });
    },
  );

  // POST create retailer order
  fastify.post(
    "/sales-rep/orders",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.create");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { id: string };
      const body = createRetailerOrderSchema.parse(request.body);

      const order = await retailerOrderService.createRetailerOrder({
        ...body,
        sales_rep_id: user.id,
        created_by: user.id,
        requested_delivery_date: body.requested_delivery_date
          ? new Date(body.requested_delivery_date)
          : undefined,
      });

      reply.status(201).send({ order });
    },
  );

  // GET retailer order by ID
  fastify.get(
    "/sales-rep/orders/:orderId",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const order = await retailerOrderService.getRetailerOrderById(orderId);

      if (!order) {
        return reply.status(404).send({ error: "Order not found" });
      }

      // Get order items
      const items = await retailerOrderService.getRetailerOrderItems(orderId);

      reply.send({ order, items });
    },
  );

  // GET retailer order by number
  fastify.get(
    "/sales-rep/orders/number/:orderNumber",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const { orderNumber } = request.params as { orderNumber: string };
      const order = await retailerOrderService.getRetailerOrderByNumber(orderNumber);

      if (!order) {
        return reply.status(404).send({ error: "Order not found" });
      }

      // Get order items
      const items = await retailerOrderService.getRetailerOrderItems(order.id);

      reply.send({ order, items });
    },
  );

  // PUT update order status (sales rep can only update their own orders)
  fastify.put(
    "/sales-rep/orders/:orderId/status",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.modify");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const user = request.user as { id: string };
      const body = updateOrderStatusSchema.parse(request.body);

      // Verify order belongs to sales rep
      const existingOrder = await retailerOrderService.getRetailerOrderById(orderId);
      if (!existingOrder) {
        return reply.status(404).send({ error: "Order not found" });
      }

      if (existingOrder.sales_rep_id !== user.id) {
        return reply.status(403).send({ error: "Not authorized to modify this order" });
      }

      const order = await retailerOrderService.updateRetailerOrderStatus(
        orderId,
        body.status,
        user.id,
      );

      reply.send({ order });
    },
  );

  // ============================================
  // WAREHOUSE/OPERATIONS ENDPOINTS
  // ============================================

  // GET all retailer orders (for warehouse/operations)
  fastify.get(
    "/warehouse/retailer-orders",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        retailer_id?: string;
        warehouse_id?: string;
        limit?: string;
        offset?: string;
      };

      const orders = await retailerOrderService.getAllRetailerOrders({
        status: query.status,
        retailer_id: query.retailer_id,
        warehouse_id: query.warehouse_id,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      });

      reply.send({ orders });
    },
  );

  // GET retailer order by ID (warehouse view)
  fastify.get(
    "/warehouse/retailer-orders/:orderId",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.read");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const order = await retailerOrderService.getRetailerOrderById(orderId);

      if (!order) {
        return reply.status(404).send({ error: "Order not found" });
      }

      // Get order items
      const items = await retailerOrderService.getRetailerOrderItems(orderId);

      reply.send({ order, items });
    },
  );

  // PUT update order status (warehouse/operations)
  fastify.put(
    "/warehouse/retailer-orders/:orderId/status",
    {
      preHandler: async (request, reply) => {
        try {
          await requireCapability(request, "retailer_orders.fulfil");
        } catch (error) {
          reply.status(403).send({ error: "Forbidden", message: (error as Error).message });
        }
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const user = request.user as { id: string };
      const body = updateOrderStatusSchema.parse(request.body);

      const order = await retailerOrderService.updateRetailerOrderStatus(
        orderId,
        body.status,
        user.id,
      );

      reply.send({ order });
    },
  );
}
