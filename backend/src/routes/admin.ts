import { FastifyInstance } from "fastify";
import { z } from "zod";
import { preHandler } from "../middleware/authentication.js";
import { MARKET } from "../config/market.js";

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
    const user = request.user as { capabilities?: string[] };
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
      stores: "stores",
      pages: "content",
    };
    const capability = aliases[resource]
      ? `${aliases[resource]}.${request.method === "GET" ? "read" : "write"}`
      : required;
    if (!capabilities.includes(capability) && !capabilities.includes("all")) {
      return reply.status(403).send({
        error: "Forbidden",
        code: "FORBIDDEN",
        message: `Missing capability: ${capability}`,
        requestId: request.id,
      });
    }
  });

  fastify.get("/dashboard", async (_request, reply) => {
    try {
      const { query } = await import("../database/connection.js");
      const result = await query(`
        SELECT
          (SELECT COUNT(*)::int FROM products) AS products,
          (SELECT COUNT(*)::int FROM stores WHERE status = 'PUBLISHED') AS stores,
          (SELECT COUNT(*)::int FROM customers WHERE status = 'ACTIVE') AS customers,
          (SELECT COUNT(*)::int FROM staff WHERE status = 'ACTIVE') AS staff,
          (SELECT COUNT(*)::int FROM suppliers WHERE status = 'ACTIVE') AS suppliers,
          (SELECT COUNT(*)::int FROM audit_events) AS audit_events
      `);
      return {
        metrics: result.rows[0],
        currencyCode: MARKET.currencyCode,
        locale: MARKET.locale,
        timezone: MARKET.timezone,
      };
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to load dashboard metrics" });
    }
  });

  // Content Pages CRUD
  fastify.get("/pages", async (request, reply) => {
    try {
      const { query } = await import("../database/connection.js");
      const result = await query(
        `SELECT id, slug, title_en, title_ne, status, published_at, scheduled_for, expires_at, created_at, updated_at
         FROM content_pages
         ORDER BY updated_at DESC`,
        [],
      );
      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch pages" };
    }
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
          (request.user as { email?: string })?.email || "admin",
        ],
      );

      // Audit log
      await query(
        `INSERT INTO content_audit_log (entity_type, entity_id, action, new_values, performed_by)
         VALUES ('content_page', $1, 'CREATE', $2, $3)`,
        [
          result.rows[0].id,
          JSON.stringify(result.rows[0]),
          (request.user as { email?: string })?.email || "admin",
        ],
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
      values.push((request.user as { email?: string })?.email || "admin");
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
          (request.user as { email?: string })?.email || "admin",
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
    try {
      const { query } = await import("../database/connection.js");
      const result = await query(`SELECT * FROM stores ORDER BY name_en`, []);
      return result.rows;
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
        `INSERT INTO stores (name_en, name_ne, address_en, address_ne, landmark_en, landmark_ne, phone, email, map_url, latitude, longitude, hours_en, hours_ne, services_en, services_ne, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
          (request.user as { email?: string })?.email || "admin",
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
    try {
      const { query } = await import("../database/connection.js");
      const result = await query(`SELECT * FROM products ORDER BY name_en`, []);
      return result.rows;
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
          (request.user as { email?: string })?.email || "admin",
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
