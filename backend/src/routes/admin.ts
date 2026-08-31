import { FastifyInstance } from "fastify";
import { z } from "zod";
import { preHandler } from "../middleware/authentication.js";
import { MARKET } from "../config/market.js";
import { query } from "../database/connection.js";

type AdminActor = {
  id: string;
  capabilities?: string[];
  roleKey?: string;
  scopeType?: string;
  scopeOrganizationId?: string;
  scopeStoreIds?: string[];
  storeId?: string;
};

function isPrivileged(user: AdminActor): boolean {
  return (
    user.roleKey === "platform_admin" ||
    Boolean(user.capabilities?.includes("system.manage"))
  );
}

async function allowedStoreIds(
  user: AdminActor,
  requestedStoreId?: string,
): Promise<string[] | null> {
  if (user.scopeType === "GLOBAL" || isPrivileged(user))
    return requestedStoreId ? [requestedStoreId] : null;
  if (user.scopeType === "ORGANIZATION" && user.scopeOrganizationId) {
    const result = await query(
      "SELECT id::text FROM stores WHERE organization_id = $1",
      [user.scopeOrganizationId],
    );
    const ids = result.rows.map((row) => String(row.id));
    return requestedStoreId ? ids.filter((id) => id === requestedStoreId) : ids;
  }
  const ids = user.scopeStoreIds?.length
    ? user.scopeStoreIds
    : user.storeId
      ? [user.storeId]
      : [];
  return requestedStoreId ? ids.filter((id) => id === requestedStoreId) : ids;
}

function actor(request: { user?: unknown }): AdminActor {
  return request.user as AdminActor;
}

// Validation schemas
const publicationStatusSchema = z.enum([
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "UNPUBLISHED",
  "EXPIRED",
]);
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "URL must use HTTPS",
  });

