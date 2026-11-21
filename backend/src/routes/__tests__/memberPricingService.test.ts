import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { query } from "../../database/connection.js";
import { memberPricingServiceRoutes } from "../memberPricingService.js";
import { customerMemberPricingRoutes } from "../customerMemberPricing.js";
import { MembershipService } from "../../services/membershipService.js";
import { SessionService } from "../../services/sessionService.js";
import {
  calculateMemberPricingLine,
  MEMBER_PRICING_QUOTE_TTL_MS,
  validateMemberPricingQuote,
} from "../../services/memberPricingQuoteService.js";
import {
  MemberPricingService,
  type MemberPricingActor,
} from "../../services/memberPricingService.js";

jest.setTimeout(30_000);

const serviceToken = "member-pricing-service-test-token-with-40-bytes";
const quoteSecret = "member-pricing-quote-secret-test-40-bytes-long";
const pricingService = new MemberPricingService();
const sessions = new SessionService();
let app: FastifyInstance;
let customerSessionToken: string;
let ids: {
  organization: string;
  store: string;
  category: string;
  product: string;
  customer: string;
  staff: string;
  sku: string;
  phone: string;
  membershipNumber: number;
};
let actor: MemberPricingActor;

async function createFixture() {
  const suffix = randomUUID();
  const fixture = {
    organization: randomUUID(),
    store: randomUUID(),
    category: randomUUID(),
    product: randomUUID(),
    customer: randomUUID(),
    staff: randomUUID(),
    role: randomUUID(),
    sku: `QUOTE-${suffix.replace(/-/g, "").slice(0, 20)}`,
    phone: `98${String(Math.floor(10_000_000 + Math.random() * 90_000_000))}`,
  };
  await query(
    `INSERT INTO organizations (
       id, organization_name, country_code, default_currency_code,
       default_locale, default_timezone, tax_regime, status
     ) VALUES ($1, $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', 'ACTIVE')`,
    [fixture.organization, `Quote integration ${suffix}`],
  );
  await query(
    `INSERT INTO stores (
       id, name_en, address_en, phone, status, organization_id,
       country_code, currency_code, locale, timezone
     ) VALUES ($1, $2, 'Kathmandu', $3, 'PUBLISHED', $4, 'NP', 'NPR',
               'en-NP', 'Asia/Kathmandu')`,
    [fixture.store, `Quote store ${suffix}`, fixture.phone, fixture.organization],
  );
  await query(
    `INSERT INTO categories (id, name_en, slug, status, published_at)
     VALUES ($1, 'Quote category', $2, 'PUBLISHED', NOW())`,
    [fixture.category, `quote-${suffix}`],
  );
  await query(
    `INSERT INTO products (
       id, sku, name_en, category_id, status, published_at
     ) VALUES ($1, $2, 'Quote product', $3, 'PUBLISHED', NOW())`,
    [fixture.product, fixture.sku, fixture.category],
  );
  await query(
    `INSERT INTO product_prices (
       product_id, store_id, price, currency_code, active, valid_from
     ) VALUES ($1, $2, 1000.00, 'NPR', TRUE, NOW() - INTERVAL '1 day')`,
    [fixture.product, fixture.store],
  );
  await query(
    `INSERT INTO batch_inventory (
       store_id, product_id, batch_id, expiry_date, quantity, unit_cost,
       total_cost, received_date
     ) VALUES ($1, $2, $3, CURRENT_DATE + 180, 10, 600.00, 6000.00, CURRENT_DATE)`,
    [fixture.store, fixture.product, `QUOTE-${suffix}`],
  );
  await query(
    `INSERT INTO customers (
       id, phone_normalized, phone_hash, phone_masked, home_store_id,
       status, verification_status
     ) VALUES ($1, $2, $3, '98XXXXXX00', $4, 'ACTIVE', 'VERIFIED')`,
    [fixture.customer, fixture.phone, `quote-hash-${suffix}`, fixture.store],
  );
  const member = await new MembershipService().enrollCustomer(fixture.customer);
  const role = await query(
    "SELECT id::text FROM roles WHERE role_key = 'head_office_admin'",
  );
  if (!role.rowCount) throw new Error("head_office_admin role is missing");
  await query(
    `INSERT INTO staff (
       id, staff_number, first_name, last_name, role, username, status,
       role_id, capabilities, scope_type, scope_store_ids, scope_organization_id
     ) VALUES ($1, $2, 'Quote', 'Admin', 'ADMIN', $3, 'ACTIVE', $4,
               '["pricing.read","pricing.write","pricing.approve"]',
               'ORGANIZATION', '{}', $5)`,
    [
      fixture.staff,
      `QA-${suffix}`,
      `quote-${suffix}`,
      role.rows[0].id,
      fixture.organization,
    ],
  );
  ids = { ...fixture, membershipNumber: member.membership_number };
  actor = {
    id: fixture.staff,
    roleKey: "head_office_admin",
    capabilities: ["pricing.read", "pricing.write", "pricing.approve"],
    scopeType: "ORGANIZATION",
    scopeStoreIds: [],
  };

  const promotion = await pricingService.createPromotion(
    {
      organization_id: fixture.organization,
      name: "Quote test promotion",
      starts_at: new Date(Date.now() - 60_000),
      ends_at: new Date(Date.now() + 60 * 60_000),
      reason: "Member quote integration test",
      products: [{ sku: fixture.sku, member_price: "950.00" }],
      category_ids: [fixture.category],
      tiers: [member.tier_key],
      channels: ["POS"],
    },
    actor,
  );
  await pricingService.transitionPromotion(
    promotion.id,
    "ACTIVATED",
    "Integration test promotion",
    actor,
    [fixture.organization],
  );
  const storefrontPromotion = await pricingService.createPromotion(
    {
      organization_id: fixture.organization,
      name: "Web and app quote test promotion",
      starts_at: new Date(Date.now() - 60_000),
      ends_at: new Date(Date.now() + 60 * 60_000),
      reason: "Customer channel parity integration test",
      products: [{ sku: fixture.sku, member_price: "900.00" }],
      category_ids: [fixture.category],
      tiers: [member.tier_key],
      channels: ["WEB", "APP"],
    },
    actor,
  );
  await pricingService.transitionPromotion(
    storefrontPromotion.id,
    "ACTIVATED",
    "Activate customer channel test price",
    actor,
    [fixture.organization],
  );
}

