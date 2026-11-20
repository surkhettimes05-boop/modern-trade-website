import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { query } from "../../database/connection.js";
import { memberPricingRoutes } from "../memberPricing.js";

describe("member pricing administration API", () => {
  const suffix = randomUUID();
  const ids = {
    organization: randomUUID(),
    store: randomUUID(),
    category: randomUUID(),
    product: randomUUID(),
    admin: randomUUID(),
    cashier: randomUUID(),
    cashierRole: randomUUID(),
    sku: `MEMBER-API-${suffix.replace(/-/g, "").slice(0, 16)}`,
  };
  let app: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    await query(
      `INSERT INTO organizations (
         id, organization_name, country_code, default_currency_code,
         default_locale, default_timezone, tax_regime, status
       ) VALUES ($1, $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', 'ACTIVE')`,
      [ids.organization, `Member pricing API ${suffix}`],
    );
    await query(
      `INSERT INTO stores (
         id, name_en, address_en, phone, status, organization_id,
         country_code, currency_code, locale, timezone
       ) VALUES ($1, $2, 'Kathmandu', $3, 'PUBLISHED', $4, 'NP', 'NPR',
                 'en-NP', 'Asia/Kathmandu')`,
      [
        ids.store,
        `Member pricing API store ${suffix}`,
        `98${String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)).slice(0, 8)}`,
        ids.organization,
      ],
    );
    await query(
      `INSERT INTO categories (id, name_en, slug, status, published_at)
       VALUES ($1, 'Member pricing API category', $2, 'PUBLISHED', NOW())`,
      [ids.category, `member-api-${suffix}`],
    );
    await query(
      `INSERT INTO products (
         id, sku, name_en, category_id, status, published_at
       ) VALUES ($1, $2, 'Member pricing API product', $3, 'PUBLISHED', NOW())`,
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

    const adminRole = await query(
      "SELECT id::text FROM roles WHERE role_key = 'head_office_admin'",
    );
    if (!adminRole.rowCount) throw new Error("head_office_admin role is missing");
    await query(
      `INSERT INTO roles (
         id, role_key, role_name, role_level, capabilities, is_active
       ) VALUES ($1, $2, 'Member Pricing Cashier', 1, '[]'::jsonb, TRUE)`,
      [ids.cashierRole, `mpc-${suffix}`],
    );
    await query(
      `INSERT INTO staff (
         id, staff_number, first_name, last_name, role, username, status,
         role_id, capabilities, scope_type, scope_store_ids, scope_organization_id
       ) VALUES ($1, $2, 'Pricing', 'Admin', 'ADMIN', $3, 'ACTIVE', $4,
                 '["pricing.read","pricing.write","pricing.approve","reports.sales"]',
                 'ORGANIZATION', '{}', $5)`,
      [
        ids.admin,
        `MPA-${suffix}`,
        `mp-admin-${suffix}`,
        adminRole.rows[0].id,
        ids.organization,
      ],
    );
    await query(
      `INSERT INTO staff (
         id, staff_number, first_name, last_name, role, username, status,
         role_id, capabilities, scope_type, scope_store_ids
       ) VALUES ($1, $2, 'Pricing', 'Cashier', 'CASHIER', $3, 'ACTIVE', $4,
                 '["pricing.read","pricing.write","pos.execute"]',
                 'STORE', ARRAY[$5]::uuid[])`,
      [
        ids.cashier,
        `MPC-${suffix}`,
        `mp-cashier-${suffix}`,
        ids.cashierRole,
        ids.store,
      ],
    );

    app = Fastify();
    await app.register(cookie);
    await app.register(jwt, {
      secret: "member-pricing-test-secret-with-sufficient-length",
      cookie: { cookieName: "ops_session", signed: false },
    });
    await app.register(memberPricingRoutes, { prefix: "/api" });
    await app.ready();
    adminToken = app.jwt.sign({ sub: ids.admin, jti: "member-pricing-admin" });
    cashierToken = app.jwt.sign({ sub: ids.cashier, jti: "member-pricing-cashier" });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("denies cashier promotion management and allows scoped Owner/Admin changes with CSRF and audit", async () => {
    const payload = {
      organization_id: ids.organization,
      name: "Member SKU price",
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      reason: "Approved launch member price",
      products: [{ sku: ids.sku, member_price: "950.00" }],
      category_ids: [ids.category],
      tiers: ["REGISTERED_MEMBER"],
      channels: ["POS", "WEB"],
    };
    const cashierResponse = await app.inject({
      method: "POST",
      url: "/api/admin/member-pricing/promotions",
      cookies: {
        ops_session: cashierToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload,
    });
    expect(cashierResponse.statusCode).toBe(403);

    const missingCsrf = await app.inject({
      method: "POST",
      url: "/api/admin/member-pricing/promotions",
      cookies: { ops_session: adminToken },
      payload,
    });
    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json().code).toBe("CSRF_INVALID");

    const invalidMoney = await app.inject({
      method: "POST",
      url: "/api/admin/member-pricing/promotions",
      cookies: {
        ops_session: adminToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload: {
        ...payload,
        products: [{ sku: ids.sku, member_price: 10_000_000_000 }],
      },
    });
    expect(invalidMoney.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/member-pricing/promotions",
      cookies: {
        ops_session: adminToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload,
    });
    expect(created.statusCode).toBe(201);
    const promotionId = created.json().promotion.id;
    expect(created.json().promotion.status).toBe("DRAFT");

    const cashierUpdate = await app.inject({
      method: "PUT",
      url: `/api/admin/member-pricing/promotions/${promotionId}`,
      cookies: {
        ops_session: cashierToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload: {
        name: "Cashier change",
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        reason: "Unauthorized edit",
        products: payload.products,
        category_ids: payload.category_ids,
        tiers: payload.tiers,
        channels: payload.channels,
      },
    });
    expect(cashierUpdate.statusCode).toBe(403);

    const activated = await app.inject({
      method: "POST",
      url: `/api/admin/member-pricing/promotions/${promotionId}/activate`,
      cookies: {
        ops_session: adminToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload: { reason: "Approved after review" },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().promotion.status).toBe("ACTIVE");

    const audit = await query(
      `SELECT event_type
         FROM audit_events
        WHERE entity_type = 'member_pricing_promotion'
          AND entity_id = $1
        ORDER BY created_at`,
      [promotionId],
    );
    expect(audit.rows.map((row) => row.event_type)).toEqual([
      "MEMBER_PRICING_PROMOTION_CREATED",
      "MEMBER_PRICING_PROMOTION_ACTIVATED",
    ]);

    const scopedRead = await app.inject({
      method: "GET",
      url: `/api/admin/member-pricing/promotions/${promotionId}`,
      cookies: { ops_session: adminToken },
    });
    expect(scopedRead.statusCode).toBe(200);
    expect(scopedRead.json().promotion.organization_id).toBe(
      ids.organization,
    );

    const otherOrganization = await app.inject({
      method: "POST",
      url: "/api/admin/member-pricing/promotions",
      cookies: {
        ops_session: adminToken,
        csrf_token: "member-pricing-csrf",
      },
      headers: { "x-csrf-token": "member-pricing-csrf" },
      payload: { ...payload, organization_id: randomUUID() },
    });
    expect(otherOrganization.statusCode).toBe(403);
    expect(otherOrganization.json().code).toBe("SCOPE_DENIED");
  });
});
