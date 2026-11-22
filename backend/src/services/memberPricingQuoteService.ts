import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { PoolClient } from "pg";
import { getPool } from "../database/connection.js";
import {
  centsMoney,
  MemberPricingError,
  moneyCents,
  resolveMemberPricing,
  type MemberPricingChannel,
  type MemberPricingPrice,
  type MemberPricingTier,
} from "./memberPricingService.js";

export const MEMBER_PRICING_QUOTE_TTL_MS = 5 * 60 * 1000;

const channelSchema = z.enum(["POS", "WEB", "APP", "COD"]);
const quantitySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
  .refine((value) => quantityMilli(value) > 0n);
const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/);

const quoteItemSchema = z
  .object({
    sku: z.string().trim().min(1).max(100),
    quantity: quantitySchema,
    regularUnitPrice: moneySchema,
    appliedUnitPrice: moneySchema,
    lineDiscount: moneySchema,
    lineTotal: moneySchema,
    promotionReference: z.string().uuid().nullable(),
    promotionSnapshot: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        version: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const campaignPromotionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(255),
    promotionType: z.literal("PERCENTAGE"),
    discountValue: moneySchema,
  })
  .strict();

export const memberPricingQuotePayloadSchema = z
  .object({
    quoteId: z.string().uuid(),
    channel: channelSchema,
    storeReference: z.string().uuid(),
    customerReference: z.string().uuid().nullable(),
    membershipNumber: z.number().int().positive().nullable(),
    membershipTier: z.enum(["REGISTERED_MEMBER", "FOUNDING_1000"]).nullable(),
    membershipStatus: z
      .enum(["ACTIVE", "SUSPENDED", "CANCELLED", "NOT_MEMBER"]),
    customerStatus: z.string().max(40).nullable(),
    items: z.array(quoteItemSchema).min(1).max(100),
    subtotal: moneySchema,
    discountTotal: moneySchema,
    finalTotal: moneySchema,
    campaignPromotion: campaignPromotionSchema.nullable(),
    currency: z.literal("NPR"),
    pricingRuleVersion: z.number().int().positive(),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type MemberPricingQuotePayload = z.infer<
  typeof memberPricingQuotePayloadSchema
>;
export type MemberPricingQuote = MemberPricingQuotePayload & {
  signedQuoteToken: string;
};

const cartInputSchema = z
  .object({
    channel: channelSchema,
    storeReference: z.string().uuid(),
    customerReference: z.string().uuid().nullable().default(null),
    customerPhoneReference: z.string().trim().min(1).max(40).nullable().default(null),
    items: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(100),
            quantity: quantitySchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      Boolean(value.customerReference) !==
      Boolean(value.customerPhoneReference)
    ) {
      context.addIssue({
        code: "custom",
        path: ["customerPhoneReference"],
        message: "Customer reference and phone reference must be supplied together.",
      });
    }

    if (new Set(value.items.map((item) => item.sku)).size !== value.items.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Each SKU may appear only once in the quote cart.",
      });
    }
  });

const validationInputSchema = cartInputSchema.extend({
  signedQuoteToken: z.string().min(20).max(32_768),
  saleReference: z.string().trim().min(8).max(200),
});

export class MemberPricingQuoteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "MemberPricingQuoteError";
  }
}

