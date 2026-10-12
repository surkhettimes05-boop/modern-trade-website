import { randomUUID } from "node:crypto";
import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { getPool } from "../database/connection.js";

type CampaignActor = {
  id: string;
  roleKey?: string;
  capabilities?: string[];
  scopeType?: string;
  scopeOrganizationId?: string;
  scopeStoreIds?: string[];
  storeId?: string;
};

const publicationStatusSchema = z.enum([
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "UNPUBLISHED",
  "EXPIRED",
]);
const channelSchema = z.enum(["WEB", "APP"]);
const placementSchema = z.enum([
  "HOME_HERO",
  "OFFERS_PAGE",
  "CATEGORY_BANNER",
  "APP_HOME",
]);
const promotionTypeSchema = z.enum([
  "PERCENTAGE",
  "FIXED_AMOUNT",
  "BUY_X_GET_Y",
  "FREE_SHIPPING",
]);

const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || new URL(value).protocol === "https:", {
    message: "Image URL must use HTTPS",
  });

const ctaUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("/") ||
      new URL(value).protocol === "https:",
    { message: "CTA URL must be a relative path or HTTPS URL" },
  );

const promotionSchema = z
  .object({
    promotion_type: promotionTypeSchema,
    discount_value: z.coerce.number().min(0),
    minimum_order_value: z.coerce.number().min(0).nullable().optional(),
    maximum_discount_amount: z.coerce.number().min(0).nullable().optional(),
    buy_quantity: z.coerce.number().int().min(1).nullable().optional(),
    get_quantity: z.coerce.number().int().min(1).nullable().optional(),
    get_product_id: z.string().uuid().nullable().optional(),
    can_combine_with_other_promotions: z.boolean().default(false),
  })
  .nullable()
  .optional();

const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    title_en: z.string().trim().min(1).max(255),
    title_ne: z.string().trim().max(255).nullable().optional(),
    subtitle_en: z.string().trim().max(255).nullable().optional(),
    subtitle_ne: z.string().trim().max(255).nullable().optional(),
    description_en: z.string().trim().min(1).max(5000),
    description_ne: z.string().trim().max(5000).nullable().optional(),
    image_url: imageUrlSchema.nullable().optional(),
    banner_image_url: imageUrlSchema.nullable().optional(),
    mobile_banner_image_url: imageUrlSchema.nullable().optional(),
    cta_text_en: z.string().trim().max(120).nullable().optional(),
    cta_text_ne: z.string().trim().max(120).nullable().optional(),
    cta_url: ctaUrlSchema.nullable().optional(),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    terms_en: z.string().trim().max(5000).nullable().optional(),
    terms_ne: z.string().trim().max(5000).nullable().optional(),
    status: publicationStatusSchema.default("DRAFT"),
    is_featured: z.boolean().default(false),
    sort_order: z.coerce.number().int().min(0).max(10000).default(0),
    channels: z.array(channelSchema).min(1).default(["WEB", "APP"]),
    placements: z.array(placementSchema).min(1).default(["OFFERS_PAGE"]),
    store_id: z.string().uuid().nullable().optional(),
    product_ids: z.array(z.string().uuid()).default([]),
    category_ids: z.array(z.string().uuid()).default([]),
    promotion: promotionSchema,
  })
  .superRefine((value, context) => {
    if (value.end_date <= value.start_date) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "End date must be after start date",
      });
    }
    if (
      value.promotion?.promotion_type === "BUY_X_GET_Y" &&
      (!value.promotion.buy_quantity || !value.promotion.get_quantity)
    ) {
      context.addIssue({
        code: "custom",
        path: ["promotion"],
        message: "Buy X Get Y requires buy and get quantities",
      });
    }
  });

