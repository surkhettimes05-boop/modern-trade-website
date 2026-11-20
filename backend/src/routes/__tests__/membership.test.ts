import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { getPool, query } from "../../database/connection.js";
import { membershipRoutes } from "../membership.js";
import { MembershipService } from "../../services/membershipService.js";
import { SessionService } from "../../services/sessionService.js";

const ORG = "23000000-0000-4000-8000-000000000011";
const STORE = "23000000-0000-4000-8000-000000000012";
const CUSTOMER = "23000000-0000-4000-8000-000000000013";
const STAFF = "23000000-0000-4000-8000-000000000014";
const STAFF_ROLE = "23000000-0000-4000-8000-000000000015";
const ADMIN_ROLE = "23000000-0000-4000-8000-000000000016";
const sessions = new SessionService();

describe("Membership API authorization", () => {
  beforeAll(async () => {
    await query(
      `INSERT INTO organizations(id, organization_name, country_code, default_currency_code, default_locale, default_timezone, tax_regime)
       VALUES ($1, 'Membership API Test', 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'VAT')
       ON CONFLICT (id) DO NOTHING`,
      [ORG],
    );
    await query(
      `INSERT INTO stores(id, name_en, address_en, phone, status, organization_id, country_code, currency_code, locale, timezone)
       VALUES ($1, 'Membership API Store', 'Kathmandu', '9800000021', 'PUBLISHED', $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu')
       ON CONFLICT (id) DO NOTHING`,
      [STORE, ORG],
    );
    await query(
      `INSERT INTO customers (
         id, phone_normalized, phone_hash, phone_masked, home_store_id,
         status, verification_status
       ) VALUES ($1, '9800000023', 'membership-api-hash', '98XXXXXX23',
                 $2, 'ACTIVE', 'VERIFIED')
       ON CONFLICT (id) DO UPDATE SET
         home_store_id = EXCLUDED.home_store_id,
         status = 'ACTIVE',
         verification_status = 'VERIFIED'`,
      [CUSTOMER, STORE],
    );
    await query(
      `INSERT INTO roles (
         id, role_key, role_name, role_level, capabilities, is_system_role, is_active
       ) VALUES ($1, 'membership_test_cashier', 'Membership Test Cashier', 1,
                 '["membership.read"]', FALSE, TRUE)
       ON CONFLICT (id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
      [STAFF_ROLE],
    );
    await query(
      `INSERT INTO roles (
         id, role_key, role_name, role_level, capabilities, is_system_role, is_active
       ) VALUES ($1, 'membership_test_admin', 'Membership Test Admin', 5,
                 '["membership.manage"]', FALSE, TRUE)
       ON CONFLICT (id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
      [ADMIN_ROLE],
    );
    await query(
      `INSERT INTO staff (
         id, staff_number, first_name, last_name, role, username, status,
         role_id, capabilities, scope_type, scope_store_ids, scope_organization_id
       ) VALUES ($1, 'membership-cashier-test', 'Membership', 'Cashier',
                 'CASHIER', 'membership-cashier-test', 'ACTIVE', $3,
                 '["membership.read"]', 'STORE', ARRAY[$2]::uuid[], NULL)
       ON CONFLICT (id) DO UPDATE SET
         capabilities = EXCLUDED.capabilities,
         scope_type = EXCLUDED.scope_type,
         scope_store_ids = EXCLUDED.scope_store_ids`,
      [STAFF, STORE, STAFF_ROLE],
    );
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(cookie);
    await app.register(jwt, {
      secret: "membership-api-test-secret-with-sufficient-length",
      cookie: { cookieName: "ops_session", signed: false },
    });
    await app.register(membershipRoutes, { prefix: "/api" });
    await app.ready();
    return app;
  }

  beforeEach(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM membership_status_history
          WHERE membership_id IN (
            SELECT id FROM customer_memberships WHERE customer_id = $1
          )`,
        [CUSTOMER],
      );
      await client.query(
        `DELETE FROM membership_campaign_allocations
          WHERE campaign_key = 'FOUNDING_1000' AND customer_id = $1`,
        [CUSTOMER],
      );
      await client.query(
        `DELETE FROM customer_memberships WHERE customer_id = $1`,
        [CUSTOMER],
      );
      await client.query(
        `DELETE FROM membership_organization_sequences WHERE organization_id = $1`,
        [ORG],
      );
      await client.query(
        `UPDATE membership_campaign_state
            SET allocated_count = (
                  SELECT COUNT(*)::int
                    FROM membership_campaign_allocations
                   WHERE campaign_key = 'FOUNDING_1000'
                ),
                active = TRUE,
                capacity = 1000,
                updated_at = NOW()
          WHERE campaign_key = 'FOUNDING_1000'`,
      );
      await client.query(
        `UPDATE customers SET status = 'ACTIVE', verification_status = 'VERIFIED'
          WHERE id = $1`,
        [CUSTOMER],
      );
      await client.query(
        `UPDATE staff
            SET role_id = $3,
                scope_type = 'STORE',
                scope_store_ids = ARRAY[$2]::uuid[]
          WHERE id = $1`,
        [STAFF, STORE, STAFF_ROLE],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("enrolls only the OTP-verified customer from the session", async () => {
    const app = await buildApp();
    const session = await sessions.createSession({ customer_id: CUSTOMER });
    const response = await app.inject({
      method: "POST",
      url: "/api/membership/enroll",
      cookies: {
        customer_session: session.session_token,
        customer_csrf: "membership-csrf",
      },
      headers: { "x-csrf-token": "membership-csrf" },
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().membership.customer_id).toBe(CUSTOMER);
    expect(response.json().membership.status).toBe("ACTIVE");
    await app.close();
  });

  it("uses a validated selected store when the verified customer has no home store", async () => {
    const app = await buildApp();
    const customerId = randomUUID();
    const phone = `98${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
    await query(
      `INSERT INTO customers (
         id, phone_normalized, phone_hash, phone_masked, status,
         verification_status
       ) VALUES ($1, $2, $3, '98XXXXXX24', 'ACTIVE', 'VERIFIED')`,
      [customerId, phone, `membership-${customerId}`],
    );
    const session = await sessions.createSession({ customer_id: customerId });
    const response = await app.inject({
      method: "POST",
      url: "/api/membership/enroll",
      cookies: {
        customer_session: session.session_token,
        customer_csrf: "membership-csrf",
      },
      headers: { "x-csrf-token": "membership-csrf" },
      payload: { store_id: STORE },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().membership.organization_id).toBe(ORG);
    const customer = await query(
      "SELECT home_store_id::text FROM customers WHERE id = $1",
      [customerId],
    );
    expect(customer.rows[0].home_store_id).toBe(STORE);
    await sessions.revokeSession(session.session_token, "Membership test cleanup");
    const membership = response.json().membership;
    await query(
      `DELETE FROM membership_status_history WHERE membership_id = $1`,
      [membership.id],
    );
    await query(
      `DELETE FROM membership_campaign_allocations WHERE membership_id = $1`,
      [membership.id],
    );
    await query(`DELETE FROM customer_memberships WHERE id = $1`, [membership.id]);
    await query(`DELETE FROM customer_sessions WHERE customer_id = $1`, [customerId]);
    await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    await query(
      `UPDATE membership_campaign_state
          SET allocated_count = (
                SELECT COUNT(*)::int
                  FROM membership_campaign_allocations
                 WHERE campaign_key = 'FOUNDING_1000'
              ),
              updated_at = NOW()
        WHERE campaign_key = 'FOUNDING_1000'`,
    );
    await app.close();
  });

  it("rejects a client-supplied tier and does not create membership", async () => {
    const app = await buildApp();
    const session = await sessions.createSession({ customer_id: CUSTOMER });
    const response = await app.inject({
      method: "POST",
      url: "/api/membership/enroll",
      cookies: {
        customer_session: session.session_token,
        customer_csrf: "membership-csrf",
      },
      headers: { "x-csrf-token": "membership-csrf" },
      payload: { tier: "FOUNDING_1000" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_ENROLLMENT_REQUEST");
    const count = await query(
      `SELECT COUNT(*)::int AS count
         FROM customer_memberships WHERE customer_id = $1`,
      [CUSTOMER],
    );
    expect(count.rows[0].count).toBe(0);
    await app.close();
  });

  it("does not allow a cashier staff session to enroll or manage memberships", async () => {
    const app = await buildApp();
    const staffToken = app.jwt.sign({ sub: STAFF, jti: "cashier-test-session" });

    const enrollment = await app.inject({
      method: "POST",
      url: "/api/membership/enroll",
      cookies: { ops_session: staffToken },
      payload: { tier: "FOUNDING_1000" },
    });
    expect(enrollment.statusCode).toBe(401);

    const statusChange = await app.inject({
      method: "POST",
      url: `/api/admin/memberships/${CUSTOMER}/status`,
      cookies: {
        ops_session: staffToken,
        csrf_token: "membership-csrf",
      },
      headers: { "x-csrf-token": "membership-csrf" },
      payload: { status: "SUSPENDED", reason: "Cashier attempt" },
    });
    expect(statusChange.statusCode).toBe(403);
    expect(statusChange.json().code).toBe("CAPABILITY_DENIED");
    await app.close();
  });

  it("limits store-scoped membership reads and status changes to assigned stores", async () => {
    const app = await buildApp();
    const otherStore = randomUUID();
    const otherCustomer = randomUUID();
    const ownMembership = randomUUID();
    const otherMembership = randomUUID();
    const membershipNumber = 1_000_000 + Math.floor(Math.random() * 1_000_000);
    const otherPhone = `98${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
    try {
      await query(
        `INSERT INTO stores (
           id, name_en, address_en, phone, status, organization_id,
           country_code, currency_code, locale, timezone
         ) VALUES ($1, 'Other membership store', 'Kathmandu', '9800000022',
                   'PUBLISHED', $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu')`,
        [otherStore, ORG],
      );
      await query(
        `INSERT INTO customers (
           id, phone_normalized, phone_hash, phone_masked, home_store_id,
           status, verification_status
         ) VALUES ($1, $2, $3, '98XXXXXX24', $4, 'ACTIVE', 'VERIFIED')`,
        [otherCustomer, otherPhone, `membership-${otherCustomer}`, otherStore],
      );
      await query(
        `INSERT INTO customer_memberships (
           id, customer_id, organization_id, tier_key, membership_number, status
         ) VALUES
           ($1, $2, $3, 'REGISTERED_MEMBER', $5, 'ACTIVE'),
           ($4, $6, $3, 'REGISTERED_MEMBER', $7, 'ACTIVE')`,
        [
          ownMembership,
          CUSTOMER,
          ORG,
          otherMembership,
          membershipNumber,
          otherCustomer,
          membershipNumber + 1,
        ],
      );

      const cashierToken = app.jwt.sign({
        sub: STAFF,
        jti: "store-scoped-membership-read",
      });
      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/memberships",
        cookies: { ops_session: cashierToken },
      });
      expect(listResponse.statusCode).toBe(200);
      const listedIds = listResponse
        .json()
        .memberships.map((membership: { id: string }) => membership.id);
      expect(listedIds).toContain(ownMembership);
      expect(listedIds).not.toContain(otherMembership);

      await query(
        `UPDATE staff
            SET role_id = $2,
                capabilities = '["membership.manage"]',
                scope_type = 'STORE',
                scope_store_ids = ARRAY[$3]::uuid[]
          WHERE id = $1`,
        [STAFF, ADMIN_ROLE, STORE],
      );
      const managerToken = app.jwt.sign({
        sub: STAFF,
        jti: "store-scoped-membership-manage",
      });
      const statusResponse = await app.inject({
        method: "POST",
        url: `/api/admin/memberships/${otherMembership}/status`,
        cookies: {
          ops_session: managerToken,
          csrf_token: "membership-scope-csrf",
        },
        headers: { "x-csrf-token": "membership-scope-csrf" },
        payload: { status: "SUSPENDED", reason: "Out of store scope" },
      });
      expect(statusResponse.statusCode).toBe(404);
      const otherState = await query(
        `SELECT status FROM customer_memberships WHERE id = $1`,
        [otherMembership],
      );
      expect(otherState.rows[0].status).toBe("ACTIVE");
    } finally {
      await query(
        `DELETE FROM membership_status_history
          WHERE membership_id = ANY($1::uuid[])`,
        [[ownMembership, otherMembership]],
      );
      await query(
        `DELETE FROM audit_events
          WHERE entity_type = 'customer_membership'
            AND entity_id = ANY($1::uuid[])`,
        [[ownMembership, otherMembership]],
      );
      await query(
        `DELETE FROM customer_memberships WHERE id = ANY($1::uuid[])`,
        [[ownMembership, otherMembership]],
      );
      await query(`DELETE FROM customers WHERE id = $1`, [otherCustomer]);
      await query(`DELETE FROM stores WHERE id = $1`, [otherStore]);
      await query(
        `UPDATE staff
            SET role_id = $2,
                capabilities = '["membership.read"]',
                scope_type = 'STORE',
                scope_store_ids = ARRAY[$3]::uuid[]
          WHERE id = $1`,
        [STAFF, STAFF_ROLE, STORE],
      );
      await app.close();
    }
  });

  it("allows an authorized admin status change and persists its audit event", async () => {
    const app = await buildApp();
    const member = await new MembershipService().enrollCustomer(CUSTOMER);
    await query(
      `UPDATE staff SET role_id = $2, scope_type = 'GLOBAL'
        WHERE id = $1`,
      [STAFF, ADMIN_ROLE],
    );
    const staffState = await query(
      `SELECT capabilities, scope_type FROM staff WHERE id = $1`,
      [STAFF],
    );
    expect(staffState.rows[0]).toMatchObject({
      capabilities: ["membership.manage"],
      scope_type: "GLOBAL",
    });
    const adminToken = app.jwt.sign({ sub: STAFF, jti: "membership-admin-session" });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/memberships/${member.id}/status`,
      cookies: {
        ops_session: adminToken,
        csrf_token: "membership-admin-csrf",
      },
      headers: { "x-csrf-token": "membership-admin-csrf" },
      payload: { status: "SUSPENDED", reason: "Admin review" },
    });

    if (response.statusCode !== 200) {
      throw new Error(
        `Admin status update returned ${response.statusCode}: ${response.body}`,
      );
    }
    expect(response.json().membership.status).toBe("SUSPENDED");
    const audit = await query(
      `SELECT event_type, changes
         FROM audit_events
        WHERE entity_type = 'customer_membership' AND entity_id = $1`,
      [member.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].event_type).toBe("MEMBERSHIP_STATUS_CHANGED");
    expect(audit.rows[0].changes.after.reason).toBe("Admin review");
    await app.close();
  });
});