function quantityMilli(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function canonicalQuantity(value: string): string {
  const milli = quantityMilli(value);
  const whole = milli / 1000n;
  const fraction = String(milli % 1000n).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function roundPaisa(unitPricePaisa: bigint, quantity: string): bigint {
  return (unitPricePaisa * quantityMilli(quantity) + 500n) / 1000n;
}

export function calculateMemberPricingLine(
  price: Pick<
    MemberPricingPrice,
    "regular_price" | "final_price" | "promotion_id"
  >,
  quantity: string,
): {
  regularUnitPrice: string;
  appliedUnitPrice: string;
  lineDiscount: string;
  lineTotal: string;
} {
  const regularUnitPrice = moneyCents(price.regular_price);
  const appliedUnitPrice = moneyCents(price.final_price);
  const regularLine = roundPaisa(regularUnitPrice, quantity);
  const appliedLine = roundPaisa(appliedUnitPrice, quantity);

  if (appliedLine > regularLine || appliedUnitPrice > regularUnitPrice) {
    throw new MemberPricingQuoteError(
      "INVALID_PRICE_RESULT",
      "The pricing engine returned an applied price above regular price.",
      500,
    );
  }

  return {
    regularUnitPrice: centsMoney(regularUnitPrice),
    appliedUnitPrice: centsMoney(appliedUnitPrice),
    lineDiscount: centsMoney(regularLine - appliedLine),
    lineTotal: centsMoney(appliedLine),
  };
}

function quoteSigningSecret(): string {
  const secret = process.env.MEMBER_PRICING_QUOTE_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNING_NOT_CONFIGURED",
      "Member pricing quote signing is not configured.",
      503,
    );
  }
  return secret;
}

function signPayload(payload: MemberPricingQuotePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedMemberPricingQuote(
  token: string,
  secret = quoteSigningSecret(),
): MemberPricingQuotePayload {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNATURE_INVALID",
      "The pricing quote signature is invalid.",
      401,
    );
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encoded)
    .digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNATURE_INVALID",
      "The pricing quote signature is invalid.",
      401,
    );
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNATURE_INVALID",
      "The pricing quote signature is invalid.",
      401,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNATURE_INVALID",
      "The pricing quote signature is invalid.",
      401,
    );
  }

  const parsed = memberPricingQuotePayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new MemberPricingQuoteError(
      "QUOTE_SIGNATURE_INVALID",
      "The pricing quote signature is invalid.",
      401,
    );
  }
  return parsed.data;
}

function quoteTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function loadStore(client: PoolClient, storeReference: string) {
  const result = await client.query(
    `SELECT id::text, organization_id::text
       FROM stores
      WHERE id = $1
        AND status = 'PUBLISHED'
        AND organization_id IS NOT NULL`,
    [storeReference],
  );
  if (!result.rowCount) {
    throw new MemberPricingError("STORE_NOT_FOUND", "Store not found", 404);
  }
  return {
    id: String(result.rows[0].id),
    organizationId: String(result.rows[0].organization_id),
  };
}

async function loadCustomer(
  client: PoolClient,
  customerReference: string | null,
  customerPhoneReference: string | null,
  organizationId: string,
) {
  if (!customerReference) {
    return {
      membershipNumber: null,
      membershipTier: null as MemberPricingTier | null,
      membershipStatus: "NOT_MEMBER" as const,
      customerStatus: null,
    };
  }

  const result = await client.query(
    `SELECT c.id::text, c.phone_normalized, c.status AS customer_status,
            c.verification_status,
            m.membership_number, m.tier_key, m.status AS membership_status
       FROM customers c
       LEFT JOIN customer_memberships m
         ON m.customer_id = c.id AND m.organization_id = $2
      WHERE c.id = $1`,
    [customerReference, organizationId],
  );
  if (!result.rowCount) {
    throw new MemberPricingQuoteError(
      "CUSTOMER_MISMATCH",
      "The customer reference is not valid for this store.",
      409,
    );
  }

  const row = result.rows[0];
  if (
    !customerPhoneReference ||
    String(row.phone_normalized) !== customerPhoneReference
  ) {
    throw new MemberPricingQuoteError(
      "CUSTOMER_MISMATCH",
      "The customer reference does not match the linked customer.",
      409,
    );
  }
  if (
    row.customer_status !== "ACTIVE" ||
    row.verification_status !== "VERIFIED"
  ) {
    throw new MemberPricingQuoteError(
      "CUSTOMER_NOT_AVAILABLE",
      "The linked customer is not active and verified.",
      409,
    );
  }

  const membershipStatus = row.membership_status
    ? String(row.membership_status)
    : "NOT_MEMBER";
  if (!["ACTIVE", "SUSPENDED", "CANCELLED", "NOT_MEMBER"].includes(membershipStatus)) {
    throw new MemberPricingQuoteError(
      "MEMBERSHIP_STATUS_INVALID",
      "The linked customer has an unsupported membership status.",
      409,
    );
  }
  return {
    membershipNumber:
      row.membership_number == null ? null : Number(row.membership_number),
    membershipTier: row.tier_key
      ? (String(row.tier_key) as MemberPricingTier)
      : null,
    membershipStatus: membershipStatus as
      | "ACTIVE"
      | "SUSPENDED"
      | "CANCELLED"
      | "NOT_MEMBER",
    customerStatus: String(row.customer_status),
  };
}

