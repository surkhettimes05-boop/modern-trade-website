import { randomUUID } from "node:crypto";
import { getPool, query } from "../../database/connection.js";
import { POSService } from "../posService.js";
import {
  MemberPricingActor,
  MemberPricingInput,
  MemberPricingService,
  resolveMemberPricing,
} from "../memberPricingService.js";

const service = new MemberPricingService();
const actor: MemberPricingActor = {
  id: "",
  roleKey: "head_office_admin",
  capabilities: ["pricing.read", "pricing.write", "pricing.approve", "reports.sales"],
  scopeType: "ORGANIZATION",
  scopeStoreIds: [],
};

async function createFixture() {
  const suffix = randomUUID();
  const ids = {
    organization: randomUUID(),
    store: randomUUID(),
    category: randomUUID(),
    product: randomUUID(),
    customer: randomUUID(),
    staff: randomUUID(),
    role: randomUUID(),
    sku: `MEMBER-${suffix.replace(/-/g, "").slice(0, 20)}`,
  };
  const phone = `980${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
  await query(
    `INSERT INTO organizations (
       id, organization_name, country_code, default_currency_code,
       default_locale, default_timezone, tax_regime, status
     ) VALUES ($1, $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', 'ACTIVE')`,
    [ids.organization, `Member pricing ${suffix}`],
  );
  await query(
    `INSERT INTO stores (
       id, name_en, address_en, phone, status, organization_id,
       country_code, currency_code, locale, timezone
     ) VALUES ($1, $2, 'Kathmandu', $3, 'PUBLISHED', $4, 'NP', 'NPR',
               'en-NP', 'Asia/Kathmandu')`,
    [ids.store, `Member pricing store ${suffix}`, phone, ids.organization],
  );
  await query(
    `INSERT INTO categories (id, name_en, slug, status, published_at)
     VALUES ($1, 'Member pricing category', $2, 'PUBLISHED', NOW())`,
    [ids.category, `member-pricing-${suffix}`],
  );
  await query(
    `INSERT INTO products (
       id, sku, name_en, category_id, status, published_at
     ) VALUES ($1, $2, 'Member pricing product', $3, 'PUBLISHED', NOW())`,
    [ids.product, ids.sku, ids.category],
  );
  await query(
    `INSERT INTO product_prices (
       product_id, store_id, price, currency_code, active, valid_from
     ) VALUES ($1, $2, 1000.00, 'NPR', TRUE, NOW() - INTERVAL '1 day')`,
    [ids.product, ids.store],
  );
  await query(
    `INSERT INTO batch_inventory (
       store_id, product_id, batch_id, expiry_date, quantity, unit_cost,
       total_cost, received_date
     ) VALUES ($1, $2, $3, CURRENT_DATE + 180, 10, 600.00, 6000.00, CURRENT_DATE)`,
    [ids.store, ids.product, `BATCH-${suffix}`],
  );
  await query(
    `INSERT INTO customers (
       id, phone_normalized, phone_hash, phone_masked, home_store_id,
       status, verification_status
     ) VALUES ($1, $2, $3, '98XXXXXX00', $4, 'ACTIVE', 'VERIFIED')`,
    [ids.customer, phone, `hash-${suffix}`, ids.store],
  );
  await query(
    `INSERT INTO customer_memberships (
       id, customer_id, organization_id, tier_key, membership_number, status
     ) VALUES ($1, $2, $3, 'REGISTERED_MEMBER', 1, 'ACTIVE')`,
    [randomUUID(), ids.customer, ids.organization],
  );
  await query(
    `INSERT INTO roles (
       id, role_key, role_name, role_level, capabilities, is_active
     ) VALUES ($1, $2, 'Member Pricing Test Staff', 4, '[]'::jsonb, TRUE)`,
    [ids.role, `mp-${suffix}`],
  );
  await query(
    `INSERT INTO staff (
       id, staff_number, first_name, last_name, role, username, status,
       role_id, capabilities, scope_type, scope_store_ids, scope_organization_id
     ) VALUES ($1, $2, 'Pricing', 'Admin', 'ADMIN', $3, 'ACTIVE', $4,
               '["pricing.read","pricing.write","pricing.approve","reports.sales"]',
               'ORGANIZATION', '{}', $5)`,
    [ids.staff, `MP-${suffix}`, `mp-${suffix}`, ids.role, ids.organization],
  );
  return ids;
}