function quoteRequest(overrides: Record<string, unknown> = {}) {
  return {
    channel: "POS",
    storeReference: ids.store,
    customerReference: ids.customer,
    customerPhoneReference: ids.phone,
    items: [{ sku: ids.sku, quantity: "1.25" }],
    ...overrides,
  };
}

async function issueQuote(overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/internal/member-pricing/quotes",
    headers: { authorization: `Bearer ${serviceToken}` },
    payload: quoteRequest(overrides),
  });
  return { response, quote: response.json().quote };
}

async function validate(
  quote: { signedQuoteToken: string },
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/internal/member-pricing/quotes/validate",
    headers: { authorization: `Bearer ${serviceToken}` },
    payload: {
      ...quoteRequest(),
      ...overrides,
      signedQuoteToken: quote.signedQuoteToken,
      saleReference: `lite-sale-${randomUUID()}`,
    },
  });
}

beforeAll(async () => {
  process.env.MEMBER_PRICING_SERVICE_TOKEN = serviceToken;
  process.env.MEMBER_PRICING_QUOTE_SECRET = quoteSecret;
  await createFixture();
  customerSessionToken = (
    await sessions.createSession({ customer_id: ids.customer })
  ).session_token;
  app = Fastify();
  await app.register(cookie);
  await app.register(customerMemberPricingRoutes, { prefix: "/api" });
  await app.register(memberPricingServiceRoutes, {
    prefix: "/api/internal/member-pricing",
  });
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  if (customerSessionToken) {
    await sessions.revokeSession(customerSessionToken, "Pricing API test cleanup");
  }
});