const campaignSelect = `
  SELECT
    o.id,
    COALESCE(o.name, o.title_en) AS name,
    o.title_en,
    o.title_ne,
    o.subtitle_en,
    o.subtitle_ne,
    o.description_en,
    o.description_ne,
    o.image_url,
    o.banner_image_url,
    o.mobile_banner_image_url,
    o.cta_text_en,
    o.cta_text_ne,
    o.cta_url,
    o.start_date,
    o.end_date,
    o.terms_en,
    o.terms_ne,
    o.status,
    o.published_at,
    o.is_featured,
    o.sort_order,
    o.channels,
    o.placements,
    o.store_id,
    o.promotion_id,
    o.created_at,
    o.updated_at,
    COALESCE(links.product_ids, ARRAY[]::uuid[]) AS product_ids,
    COALESCE(links.category_ids, ARRAY[]::uuid[]) AS category_ids,
    CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', p.id,
      'promotion_id', p.promotion_id,
      'promotion_type', p.promotion_type,
      'discount_value', p.discount_value,
      'minimum_order_value', p.minimum_order_value,
      'maximum_discount_amount', p.maximum_discount_amount,
      'buy_quantity', p.buy_quantity,
      'get_quantity', p.get_quantity,
      'get_product_id', p.get_product_id,
      'is_active', p.is_active,
      'can_combine_with_other_promotions', p.can_combine_with_other_promotions
    ) END AS promotion
  FROM offers o
  LEFT JOIN LATERAL (
    SELECT
      array_remove(array_agg(op.product_id ORDER BY op.sort_order), NULL) AS product_ids,
      array_remove(array_agg(op.category_id ORDER BY op.sort_order), NULL) AS category_ids
    FROM offer_products op
    WHERE op.offer_id = o.id
  ) links ON TRUE
  LEFT JOIN promotions p ON p.id = o.promotion_id
`;

function actor(request: FastifyRequest): CampaignActor {
  return request.user as CampaignActor;
}

function privileged(user: CampaignActor): boolean {
  return (
    user.roleKey === "platform_admin" ||
    Boolean(user.capabilities?.includes("system.manage"))
  );
}

async function allowedStoreIds(user: CampaignActor): Promise<string[] | null> {
  if (user.scopeType === "GLOBAL" || privileged(user)) return null;
  if (user.scopeType === "ORGANIZATION" && user.scopeOrganizationId) {
    const result = await getPool().query(
      "SELECT id::text FROM stores WHERE organization_id = $1",
      [user.scopeOrganizationId],
    );
    return result.rows.map((row) => String(row.id));
  }
  return user.scopeStoreIds?.length
    ? user.scopeStoreIds
    : user.storeId
      ? [user.storeId]
      : [];
}

