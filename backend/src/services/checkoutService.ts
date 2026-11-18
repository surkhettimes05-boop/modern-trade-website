import { createHash, randomUUID } from "node:crypto";
import { getPool } from "../database/connection.js";
import { MARKET } from "../config/market.js";
import { DeliveryZoneService } from "./deliveryZoneService.js";
import { loadCanonicalCartItems } from "./cartValidationService.js";
import {
  calculatePricedLine,
  centsMoney,
  moneyCents,
  resolveMemberPricing,
} from "./memberPricingService.js";
import {
  calculateMemberPricingLine,
  MemberPricingQuoteError,
  validateMemberPricingQuote,
} from "./memberPricingQuoteService.js";

const deliveryZones = new DeliveryZoneService();

export class CheckoutService {
  async createCodOrder(input: {
    customerId: string;
    storeId: string;
    addressId?: string;
    cartId: string;
    idempotencyKey: string;
    signedQuoteToken: string;
    channel: "WEB" | "APP";
    deliveryType: "DELIVERY" | "PICKUP";
    shippingName: string;
    shippingPhone: string;
    shippingAddress?: string;
    shippingMunicipalityId?: number;
    shippingWardId?: number;
    shippingPostalCode?: string;
    shippingCountry?: string;
    notes?: string;
    actorId?: string;
  }) {
    const pool = getPool();
    const client = await pool.connect();
    let requestFingerprint = "";
    try {
      await client.query("BEGIN");

      // Serialize retries before looking up the result or locking a converted cart.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `checkout:${input.customerId}:${input.idempotencyKey}`,
      ]);
      const cartFingerprintRows = await client.query(
        `SELECT ci.product_id, ci.quantity
           FROM cart_items ci
           JOIN shopping_carts sc ON sc.id = ci.cart_id
          WHERE ci.cart_id = $1 AND sc.customer_id = $2
          ORDER BY ci.product_id`,
        [input.cartId, input.customerId],
      );
      requestFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            customerId: input.customerId,
            cartId: input.cartId,
            cart: cartFingerprintRows.rows.map((row) => [
              String(row.product_id),
              Number(row.quantity),
            ]),
            addressId: input.addressId || null,
            deliveryType: input.deliveryType,
            shippingName: input.shippingName.trim(),
            shippingPhone: input.shippingPhone.trim(),
            shippingAddress: input.shippingAddress?.trim() || null,
            shippingMunicipalityId: input.shippingMunicipalityId || null,
            shippingWardId: input.shippingWardId || null,
            shippingPostalCode: input.shippingPostalCode?.trim() || null,
            shippingCountry: input.shippingCountry || null,
            notes: input.notes?.trim() || null,
          }),
        )
        .digest("hex");
      const existing = await client.query(
        "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
        [input.idempotencyKey, input.customerId],
      );
      if (existing.rows[0]) {
        if (
          existing.rows[0].idempotency_request_fingerprint !==
          requestFingerprint
        ) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        await client.query("COMMIT");
        return existing.rows[0];
      }

      let fulfillmentStoreId = input.storeId;
      let savedAddress: {
        id: string;
        municipality_id: number;
        ward_id: number;
        house_number: string | null;
        street: string | null;
        tole_locality: string | null;
        landmark: string | null;
        postal_code: string | null;
      } | null = null;
      if (input.deliveryType === "DELIVERY") {
        if (!input.addressId) {
          throw new Error("A saved delivery address is required");
        }
        const addressResult = await client.query(
          `SELECT id, municipality_id, ward_id, house_number, street,
                  tole_locality, landmark, postal_code
             FROM customer_addresses
            WHERE id = $1 AND customer_id = $2
            FOR SHARE`,
          [input.addressId, input.customerId],
        );
        savedAddress = addressResult.rows[0] || null;
        if (
          !savedAddress ||
          !savedAddress.municipality_id ||
          !savedAddress.ward_id
        ) {
          throw new Error("A complete saved delivery address is required");
        }
        const geography = await client.query(
          `SELECT 1 FROM nepal_wards
            WHERE id = $1 AND municipality_id = $2`,
          [savedAddress.ward_id, savedAddress.municipality_id],
        );
        if (!geography.rows[0]) {
          throw new Error("Saved address municipality and ward do not match");
        }
        const assignment = await deliveryZones.resolveFulfillmentStore({
          municipality_id: savedAddress.municipality_id,
          ward_id: savedAddress.ward_id,
        });
        if (!assignment.serviceable || !assignment.fulfillment_store_id) {
          throw new Error("Address is outside all active delivery areas");
        }
        // The legacy request field remains accepted for compatibility, but is
        // never used as the authority for a delivery order.
        fulfillmentStoreId = assignment.fulfillment_store_id;
      } else {
        fulfillmentStoreId = input.storeId;
      }

      const storeResult = await client.query(
        `SELECT id, address_en, is_temporarily_closed
           FROM stores
          WHERE id = $1 AND status = 'PUBLISHED'
          FOR SHARE`,
        [fulfillmentStoreId],
      );
      const store = storeResult.rows[0];
      if (!store || store.is_temporarily_closed) {
        throw new Error("Selected store is not accepting orders");
      }

      const cart = await client.query(
        "SELECT * FROM shopping_carts WHERE id = $1 AND customer_id = $2 AND store_id = $3 AND status = 'ACTIVE' FOR UPDATE",
        [input.cartId, input.customerId, fulfillmentStoreId],
      );
      if (!cart.rows[0]) {
        throw new Error("Cart is not available for this customer and store");
      }

      const items = await client.query(
        `SELECT product_id, quantity FROM cart_items
          WHERE cart_id = $1 ORDER BY product_id FOR UPDATE`,
        [input.cartId],
      );
      if (!items.rows.length) throw new Error("Cart is empty");

      const productIds = items.rows.map((item) => String(item.product_id));
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext(requested.product_id::text || ':' || $2))
           FROM unnest($1::uuid[]) AS requested(product_id)
          ORDER BY requested.product_id`,
        [productIds, fulfillmentStoreId],
      );

      const canonicalItems = await loadCanonicalCartItems(
        client,
        fulfillmentStoreId,
        items.rows.map((item) => ({
          product_id: String(item.product_id),
          quantity: Number(item.quantity),
        })),
      );

      const customerIdentity = await client.query(
        `SELECT phone_normalized
           FROM customers
          WHERE id = $1 AND status = 'ACTIVE'
            AND verification_status = 'VERIFIED'`,
        [input.customerId],
      );
      if (!customerIdentity.rowCount) {
        throw new MemberPricingQuoteError(
          "CUSTOMER_NOT_AVAILABLE",
          "The authenticated customer is not available for checkout.",
          409,
        );
      }

      const validatedQuote = await validateMemberPricingQuote({
        channel: input.channel,
        storeReference: fulfillmentStoreId,
        customerReference: input.customerId,
        customerPhoneReference: String(
          customerIdentity.rows[0].phone_normalized,
        ),
        items: canonicalItems.map((item) => {
          if (!item.sku) {
            throw new MemberPricingQuoteError(
              "SKU_NOT_FOUND",
              "A cart product is missing its authoritative SKU.",
              409,
            );
          }
          return { sku: item.sku, quantity: String(item.quantity) };
        }),
        signedQuoteToken: input.signedQuoteToken,
        saleReference: input.idempotencyKey,
      });

      const memberPrices = await resolveMemberPricing(client, {
        storeId: fulfillmentStoreId,
        customerId: input.customerId,
        channel: input.channel,
        productIds: canonicalItems.map((item) => item.product_id),
      });
      const promotionIds = [
        ...new Set(
          memberPrices.flatMap((price) =>
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
          {
            id: String(row.id),
            name: String(row.name),
            version: Number(row.version),
          },
        ]),
      );
      const policy = await client.query(
        `SELECT pricing_rule_version
           FROM member_pricing_policies
          WHERE policy_key = 'GLOBAL'`,
      );
      if (
        !policy.rowCount ||
        Number(policy.rows[0].pricing_rule_version) !==
          validatedQuote.pricingRuleVersion
      ) {
        throw new MemberPricingQuoteError(
          "PRICING_CHANGED",
          "Member pricing changed. Review the updated quote before checkout.",
          409,
        );
      }
      const priceByProduct = new Map(
        memberPrices.map((price) => [price.product_id, price]),
      );
      const quotedBySku = new Map(
        validatedQuote.items.map((item) => [item.sku, item]),
      );
      let subtotalPaisa = 0n;
      let discountPaisa = 0n;
      const pricedItems = canonicalItems.map((item) => {
        if (item.status !== "VALID") {
          throw new Error(
            item.issues[0]?.code === "INSUFFICIENT_STOCK" ||
                item.issues[0]?.code === "OUT_OF_STOCK"
              ? `Insufficient stock for ${item.name_en || item.product_id}`
              : item.issues[0]?.code === "PRODUCT_INACTIVE" ||
                  item.issues[0]?.code === "PRODUCT_UNAVAILABLE"
                ? "Cart contains an unavailable product or invalid quantity"
                : `Price unavailable for ${item.name_en || item.product_id}`,
          );
        }
        const price = priceByProduct.get(item.product_id);
        if (!price) throw new Error("Product price is unavailable");
        const quoteLine = item.sku ? quotedBySku.get(item.sku) : undefined;
        const exactLine = calculateMemberPricingLine(
          price,
          String(item.quantity),
        );
        const promotion = price.promotion_id
          ? promotionById.get(price.promotion_id) ?? null
          : null;
        if (
          !quoteLine ||
          quoteLine.quantity !== String(item.quantity) ||
          quoteLine.regularUnitPrice !== exactLine.regularUnitPrice ||
          quoteLine.appliedUnitPrice !== exactLine.appliedUnitPrice ||
          quoteLine.lineDiscount !== exactLine.lineDiscount ||
          quoteLine.lineTotal !== exactLine.lineTotal ||
          quoteLine.promotionReference !== price.promotion_id ||
          JSON.stringify(quoteLine.promotionSnapshot) !==
            JSON.stringify(promotion)
        ) {
          throw new MemberPricingQuoteError(
            "PRICING_CHANGED",
            "Member pricing changed. Review the updated quote before checkout.",
            409,
          );
        }
        const line = calculatePricedLine(price, Number(item.quantity));
        const regularLinePaisa =
          moneyCents(price.regular_price) * BigInt(item.quantity);
        subtotalPaisa += regularLinePaisa;
        discountPaisa += moneyCents(line.discountAmount);
        return {
          ...item,
          unitPrice: line.regularUnitPrice,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          taxAmount: 0,
          lineTotalWithTax: line.lineTotal,
          memberPricingPromotionId: line.promotionId,
          regularUnitPrice: exactLine.regularUnitPrice,
          appliedUnitPrice: exactLine.appliedUnitPrice,
          promotionSnapshot: quoteLine.promotionSnapshot,
          pricingRuleVersion: validatedQuote.pricingRuleVersion,
          currency: validatedQuote.currency,
        };
      });

      const subtotal = centsMoney(subtotalPaisa);
      const discountAmount = centsMoney(discountPaisa);
      const discountedSubtotalPaisa = subtotalPaisa - discountPaisa;
      const discountedSubtotal = Number(centsMoney(discountedSubtotalPaisa));
      let shippingAddress: string | null = null;
      let shippingCity: string | null = null;
      let shippingState: string | null = null;
      let shippingPostalCode: string | null = null;
      let shippingCountry = MARKET.countryCode;
      let shippingMunicipalityId: number | null = null;
      let shippingWardId: number | null = null;
      let deliveryZoneId: string | null = null;
      let deliveryQuote: Record<string, unknown> | null = null;
      let shipping = 0;
      let shippingPaisa = 0n;

      if (input.deliveryType === "PICKUP") {
        shippingAddress = store.address_en;
      } else {
        if (!savedAddress || input.shippingCountry !== MARKET.countryCode) {
          throw new Error("A complete Nepal delivery address is required");
        }

        const division = await client.query(
          `SELECT m.id AS municipality_id,
                  m.name_en AS municipality_name,
                  d.name_en AS district_name,
                  p.name_en AS province_name,
                  w.id AS ward_id,
                  w.ward_number
             FROM nepal_municipalities m
             JOIN nepal_districts d ON d.id = m.district_id
             JOIN nepal_provinces p ON p.id = d.province_id
             JOIN nepal_wards w
               ON w.id = $2
              AND w.municipality_id = m.id
            WHERE m.id = $1`,
          [savedAddress.municipality_id, savedAddress.ward_id],
        );
        if (!division.rows[0]) {
          throw new Error("Delivery municipality and ward do not match");
        }

        const quote = await deliveryZones.getDeliveryQuote({
          municipality_id: savedAddress.municipality_id,
          ward_id: savedAddress.ward_id,
          store_id: fulfillmentStoreId,
          order_value: discountedSubtotal,
        });
        if (!quote.serviceable) {
          throw new Error(
            quote.reason || "Address is outside this store's delivery area",
          );
        }

        shippingAddress = [
          savedAddress.house_number,
          savedAddress.street,
          savedAddress.tole_locality,
          savedAddress.landmark,
        ]
          .map((part) => part?.trim())
          .filter((part): part is string => Boolean(part))
          .join(", ");
        if (!shippingAddress) {
          shippingAddress = input.shippingAddress || null;
        }
        if (!shippingAddress) {
          throw new Error("Saved delivery address has no street or locality");
        }
        shippingCity = division.rows[0].municipality_name;
        shippingState = division.rows[0].province_name;
        shippingPostalCode =
          savedAddress.postal_code || input.shippingPostalCode || null;
        shippingCountry = input.shippingCountry;
        shippingMunicipalityId = savedAddress.municipality_id;
        shippingWardId = savedAddress.ward_id;
        deliveryZoneId = quote.zone_id;
        deliveryQuote = quote;
        shippingPaisa = moneyCents(String(quote.delivery_fee || 0));
        shipping = Number(centsMoney(shippingPaisa));
      }

      const tax = 0;
      const total = centsMoney(discountedSubtotalPaisa + shippingPaisa);

      const order = await client.query(
        `INSERT INTO web_orders (
          order_number, customer_id, store_id, fulfillment_store_id, cart_id,
          idempotency_key, idempotency_request_fingerprint, status,
          subtotal, tax_amount, shipping_amount,
          delivery_fee, discount_amount, total_amount, currency, payment_method,
          payment_status, shipping_name, shipping_phone, shipping_address,
          shipping_city, shipping_state, shipping_postal_code, shipping_country,
          shipping_municipality_id, shipping_ward_id, delivery_type,
          delivery_zone_id, delivery_quote, member_pricing_quote_id,
          membership_tier_snapshot, pricing_rule_version,
          pricing_quote_snapshot, notes
        )
        VALUES (
          'WO-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING($1, 1, 8),
          $2, $3, $3, $4, $1, $5, 'RECEIVED', $6, $7, $8, $8, $9, $10,
          '${MARKET.currencyCode}', 'COD', 'PENDING', $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22::jsonb, $23, $24, $25,
          $26::jsonb, $27
        )
        RETURNING *`,
        [
          input.idempotencyKey,
          input.customerId,
          fulfillmentStoreId,
          input.cartId,
          requestFingerprint,
          subtotal,
          tax,
          centsMoney(shippingPaisa),
          discountAmount,
          total,
          input.shippingName,
          input.shippingPhone,
          shippingAddress,
          shippingCity,
          shippingState,
          shippingPostalCode,
          shippingCountry,
          shippingMunicipalityId,
          shippingWardId,
          input.deliveryType,
          deliveryZoneId,
          JSON.stringify(deliveryQuote),
          validatedQuote.quoteId,
          validatedQuote.membershipTier,
          validatedQuote.pricingRuleVersion,
          JSON.stringify(validatedQuote),
          input.notes || null,
        ],
      );

      await client.query(
        `INSERT INTO web_order_items
          (order_id, product_id, product_name, quantity, unit_price,
           discount_amount, line_total, tax_amount, line_total_with_tax,
           member_pricing_promotion_id, regular_unit_price,
           applied_unit_price, promotion_snapshot, membership_tier_snapshot,
           member_pricing_quote_id, pricing_rule_version, currency)
         SELECT $1, item.product_id, item.product_name, item.quantity,
                item.unit_price, item.discount_amount, item.line_total,
                item.tax_amount, item.line_total_with_tax,
                item.member_pricing_promotion_id, item.regular_unit_price,
                item.applied_unit_price, item.promotion_snapshot,
                $3, $4, $5, item.currency
           FROM jsonb_to_recordset($2::jsonb) AS item(
             product_id uuid, product_name text, quantity integer,
             unit_price numeric, discount_amount numeric, line_total numeric,
             tax_amount numeric, line_total_with_tax numeric,
             member_pricing_promotion_id uuid, regular_unit_price numeric,
             applied_unit_price numeric, promotion_snapshot jsonb,
             currency text
           )`,
        [
          order.rows[0].id,
          JSON.stringify(
            pricedItems.map((item) => ({
              product_id: item.product_id,
              product_name: item.name_en,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              discount_amount: item.discountAmount,
              line_total: item.lineTotal,
              tax_amount: item.taxAmount,
              line_total_with_tax: item.lineTotalWithTax,
              member_pricing_promotion_id: item.memberPricingPromotionId,
              regular_unit_price: item.regularUnitPrice,
              applied_unit_price: item.appliedUnitPrice,
              promotion_snapshot: item.promotionSnapshot,
              currency: item.currency,
            })),
          ),
          validatedQuote.membershipTier,
          validatedQuote.quoteId,
          validatedQuote.pricingRuleVersion,
        ],
      );

      await client.query(
        `INSERT INTO stock_reservations
          (reservation_id, order_id, product_id, store_id, quantity,
           reserved_at, expires_at, status)
         SELECT reservation.reservation_id, $1, reservation.product_id, $2,
                reservation.quantity, NOW(), NOW() + INTERVAL '30 minutes',
                'ACTIVE'
           FROM unnest($3::text[], $4::uuid[], $5::integer[])
                AS reservation(reservation_id, product_id, quantity)`,
        [
          order.rows[0].id,
          fulfillmentStoreId,
          pricedItems.map(() => `RES-${randomUUID()}`),
          pricedItems.map((item) => item.product_id),
          pricedItems.map((item) => item.quantity),
        ],
      );

      await client.query(
        `UPDATE shopping_carts
            SET status = 'CONVERTED', updated_at = NOW()
          WHERE id = $1`,
        [input.cartId],
      );

      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES (
           $1, 'CREATED', NULL, 'RECEIVED', 'COD checkout submitted',
           $2::jsonb, $3
         )`,
        [
          order.rows[0].id,
          JSON.stringify({
            delivery_type: input.deliveryType,
            delivery_zone_id: deliveryZoneId,
            shipping_amount: shipping,
            prices_tax_inclusive: true,
          }),
          input.actorId || input.customerId,
        ],
      );

      await client.query("COMMIT");
      return order.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        const existing = await pool.query(
          "SELECT * FROM web_orders WHERE idempotency_key = $1 AND customer_id = $2",
          [input.idempotencyKey, input.customerId],
        );
        if (existing.rows[0]) {
          if (
            existing.rows[0].idempotency_request_fingerprint !==
            requestFingerprint
          ) {
            throw new Error("IDEMPOTENCY_CONFLICT");
          }
          return existing.rows[0];
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderAttempt(customerId: string, idempotencyKey: string) {
    const result = await getPool().query(
      `SELECT id, order_number, status, total_amount, order_date, delivery_type
         FROM web_orders
        WHERE customer_id = $1 AND idempotency_key = $2`,
      [customerId, idempotencyKey],
    );
    return result.rows[0] || null;
  }

  async cancelCustomerOrder(
    orderId: string,
    authenticatedCustomerId: string,
    reason: string,
  ) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM web_orders
         WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
        [orderId, authenticatedCustomerId],
      );
      const order = current.rows[0];
      if (
        !order ||
        !["RECEIVED", "CONFIRMED"].includes(order.status)
      ) {
        throw new Error("Order cannot be cancelled");
      }
      const result = await client.query(
        `UPDATE web_orders
         SET status = 'CANCELLED', cancellation_reason = $1,
             cancelled_at = NOW(), cancelled_by = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [reason, authenticatedCustomerId, orderId],
      );
      await client.query(
        `UPDATE stock_reservations SET status = 'CANCELLED', updated_at = NOW()
         WHERE status = 'ACTIVE' AND (order_id = $1 OR cart_id = $2)`,
        [orderId, order.cart_id],
      );
      await client.query(
        `INSERT INTO order_events
          (order_id, event_type, from_status, to_status, reason, metadata, created_by)
         VALUES ($1, 'CANCELLED', $2, 'CANCELLED', $3, '{}'::jsonb, $4)`,
        [orderId, order.status, reason, authenticatedCustomerId],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
