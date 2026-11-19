import type { PoolClient } from "pg";
import { getPool } from "../database/connection.js";
import { memberPricingEnabled } from "../config/releaseFeatures.js";

export type MemberPricingTier = "REGISTERED_MEMBER" | "FOUNDING_1000";
export type MemberPricingChannel = "POS" | "WEB" | "APP" | "COD";
export type MemberPricingStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "EXPIRED"
  | "ARCHIVED";

export type MemberPricingActor = {
  id: string;
  roleKey: string;
  capabilities: string[];
  scopeType: string;
  scopeStoreIds: string[];
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type MemberPricingProductInput = {
  sku: string;
  member_price: string;
};

export type MemberPricingInput = {
  organization_id: string;
  name: string;
  starts_at: Date;
  ends_at: Date;
  reason: string;
  products: MemberPricingProductInput[];
  category_ids: string[];
  tiers: MemberPricingTier[];
  channels: MemberPricingChannel[];
};

export type MemberPricingPrice = {
  product_id: string;
  sku: string;
  product_name: string;
  regular_price: string;
  final_price: string;
  discount_per_unit: string;
  promotion_id: string | null;
};

type MemberPricingPromotionSnapshot = {
  id: string;
  organization_id: string;
  name: string;
  status: MemberPricingStatus;
  starts_at: Date;
  ends_at: Date;
  reason: string;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  products: Array<{ product_id: string; sku: string; member_price: string }>;
  categories: Array<{ id: string; name_en: string; slug: string }>;
  tiers: MemberPricingTier[];
  channels: MemberPricingChannel[];
};

export class MemberPricingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function moneyCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function centsMoney(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

async function loadSnapshot(
  client: PoolClient,
  id: string,
): Promise<MemberPricingPromotionSnapshot | null> {
  const base = await client.query(
    `SELECT id::text, organization_id::text, name,
            CASE WHEN status = 'ACTIVE' AND ends_at <= NOW()
                 THEN 'EXPIRED' ELSE status END AS status,
            starts_at, ends_at,
            reason, version, created_by::text, updated_by::text, created_at, updated_at
       FROM member_pricing_promotions
      WHERE id = $1`,
    [id],
  );
  if (!base.rowCount) return null;

  const products = await client.query(
    `SELECT p.id::text AS product_id, p.sku, mps.member_price::text AS member_price
       FROM member_pricing_promotion_skus mps
       JOIN products p ON p.id = mps.product_id
      WHERE mps.promotion_id = $1
      ORDER BY p.sku`,
    [id],
  );
  const categories = await client.query(
    `SELECT c.id::text, c.name_en, c.slug
       FROM member_pricing_promotion_categories mpc
       JOIN categories c ON c.id = mpc.category_id
      WHERE mpc.promotion_id = $1
      ORDER BY c.name_en`,
    [id],
  );
  const tiers = await client.query(
    `SELECT tier_key
       FROM member_pricing_promotion_tiers
      WHERE promotion_id = $1
      ORDER BY tier_key`,
    [id],
  );
  const channels = await client.query(
    `SELECT channel
       FROM member_pricing_promotion_channels
      WHERE promotion_id = $1
      ORDER BY channel`,
    [id],
  );
  const row = base.rows[0];
  const promotion: MemberPricingPromotionSnapshot = {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    status: String(row.status) as MemberPricingStatus,
    starts_at: new Date(String(row.starts_at)),
    ends_at: new Date(String(row.ends_at)),
    reason: String(row.reason),
    version: Number(row.version),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
    products: products.rows.map((product) => ({
      product_id: String(product.product_id),
      sku: String(product.sku),
      member_price: String(product.member_price),
    })),
    categories: categories.rows.map((category) => ({
      id: String(category.id),
      name_en: String(category.name_en),
      slug: String(category.slug),
    })),
    tiers: tiers.rows.map((item) => String(item.tier_key) as MemberPricingTier),
    channels: channels.rows.map((item) => String(item.channel) as MemberPricingChannel),
  };
  if (
    promotion.status === "ACTIVE" &&
    promotion.ends_at.getTime() <= Date.now()
  ) {
    return { ...promotion, status: "EXPIRED" };
  }
  return promotion;
}

export class MemberPricingService {
  private async inTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private assertOrganizationScope(
    organizationId: string,
    allowedOrganizationIds: string[] | null,
  ) {
    if (
      allowedOrganizationIds !== null &&
      !allowedOrganizationIds.includes(organizationId)
    ) {
      throw new MemberPricingError(
        "SCOPE_DENIED",
        "Promotion is outside the staff organization scope",
        403,
      );
    }
  }

  private async assertOrganizationActive(client: PoolClient, organizationId: string) {
    const result = await client.query(
      "SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE'",
      [organizationId],
    );
    if (!result.rowCount) {
      throw new MemberPricingError(
        "ORGANIZATION_UNAVAILABLE",
        "Organization is not active",
        404,
      );
    }
  }

  private async resolveProductIds(
    client: PoolClient,
    products: MemberPricingProductInput[],
    categoryIds: string[],
  ): Promise<Array<{ id: string; sku: string; memberPrice: string }>> {
    const skus = products.map((product) => product.sku.trim());
    const productRows = await client.query(
      `SELECT id::text, sku, category_id::text
         FROM products
        WHERE lower(sku) = ANY($1::text[])`,
      [skus.map((sku) => sku.toLocaleLowerCase("en-US"))],
    );
    if (productRows.rowCount !== products.length) {
      throw new MemberPricingError(
        "SKU_NOT_FOUND",
        "Every promotion SKU must match one existing product",
      );
    }

    const bySku = new Map(
      productRows.rows.map((row) => [
        String(row.sku).toLocaleLowerCase("en-US"),
        { id: String(row.id), sku: String(row.sku), categoryId: row.category_id },
      ]),
    );
    const entries = products.map((product) => {
      const resolved = bySku.get(product.sku.trim().toLocaleLowerCase("en-US"));
      if (!resolved) {
        throw new MemberPricingError(
          "SKU_NOT_FOUND",
          `Unknown SKU: ${product.sku}`,
        );
      }
      return {
        id: resolved.id,
        sku: resolved.sku,
        memberPrice: product.member_price,
        categoryId: resolved.categoryId ? String(resolved.categoryId) : null,
      };
    });

    if (categoryIds.length) {
      const categoryRows = await client.query(
        `SELECT id::text
           FROM categories
          WHERE id = ANY($1::uuid[])
            AND status = 'PUBLISHED'`,
        [categoryIds],
      );
      if (categoryRows.rowCount !== new Set(categoryIds).size) {
        throw new MemberPricingError(
          "CATEGORY_NOT_FOUND",
          "Every promotion category must be published",
        );
      }
      const selectedCategories = new Set(categoryIds);
      if (
        entries.some(
          (entry) =>
            !entry.categoryId || !selectedCategories.has(entry.categoryId),
        )
      ) {
        throw new MemberPricingError(
          "SKU_CATEGORY_MISMATCH",
          "Every configured SKU must belong to a selected category",
        );
      }
    }

    return entries.map(({ id, sku, memberPrice }) => ({
      id,
      sku,
      memberPrice,
    }));
  }

  private async replaceLinks(
    client: PoolClient,
    promotionId: string,
    products: Array<{ id: string; memberPrice: string }>,
    categoryIds: string[],
    tiers: MemberPricingTier[],
    channels: MemberPricingChannel[],
  ) {
    await client.query(
      "DELETE FROM member_pricing_promotion_skus WHERE promotion_id = $1",
      [promotionId],
    );
    await client.query(
      "DELETE FROM member_pricing_promotion_categories WHERE promotion_id = $1",
      [promotionId],
    );
    await client.query(
      "DELETE FROM member_pricing_promotion_tiers WHERE promotion_id = $1",
      [promotionId],
    );
    await client.query(
      "DELETE FROM member_pricing_promotion_channels WHERE promotion_id = $1",
      [promotionId],
    );
    for (const product of products) {
      await client.query(
        `INSERT INTO member_pricing_promotion_skus
          (promotion_id, product_id, member_price)
         VALUES ($1, $2, $3::numeric)`,
        [promotionId, product.id, product.memberPrice],
      );
    }
    for (const categoryId of categoryIds) {
      await client.query(
        `INSERT INTO member_pricing_promotion_categories
          (promotion_id, category_id) VALUES ($1, $2)`,
        [promotionId, categoryId],
      );
    }
    for (const tier of tiers) {
      await client.query(
        `INSERT INTO member_pricing_promotion_tiers
          (promotion_id, tier_key) VALUES ($1, $2)`,
        [promotionId, tier],
      );
    }
    for (const channel of channels) {
      await client.query(
        `INSERT INTO member_pricing_promotion_channels
          (promotion_id, channel) VALUES ($1, $2)`,
        [promotionId, channel],
      );
    }
  }

  private async validatePricing(
    client: PoolClient,
    organizationId: string,
    products: Array<{ id: string; memberPrice: string }>,
  ): Promise<Array<Record<string, unknown>>> {
    const productIds = products.map((product) => product.id);
    const pricesByProduct = new Map(
      products.map((product) => [product.id, product.memberPrice]),
    );
    const result = await client.query(
      `SELECT s.id::text AS store_id,
              p.id::text AS product_id,
              p.sku,
              p.status::text AS product_status,
              effective.price::text AS regular_price,
              effective.currency_code,
              cost.weighted_cost::text AS weighted_cost,
              cost.has_missing_cost,
              policies.minimum_gross_margin_percent::text AS margin_floor
         FROM stores s
         JOIN products p ON p.id = ANY($2::uuid[])
         LEFT JOIN LATERAL (
           SELECT pp.price, pp.currency_code
             FROM product_prices pp
            WHERE pp.product_id = p.id
              AND (pp.store_id = s.id OR pp.store_id IS NULL)
              AND pp.active = TRUE
              AND pp.valid_from <= NOW()
              AND (pp.valid_to IS NULL OR pp.valid_to > NOW())
            ORDER BY (pp.store_id = s.id) DESC, pp.valid_from DESC,
                     pp.created_at DESC, pp.id DESC
            LIMIT 1
         ) effective ON TRUE
         LEFT JOIN LATERAL (
           SELECT CASE
                    WHEN SUM(bi.quantity) > 0
                     AND COUNT(*) FILTER (WHERE bi.unit_cost IS NULL) = 0
                    THEN SUM(bi.quantity * bi.unit_cost) / SUM(bi.quantity)
                    ELSE NULL
                  END AS weighted_cost,
                  COUNT(*) FILTER (WHERE bi.quantity > 0 AND bi.unit_cost IS NULL) > 0
                    AS has_missing_cost
             FROM batch_inventory bi
            WHERE bi.store_id = s.id
              AND bi.product_id = p.id
              AND bi.quantity > 0
         ) cost ON TRUE
         CROSS JOIN member_pricing_policies policies
        WHERE s.organization_id = $1
          AND s.status = 'PUBLISHED'
          AND policies.policy_key = 'GLOBAL'
        ORDER BY s.id, p.sku`,
      [organizationId, productIds],
    );
    const issues: Array<Record<string, unknown>> = [];
    if (!result.rowCount) {
      return [
        {
          code: "NO_PUBLISHED_STORES",
          message: "Organization has no published store for this promotion",
        },
      ];
    }
    for (const row of result.rows) {
      const memberPrice = pricesByProduct.get(String(row.product_id));
      if (memberPrice === undefined) {
        issues.push({
          code: "MEMBER_PRICE_MISSING",
          sku: row.sku,
          store_id: row.store_id,
          message: "An explicit member price is required for every SKU",
        });
        continue;
      }
      if (row.product_status !== "PUBLISHED") {
        issues.push({
          code: "PRODUCT_INACTIVE",
          sku: row.sku,
          store_id: row.store_id,
          message: "Product must be published",
        });
        continue;
      }
      if (
        row.regular_price === null ||
        row.currency_code !== "NPR" ||
        Number(row.regular_price) <= 0
      ) {
        issues.push({
          code: "REGULAR_PRICE_UNAVAILABLE",
          sku: row.sku,
          store_id: row.store_id,
          message: "An active NPR regular price is required",
        });
        continue;
      }
      if (moneyCents(memberPrice) > moneyCents(String(row.regular_price))) {
        issues.push({
          code: "MEMBER_PRICE_ABOVE_REGULAR",
          sku: row.sku,
          store_id: row.store_id,
          regular_price: row.regular_price,
          member_price: memberPrice,
          message: "Member price cannot exceed regular price",
        });
        continue;
      }
      if (row.weighted_cost === null || row.has_missing_cost) {
        issues.push({
          code: "COST_UNAVAILABLE",
          sku: row.sku,
          store_id: row.store_id,
          message: "Complete on-hand batch unit costs are required",
        });
        continue;
      }
      const margin = await client.query(
        `SELECT $1::numeric > 0
                  AND (($1::numeric - $2::numeric) * 100)
                      >= $1::numeric * $3::numeric AS passes`,
        [memberPrice, row.weighted_cost, row.margin_floor],
      );
      if (!margin.rows[0]?.passes) {
        issues.push({
          code: "MARGIN_FLOOR",
          sku: row.sku,
          store_id: row.store_id,
          minimum_gross_margin_percent: row.margin_floor,
          message: "Member price is below the approved gross-margin floor",
        });
      }
    }
    return issues;
  }

  private async validatePromotion(
    client: PoolClient,
    promotion: MemberPricingPromotionSnapshot,
  ) {
    const products = promotion.products.map((product) => ({
      id: String(product.product_id),
      memberPrice: String(product.member_price),
    }));
    const issues: Array<Record<string, unknown>> = [];
    if (!products.length) {
      issues.push({
        code: "SKU_REQUIRED",
        message: "At least one explicit SKU member price is required",
      });
    }
    if (!promotion.tiers.length) {
      issues.push({
        code: "TIER_REQUIRED",
        message: "At least one eligible membership tier is required",
      });
    }
    if (!promotion.channels.length) {
      issues.push({
        code: "CHANNEL_REQUIRED",
        message: "At least one sales channel is required",
      });
    }
    if (promotion.categories.length && products.length) {
      const categories = promotion.categories.map((category) => category.id);
      const activeCategories = await client.query(
        `SELECT id::text
           FROM categories
          WHERE id = ANY($1::uuid[]) AND status = 'PUBLISHED'`,
        [categories],
      );
      if (activeCategories.rowCount !== categories.length) {
        issues.push({
          code: "CATEGORY_INACTIVE",
          message: "Every configured category must remain published",
        });
      }
      const mismatches = await client.query(
        `SELECT sku
           FROM products
          WHERE id = ANY($1::uuid[])
            AND (category_id IS NULL OR NOT (category_id = ANY($2::uuid[])))`,
        [products.map((product) => product.id), categories],
      );
      for (const row of mismatches.rows) {
        issues.push({
          code: "SKU_CATEGORY_MISMATCH",
          sku: String(row.sku),
          message: "Configured SKU no longer belongs to a selected category",
        });
      }
    }
    if (products.length) {
      issues.push(
        ...(await this.validatePricing(
          client,
          String(promotion.organization_id),
          products,
        )),
      );
    }
    return issues;
  }

  private async writeAudit(
    client: PoolClient,
    promotionId: string,
    action: "CREATED" | "UPDATED" | "ACTIVATED" | "PAUSED" | "ARCHIVED",
    reason: string,
    actor: MemberPricingActor,
    before: unknown,
    after: unknown,
    version: number,
  ) {
    const snapshot = JSON.stringify(after);
    await client.query(
      `INSERT INTO member_pricing_promotion_history
        (promotion_id, version, action, reason, actor_id, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [promotionId, version, action, reason, actor.id, snapshot],
    );
    await client.query(
      `INSERT INTO audit_events (
        event_type, entity_type, entity_id, actor_id, actor_role,
        actor_capabilities, actor_scope_type, actor_scope_store_ids, changes,
        ip_address, user_agent, correlation_id
      ) VALUES ($1, 'member_pricing_promotion', $2, $3, $4, $5::jsonb,
                $6, $7::uuid[], $8::jsonb, $9, $10, $11)`,
      [
        `MEMBER_PRICING_PROMOTION_${action}`,
        promotionId,
        actor.id,
        actor.roleKey,
        JSON.stringify(actor.capabilities),
        actor.scopeType,
        actor.scopeStoreIds,
        JSON.stringify({ before, after, reason }),
        actor.ipAddress ?? null,
        actor.userAgent ?? null,
        actor.correlationId ?? `member-pricing:${promotionId}:v${version}`,
      ],
    );
  }

  async listPromotions(filters: {
    organizationIds: string[] | null;
    organizationId?: string;
    status?: MemberPricingStatus;
    search?: string;
    sku?: string;
    limit: number;
    offset: number;
  }) {
    if (filters.organizationIds && filters.organizationId &&
        !filters.organizationIds.includes(filters.organizationId)) {
      throw new MemberPricingError("SCOPE_DENIED", "Organization is outside the staff scope", 403);
    }
    const result = await getPool().query(
      `SELECT DISTINCT p.id
         FROM member_pricing_promotions p
        WHERE ($1::uuid IS NULL OR p.organization_id = $1)
          AND ($2::uuid[] IS NULL OR p.organization_id = ANY($2::uuid[]))
          AND ($3::text IS NULL OR
               CASE WHEN p.status = 'ACTIVE' AND p.ends_at <= NOW()
                    THEN 'EXPIRED' ELSE p.status END = $3)
          AND ($4::text IS NULL OR p.name ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR EXISTS (
            SELECT 1
              FROM member_pricing_promotion_skus mps
              JOIN products product ON product.id = mps.product_id
             WHERE mps.promotion_id = p.id AND product.sku ILIKE '%' || $5 || '%'
          ))
        ORDER BY p.id DESC
        LIMIT $6 OFFSET $7`,
      [
        filters.organizationId ?? null,
        filters.organizationIds,
        filters.status ?? null,
        filters.search ?? null,
        filters.sku ?? null,
        filters.limit,
        filters.offset,
      ],
    );
    const client = await getPool().connect();
    try {
      const items = [];
      for (const row of result.rows) {
        const snapshot = await loadSnapshot(client, String(row.id));
        if (snapshot) items.push(snapshot);
      }
      return { items, limit: filters.limit, offset: filters.offset };
    } finally {
      client.release();
    }
  }

  async getPromotion(
    id: string,
    allowedOrganizationIds: string[] | null,
  ) {
    const client = await getPool().connect();
    try {
      const promotion = await loadSnapshot(client, id);
      if (!promotion) {
        throw new MemberPricingError("PROMOTION_NOT_FOUND", "Promotion not found", 404);
      }
      this.assertOrganizationScope(
        String(promotion.organization_id),
        allowedOrganizationIds,
      );
      return promotion;
    } finally {
      client.release();
    }
  }

  async createPromotion(input: MemberPricingInput, actor: MemberPricingActor) {
    return this.inTransaction(async (client) => {
      await this.assertOrganizationActive(client, input.organization_id);
      const products = await this.resolveProductIds(
        client,
        input.products,
        input.category_ids,
      );
      const inserted = await client.query(
        `INSERT INTO member_pricing_promotions
          (organization_id, name, starts_at, ends_at, reason, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id::text`,
        [
          input.organization_id,
          input.name,
          input.starts_at,
          input.ends_at,
          input.reason,
          actor.id,
        ],
      );
      const id = String(inserted.rows[0].id);
      await this.replaceLinks(
        client,
        id,
        products.map(({ id: productId, memberPrice }) => ({
          id: productId,
          memberPrice,
        })),
        input.category_ids,
        input.tiers,
        input.channels,
      );
      const promotion = await loadSnapshot(client, id);
      if (!promotion) throw new Error("Created promotion could not be loaded");
      const issues = await this.validatePromotion(client, promotion);
      if (issues.length) {
        throw new MemberPricingError(
          "PROMOTION_INVALID",
          "Promotion does not satisfy pricing rules",
          422,
          issues,
        );
      }
      await this.writeAudit(client, id, "CREATED", input.reason, actor, null, promotion, 1);
      return promotion;
    });
  }

  async updatePromotion(
    id: string,
    input: Omit<MemberPricingInput, "organization_id">,
    actor: MemberPricingActor,
    allowedOrganizationIds: string[] | null,
  ) {
    return this.inTransaction(async (client) => {
      const before = await loadSnapshot(client, id);
      if (!before) throw new MemberPricingError("PROMOTION_NOT_FOUND", "Promotion not found", 404);
      this.assertOrganizationScope(String(before.organization_id), allowedOrganizationIds);
      if (!["DRAFT", "PAUSED"].includes(String(before.status))) {
        throw new MemberPricingError(
          "PROMOTION_NOT_EDITABLE",
          "Only draft or paused promotions can be edited",
          409,
        );
      }
      const products = await this.resolveProductIds(client, input.products, input.category_ids);
      const nextVersion = Number(before.version) + 1;
      await client.query(
        `UPDATE member_pricing_promotions
            SET name = $2, starts_at = $3, ends_at = $4, reason = $5,
                updated_by = $6, version = $7, updated_at = NOW()
          WHERE id = $1`,
        [id, input.name, input.starts_at, input.ends_at, input.reason, actor.id, nextVersion],
      );
      await this.replaceLinks(
        client,
        id,
        products.map(({ id: productId, memberPrice }) => ({
          id: productId,
          memberPrice,
        })),
        input.category_ids,
        input.tiers,
        input.channels,
      );
      const after = await loadSnapshot(client, id);
      if (!after) throw new Error("Updated promotion could not be loaded");
      const issues = await this.validatePromotion(client, after);
      if (issues.length) {
        throw new MemberPricingError(
          "PROMOTION_INVALID",
          "Promotion does not satisfy pricing rules",
          422,
          issues,
        );
      }
      await this.writeAudit(client, id, "UPDATED", input.reason, actor, before, after, nextVersion);
      return after;
    });
  }

  async previewPromotion(id: string, allowedOrganizationIds: string[] | null) {
    const client = await getPool().connect();
    try {
      const promotion = await loadSnapshot(client, id);
      if (!promotion) throw new MemberPricingError("PROMOTION_NOT_FOUND", "Promotion not found", 404);
      this.assertOrganizationScope(String(promotion.organization_id), allowedOrganizationIds);
      const issues = await this.validatePromotion(client, promotion);
      return { promotion, valid: issues.length === 0, issues };
    } finally {
      client.release();
    }
  }

  private async lockConflicts(
    client: PoolClient,
    promotion: MemberPricingPromotionSnapshot,
  ) {
    const keys = promotion.products.flatMap((product) =>
      promotion.tiers.flatMap((tier) =>
        promotion.channels.map(
          (channel) =>
            `${promotion.organization_id}:${product.product_id}:${tier}:${channel}`,
        ),
      ),
    );
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext(lock_key))
         FROM unnest($1::text[]) AS lock_key
        ORDER BY lock_key`,
      [Array.from(new Set(keys)).sort()],
    );
    const conflicts = await client.query(
      `SELECT DISTINCT other.id::text, other.name
         FROM member_pricing_promotions other
         JOIN member_pricing_promotion_skus other_sku
           ON other_sku.promotion_id = other.id
         JOIN member_pricing_promotion_tiers other_tier
           ON other_tier.promotion_id = other.id
         JOIN member_pricing_promotion_channels other_channel
           ON other_channel.promotion_id = other.id
         WHERE other.organization_id = $1
           AND other.id <> $2
           AND other.status = 'ACTIVE'
           AND other.starts_at < $4
           AND other.ends_at > $3
           AND other_sku.product_id = ANY($5::uuid[])
           AND other_tier.tier_key = ANY($6::text[])
           AND other_channel.channel = ANY($7::text[])`,
      [
        promotion.organization_id,
        promotion.id,
        promotion.starts_at,
        promotion.ends_at,
        promotion.products.map((product) => product.product_id),
        promotion.tiers,
        promotion.channels,
      ],
    );
    if (conflicts.rowCount) {
      throw new MemberPricingError(
        "PROMOTION_CONFLICT",
        "An active promotion already overlaps for the same SKU, tier, and channel",
        409,
        conflicts.rows,
      );
    }
  }

  async transitionPromotion(
    id: string,
    action: "ACTIVATED" | "PAUSED" | "ARCHIVED",
    reason: string,
    actor: MemberPricingActor,
    allowedOrganizationIds: string[] | null,
  ) {
    return this.inTransaction(async (client) => {
      const before = await loadSnapshot(client, id);
      if (!before) throw new MemberPricingError("PROMOTION_NOT_FOUND", "Promotion not found", 404);
      this.assertOrganizationScope(String(before.organization_id), allowedOrganizationIds);

      const nextStatus: MemberPricingStatus =
        action === "ACTIVATED"
          ? "ACTIVE"
          : action === "PAUSED"
            ? "PAUSED"
            : "ARCHIVED";
      if (
        (action === "ACTIVATED" && !["DRAFT", "PAUSED"].includes(String(before.status))) ||
        (action === "PAUSED" && before.status !== "ACTIVE") ||
        (action === "ARCHIVED" && !["DRAFT", "ACTIVE", "PAUSED", "EXPIRED"].includes(String(before.status)))
      ) {
        throw new MemberPricingError(
          "INVALID_PROMOTION_TRANSITION",
          "Promotion cannot make the requested status transition",
          409,
        );
      }
      if (action === "ACTIVATED") {
        if (new Date(String(before.ends_at)).getTime() <= Date.now()) {
          throw new MemberPricingError("PROMOTION_EXPIRED", "An expired promotion cannot be activated", 409);
        }
        const issues = await this.validatePromotion(client, before);
        if (issues.length) {
          throw new MemberPricingError(
            "PROMOTION_INVALID",
            "Promotion does not satisfy pricing rules",
            422,
            issues,
          );
        }
        await this.lockConflicts(client, before);
      }

      const nextVersion = Number(before.version) + 1;
      await client.query(
        `UPDATE member_pricing_promotions
            SET status = $2, reason = $3, updated_by = $4,
                version = $5, updated_at = NOW()
          WHERE id = $1`,
        [id, nextStatus, reason, actor.id, nextVersion],
      );
      const after = await loadSnapshot(client, id);
      if (!after) throw new Error("Transitioned promotion could not be loaded");
      await this.writeAudit(client, id, action, reason, actor, before, after, nextVersion);
      return after;
    });
  }

  async getPerformance(id: string, allowedOrganizationIds: string[] | null) {
    const promotion = await this.getPromotion(id, allowedOrganizationIds);
    const result = await getPool().query(
      `WITH applied AS (
         SELECT 'POS'::text AS channel, si.product_id, si.quantity,
                si.discount_amount, si.line_total
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN stores st ON st.id = s.store_id
          WHERE si.member_pricing_promotion_id = $1
            AND st.organization_id = $2
            AND s.sale_status = 'COMPLETED'
         UNION ALL
         SELECT 'WEB'::text AS channel, woi.product_id, woi.quantity,
                woi.discount_amount, woi.line_total
           FROM web_order_items woi
           JOIN web_orders wo ON wo.id = woi.order_id
           JOIN stores st ON st.id = wo.store_id
          WHERE woi.member_pricing_promotion_id = $1
            AND st.organization_id = $2
            AND wo.status NOT IN ('CANCELLED', 'REFUNDED')
       )
       SELECT channel, p.sku, SUM(applied.quantity)::numeric::text AS units,
              SUM(applied.discount_amount)::numeric::text AS discount_npr,
              SUM(applied.line_total)::numeric::text AS net_sales_npr
         FROM applied
         LEFT JOIN products p ON p.id = applied.product_id
        GROUP BY channel, p.sku
        ORDER BY channel, p.sku`,
      [id, promotion.organization_id],
    );
    return { promotion_id: id, rows: result.rows };
  }
}

export async function resolveMemberPricing(
  client: PoolClient,
  input: {
    storeId: string;
    customerId?: string | null;
    channel: MemberPricingChannel;
    productIds: string[];
  },
): Promise<MemberPricingPrice[]> {
  if (!input.productIds.length) return [];
  const storeResult = await client.query(
    `SELECT id::text, organization_id::text
       FROM stores
      WHERE id = $1 AND organization_id IS NOT NULL`,
    [input.storeId],
  );
  if (!storeResult.rowCount) {
    throw new MemberPricingError("STORE_NOT_FOUND", "Store not found", 404);
  }
  const organizationId = String(storeResult.rows[0].organization_id);
  let tier: string | null = null;
  if (input.customerId) {
    const membership = await client.query(
      `SELECT m.tier_key
         FROM customer_memberships m
         JOIN customers c ON c.id = m.customer_id
        WHERE m.customer_id = $1
          AND m.organization_id = $2
          AND m.status = 'ACTIVE'
          AND c.status = 'ACTIVE'
          AND c.verification_status = 'VERIFIED'
        LIMIT 1`,
      [input.customerId, organizationId],
    );
    tier = membership.rows[0]?.tier_key ? String(membership.rows[0].tier_key) : null;
  }
  const products = await client.query(
    `SELECT     p.id::text, p.sku, p.name_en, p.category_id::text,
    p.status::text AS product_status,
            effective.price::text AS regular_price, effective.currency_code,
            cost.weighted_cost::text AS weighted_cost, cost.has_missing_cost,
            policies.minimum_gross_margin_percent::text AS margin_floor
       FROM products p
       LEFT JOIN LATERAL (
         SELECT pp.price, pp.currency_code
           FROM product_prices pp
          WHERE pp.product_id = p.id
            AND (pp.store_id = $1 OR pp.store_id IS NULL)
            AND pp.active = TRUE
            AND pp.valid_from <= NOW()
            AND (pp.valid_to IS NULL OR pp.valid_to > NOW())
          ORDER BY (pp.store_id = $1) DESC, pp.valid_from DESC,
                   pp.created_at DESC, pp.id DESC
          LIMIT 1
       ) effective ON TRUE
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN SUM(bi.quantity) > 0
                   AND COUNT(*) FILTER (WHERE bi.unit_cost IS NULL) = 0
                  THEN SUM(bi.quantity * bi.unit_cost) / SUM(bi.quantity)
                  ELSE NULL
                END AS weighted_cost,
                COUNT(*) FILTER (WHERE bi.quantity > 0 AND bi.unit_cost IS NULL) > 0
                  AS has_missing_cost
           FROM batch_inventory bi
          WHERE bi.store_id = $1 AND bi.product_id = p.id AND bi.quantity > 0
       ) cost ON TRUE
       CROSS JOIN member_pricing_policies policies
      WHERE p.id = ANY($2::uuid[])
        AND policies.policy_key = 'GLOBAL'`,
    [input.storeId, input.productIds],
  );
  if (products.rowCount !== new Set(input.productIds).size) {
    throw new MemberPricingError("SKU_NOT_FOUND", "A product is unavailable", 404);
  }
  const byProduct = new Map<string, Record<string, unknown>>();
  for (const row of products.rows) {
    if (
      row.product_status !== "PUBLISHED" ||
      row.currency_code !== "NPR" ||
      row.regular_price === null ||
      Number(row.regular_price) <= 0
    ) {
      throw new MemberPricingError(
        "REGULAR_PRICE_UNAVAILABLE",
        `Regular price is unavailable for SKU ${row.sku}`,
        409,
      );
    }
    byProduct.set(String(row.id), row);
  }

  const candidates = tier && memberPricingEnabled()
    ? await client.query(
        `SELECT p.id::text AS promotion_id, p.starts_at, p.ends_at,
                mps.product_id::text, mps.member_price::text
           FROM member_pricing_promotions p
           JOIN member_pricing_promotion_skus mps ON mps.promotion_id = p.id
           JOIN member_pricing_promotion_tiers mpt ON mpt.promotion_id = p.id
           JOIN member_pricing_promotion_channels mpc ON mpc.promotion_id = p.id
           JOIN products product ON product.id = mps.product_id
          WHERE p.organization_id = $1
            AND p.status = 'ACTIVE'
            AND p.starts_at <= NOW()
            AND p.ends_at > NOW()
            AND mpt.tier_key = $2
            AND mpc.channel = $3
            AND mps.product_id = ANY($4::uuid[])
            AND (
              NOT EXISTS (
                SELECT 1 FROM member_pricing_promotion_categories any_category
                 WHERE any_category.promotion_id = p.id
              )
              OR EXISTS (
                SELECT 1
                  FROM member_pricing_promotion_categories eligible_category
                  JOIN categories category ON category.id = eligible_category.category_id
                 WHERE eligible_category.promotion_id = p.id
                   AND eligible_category.category_id = product.category_id
                   AND category.status = 'PUBLISHED'
              )
            )`,
        [organizationId, tier, input.channel, input.productIds],
      )
    : { rows: [] as Array<Record<string, unknown>> };
  const candidateByProduct = new Map<string, Record<string, unknown>>();
  for (const row of candidates.rows) {
    const productId = String(row.product_id);
    if (candidateByProduct.has(productId)) {
      throw new MemberPricingError(
        "PROMOTION_CONFLICT",
        "More than one member promotion applies to this SKU",
        409,
      );
    }
    candidateByProduct.set(productId, row);
  }

  const result: MemberPricingPrice[] = [];
  for (const productId of input.productIds) {
    const product = byProduct.get(productId);
    if (!product) throw new MemberPricingError("SKU_NOT_FOUND", "A product is unavailable", 404);
    const candidate = candidateByProduct.get(productId);
    let finalPrice = String(product.regular_price);
    let promotionId: string | null = null;
    if (
      candidate &&
      moneyCents(String(candidate.member_price)) <=
        moneyCents(String(product.regular_price)) &&
      product.weighted_cost !== null &&
      !product.has_missing_cost
    ) {
      const margin = await client.query(
        `SELECT $1::numeric > 0
                  AND (($1::numeric - $2::numeric) * 100)
                      >= $1::numeric * $3::numeric AS passes`,
        [candidate.member_price, product.weighted_cost, product.margin_floor],
      );
      if (margin.rows[0]?.passes) {
        finalPrice = String(candidate.member_price);
        promotionId = String(candidate.promotion_id);
      }
    }
    const regularCents = moneyCents(String(product.regular_price));
    const finalCents = moneyCents(finalPrice);
    result.push({
      product_id: productId,
      sku: String(product.sku),
      product_name: String(product.name_en),
      regular_price: String(product.regular_price),
      final_price: finalPrice,
      discount_per_unit: centsMoney(regularCents - finalCents),
      promotion_id: promotionId,
    });
  }
  return result;
}

export function calculatePricedLine(price: MemberPricingPrice, quantity: number) {
  const regular = moneyCents(price.regular_price);
  const final = moneyCents(price.final_price);
  return {
    regularUnitPrice: price.regular_price,
    discountAmount: centsMoney((regular - final) * BigInt(quantity)),
    lineTotal: centsMoney(final * BigInt(quantity)),
    promotionId: price.promotion_id,
  };
}