export async function adminRoutes(fastify: FastifyInstance) {
  // Use centralized authentication middleware
  fastify.addHook("preHandler", preHandler.authenticate);
  fastify.addHook("preHandler", async (request, reply) => {
    const user = request.user as AdminActor;
    const capabilities = user.capabilities || [];
    const resource = request.url
      .split("?")[0]
      .replace(/^\/api\/admin\/?/, "")
      .split("/")[0];
    const required =
      request.method === "GET"
        ? `${resource === "pages" ? "content" : resource}.read`
        : `${resource === "pages" ? "content" : resource}.write`;
    const aliases: Record<string, string> = {
      products: "catalog",
      categories: "catalog",
      stores: "stores",
      pages: "content",
      context: "dashboard",
      notifications: "dashboard",
      search: "dashboard",
      "inventory-adjustments": "inventory",
      roles: "roles",
      orders: "orders",
      batches: "inventory",
      suppliers: "procurement",
      "purchase-orders": "procurement",
      receiving: "procurement",
      staff: "staff",
    };
    const readOnlyUtility = ["context", "notifications", "search"].includes(
      resource,
    );
    const capability =
      resource === "roles"
        ? "roles.manage"
        : resource === "stores"
          ? `stores.${request.method === "GET" ? "read" : "manage"}`
          : aliases[resource]
            ? `${aliases[resource]}.${request.method === "GET" || readOnlyUtility ? "read" : "write"}`
            : required;
    if (
      !isPrivileged(user) &&
      !capabilities.includes(capability) &&
      !capabilities.includes("all")
    ) {
      return reply.status(403).send({
        error: "Forbidden",
        code: "FORBIDDEN",
        message: `Missing capability: ${capability}`,
        requestId: request.id,
      });
    }
  });

  fastify.get("/context/stores", async (request, reply) => {
    const user = actor(request);
    const storeIds = await allowedStoreIds(user);
    if (storeIds && storeIds.length === 0) return { items: [] };
    try {
      const result = await query(
        `SELECT id, name_en AS name, NULL::text AS code
         FROM stores
         WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
         ORDER BY name_en`,
        [storeIds],
      );
      return { items: result.rows };
    } catch (error) {
      request.log.error({ error }, "Failed to load authorized store context");
      return reply.status(500).send({ error: "Failed to load store scope" });
    }
  });

  fastify.get("/notifications", async (request, reply) => {
    const filters = z
      .object({ store_id: z.string().uuid().optional() })
      .parse(request.query);
    const user = actor(request);
    const storeIds = await allowedStoreIds(user, filters.store_id);
    if (filters.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    try {
      const result = await query(
        `WITH inventory AS (
           SELECT bi.store_id, bi.product_id, p.name_en, p.sku, SUM(bi.quantity)::numeric AS quantity
           FROM batch_inventory bi JOIN products p ON p.id = bi.product_id
           WHERE ($1::uuid[] IS NULL OR bi.store_id = ANY($1::uuid[]))
           GROUP BY bi.store_id, bi.product_id, p.name_en, p.sku
         ), alerts AS (
           SELECT ('inventory:' || store_id || ':' || product_id)::text AS id,
             CASE WHEN quantity <= 0 THEN 'Out of stock' ELSE 'Low inventory' END AS title,
             name_en || ' (' || sku || ') has ' || quantity || ' units available.' AS message,
             '/admin/inventory?product_id=' || product_id AS href,
             CASE WHEN quantity <= 0 THEN 'critical' ELSE 'warning' END AS severity,
             NOW() AS created_at
           FROM inventory WHERE quantity <= 5
           UNION ALL
           SELECT ('po-overdue:' || po.id)::text, 'Purchase order overdue',
             po.po_number || ' was expected on ' || po.expected_delivery_date::text || '.',
             '/admin/procurement/purchase-orders/' || po.id, 'warning', po.created_at
           FROM purchase_orders po
           WHERE po.expected_delivery_date < CURRENT_DATE
             AND po.status NOT IN ('RECEIVED', 'CANCELLED')
             AND ($1::uuid[] IS NULL OR po.store_id = ANY($1::uuid[]))
           UNION ALL
           SELECT ('order-failed:' || wo.id)::text, 'Order payment failed',
             wo.order_number || ' requires payment attention.',
             '/admin/commerce/orders/' || wo.id, 'critical', wo.updated_at
           FROM web_orders wo
           WHERE wo.payment_status = 'FAILED'
             AND ($1::uuid[] IS NULL OR wo.store_id = ANY($1::uuid[]))
         )
         SELECT a.id, a.title, a.message, a.href, a.severity, a.created_at AS "createdAt",
                (r.notification_key IS NOT NULL) AS read
         FROM alerts a
         LEFT JOIN admin_notification_reads r ON r.staff_id = $2 AND r.notification_key = a.id
         ORDER BY read ASC, a.created_at DESC LIMIT 40`,
        [storeIds, user.id],
      );
      return {
        items: result.rows,
        unread: result.rows.filter((row) => !row.read).length,
      };
    } catch (error) {
      request.log.error({ error }, "Failed to load admin notifications");
      return reply.status(500).send({ error: "Failed to load notifications" });
    }
  });

  fastify.post("/notifications/read", async (request, reply) => {
    const body = z
      .object({ ids: z.array(z.string().min(1).max(255)).min(1).max(100) })
      .parse(request.body);
    const user = actor(request);
    await query(
      `INSERT INTO admin_notification_reads (staff_id, notification_key)
       SELECT $1, key FROM unnest($2::text[]) AS key
       ON CONFLICT (staff_id, notification_key) DO UPDATE SET read_at = NOW()`,
      [user.id, body.ids],
    );
    return reply.send({ success: true });
  });

  fastify.get("/search", async (request, reply) => {
    const input = z
      .object({
        q: z.string().trim().min(2).max(100),
        store_id: z.string().uuid().optional(),
      })
      .parse(request.query);
    const user = actor(request);
    const storeIds = await allowedStoreIds(user, input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const pattern = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
    const items: Array<{
      id: string;
      label: string;
      description: string;
      href: string;
    }> = [];
    if (user.capabilities?.includes("catalog.read") || isPrivileged(user)) {
      const products = await query(
        "SELECT id, name_en, sku FROM products WHERE name_en ILIKE $1 OR sku ILIKE $1 ORDER BY name_en LIMIT 6",
        [pattern],
      );
      items.push(
        ...products.rows.map((row) => ({
          id: `product-${row.id}`,
          label: row.name_en,
          description: `Product · ${row.sku}`,
          href: `/admin/catalog/products/${row.id}`,
        })),
      );
    }
    if (user.capabilities?.includes("orders.read") || isPrivileged(user)) {
      const orders = await query(
        `SELECT id, order_number, status FROM web_orders WHERE order_number ILIKE $1 AND ($2::uuid[] IS NULL OR store_id = ANY($2::uuid[])) ORDER BY order_date DESC LIMIT 6`,
        [pattern, storeIds],
      );
      items.push(
        ...orders.rows.map((row) => ({
          id: `order-${row.id}`,
          label: row.order_number,
          description: `Order · ${row.status}`,
          href: `/admin/commerce/orders/${row.id}`,
        })),
      );
    }
    if (user.capabilities?.includes("customers.read") || isPrivileged(user)) {
      const customers = await query(
        "SELECT id, preferred_name, phone_masked FROM customers WHERE preferred_name ILIKE $1 OR email ILIKE $1 OR phone_masked ILIKE $1 ORDER BY updated_at DESC LIMIT 6",
        [pattern],
      );
      items.push(
        ...customers.rows.map((row) => ({
          id: `customer-${row.id}`,
          label: row.preferred_name || row.phone_masked,
          description: `Customer · ${row.phone_masked || "no phone"}`,
          href: `/admin/customers/${row.id}`,
        })),
      );
    }
    return { items: items.slice(0, 15) };
  });

  fastify.get("/dashboard", async (request, reply) => {
    const filters = z
      .object({
        period: z.enum(["today", "7d", "30d", "month"]).default("7d"),
        store_id: z.string().uuid().optional(),
      })
      .parse(request.query);
    const user = actor(request);
    const storeIds = await allowedStoreIds(user, filters.store_id);
    if (filters.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const start =
      filters.period === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : filters.period === "month"
          ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          : new Date(
              Date.now() - (filters.period === "30d" ? 29 : 6) * 86_400_000,
            );
    try {
      const [sales, inventory, procurement, customers, trend] =
        await Promise.all([
          query(
            `SELECT COALESCE(SUM(total_amount) FILTER (WHERE status <> 'CANCELLED'), 0)::numeric AS revenue,
          COUNT(*)::int AS orders,
          COALESCE(AVG(total_amount) FILTER (WHERE status <> 'CANCELLED'), 0)::numeric AS average_order_value,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_orders,
          COUNT(*) FILTER (WHERE status = 'REFUNDED' OR payment_status = 'REFUNDED')::int AS refunds
          FROM web_orders WHERE order_date >= $1 AND ($2::uuid[] IS NULL OR store_id = ANY($2::uuid[]))`,
            [start, storeIds],
          ),
          query(
            `WITH stock AS (SELECT store_id, product_id, SUM(quantity)::numeric quantity,
          SUM(quantity * COALESCE(cost, 0))::numeric value FROM batch_inventory
          WHERE ($1::uuid[] IS NULL OR store_id = ANY($1::uuid[])) GROUP BY store_id, product_id)
          SELECT COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= 5)::int AS low_stock,
          COUNT(*) FILTER (WHERE quantity <= 0)::int AS out_of_stock,
          COALESCE(SUM(value), 0)::numeric AS inventory_value FROM stock`,
            [storeIds],
          ),
          query(
            `SELECT COUNT(*) FILTER (WHERE status NOT IN ('RECEIVED','CANCELLED'))::int AS open_purchase_orders,
          COUNT(*) FILTER (WHERE status NOT IN ('RECEIVED','CANCELLED') AND expected_delivery_date < CURRENT_DATE)::int AS overdue_purchase_orders,
          COALESCE((SELECT SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0))
            FROM purchase_order_items poi JOIN purchase_orders inner_po ON inner_po.id = poi.po_id
            WHERE inner_po.status NOT IN ('RECEIVED','CANCELLED') AND ($1::uuid[] IS NULL OR inner_po.store_id = ANY($1::uuid[]))), 0)::numeric AS incoming_units
          FROM purchase_orders WHERE ($1::uuid[] IS NULL OR store_id = ANY($1::uuid[]))`,
            [storeIds],
          ),
          query(
            `SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.enrolled_at >= $1)::int AS new_customers,
          COUNT(DISTINCT wo.customer_id) FILTER (WHERE prior.customer_id IS NOT NULL)::int AS returning_customers
          FROM customers c LEFT JOIN web_orders wo ON wo.customer_id = c.id AND wo.order_date >= $1
          LEFT JOIN (SELECT DISTINCT customer_id FROM web_orders WHERE order_date < $1) prior ON prior.customer_id = c.id
          WHERE ($2::uuid[] IS NULL OR c.home_store_id = ANY($2::uuid[]) OR c.home_store_id IS NULL)`,
            [start, storeIds],
          ),
          query(
            `SELECT day::date AS date, COALESCE(SUM(wo.total_amount) FILTER (WHERE wo.status <> 'CANCELLED'), 0)::numeric AS revenue,
          COUNT(wo.id)::int AS orders FROM generate_series($1::date, CURRENT_DATE, '1 day') day
          LEFT JOIN web_orders wo ON wo.order_date >= day AND wo.order_date < day + INTERVAL '1 day'
            AND ($2::uuid[] IS NULL OR wo.store_id = ANY($2::uuid[])) GROUP BY day ORDER BY day`,
            [start, storeIds],
          ),
        ]);
      return {
        metrics: {
          ...sales.rows[0],
          ...inventory.rows[0],
          ...procurement.rows[0],
          ...customers.rows[0],
        },
        revenueTrend: trend.rows,
        scopeLabel: filters.store_id
          ? "Selected store"
          : storeIds
            ? `${storeIds.length} authorized stores`
            : "All stores",
        generatedAt: new Date().toISOString(),
        currencyCode: MARKET.currencyCode,
        locale: MARKET.locale,
        timezone: MARKET.timezone,
      };
    } catch (error) {
      request.log.error({ error }, "Failed to load admin dashboard");
      return reply
        .status(500)
        .send({ error: "Failed to load dashboard metrics" });
    }
  });

  // Content Pages CRUD
  fastify.get("/pages", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: publicationStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    try {
      const result = await query(
        `SELECT id, slug, title_en, title_ne, status, published_at, scheduled_for, expires_at, created_at, updated_at, COUNT(*) OVER()::int AS total_count
         FROM content_pages WHERE ($1::text IS NULL OR title_en ILIKE '%'||$1||'%' OR slug ILIKE '%'||$1||'%') AND ($2::text IS NULL OR status::text=$2)
         ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
        [input.search || null, input.status || null, input.limit, input.offset],
      );
      return {
        items: result.rows.map(({ total_count: _total, ...row }) => row),
        total: Number(result.rows[0]?.total_count || 0),
        limit: input.limit,
        offset: input.offset,
      };
    } catch {
      reply.status(500);
      return { error: "Failed to fetch pages" };
    }
  });

  fastify.get("/pages/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("SELECT * FROM content_pages WHERE id = $1", [
      id,
    ]);
    if (!result.rowCount)
      return reply.status(404).send({ error: "Page not found" });
    return result.rows[0];
  });

  fastify.post("/pages", async (request, reply) => {
    const pageSchema = z.object({
      slug: z.string().min(1).max(255),
      title_en: z.string().min(1).max(255),
      title_ne: z.string().max(255).optional(),
      content_en: z.string().min(1),
      content_ne: z.string().optional(),
      meta_description_en: z.string().optional(),
      meta_description_ne: z.string().optional(),
      status: publicationStatusSchema.default("DRAFT"),
      scheduled_for: z.string().datetime().optional(),
      expires_at: z.string().datetime().optional(),
    });

    try {
      const body = pageSchema.parse(request.body);
      const { query } = await import("../database/connection.js");

      const result = await query(
        `INSERT INTO content_pages (slug, title_en, title_ne, content_en, content_ne, meta_description_en, meta_description_ne, status, scheduled_for, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          body.slug,
          body.title_en,
          body.title_ne || null,
          body.content_en,
          body.content_ne || null,
          body.meta_description_en || null,
          body.meta_description_ne || null,
          body.status,
          body.scheduled_for ? new Date(body.scheduled_for) : null,
          body.expires_at ? new Date(body.expires_at) : null,
          actor(request).id,
        ],
      );

      // Audit log
      await query(
        `INSERT INTO content_audit_log (entity_type, entity_id, action, new_values, performed_by)
         VALUES ('content_page', $1, 'CREATE', $2, $3)`,
        [result.rows[0].id, JSON.stringify(result.rows[0]), actor(request).id],
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to create page" };
    }
  });

  fastify.put("/pages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const pageSchema = z.object({
      slug: z.string().min(1).max(255).optional(),
      title_en: z.string().min(1).max(255).optional(),
      title_ne: z.string().max(255).optional(),
      content_en: z.string().min(1).optional(),
      content_ne: z.string().optional(),
      meta_description_en: z.string().optional(),
      meta_description_ne: z.string().optional(),
      status: publicationStatusSchema.optional(),
      scheduled_for: z.string().datetime().optional(),
      expires_at: z.string().datetime().optional(),
    });

    try {
      const body = pageSchema.parse(request.body);
      const { query } = await import("../database/connection.js");

      // Get old values for audit
      const oldResult = await query(
        "SELECT * FROM content_pages WHERE id = $1",
        [id],
      );
      if (oldResult.rows.length === 0) {
        reply.status(404);
        return { error: "Page not found" };
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (body.slug !== undefined) {
        updates.push(`slug = $${paramIndex}`);
        values.push(body.slug);
        paramIndex++;
      }
      if (body.title_en !== undefined) {
        updates.push(`title_en = $${paramIndex}`);
        values.push(body.title_en);
        paramIndex++;
      }
      if (body.title_ne !== undefined) {
        updates.push(`title_ne = $${paramIndex}`);
        values.push(body.title_ne || null);
        paramIndex++;
      }
      if (body.content_en !== undefined) {
        updates.push(`content_en = $${paramIndex}`);
        values.push(body.content_en);
        paramIndex++;
      }
      if (body.content_ne !== undefined) {
        updates.push(`content_ne = $${paramIndex}`);
        values.push(body.content_ne || null);
        paramIndex++;
      }
      if (body.meta_description_en !== undefined) {
        updates.push(`meta_description_en = $${paramIndex}`);
        values.push(body.meta_description_en || null);
        paramIndex++;
      }
      if (body.meta_description_ne !== undefined) {
        updates.push(`meta_description_ne = $${paramIndex}`);
        values.push(body.meta_description_ne || null);
        paramIndex++;
      }
      if (body.status !== undefined) {
        updates.push(`status = $${paramIndex}`);
        values.push(body.status);
        paramIndex++;
        if (body.status === "PUBLISHED") {
          updates.push(`published_at = NOW()`);
        }
      }
      if (body.scheduled_for !== undefined) {
        updates.push(`scheduled_for = $${paramIndex}`);
        values.push(new Date(body.scheduled_for));
        paramIndex++;
      }
      if (body.expires_at !== undefined) {
        updates.push(`expires_at = $${paramIndex}`);
        values.push(new Date(body.expires_at));
        paramIndex++;
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`updated_by = $${paramIndex}`);
      values.push(actor(request).id);
      paramIndex++;

      values.push(id);

      const result = await query(
        `UPDATE content_pages SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values,
      );

      // Audit log
      await query(
        `INSERT INTO content_audit_log (entity_type, entity_id, action, old_values, new_values, performed_by)
         VALUES ('content_page', $1, 'UPDATE', $2, $3, $4)`,
        [
          id,
          JSON.stringify(oldResult.rows[0]),
          JSON.stringify(result.rows[0]),
          actor(request).id,
        ],
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to update page" };
    }
  });

  // Stores CRUD
  fastify.get("/stores", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: publicationStatusSchema.optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    try {
      const result = await query(
        `SELECT s.*, COUNT(st.id)::int AS staff_count, COUNT(*) OVER()::int AS total_count
        FROM stores s LEFT JOIN staff st ON st.store_id = s.id AND st.status = 'ACTIVE'
        WHERE ($1::uuid[] IS NULL OR s.id = ANY($1::uuid[]))
          AND ($2::text IS NULL OR s.name_en ILIKE '%' || $2 || '%' OR s.address_en ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR s.status::text = $3)
        GROUP BY s.id ORDER BY s.name_en LIMIT $4 OFFSET $5`,
        [
          storeIds,
          input.search || null,
          input.status || null,
          input.limit,
          input.offset,
        ],
      );
      return {
        items: result.rows.map(({ total_count: _total, ...row }) => row),
        total: Number(result.rows[0]?.total_count || 0),
        limit: input.limit,
        offset: input.offset,
      };
    } catch {
      reply.status(500);
      return { error: "Failed to fetch stores" };
    }
  });

  fastify.post("/stores", async (request, reply) => {
    const storeSchema = z.object({
      name_en: z.string().min(1).max(255),
      name_ne: z.string().max(255).optional(),
      address_en: z.string().min(1),
      address_ne: z.string().optional(),
      landmark_en: z.string().max(255).optional(),
      landmark_ne: z.string().max(255).optional(),
      phone: z.string().min(1).max(20),
      email: z.string().email().optional(),
      map_url: httpsUrlSchema.optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      hours_en: z.record(z.string(), z.any()).optional(),
      hours_ne: z.record(z.string(), z.any()).optional(),
      services_en: z.array(z.any()).optional(),
      services_ne: z.array(z.any()).optional(),
      status: publicationStatusSchema.default("DRAFT"),
    });

    try {
      const body = storeSchema.parse(request.body);
      const { query } = await import("../database/connection.js");

      const result = await query(
        `INSERT INTO stores (name_en, name_ne, address_en, address_ne, landmark_en, landmark_ne, phone, email, map_url, latitude, longitude, hours_en, hours_ne, services_en, services_ne, status, created_by, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          body.name_en,
          body.name_ne || null,
          body.address_en,
          body.address_ne || null,
          body.landmark_en || null,
          body.landmark_ne || null,
          body.phone,
          body.email || null,
          body.map_url || null,
          body.latitude || null,
          body.longitude || null,
          body.hours_en ? JSON.stringify(body.hours_en) : null,
          body.hours_ne ? JSON.stringify(body.hours_ne) : null,
          body.services_en ? JSON.stringify(body.services_en) : null,
          body.services_ne ? JSON.stringify(body.services_ne) : null,
          body.status,
          actor(request).id,
          actor(request).scopeOrganizationId || null,
        ],
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to create store" };
    }
  });

  // Products CRUD
  fastify.get("/products", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: publicationStatusSchema.optional(),
        category_id: z.string().uuid().optional(),
        stock: z.enum(["in", "low", "out"]).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    try {
      const result = await query(
        `WITH stock AS (
          SELECT product_id, SUM(quantity)::numeric AS quantity FROM batch_inventory
          WHERE ($1::uuid[] IS NULL OR store_id = ANY($1::uuid[])) GROUP BY product_id
        ), prices AS (
          SELECT DISTINCT ON (product_id) product_id, price, currency_code FROM product_prices
          WHERE active = TRUE AND valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())
            AND ($1::uuid[] IS NULL OR store_id = ANY($1::uuid[]) OR store_id IS NULL)
          ORDER BY product_id, store_id NULLS LAST, valid_from DESC
        )
        SELECT p.*, c.name_en AS category_name, COALESCE(stock.quantity, 0) AS stock,
          prices.price, prices.currency_code, COUNT(*) OVER()::int AS total_count
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN stock ON stock.product_id = p.id LEFT JOIN prices ON prices.product_id = p.id
        WHERE ($2::text IS NULL OR p.name_en ILIKE '%' || $2 || '%' OR p.sku ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR p.status::text = $3) AND ($4::uuid IS NULL OR p.category_id = $4)
          AND ($5::text IS NULL OR ($5 = 'out' AND COALESCE(stock.quantity, 0) <= 0) OR ($5 = 'low' AND COALESCE(stock.quantity, 0) > 0 AND COALESCE(stock.quantity, 0) <= 5) OR ($5 = 'in' AND COALESCE(stock.quantity, 0) > 5))
        ORDER BY p.updated_at DESC LIMIT $6 OFFSET $7`,
        [
          storeIds,
          input.search || null,
          input.status || null,
          input.category_id || null,
          input.stock || null,
          input.limit,
          input.offset,
        ],
      );
      return {
        items: result.rows.map(({ total_count: _total, ...row }) => row),
        total: Number(result.rows[0]?.total_count || 0),
        limit: input.limit,
        offset: input.offset,
      };
    } catch {
      reply.status(500);
      return { error: "Failed to fetch products" };
    }
  });

  fastify.post("/products", async (request, reply) => {
    const productSchema = z.object({
      sku: z.string().min(1).max(100),
      name_en: z.string().min(1).max(255),
      name_ne: z.string().max(255).optional(),
      description_en: z.string().optional(),
      description_ne: z.string().optional(),
      category_id: z.string().uuid().optional(),
      pack_size_en: z.string().max(100).optional(),
      pack_size_ne: z.string().max(100).optional(),
      unit_en: z.string().max(50).optional(),
      unit_ne: z.string().max(50).optional(),
      image_url: httpsUrlSchema.optional(),
      images: z.array(z.any()).optional(),
      status: publicationStatusSchema.default("DRAFT"),
      scheduled_for: z.string().datetime().optional(),
      expires_at: z.string().datetime().optional(),
      is_featured: z.boolean().default(false),
      meta_title_en: z.string().max(255).optional(),
      meta_title_ne: z.string().max(255).optional(),
      meta_description_en: z.string().optional(),
      meta_description_ne: z.string().optional(),
    });

    try {
      const body = productSchema.parse(request.body);
      const { query } = await import("../database/connection.js");

      const result = await query(
        `INSERT INTO products (sku, name_en, name_ne, description_en, description_ne, category_id, pack_size_en, pack_size_ne, unit_en, unit_ne, image_url, images, status, scheduled_for, expires_at, is_featured, meta_title_en, meta_title_ne, meta_description_en, meta_description_ne, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING *`,
        [
          body.sku,
          body.name_en,
          body.name_ne || null,
          body.description_en || null,
          body.description_ne || null,
          body.category_id || null,
          body.pack_size_en || null,
          body.pack_size_ne || null,
          body.unit_en || null,
          body.unit_ne || null,
          body.image_url || null,
          body.images ? JSON.stringify(body.images) : null,
          body.status,
          body.scheduled_for ? new Date(body.scheduled_for) : null,
          body.expires_at ? new Date(body.expires_at) : null,
          body.is_featured,
          body.meta_title_en || null,
          body.meta_title_ne || null,
          body.meta_description_en || null,
          body.meta_description_ne || null,
          actor(request).id,
        ],
      );

      return result.rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to create product" };
    }
  });

  fastify.get("/products/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query(
      `SELECT p.*, c.name_en AS category_name,
      COALESCE((SELECT SUM(quantity) FROM batch_inventory WHERE product_id = p.id), 0) AS stock,
      (SELECT price FROM product_prices WHERE product_id = p.id AND active = TRUE ORDER BY valid_from DESC LIMIT 1) AS price,
      (SELECT currency_code FROM product_prices WHERE product_id = p.id AND active = TRUE ORDER BY valid_from DESC LIMIT 1) AS currency_code
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
      [id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Product not found" });
    return result.rows[0];
  });

  fastify.put("/products/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        sku: z.string().min(1).max(100).optional(),
        name_en: z.string().min(1).max(255).optional(),
        name_ne: z.string().max(255).nullable().optional(),
        description_en: z.string().nullable().optional(),
        description_ne: z.string().nullable().optional(),
        category_id: z.string().uuid().nullable().optional(),
        image_url: httpsUrlSchema.nullable().optional(),
        status: publicationStatusSchema.optional(),
        is_featured: z.boolean().optional(),
      })
      .strict()
      .parse(request.body);
    if (!Object.keys(body).length)
      return reply
        .status(400)
        .send({ error: "No product fields were provided" });
    const fields = Object.keys(body);
    const values = fields.map((field) => body[field as keyof typeof body]);
    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`,
    );
    values.push(id as never);
    const result = await query(
      `UPDATE products SET ${assignments.join(", ")}, updated_at = NOW(), updated_by = $${values.length + 1} WHERE id = $${values.length} RETURNING *`,
      [...values, actor(request).id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Product not found" });
    return result.rows[0];
  });

  fastify.get("/categories", async (request, _reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: publicationStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const result = await query(
      `SELECT c.*, parent.name_en AS parent_name, COUNT(p.id)::int AS product_count, COUNT(*) OVER()::int AS total_count
      FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id LEFT JOIN products p ON p.category_id = c.id
      WHERE ($1::text IS NULL OR c.name_en ILIKE '%' || $1 || '%' OR c.slug ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR c.status::text = $2)
      GROUP BY c.id, parent.name_en ORDER BY c.sort_order, c.name_en LIMIT $3 OFFSET $4`,
      [input.search || null, input.status || null, input.limit, input.offset],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.post("/categories", async (request, reply) => {
    const body = z
      .object({
        name_en: z.string().min(1).max(255),
        name_ne: z.string().max(255).optional(),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(255),
        description_en: z.string().optional(),
        description_ne: z.string().optional(),
        image_url: httpsUrlSchema.optional(),
        parent_id: z.string().uuid().optional(),
        sort_order: z.coerce.number().int().min(0).default(0),
        status: publicationStatusSchema.default("DRAFT"),
      })
      .parse(request.body);
    const result = await query(
      `INSERT INTO categories (name_en, name_ne, slug, description_en, description_ne, image_url, parent_id, sort_order, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        body.name_en,
        body.name_ne || null,
        body.slug,
        body.description_en || null,
        body.description_ne || null,
        body.image_url || null,
        body.parent_id || null,
        body.sort_order,
        body.status,
        actor(request).id,
      ],
    );
    return reply.status(201).send(result.rows[0]);
  });

  fastify.get("/categories/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query(
      `SELECT c.*, parent.name_en AS parent_name, COUNT(p.id)::int AS product_count FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id LEFT JOIN products p ON p.category_id = c.id WHERE c.id = $1 GROUP BY c.id, parent.name_en`,
      [id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Category not found" });
    return result.rows[0];
  });

  fastify.put("/categories/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name_en: z.string().min(1).max(255).optional(),
        name_ne: z.string().max(255).nullable().optional(),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(255)
          .optional(),
        description_en: z.string().nullable().optional(),
        description_ne: z.string().nullable().optional(),
        image_url: httpsUrlSchema.nullable().optional(),
        parent_id: z.string().uuid().nullable().optional(),
        sort_order: z.number().int().min(0).optional(),
        status: publicationStatusSchema.optional(),
      })
      .strict()
      .parse(request.body);
    if (body.parent_id === id)
      return reply
        .status(400)
        .send({ error: "A category cannot be its own parent" });
    const fields = Object.keys(body);
    if (!fields.length)
      return reply
        .status(400)
        .send({ error: "No category fields were provided" });
    const values = fields.map((field) => body[field as keyof typeof body]);
    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`,
    );
    values.push(id as never);
    const result = await query(
      `UPDATE categories SET ${assignments.join(", ")}, updated_at = NOW(), updated_by = $${values.length + 1} WHERE id = $${values.length} RETURNING *`,
      [...values, actor(request).id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Category not found" });
    return result.rows[0];
  });

  fastify.get("/stores/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const ids = await allowedStoreIds(actor(request), id);
    if (ids?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT s.*, COUNT(DISTINCT st.id)::int AS staff_count,
      (SELECT COUNT(*) FROM web_orders WHERE store_id=s.id)::int AS order_count,
      COALESCE((SELECT SUM(total_amount) FROM web_orders WHERE store_id=s.id AND status <> 'CANCELLED'), 0)::numeric AS sales_total,
      COALESCE((SELECT SUM(quantity) FROM batch_inventory WHERE store_id = s.id), 0)::numeric AS inventory_units
      FROM stores s LEFT JOIN staff st ON st.store_id = s.id AND st.status = 'ACTIVE'
      WHERE s.id = $1 GROUP BY s.id`,
      [id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Store not found" });
    return result.rows[0];
  });

  fastify.get("/inventory", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        stock: z.enum(["in", "low", "out"]).optional(),
        store_id: z.string().uuid().optional(),
        product_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `WITH incoming AS (SELECT po.store_id, poi.product_id, SUM(poi.quantity_ordered - COALESCE(poi.quantity_received,0))::numeric quantity FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.po_id WHERE po.status NOT IN ('RECEIVED','CANCELLED') GROUP BY po.store_id, poi.product_id)
      SELECT bi.store_id, bi.product_id AS id, p.name_en AS product_name, p.sku, s.name_en AS store_name, SUM(bi.quantity)::numeric AS on_hand,
        COALESCE(MAX(i.quantity),0)::numeric AS incoming, SUM(bi.quantity * COALESCE(bi.cost,0))::numeric AS inventory_value, MIN(bi.expiry_date) AS nearest_expiry,
        CASE WHEN SUM(bi.quantity) <= 0 THEN 'OUT_OF_STOCK' WHEN SUM(bi.quantity) <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END AS stock_status,
        COUNT(*) OVER()::int AS total_count
      FROM batch_inventory bi JOIN products p ON p.id = bi.product_id JOIN stores s ON s.id = bi.store_id
      LEFT JOIN incoming i ON i.store_id = bi.store_id AND i.product_id = bi.product_id
      WHERE ($1::uuid[] IS NULL OR bi.store_id = ANY($1::uuid[])) AND ($2::uuid IS NULL OR bi.product_id = $2)
        AND ($3::text IS NULL OR p.name_en ILIKE '%' || $3 || '%' OR p.sku ILIKE '%' || $3 || '%')
      GROUP BY bi.store_id, bi.product_id, p.name_en, p.sku, s.name_en
      HAVING ($4::text IS NULL OR ($4='out' AND SUM(bi.quantity)<=0) OR ($4='low' AND SUM(bi.quantity)>0 AND SUM(bi.quantity)<=5) OR ($4='in' AND SUM(bi.quantity)>5))
      ORDER BY stock_status DESC, p.name_en LIMIT $5 OFFSET $6`,
      [
        storeIds,
        input.product_id || null,
        input.search || null,
        input.stock || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/inventory-adjustments", async (request) => {
    const input = z
      .object({
        store_id: z.string().uuid().optional(),
        search: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    const result = await query(
      `SELECT ae.id, ae.created_at, ae.actor_id, COALESCE(st.first_name || ' ' || st.last_name, ae.actor_id::text) AS staff_name,
      ae.entity_id, p.name_en AS product_name, p.sku, s.name_en AS store_name,
      COALESCE(ae.changes->'after'->>'quantity', ae.changes->>'quantity_change', '—') AS quantity_change,
      COALESCE(ae.changes->>'reason', ae.event_type) AS reason, COUNT(*) OVER()::int AS total_count
      FROM audit_events ae LEFT JOIN staff st ON st.id = ae.actor_id LEFT JOIN products p ON p.id = ae.entity_id
      LEFT JOIN stores s ON s.id = ANY(ae.actor_scope_store_ids)
      WHERE (ae.entity_type ILIKE '%inventory%' OR ae.event_type ILIKE '%ADJUST%')
        AND ($1::uuid[] IS NULL OR ae.actor_scope_store_ids && $1::uuid[])
        AND ($2::text IS NULL OR p.name_en ILIKE '%' || $2 || '%' OR p.sku ILIKE '%' || $2 || '%')
      ORDER BY ae.created_at DESC LIMIT $3 OFFSET $4`,
      [storeIds, input.search || null, input.limit, input.offset],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
    };
  });

  fastify.get("/orders", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.string().max(40).optional(),
        payment_status: z.string().max(40).optional(),
        store_id: z.string().uuid().optional(),
        customer_id: z.string().uuid().optional(),
        date_from: z.coerce.date().optional(),
        date_to: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT wo.*, c.preferred_name AS customer_name, s.name_en AS store_name, COUNT(*) OVER()::int AS total_count
      FROM web_orders wo LEFT JOIN customers c ON c.id=wo.customer_id LEFT JOIN stores s ON s.id=wo.store_id
      WHERE ($1::uuid[] IS NULL OR wo.store_id=ANY($1::uuid[]))
        AND ($2::text IS NULL OR wo.order_number ILIKE '%'||$2||'%' OR wo.shipping_name ILIKE '%'||$2||'%' OR c.preferred_name ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR wo.status=$3) AND ($4::text IS NULL OR wo.payment_status=$4)
        AND ($5::uuid IS NULL OR wo.customer_id=$5) AND ($6::timestamptz IS NULL OR wo.order_date >= $6) AND ($7::timestamptz IS NULL OR wo.order_date <= $7)
      ORDER BY wo.order_date DESC LIMIT $8 OFFSET $9`,
      [
        storeIds,
        input.search || null,
        input.status || null,
        input.payment_status || null,
        input.customer_id || null,
        input.date_from || null,
        input.date_to || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/orders/:id/items", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const allowed = await query(
      "SELECT 1 FROM web_orders WHERE id=$1 AND ($2::uuid[] IS NULL OR store_id=ANY($2::uuid[]))",
      [id, storeIds],
    );
    if (!allowed.rowCount)
      return reply.status(404).send({ error: "Order not found" });
    const result = await query(
      "SELECT * FROM web_order_items WHERE order_id=$1 ORDER BY id",
      [id],
    );
    return result.rows;
  });

  fastify.get("/orders/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT wo.*, c.preferred_name AS customer_name, c.email AS customer_email, c.phone_masked AS customer_phone, s.name_en AS store_name
      FROM web_orders wo LEFT JOIN customers c ON c.id=wo.customer_id LEFT JOIN stores s ON s.id=wo.store_id
      WHERE wo.id=$1 AND ($2::uuid[] IS NULL OR wo.store_id=ANY($2::uuid[]))`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Order not found" });
    return result.rows[0];
  });

  fastify.get("/batches", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        store_id: z.string().uuid().optional(),
        product_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT bi.*, p.name_en AS product_name, p.sku, s.name_en AS store_name, COUNT(*) OVER()::int AS total_count
      FROM batch_inventory bi JOIN products p ON p.id=bi.product_id JOIN stores s ON s.id=bi.store_id
      WHERE ($1::uuid[] IS NULL OR bi.store_id=ANY($1::uuid[])) AND ($2::uuid IS NULL OR bi.product_id=$2)
        AND ($3::text IS NULL OR p.name_en ILIKE '%'||$3||'%' OR p.sku ILIKE '%'||$3||'%' OR bi.batch_id ILIKE '%'||$3||'%')
      ORDER BY bi.expiry_date, p.name_en LIMIT $4 OFFSET $5`,
      [
        storeIds,
        input.product_id || null,
        input.search || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/suppliers", async (request) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.string().max(30).optional(),
        approval_status: z.string().max(30).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    const result = await query(
      `SELECT sp.*, COUNT(*) OVER()::int AS total_count FROM suppliers sp
      WHERE ($1::uuid[] IS NULL OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.supplier_id=sp.id AND po.store_id=ANY($1::uuid[])))
        AND ($2::text IS NULL OR sp.supplier_name ILIKE '%'||$2||'%' OR sp.supplier_code ILIKE '%'||$2||'%' OR sp.contact_person ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR sp.status=$3) AND ($4::text IS NULL OR sp.approval_status=$4)
      ORDER BY sp.supplier_name LIMIT $5 OFFSET $6`,
      [
        storeIds,
        input.search || null,
        input.status || null,
        input.approval_status || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/suppliers/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT sp.*, COUNT(po.id)::int AS purchase_order_count, COALESCE(SUM(po.total_amount),0)::numeric AS purchase_order_total
      FROM suppliers sp LEFT JOIN purchase_orders po ON po.supplier_id=sp.id AND ($2::uuid[] IS NULL OR po.store_id=ANY($2::uuid[]))
      WHERE sp.id=$1 AND ($2::uuid[] IS NULL OR po.id IS NOT NULL) GROUP BY sp.id`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Supplier not found" });
    return result.rows[0];
  });

  fastify.get("/purchase-orders", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.string().max(40).optional(),
        supplier_id: z.string().uuid().optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT po.*, sp.supplier_name, s.name_en AS store_name, COUNT(*) OVER()::int AS total_count
      FROM purchase_orders po JOIN suppliers sp ON sp.id=po.supplier_id LEFT JOIN stores s ON s.id=po.store_id
      WHERE ($1::uuid[] IS NULL OR po.store_id=ANY($1::uuid[])) AND ($2::uuid IS NULL OR po.supplier_id=$2)
        AND ($3::text IS NULL OR po.status=$3) AND ($4::text IS NULL OR po.po_number ILIKE '%'||$4||'%' OR sp.supplier_name ILIKE '%'||$4||'%')
      ORDER BY po.created_at DESC LIMIT $5 OFFSET $6`,
      [
        storeIds,
        input.supplier_id || null,
        input.status || null,
        input.search || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/purchase-orders/:id/items", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const allowed = await query(
      "SELECT 1 FROM purchase_orders WHERE id=$1 AND ($2::uuid[] IS NULL OR store_id=ANY($2::uuid[]))",
      [id, storeIds],
    );
    if (!allowed.rowCount)
      return reply.status(404).send({ error: "Purchase order not found" });
    const result = await query(
      "SELECT * FROM purchase_order_items WHERE po_id=$1 ORDER BY id",
      [id],
    );
    return result.rows;
  });

  fastify.get("/purchase-orders/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT po.*, sp.supplier_name, sp.email AS supplier_email, sp.phone AS supplier_phone, s.name_en AS store_name FROM purchase_orders po JOIN suppliers sp ON sp.id=po.supplier_id LEFT JOIN stores s ON s.id=po.store_id WHERE po.id=$1 AND ($2::uuid[] IS NULL OR po.store_id=ANY($2::uuid[]))`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Purchase order not found" });
    return result.rows[0];
  });

  fastify.get("/receiving", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.string().max(30).optional(),
        store_id: z.string().uuid().optional(),
        supplier_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT r.*, po.po_number, sp.supplier_name, s.name_en AS store_name, COUNT(*) OVER()::int AS total_count
      FROM receiving r LEFT JOIN purchase_orders po ON po.id=r.po_id JOIN suppliers sp ON sp.id=r.supplier_id LEFT JOIN stores s ON s.id=r.store_id
      WHERE ($1::uuid[] IS NULL OR r.store_id=ANY($1::uuid[])) AND ($2::uuid IS NULL OR r.supplier_id=$2) AND ($3::text IS NULL OR r.status=$3)
        AND ($4::text IS NULL OR r.receiving_number ILIKE '%'||$4||'%' OR po.po_number ILIKE '%'||$4||'%' OR sp.supplier_name ILIKE '%'||$4||'%')
      ORDER BY r.receiving_date DESC LIMIT $5 OFFSET $6`,
      [
        storeIds,
        input.supplier_id || null,
        input.status || null,
        input.search || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/receiving/:id/items", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const allowed = await query(
      "SELECT 1 FROM receiving WHERE id=$1 AND ($2::uuid[] IS NULL OR store_id=ANY($2::uuid[]))",
      [id, storeIds],
    );
    if (!allowed.rowCount)
      return reply.status(404).send({ error: "Receiving record not found" });
    const result = await query(
      "SELECT * FROM receiving_items WHERE receiving_id=$1 ORDER BY id",
      [id],
    );
    return result.rows;
  });

  fastify.get("/receiving/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT r.*, po.po_number, sp.supplier_name, s.name_en AS store_name FROM receiving r LEFT JOIN purchase_orders po ON po.id=r.po_id JOIN suppliers sp ON sp.id=r.supplier_id LEFT JOIN stores s ON s.id=r.store_id WHERE r.id=$1 AND ($2::uuid[] IS NULL OR r.store_id=ANY($2::uuid[]))`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Receiving record not found" });
    return result.rows[0];
  });

  fastify.get("/staff", async (request, reply) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.string().max(30).optional(),
        role: z.string().max(50).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    if (input.store_id && storeIds?.length === 0)
      return reply
        .status(403)
        .send({ error: "Store is outside your authorized scope" });
    const result = await query(
      `SELECT st.id, st.staff_number, st.first_name, st.last_name, (st.first_name||' '||st.last_name) AS full_name, st.username, st.email, st.phone, st.store_id, st.status, st.role, st.department, st.position, st.created_at, st.updated_at,
      r.role_name, r.role_key, s.name_en AS store_name, MAX(sess.last_activity_at) AS last_activity_at, COUNT(*) OVER()::int AS total_count
      FROM staff st LEFT JOIN roles r ON r.id=st.role_id LEFT JOIN stores s ON s.id=st.store_id LEFT JOIN sessions sess ON sess.staff_id=st.id AND sess.is_revoked=FALSE
      WHERE ($1::uuid[] IS NULL OR st.store_id=ANY($1::uuid[]) OR st.id=$6) AND ($2::text IS NULL OR st.first_name ILIKE '%'||$2||'%' OR st.last_name ILIKE '%'||$2||'%' OR st.username ILIKE '%'||$2||'%' OR st.staff_number ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR st.status=$3) AND ($4::text IS NULL OR st.role=$4 OR r.role_key=$4)
      GROUP BY st.id, r.role_name, r.role_key, s.name_en ORDER BY st.first_name, st.last_name LIMIT $5 OFFSET $7`,
      [
        storeIds,
        input.search || null,
        input.status || null,
        input.role || null,
        input.limit,
        actor(request).id,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/staff/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT st.id, st.staff_number, st.first_name, st.last_name, (st.first_name||' '||st.last_name) AS full_name, st.username, st.email, st.phone, st.store_id, st.status, st.role, st.department, st.position, st.scope_type, st.scope_store_ids, st.created_at, st.updated_at,
      r.role_name, r.role_key, r.role_level, s.name_en AS store_name FROM staff st LEFT JOIN roles r ON r.id=st.role_id LEFT JOIN stores s ON s.id=st.store_id
      WHERE st.id=$1 AND ($2::uuid[] IS NULL OR st.store_id=ANY($2::uuid[]) OR st.id=$3)`,
      [id, storeIds, actor(request).id],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Staff member not found" });
    return result.rows[0];
  });

  fastify.get("/customers", async (request) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    const result = await query(
      `SELECT c.id, c.preferred_name, c.email, c.phone_masked, c.language, c.home_store_id, c.status, c.verification_status, c.enrolled_at,
      COUNT(wo.id)::int AS order_count, COALESCE(SUM(wo.total_amount) FILTER (WHERE wo.status <> 'CANCELLED'),0)::numeric AS total_spend, MAX(wo.order_date) AS last_order_at, COUNT(*) OVER()::int AS total_count
      FROM customers c LEFT JOIN web_orders wo ON wo.customer_id = c.id
      WHERE ($1::uuid[] IS NULL OR c.home_store_id = ANY($1::uuid[]) OR EXISTS (SELECT 1 FROM web_orders scoped WHERE scoped.customer_id=c.id AND scoped.store_id=ANY($1::uuid[])))
        AND ($2::text IS NULL OR c.preferred_name ILIKE '%' || $2 || '%' OR c.email ILIKE '%' || $2 || '%' OR c.phone_masked ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR c.status = $3) GROUP BY c.id ORDER BY MAX(wo.order_date) DESC NULLS LAST, c.enrolled_at DESC LIMIT $4 OFFSET $5`,
      [
        storeIds,
        input.search || null,
        input.status || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
      limit: input.limit,
      offset: input.offset,
    };
  });

  fastify.get("/customers/:id/orders", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT id, order_number, order_date, status, payment_status, total_amount, currency FROM web_orders WHERE customer_id=$1 AND ($2::uuid[] IS NULL OR store_id=ANY($2::uuid[])) ORDER BY order_date DESC LIMIT 100`,
      [id, storeIds],
    );
    return reply.send(result.rows);
  });

  fastify.get("/customers/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT c.id, c.preferred_name, c.email, c.phone_masked, c.language, c.home_store_id, c.status, c.verification_status, c.enrollment_source, c.enrollment_channel, c.enrolled_at, c.created_at, c.updated_at,
      COUNT(wo.id)::int AS order_count, COALESCE(SUM(wo.total_amount) FILTER (WHERE wo.status <> 'CANCELLED'),0)::numeric AS total_spend, MAX(wo.order_date) AS last_order_at
      FROM customers c LEFT JOIN web_orders wo ON wo.customer_id=c.id WHERE c.id=$1 AND ($2::uuid[] IS NULL OR c.home_store_id=ANY($2::uuid[]) OR wo.store_id=ANY($2::uuid[])) GROUP BY c.id`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Customer not found" });
    return result.rows[0];
  });

  fastify.get("/roles", async (request) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const currentLevel =
      actor(request).roleKey === "platform_admin"
        ? 999
        : Number(
            (request.user as AdminActor & { roleLevel?: number }).roleLevel ||
              0,
          );
    const result = await query(
      `SELECT r.id, r.role_key, r.role_name, r.description, r.role_level, r.capabilities, r.is_system_role, r.is_active,
      jsonb_array_length(r.capabilities)::int AS capability_count, COUNT(st.id)::int AS staff_count, COUNT(*) OVER()::int AS total_count
      FROM roles r LEFT JOIN staff st ON st.role_id=r.id WHERE r.role_level <= $1 AND ($2::text IS NULL OR r.role_name ILIKE '%'||$2||'%' OR r.role_key ILIKE '%'||$2||'%')
      GROUP BY r.id ORDER BY r.role_level DESC, r.role_name LIMIT $3 OFFSET $4`,
      [currentLevel, input.search || null, input.limit, input.offset],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
    };
  });

  fastify.get("/roles/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const currentLevel =
      actor(request).roleKey === "platform_admin"
        ? 999
        : Number(
            (request.user as AdminActor & { roleLevel?: number }).roleLevel ||
              0,
          );
    const result = await query(
      `SELECT r.*, jsonb_array_length(r.capabilities)::int AS capability_count, COUNT(st.id)::int AS staff_count FROM roles r LEFT JOIN staff st ON st.role_id=r.id WHERE r.id=$1 AND r.role_level <= $2 GROUP BY r.id`,
      [id, currentLevel],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Role not found" });
    return result.rows[0];
  });

  fastify.get("/audit", async (request) => {
    const input = z
      .object({
        search: z.string().max(100).optional(),
        event_type: z.string().max(50).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const storeIds = await allowedStoreIds(actor(request), input.store_id);
    const result = await query(
      `SELECT ae.id, ae.created_at, ae.event_type, ae.entity_type, ae.entity_id, ae.actor_id, ae.actor_role, ae.ip_address, ae.user_agent, ae.changes,
      COALESCE(st.first_name || ' ' || st.last_name, 'System') AS actor_name, NULL::text AS store_name, COUNT(*) OVER()::int AS total_count
      FROM audit_events ae LEFT JOIN staff st ON st.id=ae.actor_id
      WHERE ($1::uuid[] IS NULL OR ae.actor_scope_store_ids && $1::uuid[] OR ae.actor_scope_type IN ('GLOBAL','ORGANIZATION'))
        AND ($2::text IS NULL OR ae.event_type ILIKE '%'||$2||'%' OR ae.entity_type ILIKE '%'||$2||'%' OR ae.entity_id::text ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR ae.event_type=$3) ORDER BY ae.created_at DESC LIMIT $4 OFFSET $5`,
      [
        storeIds,
        input.search || null,
        input.event_type || null,
        input.limit,
        input.offset,
      ],
    );
    return {
      items: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count || 0),
    };
  });

  fastify.get("/audit/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storeIds = await allowedStoreIds(actor(request));
    const result = await query(
      `SELECT ae.*, COALESCE(st.first_name || ' ' || st.last_name, 'System') AS actor_name FROM audit_events ae LEFT JOIN staff st ON st.id=ae.actor_id WHERE ae.id=$1 AND ($2::uuid[] IS NULL OR ae.actor_scope_store_ids && $2::uuid[] OR ae.actor_scope_type IN ('GLOBAL','ORGANIZATION'))`,
      [id, storeIds],
    );
    if (!result.rowCount)
      return reply.status(404).send({ error: "Audit event not found" });
    return result.rows[0];
  });

  // Contact submissions
  fastify.get("/contact", async (request, reply) => {
    try {
      const { query } = await import("../database/connection.js");
      const result = await query(
        `SELECT * FROM contact_submissions ORDER BY created_at DESC`,
        [],
      );
      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch contact submissions" };
    }
  });

  fastify.patch("/contact/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const statusSchema = z.object({
      status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    });

    try {
      const body = statusSchema.parse(request.body);
      const { query } = await import("../database/connection.js");

      const result = await query(
        `UPDATE contact_submissions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [body.status, id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return { error: "Contact submission not found" };
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400);
        return { error: "Validation failed", details: error.issues };
      }
      reply.status(500);
      return { error: "Failed to update contact submission" };
    }
  });
}