async function assertStoreWriteAccess(
  request: FastifyRequest,
  storeId: string | null | undefined,
): Promise<void> {
  const user = actor(request);
  const allowed = await allowedStoreIds(user);
  if (allowed === null) return;
  if (!storeId || !allowed.includes(storeId)) {
    throw new Error("CAMPAIGN_STORE_SCOPE_DENIED");
  }
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function syncLinks(
  client: import("pg").PoolClient,
  offerId: string,
  productIds: string[],
  categoryIds: string[],
): Promise<void> {
  await client.query("DELETE FROM offer_products WHERE offer_id = $1", [
    offerId,
  ]);
  let order = 0;
  for (const productId of productIds) {
    await client.query(
      "INSERT INTO offer_products (offer_id, product_id, sort_order) VALUES ($1, $2, $3)",
      [offerId, productId, order++],
    );
  }
  for (const categoryId of categoryIds) {
    await client.query(
      "INSERT INTO offer_products (offer_id, category_id, sort_order) VALUES ($1, $2, $3)",
      [offerId, categoryId, order++],
    );
  }
}

async function syncPromotion(
  client: import("pg").PoolClient,
  existingPromotionId: string | null,
  input: z.infer<typeof campaignSchema>,
  userId: string,
): Promise<string | null> {
  const promotion = input.promotion;
  if (!promotion) {
    if (existingPromotionId) {
      await client.query(
        "UPDATE promotions SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
        [existingPromotionId],
      );
    }
    return null;
  }

  const applicableProducts = JSON.stringify(input.product_ids);
  const applicableCategories = JSON.stringify(input.category_ids);
  const isActive = input.status === "PUBLISHED";

  if (existingPromotionId) {
    const updated = await client.query(
      `UPDATE promotions SET
        store_id = $1,
        name = $2,
        description = $3,
        promotion_type = $4,
        discount_value = $5,
        minimum_order_value = $6,
        maximum_discount_amount = $7,
        applicable_categories = $8::jsonb,
        applicable_products = $9::jsonb,
        buy_quantity = $10,
        get_quantity = $11,
        get_product_id = $12,
        is_active = $13,
        start_date = $14,
        end_date = $15,
        can_combine_with_other_promotions = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING id`,
      [
        input.store_id || null,
        input.name,
        input.description_en,
        promotion.promotion_type,
        promotion.discount_value,
        promotion.minimum_order_value ?? null,
        promotion.maximum_discount_amount ?? null,
        applicableCategories,
        applicableProducts,
        promotion.buy_quantity ?? null,
        promotion.get_quantity ?? null,
        promotion.get_product_id ?? null,
        isActive,
        input.start_date,
        input.end_date,
        promotion.can_combine_with_other_promotions,
        existingPromotionId,
      ],
    );
    if (updated.rowCount) return String(updated.rows[0].id);
  }

  const created = await client.query(
    `INSERT INTO promotions (
      promotion_id, store_id, name, description, promotion_type, discount_value,
      minimum_order_value, maximum_discount_amount, applicable_categories,
      applicable_products, buy_quantity, get_quantity, get_product_id,
      is_active, start_date, end_date, can_combine_with_other_promotions,
      created_by, metadata
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb
    ) RETURNING id`,
    [
      `PRM-${Date.now()}-${randomUUID().slice(0, 8)}`,
      input.store_id || null,
      input.name,
      input.description_en,
      promotion.promotion_type,
      promotion.discount_value,
      promotion.minimum_order_value ?? null,
      promotion.maximum_discount_amount ?? null,
      applicableCategories,
      applicableProducts,
      promotion.buy_quantity ?? null,
      promotion.get_quantity ?? null,
      promotion.get_product_id ?? null,
      isActive,
      input.start_date,
      input.end_date,
      promotion.can_combine_with_other_promotions,
      userId,
      JSON.stringify({ source: "campaign-manager" }),
    ],
  );
  return String(created.rows[0].id);
}

export async function publicCampaignRoutes(fastify: FastifyInstance) {
  fastify.get("/campaigns", async (request) => {
    const input = z
      .object({
        channel: channelSchema.default("WEB"),
        placement: placementSchema.optional(),
        store_id: z.string().uuid().optional(),
      })
      .parse(request.query);

    const result = await getPool().query(
      `${campaignSelect}
       WHERE o.status = 'PUBLISHED'
         AND o.start_date <= NOW()
         AND o.end_date >= NOW()
         AND $1::text = ANY(o.channels)
         AND ($2::text IS NULL OR $2::text = ANY(o.placements))
         AND (
           ($3::uuid IS NULL AND o.store_id IS NULL)
           OR ($3::uuid IS NOT NULL AND (o.store_id IS NULL OR o.store_id = $3))
         )
       ORDER BY o.sort_order, o.start_date DESC`,
      [input.channel, input.placement || null, input.store_id || null],
    );
    return result.rows;
  });
}

export async function campaignAdminRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (request) => {
    const input = z
      .object({
        status: publicationStatusSchema.optional(),
        store_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const allowed = await allowedStoreIds(actor(request));
    if (
      input.store_id &&
      allowed !== null &&
      !allowed.includes(input.store_id)
    ) {
      return [];
    }
    const result = await getPool().query(
      `${campaignSelect}
       WHERE ($1::text IS NULL OR o.status::text = $1)
         AND ($2::uuid IS NULL OR o.store_id = $2)
         AND ($3::uuid[] IS NULL OR o.store_id IS NULL OR o.store_id = ANY($3::uuid[]))
       ORDER BY o.updated_at DESC
       LIMIT $4 OFFSET $5`,
      [
        input.status || null,
        input.store_id || null,
        allowed,
        input.limit,
        input.offset,
      ],
    );
    return { items: result.rows, limit: input.limit, offset: input.offset };
  });

  fastify.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const allowed = await allowedStoreIds(actor(request));
    const result = await getPool().query(
      `${campaignSelect}
       WHERE o.id = $1
         AND ($2::uuid[] IS NULL OR o.store_id IS NULL OR o.store_id = ANY($2::uuid[]))`,
      [id, allowed],
    );
    if (!result.rowCount) {
      return reply.status(404).send({ error: "Campaign not found" });
    }
    return result.rows[0];
  });

  fastify.post("/", async (request, reply) => {
    const input = campaignSchema.parse(request.body);
    try {
      await assertStoreWriteAccess(request, input.store_id);
    } catch {
      return reply.status(403).send({ error: "Store is outside your scope" });
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const userId = actor(request).id;
      const created = await client.query(
        `INSERT INTO offers (
          name, title_en, title_ne, subtitle_en, subtitle_ne,
          description_en, description_ne, image_url, banner_image_url,
          mobile_banner_image_url, cta_text_en, cta_text_ne, cta_url,
          start_date, end_date, terms_en, terms_ne, status, published_at,
          is_featured, sort_order, channels, placements, store_id, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          CASE WHEN $18 = 'PUBLISHED' THEN NOW() ELSE NULL END,
          $19,$20,$21::text[],$22::text[],$23,$24
        ) RETURNING id`,
        [
          input.name,
          input.title_en,
          clean(input.title_ne),
          clean(input.subtitle_en),
          clean(input.subtitle_ne),
          input.description_en,
          clean(input.description_ne),
          clean(input.image_url),
          clean(input.banner_image_url),
          clean(input.mobile_banner_image_url),
          clean(input.cta_text_en),
          clean(input.cta_text_ne),
          clean(input.cta_url),
          input.start_date,
          input.end_date,
          clean(input.terms_en),
          clean(input.terms_ne),
          input.status,
          input.is_featured,
          input.sort_order,
          input.channels,
          input.placements,
          input.store_id || null,
          userId,
        ],
      );
      const offerId = String(created.rows[0].id);
      await syncLinks(client, offerId, input.product_ids, input.category_ids);
      const promotionId = await syncPromotion(client, null, input, userId);
      if (promotionId) {
        await client.query(
          "UPDATE offers SET promotion_id = $1 WHERE id = $2",
          [promotionId, offerId],
        );
      }
      await client.query("COMMIT");
      const result = await getPool().query(
        `${campaignSelect} WHERE o.id = $1`,
        [offerId],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ error }, "Failed to create campaign");
      return reply.status(500).send({ error: "Failed to create campaign" });
    } finally {
      client.release();
    }
  });

  fastify.put("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = campaignSchema.parse(request.body);
    try {
      await assertStoreWriteAccess(request, input.store_id);
    } catch {
      return reply.status(403).send({ error: "Store is outside your scope" });
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query(
        "SELECT promotion_id FROM offers WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!prior.rowCount) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ error: "Campaign not found" });
      }
      const userId = actor(request).id;
      const promotionId = await syncPromotion(
        client,
        prior.rows[0].promotion_id ? String(prior.rows[0].promotion_id) : null,
        input,
        userId,
      );
      await client.query(
        `UPDATE offers SET
          name = $1,
          title_en = $2,
          title_ne = $3,
          subtitle_en = $4,
          subtitle_ne = $5,
          description_en = $6,
          description_ne = $7,
          image_url = $8,
          banner_image_url = $9,
          mobile_banner_image_url = $10,
          cta_text_en = $11,
          cta_text_ne = $12,
          cta_url = $13,
          start_date = $14,
          end_date = $15,
          terms_en = $16,
          terms_ne = $17,
          status = $18,
          published_at = CASE
            WHEN $18 = 'PUBLISHED' THEN COALESCE(published_at, NOW())
            ELSE published_at
          END,
          is_featured = $19,
          sort_order = $20,
          channels = $21::text[],
          placements = $22::text[],
          store_id = $23,
          promotion_id = $24,
          updated_by = $25,
          updated_at = NOW()
        WHERE id = $26`,
        [
          input.name,
          input.title_en,
          clean(input.title_ne),
          clean(input.subtitle_en),
          clean(input.subtitle_ne),
          input.description_en,
          clean(input.description_ne),
          clean(input.image_url),
          clean(input.banner_image_url),
          clean(input.mobile_banner_image_url),
          clean(input.cta_text_en),
          clean(input.cta_text_ne),
          clean(input.cta_url),
          input.start_date,
          input.end_date,
          clean(input.terms_en),
          clean(input.terms_ne),
          input.status,
          input.is_featured,
          input.sort_order,
          input.channels,
          input.placements,
          input.store_id || null,
          promotionId,
          userId,
          id,
        ],
      );
      await syncLinks(client, id, input.product_ids, input.category_ids);
      await client.query("COMMIT");
      const result = await getPool().query(
        `${campaignSelect} WHERE o.id = $1`,
        [id],
      );
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ error }, "Failed to update campaign");
      return reply.status(500).send({ error: "Failed to update campaign" });
    } finally {
      client.release();
    }
  });
}