async function buildQuotePayload(
  client: PoolClient,
  input: z.infer<typeof cartInputSchema>,
  now: Date,
): Promise<MemberPricingQuotePayload> {
  const store = await loadStore(client, input.storeReference);
  const customer = await loadCustomer(
    client,
    input.customerReference,
    input.customerPhoneReference,
    store.organizationId,
  );

  const productResult = await client.query(
    `SELECT id::text, sku
       FROM products
      WHERE sku = ANY($1::text[])
      ORDER BY sku, id`,
    [input.items.map((item) => item.sku)],
  );
  const idsBySku = new Map<string, string[]>();
  for (const row of productResult.rows) {
    const sku = String(row.sku);
    const productIds = idsBySku.get(sku) ?? [];
    productIds.push(String(row.id));
    idsBySku.set(sku, productIds);
  }
  const productIds: string[] = [];
  for (const item of input.items) {
    const ids = idsBySku.get(item.sku) ?? [];
    if (ids.length !== 1) {
      throw new MemberPricingQuoteError(
        ids.length ? "DUPLICATE_SKU" : "SKU_NOT_FOUND",
        ids.length
          ? `SKU ${item.sku} maps to multiple products.`
          : `SKU ${item.sku} is not available in the pricing catalog.`,
        409,
      );
    }
    productIds.push(ids[0]);
  }

  const prices = await resolveMemberPricing(client, {
    storeId: store.id,
    customerId: input.customerReference,
    channel: input.channel as MemberPricingChannel,
    productIds,
  });
  const priceById = new Map(prices.map((price) => [price.product_id, price]));
  const promotionIds = [
    ...new Set(
      prices.flatMap((price) => (price.promotion_id ? [price.promotion_id] : [])),
    ),
  ];
  const promotionResult = promotionIds.length
    ? await client.query(
        `SELECT id::text, name, version
           FROM member_pricing_promotions
          WHERE id = ANY($1::uuid[])`,
        [promotionIds],
      )
    : { rows: [] as Array<{ id: string; name: string; version: number }> };
  const promotionById = new Map(
    promotionResult.rows.map((row: { id: string; name: string; version: number }) => [
      String(row.id),
      { id: String(row.id), name: String(row.name), version: Number(row.version) },
    ]),
  );

  // Campaign discounts are sourced from the admin campaign manager, but only
  // published, date-valid web campaigns with a percentage rule are applied.
  // The signed quote remains the source of truth at checkout.
  const campaignResult = input.channel === "WEB"
    ? await client.query(
        `SELECT o.id::text AS id, p.name,
                p.discount_value::numeric(12,2)::text AS discount_value,
                p.minimum_order_value::numeric(12,2)::text AS minimum_order_value,
                p.maximum_discount_amount::numeric(12,2)::text AS maximum_discount_amount,
                COALESCE(links.product_ids, ARRAY[]::text[]) AS product_ids,
                COALESCE(links.category_ids, ARRAY[]::text[]) AS category_ids
           FROM offers o
           JOIN promotions p ON p.id = o.promotion_id
           LEFT JOIN LATERAL (
             SELECT array_remove(array_agg(DISTINCT op.product_id::text), NULL) AS product_ids,
                    array_remove(array_agg(DISTINCT op.category_id::text), NULL) AS category_ids
               FROM offer_products op
              WHERE op.offer_id = o.id
           ) links ON TRUE
          WHERE o.status = 'PUBLISHED'
            AND o.start_date <= $1 AND o.end_date >= $1
            AND 'WEB' = ANY(o.channels)
            AND (o.store_id IS NULL OR o.store_id = $2)
            AND (p.store_id IS NULL OR p.store_id = $2)
            AND p.is_active = TRUE
            AND p.promotion_type = 'PERCENTAGE'
            AND (p.start_date IS NULL OR p.start_date <= $1)
            AND (p.end_date IS NULL OR p.end_date >= $1)
          ORDER BY o.sort_order, o.start_date DESC, o.id
          LIMIT 20`,
        [now, store.id],
      )
    : { rows: [] as Array<Record<string, unknown>> };

  const categoriesResult = await client.query(
    "SELECT id::text, category_id::text FROM products WHERE id = ANY($1::uuid[])",
    [productIds],
  );
  const categoryByProductId = new Map<string, string | null>(
    categoriesResult.rows.map((row) => [String(row.id), row.category_id == null ? null : String(row.category_id)]),
  );
  const campaign = campaignResult.rows.find((row) => {
    const targetProducts = Array.isArray(row.product_ids) ? row.product_ids.map(String) : [];
    const targetCategories = Array.isArray(row.category_ids) ? row.category_ids.map(String) : [];
    const unrestricted = targetProducts.length === 0 && targetCategories.length === 0;
    const eligibleIndices = productIds.map((id, index) => ({ id, index })).filter(({ id }) =>
      unrestricted || targetProducts.includes(id) || (categoryByProductId.get(id) && targetCategories.includes(categoryByProductId.get(id)!)),
    );
    if (!eligibleIndices.length) return false;
    const eligibleSubtotal = eligibleIndices.reduce((sum, { id, index }) => {
      const price = priceById.get(id);
      return sum + (price ? roundPaisa(moneyCents(price.regular_price), input.items[index].quantity) : 0n);
    }, 0n);
    return eligibleSubtotal > 0n && (row.minimum_order_value == null || eligibleSubtotal >= moneyCents(String(row.minimum_order_value)));
  });

  let campaignRemainingPaisa = campaign?.maximum_discount_amount == null
    ? null
    : moneyCents(String(campaign.maximum_discount_amount));

  let subtotalPaisa = 0n;
  let finalTotalPaisa = 0n;
  let campaignApplied = false;
  const quoteItems = input.items
    .map((item, index) => {
      const price = priceById.get(productIds[index]);
      if (!price || price.sku !== item.sku) {
        throw new MemberPricingQuoteError(
          "SKU_MISMATCH",
          "The pricing catalog returned a different SKU mapping.",
          409,
        );
      }
      const line = calculateMemberPricingLine(price, item.quantity);
      const regularLinePaisa = roundPaisa(
        moneyCents(line.regularUnitPrice),
        item.quantity,
      );
      let finalLinePaisa = moneyCents(line.lineTotal);
      const campaignProductIds = campaign && Array.isArray(campaign.product_ids) ? campaign.product_ids.map(String) : [];
      const campaignCategoryIds = campaign && Array.isArray(campaign.category_ids) ? campaign.category_ids.map(String) : [];
      const campaignUnrestricted = campaignProductIds.length === 0 && campaignCategoryIds.length === 0;
      const campaignEligible = Boolean(campaign && (campaignUnrestricted || campaignProductIds.includes(productIds[index]) || (categoryByProductId.get(productIds[index]) && campaignCategoryIds.includes(categoryByProductId.get(productIds[index])!))));
      let appliedLine = line;
      let lineCampaignApplied = false;
      if (campaign && campaignEligible && (campaignRemainingPaisa === null || campaignRemainingPaisa > 0n)) {
        const percentHundredths = Number(campaign.discount_value) * 100;
        const campaignDiscount = (regularLinePaisa * BigInt(Math.round(percentHundredths)) + 5000n) / 10000n;
        const cappedDiscount = campaignRemainingPaisa === null
          ? campaignDiscount
          : campaignDiscount < campaignRemainingPaisa ? campaignDiscount : campaignRemainingPaisa;
        const campaignLineTotal = regularLinePaisa - cappedDiscount;
        // Campaigns do not stack with member promotions: apply whichever gives
        // the customer the lower line total.
        if (campaignLineTotal < finalLinePaisa) {
          finalLinePaisa = campaignLineTotal;
          campaignApplied = true;
          lineCampaignApplied = true;
          campaignRemainingPaisa = campaignRemainingPaisa === null ? null : campaignRemainingPaisa - cappedDiscount;
          const quantityMilliValue = quantityMilli(item.quantity);
          const appliedUnitPaisa = (finalLinePaisa * 1000n + quantityMilliValue / 2n) / quantityMilliValue;
          appliedLine = {
            ...line,
            appliedUnitPrice: centsMoney(appliedUnitPaisa),
            lineDiscount: centsMoney(regularLinePaisa - finalLinePaisa),
            lineTotal: centsMoney(finalLinePaisa),
          };
        }
      }
      subtotalPaisa += regularLinePaisa;
      finalTotalPaisa += finalLinePaisa;
      const promotion = price.promotion_id
        ? promotionById.get(price.promotion_id)
        : null;
      return {
        sku: item.sku,
        quantity: canonicalQuantity(item.quantity),
        ...appliedLine,
        promotionReference: lineCampaignApplied ? null : price.promotion_id,
        promotionSnapshot: lineCampaignApplied ? null : promotion ?? null,
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const policy = await client.query(
    `SELECT pricing_rule_version
       FROM member_pricing_policies
      WHERE policy_key = 'GLOBAL'`,
  );
  if (!policy.rowCount) {
    throw new MemberPricingQuoteError(
      "PRICING_POLICY_UNAVAILABLE",
      "The pricing policy is unavailable.",
      503,
    );
  }

  const payload = {
    quoteId: randomUUID(),
    channel: input.channel,
    storeReference: store.id,
    customerReference: input.customerReference,
    membershipNumber: customer.membershipNumber,
    membershipTier: customer.membershipTier,
    membershipStatus: customer.membershipStatus,
    customerStatus: customer.customerStatus,
    items: quoteItems,
    subtotal: centsMoney(subtotalPaisa),
    discountTotal: centsMoney(subtotalPaisa - finalTotalPaisa),
    finalTotal: centsMoney(finalTotalPaisa),
    campaignPromotion: campaign && campaignApplied ? {
      id: String(campaign.id),
      name: String(campaign.name),
      promotionType: "PERCENTAGE" as const,
      discountValue: moneyCents(String(campaign.discount_value)) === 0n ? "0.00" : String(campaign.discount_value),
    } : null,
    currency: "NPR" as const,
    pricingRuleVersion: Number(policy.rows[0].pricing_rule_version),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MEMBER_PRICING_QUOTE_TTL_MS).toISOString(),
  };
  return memberPricingQuotePayloadSchema.parse(payload);
}

export async function createMemberPricingQuote(
  rawInput: unknown,
  options: { now?: Date } = {},
): Promise<MemberPricingQuote> {
  const parsed = cartInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new MemberPricingQuoteError(
      "INVALID_QUOTE_REQUEST",
      "The pricing quote request is invalid.",
      400,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const payload = await buildQuotePayload(
      client,
      {
        ...parsed.data,
        items: parsed.data.items.map((item) => ({
          ...item,
          quantity: canonicalQuantity(item.quantity),
        })),
      },
      options.now ?? new Date(),
    );
    const signedQuoteToken = signPayload(payload, quoteSigningSecret());
    await client.query(
      `INSERT INTO member_pricing_quotes (
         id, quote_payload, token_hash, issued_at, expires_at
       ) VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [
        payload.quoteId,
        JSON.stringify(payload),
        quoteTokenHash(signedQuoteToken),
        payload.issuedAt,
        payload.expiresAt,
      ],
    );
    await client.query("COMMIT");
    return { ...payload, signedQuoteToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function validateMemberPricingQuote(
  rawInput: unknown,
  options: { now?: Date } = {},
): Promise<MemberPricingQuotePayload> {
  const parsed = validationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new MemberPricingQuoteError(
      "INVALID_QUOTE_VALIDATION",
      "The pricing quote validation request is invalid.",
      400,
    );
  }

  const signedPayload = verifySignedMemberPricingQuote(
    parsed.data.signedQuoteToken,
  );
  const expectedItems = parsed.data.items
    .map((item) => ({
      sku: item.sku,
      quantity: canonicalQuantity(item.quantity),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  const quotedItems = signedPayload.items
    .map((item) => ({ sku: item.sku, quantity: item.quantity }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  if (
    signedPayload.channel !== parsed.data.channel ||
    signedPayload.storeReference !== parsed.data.storeReference ||
    signedPayload.customerReference !== parsed.data.customerReference ||
    !isDeepStrictEqual(expectedItems, quotedItems)
  ) {
    throw new MemberPricingQuoteError(
      "QUOTE_MISMATCH",
      "The pricing quote does not match this customer, channel, store, or cart.",
      409,
    );
  }

  const now = options.now ?? new Date();
  if (
    Date.parse(signedPayload.expiresAt) <= now.getTime() ||
    Date.parse(signedPayload.issuedAt) > now.getTime() + 30_000
  ) {
    throw new MemberPricingQuoteError(
      "QUOTE_EXPIRED",
      "The pricing quote is expired or not yet valid.",
      409,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const store = await loadStore(client, parsed.data.storeReference);
    const customer = await loadCustomer(
      client,
      parsed.data.customerReference,
      parsed.data.customerPhoneReference,
      store.organizationId,
    );
    if (
      customer.membershipTier !== signedPayload.membershipTier ||
      customer.membershipStatus !== signedPayload.membershipStatus ||
      customer.customerStatus !== signedPayload.customerStatus
    ) {
      throw new MemberPricingQuoteError(
        "CUSTOMER_MISMATCH",
        "Customer membership changed after the pricing quote was issued.",
        409,
      );
    }
    const result = await client.query(
      `SELECT quote_payload, token_hash, claimed_sale_reference
         FROM member_pricing_quotes
        WHERE id = $1
        FOR UPDATE`,
      [signedPayload.quoteId],
    );
    if (
      !result.rowCount ||
      result.rows[0].token_hash !== quoteTokenHash(parsed.data.signedQuoteToken) ||
      !isDeepStrictEqual(result.rows[0].quote_payload, signedPayload)
    ) {
      throw new MemberPricingQuoteError(
        "QUOTE_NOT_FOUND",
        "The signed pricing quote is not recognized.",
        409,
      );
    }
    if (result.rows[0].claimed_sale_reference) {
      if (result.rows[0].claimed_sale_reference !== parsed.data.saleReference) {
        throw new MemberPricingQuoteError(
          "QUOTE_REPLAY",
          "The pricing quote is already bound to another sale.",
          409,
        );
      }
    } else {
      const claimed = await client.query(
        `UPDATE member_pricing_quotes
            SET claimed_sale_reference = $2,
                claimed_at = NOW()
          WHERE id = $1 AND claimed_sale_reference IS NULL`,
        [signedPayload.quoteId, parsed.data.saleReference],
      );
      if (claimed.rowCount !== 1) {
        throw new MemberPricingQuoteError(
          "QUOTE_REPLAY",
          "The pricing quote could not be bound to this sale.",
          409,
        );
      }
    }
    await client.query("COMMIT");
    return signedPayload;
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new MemberPricingQuoteError(
        "QUOTE_REPLAY",
        "The sale reference is already bound to another pricing quote.",
        409,
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyMemberPricingCustomer(
  rawInput: unknown,
): Promise<{
  customerReference: string;
  membershipNumber: number | null;
  membershipTier: MemberPricingTier | null;
  membershipStatus: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "NOT_MEMBER";
}> {
  const parsed = z
    .object({
      customerReference: z.string().uuid(),
      customerPhoneReference: z.string().trim().min(1).max(40),
      storeReference: z.string().uuid(),
    })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    throw new MemberPricingQuoteError(
      "INVALID_CUSTOMER_REFERENCE",
      "The customer reference request is invalid.",
      400,
    );
  }

  const client = await getPool().connect();
  try {
    const store = await loadStore(client, parsed.data.storeReference);
    const customer = await loadCustomer(
      client,
      parsed.data.customerReference,
      parsed.data.customerPhoneReference,
      store.organizationId,
    );
    return {
      customerReference: parsed.data.customerReference,
      membershipNumber: customer.membershipNumber,
      membershipTier: customer.membershipTier,
      membershipStatus: customer.membershipStatus,
    };
  } finally {
    client.release();
  }
}

export async function getCustomerMemberPricingDisplay(rawInput: unknown) {
  const parsed = z
    .object({
      channel: channelSchema,
      storeReference: z.string().uuid(),
      customerReference: z.string().uuid(),
      customerPhoneReference: z.string().trim().min(1).max(40),
      skus: z.array(z.string().trim().min(1).max(100)).min(1).max(2500),
    })
    .strict()
    .superRefine((value, context) => {
      if (new Set(value.skus).size !== value.skus.length) {
        context.addIssue({
          code: "custom",
          path: ["skus"],
          message: "Each SKU may appear only once.",
        });
      }
    })
    .safeParse(rawInput);
  if (!parsed.success) {
    throw new MemberPricingQuoteError(
      "INVALID_PRICING_REQUEST",
      "The member pricing request is invalid.",
      400,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const store = await loadStore(client, parsed.data.storeReference);
    const customer = await loadCustomer(
      client,
      parsed.data.customerReference,
      parsed.data.customerPhoneReference,
      store.organizationId,
    );
    const productResult = await client.query(
      `SELECT id::text, sku
         FROM products
        WHERE sku = ANY($1::text[])
        ORDER BY sku, id`,
      [parsed.data.skus],
    );
    const idsBySku = new Map<string, string[]>();
    for (const row of productResult.rows) {
      const sku = String(row.sku);
      const ids = idsBySku.get(sku) ?? [];
      ids.push(String(row.id));
      idsBySku.set(sku, ids);
    }
    const productIds = parsed.data.skus.map((sku) => {
      const ids = idsBySku.get(sku) ?? [];
      if (ids.length !== 1) {
        throw new MemberPricingQuoteError(
          ids.length ? "DUPLICATE_SKU" : "SKU_NOT_FOUND",
          ids.length
            ? `SKU ${sku} maps to multiple products.`
            : `SKU ${sku} is not available in the pricing catalog.`,
          409,
        );
      }
      return ids[0];
    });
    const prices = await resolveMemberPricing(client, {
      storeId: store.id,
      customerId: parsed.data.customerReference,
      channel: parsed.data.channel as MemberPricingChannel,
      productIds,
    });
    const promotionIds = [
      ...new Set(
        prices.flatMap((price) =>
          price.promotion_id ? [price.promotion_id] : [],
        ),
      ),
    ];
    const promotionResult = promotionIds.length
      ? await client.query(
          `SELECT id::text, name, version
             FROM member_pricing_promotions
            WHERE id = ANY($1::uuid[])`,
          [promotionIds],
        )
      : { rows: [] as Array<{ id: string; name: string; version: number }> };
    const promotionById = new Map(
      promotionResult.rows.map((row) => [
        String(row.id),
        { id: String(row.id), name: String(row.name), version: Number(row.version) },
      ]),
    );
    const priceBySku = new Map(prices.map((price) => [price.sku, price]));
    const policy = await client.query(
      `SELECT pricing_rule_version
         FROM member_pricing_policies
        WHERE policy_key = 'GLOBAL'`,
    );
    if (!policy.rowCount) {
      throw new MemberPricingQuoteError(
        "PRICING_POLICY_UNAVAILABLE",
        "The pricing policy is unavailable.",
        503,
      );
    }

    const displayPrices = parsed.data.skus.map((sku) => {
      const price = priceBySku.get(sku);
      if (!price) {
        throw new MemberPricingQuoteError(
          "SKU_MISMATCH",
          "The pricing catalog returned a different SKU mapping.",
          409,
        );
      }
      const line = calculateMemberPricingLine(price, "1");
      return {
        sku,
        regularUnitPrice: line.regularUnitPrice,
        appliedUnitPrice: line.appliedUnitPrice,
        savingPerUnit: line.lineDiscount,
        promotionReference: price.promotion_id,
        promotionSnapshot: price.promotion_id
          ? promotionById.get(price.promotion_id) ?? null
          : null,
      };
    });
    await client.query("COMMIT");
    return {
      channel: parsed.data.channel,
      storeReference: store.id,
      customerReference: parsed.data.customerReference,
      membershipNumber: customer.membershipNumber,
      membershipTier: customer.membershipTier,
      membershipStatus: customer.membershipStatus,
      currency: "NPR" as const,
      pricingRuleVersion: Number(policy.rows[0].pricing_rule_version),
      prices: displayPrices,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getMemberPricingCatalog(storeReference: string) {
  const parsedStore = z.string().uuid().safeParse(storeReference);
  if (!parsedStore.success) {
    throw new MemberPricingQuoteError(
      "INVALID_STORE_REFERENCE",
      "The store reference is invalid.",
      400,
    );
  }
  const client = await getPool().connect();
  try {
    const store = await loadStore(client, parsedStore.data);
    const result = await client.query(
      `SELECT p.id::text AS product_id, p.sku, p.status::text AS product_status,
              effective.price::text AS regular_price,
              effective.currency_code,
              cost.weighted_cost::text AS weighted_cost,
              cost.has_missing_cost
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
        WHERE p.status IN ('PUBLISHED', 'DRAFT', 'ARCHIVED')
        ORDER BY p.sku, p.id`,
      [store.id],
    );
    return {
      storeReference: store.id,
      currency: "NPR",
      products: result.rows.map((row) => {
        const reasons: string[] = [];
        if (row.product_status !== "PUBLISHED") reasons.push("PRODUCT_INACTIVE");
        if (
          row.regular_price === null ||
          row.currency_code !== "NPR" ||
          moneyCents(String(row.regular_price)) <= 0n
        ) {
          reasons.push("REGULAR_PRICE_UNAVAILABLE");
        }
        if (row.weighted_cost === null || row.has_missing_cost) {
          reasons.push("COST_UNAVAILABLE");
        }
        return {
          productReference: String(row.product_id),
          sku: String(row.sku),
          active: row.product_status === "PUBLISHED",
          regularUnitPrice:
            row.regular_price === null
              ? null
              : centsMoney(moneyCents(String(row.regular_price))),
          currency: row.currency_code ? String(row.currency_code) : null,
          memberPricingEligible: reasons.length === 0,
          ineligibilityReasons: reasons,
        };
      }),
    };
  } finally {
    client.release();
  }
}
