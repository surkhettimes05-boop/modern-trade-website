import { getPool, query } from "../../database/connection.js";
import { MembershipAuditContext, MembershipService } from "../membershipService.js";
import { normalizePhone } from "../../utils/phoneNormalization.js";

const ORG = "22000000-0000-4000-8000-000000000011";
const STORE = "22000000-0000-4000-8000-000000000012";
const STAFF = "22000000-0000-4000-8000-000000000017";
const CUSTOMERS = [
  "22000000-0000-4000-8000-000000000013",
  "22000000-0000-4000-8000-000000000014",
  "22000000-0000-4000-8000-000000000015",
  "22000000-0000-4000-8000-000000000016",
  "22000000-0000-4000-8000-000000000018",
];

const service = new MembershipService();
const auditContext: MembershipAuditContext = {
  actorRole: "platform_admin",
  actorCapabilities: ["membership.manage"],
  actorScopeType: "GLOBAL",
  actorScopeStoreIds: [],
};

describe("Pasalho membership foundation", () => {
  beforeAll(async () => {
    await query(
      `INSERT INTO organizations(id, organization_name, country_code, default_currency_code, default_locale, default_timezone, tax_regime)
       VALUES ($1, 'Pasalho Membership Test', 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'VAT')
       ON CONFLICT (id) DO NOTHING`,
      [ORG],
    );
    await query(
      `INSERT INTO stores(id, name_en, address_en, phone, status, organization_id, country_code, currency_code, locale, timezone)
       VALUES ($1, 'Membership Test Store', 'Kathmandu', '9800000011', 'PUBLISHED', $2, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu')
       ON CONFLICT (id) DO NOTHING`,
      [STORE, ORG],
    );
    await query(
      `INSERT INTO staff (
         id, staff_number, first_name, last_name, role, username, status,
         capabilities, scope_type, scope_store_ids, scope_organization_id
       ) VALUES ($1, 'membership-admin-test', 'Membership', 'Admin', 'MANAGER',
                 'membership-admin-test', 'ACTIVE', '["membership.manage"]',
                 'GLOBAL', '{}', NULL)
       ON CONFLICT (id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
      [STAFF],
    );
  });

  beforeEach(async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM audit_events
          WHERE entity_type = 'customer_membership'`,
      );
      await client.query("DELETE FROM membership_status_history");
      await client.query("DELETE FROM membership_campaign_allocations");
      await client.query("DELETE FROM customer_memberships");
      await client.query("DELETE FROM membership_organization_sequences");
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

      for (let index = 0; index < CUSTOMERS.length; index += 1) {
        const customerId = CUSTOMERS[index];
        const phone = `98000000${String(index + 13).padStart(2, "0")}`;
        await client.query(
          `INSERT INTO customers (
             id, phone_normalized, phone_hash, phone_masked, home_store_id,
             status, verification_status
           ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'VERIFIED')
           ON CONFLICT (id) DO UPDATE SET
             phone_normalized = EXCLUDED.phone_normalized,
             phone_hash = EXCLUDED.phone_hash,
             phone_masked = EXCLUDED.phone_masked,
             home_store_id = EXCLUDED.home_store_id,
             status = 'ACTIVE',
             verification_status = 'VERIFIED'`,
          [
            customerId,
            phone,
            `membership-hash-${index}`,
            `${phone.slice(0, 2)}XXXX${phone.slice(-2)}`,
            STORE,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("enrolls a verified customer once per organization without consuming a duplicate slot", async () => {
    const first = await service.enrollCustomer(CUSTOMERS[0]);
    expect(first.tier_key).toBe("FOUNDING_1000");
    expect(first.membership_number).toBe(1);
    expect(first.founding_number).toBe(1);

    const duplicate = await service.enrollCustomer(CUSTOMERS[0]);
    expect(duplicate.id).toBe(first.id);

    const state = await query(
      `SELECT allocated_count FROM membership_campaign_state
        WHERE campaign_key = 'FOUNDING_1000'`,
    );
    expect(Number(state.rows[0].allocated_count)).toBe(1);
  });

  it("enrolls a verified pre-launch customer without publishing or assigning a store", async () => {
    const previous = process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID;
    try {
      await query("UPDATE customers SET home_store_id = NULL WHERE id = $1", [CUSTOMERS[0]]);
      delete process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID;
      await expect(service.enrollCustomer(CUSTOMERS[0])).rejects.toMatchObject({ code: "STORE_REQUIRED" });
      process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID = ORG;
      const first = await service.enrollCustomer(CUSTOMERS[0]);
      expect(first.organization_id).toBe(ORG);
      expect(first.founding_number).toBe(1);
      expect((await service.enrollCustomer(CUSTOMERS[0])).id).toBe(first.id);
      const customer = await query("SELECT home_store_id FROM customers WHERE id = $1", [CUSTOMERS[0]]);
      expect(customer.rows[0].home_store_id).toBeNull();
      await query("UPDATE customers SET verification_status = 'UNVERIFIED', home_store_id = NULL WHERE id = $1", [CUSTOMERS[1]]);
      await expect(service.enrollCustomer(CUSTOMERS[1])).rejects.toMatchObject({ code: "OTP_REQUIRED" });
    } finally {
      if (previous === undefined) delete process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID;
      else process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID = previous;
    }
  });

  it("rejects enrollment until the authenticated customer is OTP verified", async () => {
    await query(
      `UPDATE customers SET verification_status = 'UNVERIFIED' WHERE id = $1`,
      [CUSTOMERS[0]],
    );

    await expect(service.enrollCustomer(CUSTOMERS[0])).rejects.toMatchObject({
      code: "OTP_REQUIRED",
    });

    const count = await query(
      `SELECT COUNT(*)::int AS count
         FROM membership_campaign_allocations
        WHERE campaign_key = 'FOUNDING_1000'`,
    );
    expect(count.rows[0].count).toBe(0);
  });

  it("uses the existing canonical normalized phone identity", async () => {
    expect(normalizePhone("+977 980 0000 013")).toBe("9800000013");
    const membership = await service.enrollCustomer(CUSTOMERS[0]);
    const customer = await query(
      `SELECT phone_normalized FROM customers WHERE id = $1`,
      [CUSTOMERS[0]],
    );
    expect(customer.rows[0].phone_normalized).toBe("9800000013");
    expect(membership.customer_id).toBe(CUSTOMERS[0]);
  });

  it("does not return another customer's membership", async () => {
    await service.enrollCustomer(CUSTOMERS[0]);

    await expect(
      service.getMembershipForCustomer(CUSTOMERS[1]),
    ).resolves.toBeNull();
  });

  it("supports suspension and reactivation and writes an audit event per change", async () => {
    const membership = await service.enrollCustomer(CUSTOMERS[0]);

    const suspended = await service.updateMembershipStatus(
      membership.id,
      "SUSPENDED",
      STAFF,
      "Account review",
      auditContext,
    );
    expect(suspended.status).toBe("SUSPENDED");

    const reactivated = await service.updateMembershipStatus(
      membership.id,
      "ACTIVE",
      STAFF,
      "Review complete",
      auditContext,
    );
    expect(reactivated.status).toBe("ACTIVE");
    expect(reactivated.suspended_at).toBeNull();

    const history = await query(
      `SELECT COUNT(*)::int AS count
         FROM membership_status_history
        WHERE membership_id = $1`,
      [membership.id],
    );
    const audits = await query(
      `SELECT COUNT(*)::int AS count
         FROM audit_events
        WHERE entity_type = 'customer_membership' AND entity_id = $1`,
      [membership.id],
    );
    expect(history.rows[0].count).toBe(3);
    expect(audits.rows[0].count).toBe(2);
  });

  it("serializes concurrent allocation of the final founding membership", async () => {
    await query(
      `UPDATE membership_campaign_state
          SET allocated_count = 999
        WHERE campaign_key = 'FOUNDING_1000'`,
    );

    const outcomes = await Promise.allSettled([
      service.grantFoundingMembership(CUSTOMERS[2], STAFF),
      service.grantFoundingMembership(CUSTOMERS[3], STAFF),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const allocated = outcomes.find((result) => result.status === "fulfilled");
    expect(allocated?.status === "fulfilled" && allocated.value.founding_number).toBe(
      1000,
    );
    const state = await query(
      `SELECT allocated_count FROM membership_campaign_state
        WHERE campaign_key = 'FOUNDING_1000'`,
    );
    expect(Number(state.rows[0].allocated_count)).toBe(1000);
  });

  it("hard-rejects founding allocation after 1,000 while allowing registered enrollment", async () => {
    await query(
      `UPDATE membership_campaign_state
          SET allocated_count = 1000
        WHERE campaign_key = 'FOUNDING_1000'`,
    );

    await expect(
      service.grantFoundingMembership(CUSTOMERS[4], STAFF),
    ).rejects.toMatchObject({ code: "CAMPAIGN_FULL" });

    const registered = await service.enrollCustomer(CUSTOMERS[4]);
    expect(registered.tier_key).toBe("REGISTERED_MEMBER");
    expect(registered.founding_number).toBeNull();
    const state = await query(
      `SELECT allocated_count FROM membership_campaign_state
        WHERE campaign_key = 'FOUNDING_1000'`,
    );
    expect(Number(state.rows[0].allocated_count)).toBe(1000);
  });

  it("enforces the 1,000-slot maximum in the database", async () => {
    await expect(
      query(
        `UPDATE membership_campaign_state
            SET capacity = 1001
          WHERE campaign_key = 'FOUNDING_1000'`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
