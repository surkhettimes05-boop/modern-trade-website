import crypto from "node:crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { getPool } from "../database/connection.js";

const money = (value: number) =>
  `${Math.trunc(value).toString()}.${Math.round((value - Math.trunc(value)) * 100)
    .toString()
    .padStart(2, "0")}`;

function timingSafeStringMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorized(request: FastifyRequest) {
  const configured = process.env.MODERN_PRICING_SERVICE_TOKEN?.trim();
  if (!configured) return false;
  const header = String(request.headers.authorization ?? "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return Boolean(match?.[1] && timingSafeStringMatch(match[1], configured));
}

function signPayload(payload: object) {
  const secret = process.env.MODERN_PRICING_SIGNING_SECRET ||
    process.env.MODERN_PRICING_SERVICE_TOKEN;
  if (!secret) throw new Error("Modern pricing signing secret is not configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function verifySignedToken(token: string) {
  const secret = process.env.MODERN_PRICING_SIGNING_SECRET ||
    process.env.MODERN_PRICING_SERVICE_TOKEN;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("hex");
  if (!timingSafeStringMatch(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as object;
  } catch {
    return null;
  }
}

const quoteInputSchema = z.object({
  channel: z.enum(["POS", "COD"]),
  storeReference: z.string().uuid(),
  customerReference: z.string().uuid().nullable(),
  customerPhoneReference: z.string().min(1).max(128).nullable(),
  items: z.array(z.object({
    sku: z.string().min(1).max(100),
    quantity: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/),
  })).min(1).max(100),
});

const validateInputSchema = quoteInputSchema.extend({
  saleReference: z.string().min(1).max(200),
  signedQuoteToken: z.string().min(20).max(32768),
});

function cartHash(channel: string, storeReference: string, customerReference: string | null,
  customerPhoneReference: string | null, items: Array<{ sku: string; quantity: string }>) {
  return crypto.createHash("sha256").update(JSON.stringify({
    channel, storeReference, customerReference, customerPhoneReference, items,
  })).digest("hex");
}

async function customerSnapshot(customerReference: string | null) {
  if (!customerReference) {
    return {
      membershipNumber: null,
      membershipTier: null,
      membershipStatus: "NOT_MEMBER",
      customerStatus: null,
    };
  }
  const result = await getPool().query(
    `SELECT c.id, c.status, c.verification_status,
            fm.founder_number
       FROM customers c
       LEFT JOIN founding_members fm ON fm.customer_id = c.id
      WHERE c.id = $1
      LIMIT 1`,
    [customerReference],
  );
  if (!result.rowCount) {
    return {
      membershipNumber: null,
      membershipTier: null,
      membershipStatus: "NOT_MEMBER",
      customerStatus: null,
    };
  }
  const row = result.rows[0];
  if (row.status !== "ACTIVE" || row.verification_status !== "VERIFIED") {
    return {
      membershipNumber: null,
      membershipTier: null,
      membershipStatus: "SUSPENDED",
      customerStatus: row.status,
    };
  }
  if (row.founder_number) {
    return {
      membershipNumber: Number(row.founder_number),
      membershipTier: "FOUNDING_1000",
      membershipStatus: "ACTIVE",
      customerStatus: "ACTIVE",
    };
  }
  return {
    membershipNumber: null,
    membershipTier: "REGISTERED_MEMBER",
    membershipStatus: "ACTIVE",
    customerStatus: "ACTIVE",
  };
}

async function buildQuote(input: z.infer<typeof quoteInputSchema>) {
  const pool = getPool();
  const quoteItems = [];
  let subtotal = 0;
  let discountTotal = 0;

  for (const item of input.items) {
    const quantity = Number(item.quantity);
    const product = await pool.query(
      `SELECT p.id, p.sku, p.status, pp.price, pp.original_price,
              pp.currency_code
         FROM products p
         LEFT JOIN product_prices pp
           ON pp.product_id = p.id
          AND pp.store_id = $1
          AND pp.active = true
          AND pp.valid_from <= NOW()
          AND (pp.valid_to IS NULL OR pp.valid_to >= NOW())
        WHERE p.sku = $2
        ORDER BY pp.valid_from DESC
        LIMIT 1`,
      [input.storeReference, item.sku],
    );
    if (!product.rowCount) throw new Error("PRICING_SKU_NOT_FOUND");
    const row = product.rows[0];
    if (row.status !== "PUBLISHED" || !row.price || row.currency_code !== "NPR") {
      throw new Error("PRICING_PRODUCT_INELIGIBLE");
    }
    const regularUnitPrice = Number(row.original_price ?? row.price);
    const appliedUnitPrice = Number(row.price);
    const quantityMilli = Math.round(quantity * 1000);
    const regularLine = Math.round((regularUnitPrice * quantityMilli + 500) / 1000 * 100) / 100;
    const appliedLine = Math.round((appliedUnitPrice * quantityMilli + 500) / 1000 * 100) / 100;
    const lineDiscount = Math.round((regularLine - appliedLine) * 100) / 100;
    subtotal += regularLine;
    discountTotal += lineDiscount;
    quoteItems.push({
      sku: item.sku,
      quantity: item.quantity,
      regularUnitPrice: money(regularUnitPrice),
      appliedUnitPrice: money(appliedUnitPrice),
      lineDiscount: money(lineDiscount),
      lineTotal: money(appliedLine),
      promotionReference: null,
      promotionSnapshot: null,
    });
  }

  const finalTotal = Math.round((subtotal - discountTotal) * 100) / 100;
  const customer = await customerSnapshot(input.customerReference);
  const quoteId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  return {
    quoteId,
    channel: input.channel,
    storeReference: input.storeReference,
    customerReference: input.customerReference,
    ...customer,
    items: quoteItems,
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    finalTotal: money(finalTotal),
    currency: "NPR",
    pricingRuleVersion: 1,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function forbidden(reply: FastifyReply) {
  return reply.status(401).send({ error: "Invalid pricing service credential" });
}

export async function pasalhoLitePricingRoutes(fastify: FastifyInstance) {
  fastify.post("/api/internal/member-pricing/quotes",
    async (request, reply) => {
      if (!authorized(request)) return forbidden(reply);
      const parsed = quoteInputSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid pricing request" });
      try {
        const payload = await buildQuote(parsed.data);
        const encodedPayload = JSON.stringify(payload);
        await getPool().query(
          `INSERT INTO pasalho_lite_pricing_quotes (
             quote_id, channel, store_reference, customer_reference,
             customer_phone_hash, cart_hash, payload, expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            payload.quoteId,
            payload.channel,
            payload.storeReference,
            payload.customerReference,
            parsed.data.customerPhoneReference
              ? crypto.createHash("sha256").update(parsed.data.customerPhoneReference).digest("hex")
              : null,
            cartHash(
              parsed.data.channel,
              parsed.data.storeReference,
              parsed.data.customerReference,
              parsed.data.customerPhoneReference,
              parsed.data.items,
            ),
            encodedPayload,
            payload.expiresAt,
          ],
        );
        return reply.send({
          quote: {
            ...payload,
            signedQuoteToken: signPayload(payload),
          },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "PRICING_REQUEST_FAILED";
        return reply.status(code === "PRICING_SKU_NOT_FOUND" ||
          code === "PRICING_PRODUCT_INELIGIBLE" ? 422 : 500).send({ error: code });
      }
    });

  fastify.post("/api/internal/member-pricing/quotes/validate",
    async (request, reply) => {
      if (!authorized(request)) return forbidden(reply);
      const parsed = validateInputSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid quote validation request" });
      const signed = verifySignedToken(parsed.data.signedQuoteToken);
      if (!signed) return reply.status(409).send({ error: "INVALID_PRICING_QUOTE" });
      const quote = signed as Record<string, unknown>;
      const quoteId = quote.quoteId as string;
      if (!quoteId) return reply.status(409).send({ error: "INVALID_PRICING_QUOTE" });
      const stored = await getPool().query(
        "SELECT * FROM pasalho_lite_pricing_quotes WHERE quote_id = $1",
        [quoteId],
      );
      if (!stored.rowCount) return reply.status(409).send({ error: "INVALID_PRICING_QUOTE" });
      const row = stored.rows[0];
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return reply.status(409).send({ error: "PRICING_QUOTE_EXPIRED" });
      }
      const expectedHash = cartHash(
        parsed.data.channel,
        parsed.data.storeReference,
        parsed.data.customerReference,
        parsed.data.customerPhoneReference,
        parsed.data.items,
      );
      if (row.cart_hash !== expectedHash) {
        return reply.status(409).send({ error: "PRICING_QUOTE_MISMATCH" });
      }
      if (row.validated_at && row.sale_reference && row.sale_reference !== parsed.data.saleReference) {
        return reply.status(409).send({ error: "PRICING_QUOTE_REPLAY" });
      }
      await getPool().query(
        `UPDATE pasalho_lite_pricing_quotes
            SET sale_reference = COALESCE(sale_reference, $2),
                validated_at = COALESCE(validated_at, NOW())
          WHERE quote_id = $1
            AND (sale_reference IS NULL OR sale_reference = $2)
            AND validated_at IS NULL`,
        [quoteId, parsed.data.saleReference],
      );
      return reply.send({ valid: true, quote: row.payload });
    });

  fastify.post("/api/internal/member-pricing/customers/verify",
    async (request, reply) => {
      if (!authorized(request)) return forbidden(reply);
      const parsed = z.object({
        customerReference: z.string().uuid(),
        customerPhoneReference: z.string().min(1).max(128),
        storeReference: z.string().uuid(),
      }).safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid customer verification request" });
      const customer = await customerSnapshot(parsed.data.customerReference);
      return reply.send({ customer: {
        customerReference: parsed.data.customerReference,
        membershipNumber: customer.membershipNumber,
        membershipTier: customer.membershipTier,
        membershipStatus: customer.membershipStatus,
      } });
    });
}