function promotionInput(
  ids: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<MemberPricingInput> = {},
): MemberPricingInput {
  return {
    organization_id: ids.organization,
    name: "SKU member price",
    starts_at: new Date(Date.now() - 60_000),
    ends_at: new Date(Date.now() + 60 * 60_000),
    reason: "Approved member pricing test",
    products: [{ sku: ids.sku, member_price: "950.00" }],
    category_ids: [ids.category],
    tiers: ["REGISTERED_MEMBER"],
    channels: ["POS", "WEB"],
    ...overrides,
  };
}

async function quote(
  ids: Awaited<ReturnType<typeof createFixture>>,
  channel: "POS" | "WEB" | "APP" | "COD" = "WEB",
) {
  const client = await getPool().connect();
  try {
    return await resolveMemberPricing(client, {
      storeId: ids.store,
      customerId: ids.customer,
      channel,
      productIds: [ids.product],
    });
  } finally {
    client.release();
  }
}

describe("authoritative member pricing", () => {
  it("restores the prior eligible price after a bounded price expires", async () => {
    const ids = await createFixture();
    await query(
      `INSERT INTO product_prices (
         product_id, store_id, price, currency_code, active, valid_from, valid_to
       ) VALUES ($1, $2, 850.00, 'NPR', TRUE,
                 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')`,
      [ids.product, ids.store],
    );

    await expect(quote(ids)).resolves.toMatchObject([
      {
        regular_price: "1000.00",
        final_price: "1000.00",
        discount_per_unit: "0.00",
      },
    ]);
  });

  it("returns regular prices while member pricing is disabled", async () => {
    const originalFlag = process.env.ENABLE_MEMBER_PRICING;
    process.env.ENABLE_MEMBER_PRICING = "false";
    try {
      const ids = await createFixture();
      actor.id = ids.staff;
      const draft = await service.createPromotion(promotionInput(ids), actor);
      await service.transitionPromotion(
        draft.id,
        "ACTIVATED",
        "Ready for launch",
        actor,
        [ids.organization],
      );

      await expect(quote(ids, "WEB")).resolves.toMatchObject([
        {
          regular_price: "1000.00",
          final_price: "1000.00",
          discount_per_unit: "0.00",
          promotion_id: null,
        },
      ]);
    } finally {
      if (originalFlag === undefined) {
        delete process.env.ENABLE_MEMBER_PRICING;
      } else {
        process.env.ENABLE_MEMBER_PRICING = originalFlag;
      }
    }
  });

  it("applies explicit SKU prices only for eligible member tier, channel, time, and active state", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    const draft = await service.createPromotion(promotionInput(ids), actor);
    await service.transitionPromotion(
      draft.id,
      "ACTIVATED",
      "Ready for launch",
      actor,
      [ids.organization],
    );

    await expect(quote(ids)).resolves.toMatchObject([
      {
        regular_price: "1000.00",
        final_price: "950.00",
        discount_per_unit: "50.00",
      },
    ]);
    await expect(quote(ids, "APP")).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);

    await query(
      `UPDATE member_pricing_promotion_tiers
          SET tier_key = 'FOUNDING_1000'
        WHERE promotion_id = $1`,
      [draft.id],
    );
    await expect(quote(ids)).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
    await query(
      `UPDATE member_pricing_promotion_tiers
          SET tier_key = 'REGISTERED_MEMBER'
        WHERE promotion_id = $1`,
      [draft.id],
    );

    await query(
      `UPDATE member_pricing_promotions
          SET starts_at = NOW() + INTERVAL '1 hour',
              ends_at = NOW() + INTERVAL '2 hours'
        WHERE id = $1`,
      [draft.id],
    );
    await expect(quote(ids)).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
    await query(
      `UPDATE member_pricing_promotions
          SET starts_at = NOW() - INTERVAL '1 hour',
              ends_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1`,
      [draft.id],
    );
    await query(
      `UPDATE member_pricing_promotion_tiers
          SET tier_key = 'REGISTERED_MEMBER'
        WHERE promotion_id = $1`,
      [draft.id],
    );
    await query(
      `UPDATE member_pricing_promotions SET status = 'ACTIVE' WHERE id = $1`,
      [draft.id],
    );
    await expect(quote(ids)).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
    await expect(
      service.getPromotion(draft.id, [ids.organization]),
    ).resolves.toMatchObject({ status: "EXPIRED" });
    await expect(
      service.listPromotions({
        organizationIds: [ids.organization],
        status: "EXPIRED",
        limit: 10,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: draft.id, status: "EXPIRED" })],
    });
    await expect(
      service.listPromotions({
        organizationIds: [ids.organization],
        status: "ACTIVE",
        limit: 10,
        offset: 0,
      }),
    ).resolves.toMatchObject({ items: [] });
    const storedStatus = await query(
      "SELECT status FROM member_pricing_promotions WHERE id = $1",
      [draft.id],
    );
    expect(storedStatus.rows[0].status).toBe("ACTIVE");

    await query(
      `UPDATE member_pricing_promotions
          SET ends_at = NOW() + INTERVAL '1 hour',
              status = 'ACTIVE'
        WHERE id = $1`,
      [draft.id],
    );
    await query(
      `UPDATE batch_inventory SET unit_cost = NULL
        WHERE store_id = $1 AND product_id = $2`,
      [ids.store, ids.product],
    );
    await expect(quote(ids)).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
    await query(
      `UPDATE batch_inventory SET unit_cost = 600.00
        WHERE store_id = $1 AND product_id = $2`,
      [ids.store, ids.product],
    );
    await query(
      `UPDATE member_pricing_promotions
          SET status = 'PAUSED'
        WHERE id = $1`,
      [draft.id],
    );
    await expect(quote(ids)).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
  });

  it("applies COD promotions only to the explicit COD channel", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    const draft = await service.createPromotion(
      promotionInput(ids, { channels: ["COD"] }),
      actor,
    );
    await service.transitionPromotion(
      draft.id,
      "ACTIVATED",
      "COD-only promotion",
      actor,
      [ids.organization],
    );

    await expect(quote(ids, "COD")).resolves.toMatchObject([
      { final_price: "950.00", discount_per_unit: "50.00" },
    ]);
    await expect(quote(ids, "WEB")).resolves.toMatchObject([
      { final_price: "1000.00", promotion_id: null },
    ]);
  });

  it("rejects member prices above regular, below the margin floor, and inactive SKUs", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    await expect(
      service.createPromotion(
        promotionInput(ids, {
          products: [{ sku: ids.sku, member_price: "1000.01" }],
        }),
        actor,
      ),
    ).rejects.toMatchObject({
      code: "PROMOTION_INVALID",
      details: expect.arrayContaining([
        expect.objectContaining({ code: "MEMBER_PRICE_ABOVE_REGULAR" }),
      ]),
    });

    await query(
      `UPDATE batch_inventory SET unit_cost = 600.00
        WHERE store_id = $1 AND product_id = $2`,
      [ids.store, ids.product],
    );
    await expect(
      service.createPromotion(
        promotionInput(ids, {
          products: [{ sku: ids.sku, member_price: "600.00" }],
        }),
        actor,
      ),
    ).rejects.toMatchObject({
      code: "PROMOTION_INVALID",
      details: expect.arrayContaining([
        expect.objectContaining({ code: "MARGIN_FLOOR" }),
      ]),
    });

    await query("UPDATE products SET status = 'DRAFT' WHERE id = $1", [
      ids.product,
    ]);
    await expect(
      service.createPromotion(promotionInput(ids), actor),
    ).rejects.toMatchObject({
      code: "PROMOTION_INVALID",
      details: expect.arrayContaining([
        expect.objectContaining({ code: "PRODUCT_INACTIVE" }),
      ]),
    });
  });

  it("rejects overlapping active promotions for the same SKU, tier, and channel", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    const first = await service.createPromotion(promotionInput(ids), actor);
    await service.transitionPromotion(
      first.id,
      "ACTIVATED",
      "First promotion",
      actor,
      [ids.organization],
    );
    const second = await service.createPromotion(
      promotionInput(ids, { name: "Conflicting member price" }),
      actor,
    );
    await expect(
      service.transitionPromotion(
        second.id,
        "ACTIVATED",
        "Attempted overlap",
        actor,
        [ids.organization],
      ),
    ).rejects.toMatchObject({ code: "PROMOTION_CONFLICT" });
  });

  it("versions edits and atomically audits promotion changes", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    const draft = await service.createPromotion(promotionInput(ids), actor);
    const updated = await service.updatePromotion(
      draft.id,
      {
        ...promotionInput(ids),
        name: "Updated member price",
        reason: "Updated SKU price",
      },
      actor,
      [ids.organization],
    );
    expect(updated.version).toBe(2);
    await service.transitionPromotion(
      draft.id,
      "ACTIVATED",
      "Approved after review",
      actor,
      [ids.organization],
    );
    const history = await query(
      `SELECT version, action, reason
         FROM member_pricing_promotion_history
        WHERE promotion_id = $1
        ORDER BY version`,
      [draft.id],
    );
    expect(history.rows.map((row) => row.action)).toEqual([
      "CREATED",
      "UPDATED",
      "ACTIVATED",
    ]);
    expect(history.rows.map((row) => Number(row.version))).toEqual([1, 2, 3]);
    const audits = await query(
      `SELECT event_type
         FROM audit_events
        WHERE entity_type = 'member_pricing_promotion'
          AND entity_id = $1
        ORDER BY created_at`,
      [draft.id],
    );
    expect(audits.rows).toHaveLength(3);
    await expect(
      query(
        `UPDATE member_pricing_promotion_history
            SET reason = 'tampered'
          WHERE promotion_id = $1`,
        [draft.id],
      ),
    ).rejects.toThrow("immutable");
  });

  it("prices POS from server data and leaves earlier sale prices unchanged", async () => {
    const ids = await createFixture();
    actor.id = ids.staff;
    const oldSaleId = randomUUID();
    await query(
      `INSERT INTO sales (
         id, sale_number, customer_id, store_id, sale_status, total_amount,
         currency, idempotency_key
       ) VALUES ($1, $2, $3, $4, 'COMPLETED', 1000.00, 'NPR', $5)`,
      [
        oldSaleId,
        `OLD-${randomUUID()}`,
        ids.customer,
        ids.store,
        `old-${randomUUID()}`,
      ],
    );
    await query(
      `INSERT INTO sale_items (
         sale_id, product_id, sku, product_name, quantity, unit_price, line_total
       ) VALUES ($1, $2, $3, 'Historical product', 1, 1000.00, 1000.00)`,
      [oldSaleId, ids.product, ids.sku],
    );

    const draft = await service.createPromotion(
      promotionInput(ids, { channels: ["POS"] }),
      actor,
    );
    await service.transitionPromotion(
      draft.id,
      "ACTIVATED",
      "POS promotion",
      actor,
      [ids.organization],
    );
    const sale = await new POSService().createSale({
      sale_number: `MEM-${randomUUID()}`,
      customer_id: ids.customer,
      store_id: ids.store,
      total_amount: 999999,
      items: [
        {
          product_id: ids.product,
          quantity: 1,
          unit_price: 1,
          line_total: 1,
        },
      ],
      created_by: ids.staff,
      idempotency_key: `member-pricing-${randomUUID()}`,
    });
    const newItem = await query(
      `SELECT unit_price::text, line_total::text, discount_amount::text,
              member_pricing_promotion_id::text
         FROM sale_items WHERE sale_id = $1`,
      [sale.sale_id],
    );
    expect(newItem.rows[0]).toMatchObject({
      unit_price: "1000.00",
      line_total: "950.00",
      discount_amount: "50.00",
      member_pricing_promotion_id: draft.id,
    });
    const historicalItem = await query(
      `SELECT unit_price::text, line_total::text, discount_amount::text,
              member_pricing_promotion_id
         FROM sale_items WHERE sale_id = $1`,
      [oldSaleId],
    );
    expect(historicalItem.rows[0]).toMatchObject({
      unit_price: "1000.00",
      line_total: "1000.00",
      discount_amount: "0.00",
      member_pricing_promotion_id: null,
    });
  });
});
