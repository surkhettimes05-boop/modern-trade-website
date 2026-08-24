import { FastifyInstance } from "fastify";
import { z } from "zod";
import { MARKET } from "../config/market.js";

// Validation schemas
const langSchema = z.enum(["en", "ne"]).optional().default("en");

export async function publicRoutes(fastify: FastifyInstance) {
  // Get published content page
  fastify.get("/pages/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { lang } = request.query as { lang?: string };

    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id, slug, 
          COALESCE(title_${validatedLang}, title_en) as title,
          COALESCE(content_${validatedLang}, content_en) as content,
          COALESCE(meta_description_${validatedLang}, meta_description_en) as meta_description,
          updated_at
        FROM content_pages 
        WHERE slug = $1 AND status = 'PUBLISHED' 
          AND (expires_at IS NULL OR expires_at > NOW())`,
        [slug],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return { error: "Page not found" };
      }

      return result.rows[0];
    } catch {
      reply.status(500);
      return { error: "Failed to fetch page" };
    }
  });

  // Get all published stores
  fastify.get("/stores", async (request, reply) => {
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          COALESCE(name_${validatedLang}, name_en) as name,
          COALESCE(address_${validatedLang}, address_en) as address,
          COALESCE(landmark_${validatedLang}, landmark_en) as landmark,
          phone,
          email,
          map_url,
          latitude,
          longitude,
          COALESCE(hours_${validatedLang}, hours_en) as hours,
          COALESCE(services_${validatedLang}, services_en) as services,
          is_temporarily_closed,
          COALESCE(closure_reason_${validatedLang}, closure_reason_en) as closure_reason,
          closure_start,
          closure_end,
          last_updated_at
        FROM stores 
        WHERE status = 'PUBLISHED'
        ORDER BY name_en`,
        [],
      );

      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch stores" };
    }
  });

  // Get single store
  fastify.get("/stores/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          COALESCE(name_${validatedLang}, name_en) as name,
          COALESCE(address_${validatedLang}, address_en) as address,
          COALESCE(landmark_${validatedLang}, landmark_en) as landmark,
          phone,
          email,
          map_url,
          latitude,
          longitude,
          COALESCE(hours_${validatedLang}, hours_en) as hours,
          COALESCE(services_${validatedLang}, services_en) as services,
          is_temporarily_closed,
          COALESCE(closure_reason_${validatedLang}, closure_reason_en) as closure_reason,
          closure_start,
          closure_end,
          last_updated_at
        FROM stores 
        WHERE id = $1 AND status = 'PUBLISHED'`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return { error: "Store not found" };
      }

      return result.rows[0];
    } catch {
      reply.status(500);
      return { error: "Failed to fetch store" };
    }
  });

  // Get published categories
  fastify.get("/categories", async (request, reply) => {
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          COALESCE(name_${validatedLang}, name_en) as name,
          COALESCE(description_${validatedLang}, description_en) as description,
          slug,
          image_url,
          parent_id,
          sort_order
        FROM categories 
        WHERE status = 'PUBLISHED'
        ORDER BY sort_order, name_en`,
        [],
      );

      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch categories" };
    }
  });

  // Get published products
  fastify.get("/products", async (request, reply) => {
    const {
      lang: validatedLang,
      category,
      featured,
      store_id,
      limit,
      offset,
    } = z
      .object({
        lang: langSchema,
        category: z.string().uuid().optional(),
        featured: z.enum(["true", "false"]).optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
      })
      .strict()
      .parse(request.query);

    try {
      const { query } = await import("../database/connection.js");

      let queryText = `
        SELECT 
          products.id,
          products.sku,
          COALESCE(products.name_${validatedLang}, products.name_en) as name,
          COALESCE(products.description_${validatedLang}, products.description_en) as description,
          products.category_id,
          c.name_en as category_name,
          COALESCE(products.pack_size_${validatedLang}, products.pack_size_en) as pack_size,
          COALESCE(products.unit_${validatedLang}, products.unit_en) as unit,
          products.image_url,
          products.images,
          products.is_featured,
          COALESCE(store_price.price, organization_price.price) as price,
          COALESCE(store_price.original_price, organization_price.original_price) as original_price,
          COALESCE(store_price.currency_code, organization_price.currency_code, '${MARKET.currencyCode}') as currency_code,
          COALESCE(spa.availability_status, CASE WHEN EXISTS (SELECT 1 FROM batch_inventory bi WHERE bi.product_id = products.id AND bi.store_id = COALESCE($1::uuid, (SELECT id FROM stores WHERE status = 'PUBLISHED' ORDER BY name_en LIMIT 1)) AND bi.quantity > 0) THEN 'AVAILABLE' ELSE 'OUT_OF_STOCK' END) as availability_status,
          COALESCE(products.meta_title_${validatedLang}, products.meta_title_en) as meta_title,
          COALESCE(products.meta_description_${validatedLang}, products.meta_description_en) as meta_description
        FROM products
        LEFT JOIN categories c ON c.id = products.category_id
        LEFT JOIN LATERAL (
          SELECT pp.price, pp.original_price, pp.currency_code FROM product_prices pp
          WHERE pp.product_id = products.id AND pp.store_id = COALESCE($1::uuid, (SELECT id FROM stores WHERE status = 'PUBLISHED' ORDER BY name_en LIMIT 1)) AND pp.active = TRUE
            AND pp.valid_from <= NOW() AND (pp.valid_to IS NULL OR pp.valid_to > NOW())
          ORDER BY pp.valid_from DESC LIMIT 1
        ) store_price ON TRUE
        LEFT JOIN LATERAL (
          SELECT pp.price, pp.original_price, pp.currency_code FROM product_prices pp
          WHERE pp.product_id = products.id AND pp.store_id IS NULL AND pp.active = TRUE
            AND pp.valid_from <= NOW() AND (pp.valid_to IS NULL OR pp.valid_to > NOW())
          ORDER BY pp.valid_from DESC LIMIT 1
        ) organization_price ON TRUE
        LEFT JOIN store_product_availability spa ON spa.product_id = products.id AND spa.store_id = COALESCE($1::uuid, (SELECT id FROM stores WHERE status = 'PUBLISHED' ORDER BY name_en LIMIT 1))
        WHERE products.status = 'PUBLISHED'
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const params: unknown[] = [store_id || null];
      let paramIndex = 2;

      if (category) {
        queryText += ` AND category_id = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (featured === "true") {
        queryText += ` AND is_featured = true`;
      }

      params.push(limit, offset);
      queryText += ` ORDER BY products.name_en LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

      const result = await query(queryText, params);
      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch products" };
    }
  });

  // Get single product
  fastify.get("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          sku,
          COALESCE(name_${validatedLang}, name_en) as name,
          COALESCE(description_${validatedLang}, description_en) as description,
          category_id,
          COALESCE(pack_size_${validatedLang}, pack_size_en) as pack_size,
          COALESCE(unit_${validatedLang}, unit_en) as unit,
          image_url,
          images,
          is_featured,
          COALESCE(meta_title_${validatedLang}, meta_title_en) as meta_title,
          COALESCE(meta_description_${validatedLang}, meta_description_en) as meta_description
        FROM products 
        WHERE id = $1 AND status = 'PUBLISHED'
          AND (expires_at IS NULL OR expires_at > NOW())`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return { error: "Product not found" };
      }

      return result.rows[0];
    } catch {
      reply.status(500);
      return { error: "Failed to fetch product" };
    }
  });

  // Get published offers
  fastify.get("/offers", async (request, reply) => {
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          COALESCE(title_${validatedLang}, title_en) as title,
          COALESCE(description_${validatedLang}, description_en) as description,
          image_url,
          banner_image_url,
          start_date,
          end_date,
          COALESCE(terms_${validatedLang}, terms_en) as terms,
          is_featured,
          sort_order
        FROM offers 
        WHERE status = 'PUBLISHED'
          AND start_date <= NOW()
          AND end_date >= NOW()
        ORDER BY sort_order, start_date`,
        [],
      );

      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch offers" };
    }
  });

  // Get published FAQs
  fastify.get("/faqs", async (request, reply) => {
    const { lang, category } = request.query as {
      lang?: string;
      category?: string;
    };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      let queryText = `
        SELECT 
          id,
          COALESCE(question_${validatedLang}, question_en) as question,
          COALESCE(answer_${validatedLang}, answer_en) as answer,
          category,
          sort_order
        FROM faqs 
        WHERE status = 'PUBLISHED'
      `;
      const params: unknown[] = [];
      let paramIndex = 1;

      if (category) {
        queryText += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      queryText += ` ORDER BY sort_order, question_en`;

      const result = await query(queryText, params);
      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch FAQs" };
    }
  });

  // Get published services
  fastify.get("/services", async (request, reply) => {
    const { lang } = request.query as { lang?: string };
    const validatedLang = langSchema.parse(lang);

    try {
      const { query } = await import("../database/connection.js");

      const result = await query(
        `SELECT 
          id,
          COALESCE(name_${validatedLang}, name_en) as name,
          COALESCE(description_${validatedLang}, description_en) as description,
          icon,
          sort_order
        FROM services 
        WHERE status = 'PUBLISHED'
        ORDER BY sort_order, name_en`,
        [],
      );

      return result.rows;
    } catch {
      reply.status(500);
      return { error: "Failed to fetch services" };
    }
  });

  // Submit contact form
  fastify.post(
    "/contact",
    {
      bodyLimit: 32 * 1024,
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const contactSchema = z
        .object({
          name: z.string().min(1).max(255),
          email: z.string().email(),
          phone: z.string().optional(),
          subject: z.string().min(1).max(255),
          message: z.string().min(1).max(5000),
        })
        .strict();

      try {
        const body = contactSchema.parse(request.body);
        const { query } = await import("../database/connection.js");

        const ip = request.ip;

        await query(
          `INSERT INTO contact_submissions (name, email, phone, subject, message, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            body.name,
            body.email,
            body.phone || null,
            body.subject,
            body.message,
            ip,
          ],
        );

        return { success: true, message: "Contact submission received" };
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.status(400);
          return { error: "Validation failed", details: error.issues };
        }
        reply.status(500);
        return { error: "Failed to submit contact form" };
      }
    },
  );
}