describe("authenticated member pricing quote API", () => {
  it("accepts and preserves the explicit COD channel", async () => {
    const { response, quote } = await issueQuote({ channel: "COD" });

    expect(response.statusCode).toBe(201);
    expect(quote).toMatchObject({
      channel: "COD",
      finalTotal: "1250.00",
      discountTotal: "0.00",
    });
  });

  it("creates a signed product-specific quote from the enrolled membership and exact decimals", async () => {
    const { response, quote } = await issueQuote();
    expect(response.statusCode).toBe(201);
    expect(quote).toMatchObject({
      channel: "POS",
      customerReference: ids.customer,
      membershipNumber: ids.membershipNumber,
      membershipStatus: "ACTIVE",
      items: [
        {
          sku: ids.sku,
          quantity: "1.25",
          regularUnitPrice: "1000.00",
          appliedUnitPrice: "950.00",
          lineDiscount: "62.50",
          lineTotal: "1187.50",
        },
      ],
      subtotal: "1250.00",
      discountTotal: "62.50",
      finalTotal: "1187.50",
      currency: "NPR",
      pricingRuleVersion: 1,
    });
    expect(quote.signedQuoteToken).toContain(".");
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.issuedAt)).toBe(
      MEMBER_PRICING_QUOTE_TTL_MS,
    );
  });

  it("rejects missing and incorrect service credentials", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes",
      payload: quoteRequest(),
    });
    const incorrect = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes",
      headers: { authorization: "Bearer wrong-service-token" },
      payload: quoteRequest(),
    });
    expect(missing.statusCode).toBe(401);
    expect(incorrect.statusCode).toBe(401);
  });

  it("returns server-verified membership details to Lite", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/customers/verify",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: {
        customerReference: ids.customer,
        customerPhoneReference: ids.phone,
        storeReference: ids.store,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().customer).toMatchObject({
      customerReference: ids.customer,
      membershipNumber: ids.membershipNumber,
      membershipTier: "FOUNDING_1000",
      membershipStatus: "ACTIVE",
    });
  });

  it("rejects an unknown store reference from Lite before issuing a quote", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: quoteRequest({ storeReference: randomUUID() }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects a customer reference when Lite supplies a different phone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/customers/verify",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: {
        customerReference: ids.customer,
        customerPhoneReference: "9811111111",
        storeReference: ids.store,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "CUSTOMER_MISMATCH" });
  });

  it("rejects altered signatures and expired quotes", async () => {
    const { quote } = await issueQuote();
    const tokenParts = quote.signedQuoteToken.split(".");
    const firstSignatureCharacter = tokenParts[1][0] === "A" ? "B" : "A";
    const tampered = `${tokenParts[0]}.${firstSignatureCharacter}${tokenParts[1].slice(1)}`;
    await expect(
      validateMemberPricingQuote(
        {
          ...quoteRequest(),
          signedQuoteToken: tampered,
          saleReference: `lite-sale-${randomUUID()}`,
        },
      ),
    ).rejects.toMatchObject({ code: "QUOTE_SIGNATURE_INVALID" });

    await expect(
      validateMemberPricingQuote(
        {
          ...quoteRequest(),
          signedQuoteToken: quote.signedQuoteToken,
          saleReference: `lite-sale-${randomUUID()}`,
        },
        { now: new Date(Date.parse(quote.expiresAt) + 1) },
      ),
    ).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
  });

  it.each([
    ["channel", { channel: "WEB" }],
    ["customer", { customerReference: randomUUID() }],
    ["cart quantity", () => ({ items: [{ sku: ids.sku, quantity: "1.5" }] })],
  ])("rejects a mismatched %s", async (_label, mismatch) => {
    const { quote } = await issueQuote();
    const response = await validate(
      quote,
      typeof mismatch === "function" ? mismatch() : mismatch,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toMatch(/MISMATCH/);
  });

  it("allows an idempotent retry for one sale and rejects quote replay into another sale", async () => {
    const { quote } = await issueQuote();
    const saleReference = `lite-sale-${randomUUID()}`;
    const payload = {
      ...quoteRequest(),
      signedQuoteToken: quote.signedQuoteToken,
      saleReference,
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes/validate",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload,
    });
    const retry = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes/validate",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes/validate",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: { ...payload, saleReference: `lite-sale-${randomUUID()}` },
    });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().code).toBe("QUOTE_REPLAY");
  });

  it("prevents distinct quotes from claiming the same sale reference", async () => {
    const firstQuote = await issueQuote();
    const secondQuote = await issueQuote();
    const saleReference = `lite-sale-${randomUUID()}`;
    const responses = await Promise.all(
      [firstQuote.quote, secondQuote.quote].map((quote) =>
        app.inject({
          method: "POST",
          url: "/api/internal/member-pricing/quotes/validate",
          headers: { authorization: `Bearer ${serviceToken}` },
          payload: {
            ...quoteRequest(),
            signedQuoteToken: quote.signedQuoteToken,
            saleReference,
          },
        }),
      ),
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect(
      responses.find((response) => response.statusCode === 409)?.json().code,
    ).toBe("QUOTE_REPLAY");
  });

  it("rejects an SKU absent from the authoritative catalog", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/internal/member-pricing/quotes",
      headers: { authorization: `Bearer ${serviceToken}` },
      payload: quoteRequest({
        items: [{ sku: "NOT-IN-CATALOG", quantity: "1" }],
      }),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SKU_NOT_FOUND");
  });

  it("serves authenticated web and app prices from the same authoritative promotion", async () => {
    const request = {
      store_id: ids.store,
      items: [{ sku: ids.sku, quantity: 1 }],
    };
    const headers = { "x-csrf-token": "customer-pricing-csrf" };
    const cookies = {
      customer_session: customerSessionToken,
      customer_csrf: "customer-pricing-csrf",
    };
    const web = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/web/quotes",
      headers,
      cookies,
      payload: request,
    });
    const mobile = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/app/quotes",
      headers,
      cookies,
      payload: request,
    });
    expect(web.statusCode).toBe(201);
    expect(mobile.statusCode).toBe(201);
    expect(web.json().quote).toMatchObject({
      channel: "WEB",
      membershipNumber: ids.membershipNumber,
      membershipStatus: "ACTIVE",
      items: [{ sku: ids.sku, appliedUnitPrice: "900.00" }],
    });
    expect(mobile.json().quote.items).toEqual(web.json().quote.items);

    const webValidation = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/web/quotes/validate",
      headers,
      cookies,
      payload: {
        ...request,
        signed_quote_token: web.json().quote.signedQuoteToken,
        sale_reference: `web-order-${randomUUID()}`,
      },
    });
    expect(webValidation.statusCode).toBe(200);
    expect(webValidation.json().valid).toBe(true);

    const wrongChannel = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/app/quotes/validate",
      headers,
      cookies,
      payload: {
        ...request,
        signed_quote_token: web.json().quote.signedQuoteToken,
        sale_reference: `app-order-${randomUUID()}`,
      },
    });
    expect(wrongChannel.statusCode).toBe(409);
    expect(wrongChannel.json().code).toBe("QUOTE_MISMATCH");
  });

  it("rejects quote requests without a customer session or with a client identity", async () => {
    const request = {
      store_id: ids.store,
      items: [{ sku: ids.sku, quantity: 1 }],
    };
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/web/quotes",
      payload: request,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const clientIdentity = await app.inject({
      method: "POST",
      url: "/api/customer-pricing/web/quotes",
      headers: { "x-csrf-token": "customer-pricing-csrf" },
      cookies: {
        customer_session: customerSessionToken,
        customer_csrf: "customer-pricing-csrf",
      },
      payload: { ...request, customer_reference: randomUUID() },
    });
    expect(clientIdentity.statusCode).toBe(400);
    expect(clientIdentity.json().code).toBe("INVALID_QUOTE_REQUEST");
  });
});

describe("exact member-price arithmetic", () => {
  it("rounds fractional quantities to paise without floating-point math", () => {
    expect(
      calculateMemberPricingLine(
        {
          regular_price: "0.10",
          final_price: "0.07",
          promotion_id: null,
        },
        "0.333",
      ),
    ).toEqual({
      regularUnitPrice: "0.10",
      appliedUnitPrice: "0.07",
      lineDiscount: "0.01",
      lineTotal: "0.02",
    });
  });
});
