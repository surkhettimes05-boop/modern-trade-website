import { getPool } from "../database/connection.js";
import { normalizePhone } from "../utils/phoneNormalization.js";

type EnrollmentProfile = { name: string; ward: string; language: "ne" | "en"; consent: true; policy_version: "membership-v1" };

export type MembershipTier = "REGISTERED_MEMBER" | "FOUNDING_1000";
export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";

export class MembershipServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type CustomerMembershipRow = {
  id: string;
  customer_id: string;
  organization_id: string;
  tier_key: MembershipTier;
  membership_number: number;
  founding_number: number | null;
  status: MembershipStatus;
  status_reason: string | null;
  enrolled_at: Date;
  last_status_changed_at: Date;
  suspended_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type MembershipAuditContext = {
  actorRole: string;
  actorCapabilities: string[];
  actorScopeType: string;
  actorScopeStoreIds: string[];
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

function serializeMembership(row: Record<string, unknown>): CustomerMembershipRow {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    organization_id: String(row.organization_id),
    tier_key: String(row.tier_key) as MembershipTier,
    membership_number: Number(row.membership_number),
    founding_number:
      row.founding_number === null || row.founding_number === undefined
        ? null
        : Number(row.founding_number),
    status: String(row.status) as MembershipStatus,
    status_reason: row.status_reason ? String(row.status_reason) : null,
    enrolled_at: new Date(String(row.enrolled_at)),
    last_status_changed_at: new Date(String(row.last_status_changed_at)),
    suspended_at: row.suspended_at ? new Date(String(row.suspended_at)) : null,
    cancelled_at: row.cancelled_at ? new Date(String(row.cancelled_at)) : null,
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
  };
}

export class MembershipService {
  async getMembershipForCustomer(
    customerId: string,
    organizationId?: string,
  ): Promise<CustomerMembershipRow | null> {
    const result = await getPool().query(
      `SELECT *
         FROM customer_memberships
        WHERE customer_id = $1
          AND ($2::uuid IS NULL OR organization_id = $2)
        ORDER BY enrolled_at DESC, created_at DESC
        LIMIT 1`,
      [customerId, organizationId ?? null],
    );
    return result.rowCount ? serializeMembership(result.rows[0]) : null;
  }

  async listMemberships(filters: {
    status?: MembershipStatus;
    tier?: MembershipTier;
    organization_id?: string;
    organization_ids?: string[];
    store_ids?: string[];
  } = {}): Promise<CustomerMembershipRow[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (filters.status) {
      clauses.push(`m.status = $${index}`);
      values.push(filters.status);
      index += 1;
    }
    if (filters.tier) {
      clauses.push(`m.tier_key = $${index}`);
      values.push(filters.tier);
      index += 1;
    }
    if (filters.organization_id) {
      clauses.push(`m.organization_id = $${index}`);
      values.push(filters.organization_id);
      index += 1;
    } else if (filters.organization_ids) {
      clauses.push(`m.organization_id = ANY($${index}::uuid[])`);
      values.push(filters.organization_ids);
      index += 1;
    }
    if (filters.store_ids) {
      clauses.push(`c.home_store_id = ANY($${index}::uuid[])`);
      values.push(filters.store_ids);
      index += 1;
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await getPool().query(
      `SELECT m.*
         FROM customer_memberships m
         JOIN customers c ON c.id = m.customer_id
         ${where}
        ORDER BY m.enrolled_at DESC, m.created_at DESC`,
      values,
    );
    return result.rows.map((row) => serializeMembership(row));
  }

  private async createMembership(
    customerId: string,
    options: {
      source: string;
      reason: string;
      requireFounding: boolean;
      actorId?: string;
      storeId?: string;
      profile?: EnrollmentProfile;
    },
  ): Promise<CustomerMembershipRow> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      const customer = await client.query(
        `SELECT c.id, c.phone_normalized, c.status, c.verification_status,
                c.home_store_id, s.organization_id
           FROM customers c
           LEFT JOIN stores s ON s.id = c.home_store_id
          WHERE c.id = $1
          FOR UPDATE OF c`,
        [customerId],
      );
      if (!customer.rowCount) {
        throw new MembershipServiceError(
          "CUSTOMER_NOT_FOUND",
          "Customer not found",
        );
      }

      const customerRow = customer.rows[0];
      if (customerRow.status !== "ACTIVE") {
        throw new MembershipServiceError(
          "CUSTOMER_INACTIVE",
          "Customer is not active",
        );
      }
      if (customerRow.verification_status !== "VERIFIED") {
        throw new MembershipServiceError(
          "OTP_REQUIRED",
          "OTP verification is required before enrollment",
        );
      }
      let normalizedPhone: string;
      try {
        normalizedPhone =
          typeof customerRow.phone_normalized === "string"
            ? normalizePhone(customerRow.phone_normalized)
            : "";
      } catch {
        normalizedPhone = "";
      }
      if (
        !normalizedPhone ||
        normalizedPhone !== customerRow.phone_normalized
      ) {
        throw new MembershipServiceError(
          "CUSTOMER_IDENTITY_INVALID",
          "Customer phone identity is not normalized",
        );
      }
      if (!customerRow.home_store_id && !options.storeId && options.source === "CUSTOMER_SELF_SERVICE" && process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID) {
        const configuredId = process.env.PRELAUNCH_MEMBERSHIP_ORGANIZATION_ID;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredId)) {
          throw new MembershipServiceError("ORGANIZATION_REQUIRED", "Pre-launch membership is unavailable");
        }
        const organization = await client.query(
          "SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE' AND country_code = 'NP' FOR SHARE",
          [configuredId],
        );
        if (!organization.rowCount) {
          throw new MembershipServiceError("ORGANIZATION_REQUIRED", "Pre-launch membership is unavailable");
        }
        customerRow.organization_id = organization.rows[0].id;
      } else if (!customerRow.home_store_id) {
        if (!options.storeId) {
          throw new MembershipServiceError(
            "STORE_REQUIRED",
            "Choose a home store before joining the membership program",
          );
        }
        const selectedStore = await client.query(
          `SELECT id, organization_id
             FROM stores
            WHERE id = $1
              AND status = 'PUBLISHED'
              AND organization_id IS NOT NULL`,
          [options.storeId],
        );
        if (!selectedStore.rowCount) {
          throw new MembershipServiceError(
            "STORE_REQUIRED",
            "Choose an available store before joining the membership program",
          );
        }
        await client.query(
          `UPDATE customers
              SET home_store_id = $2, updated_at = NOW()
            WHERE id = $1`,
          [customerId, selectedStore.rows[0].id],
        );
        customerRow.home_store_id = selectedStore.rows[0].id;
        customerRow.organization_id = selectedStore.rows[0].organization_id;
      }
      if (!customerRow.organization_id) {
        throw new MembershipServiceError(
          "ORGANIZATION_REQUIRED",
          "Customer home store must belong to an organization",
        );
      }

      const organizationId = String(customerRow.organization_id);
      const existing = await client.query(
        `SELECT *
           FROM customer_memberships
          WHERE customer_id = $1 AND organization_id = $2
          FOR UPDATE`,
        [customerId, organizationId],
      );
      if (existing.rowCount) {
        const membership = serializeMembership(existing.rows[0]);
        if (
          options.requireFounding &&
          membership.tier_key !== "FOUNDING_1000"
        ) {
          throw new MembershipServiceError(
            "MEMBERSHIP_ALREADY_EXISTS",
            "Customer already has a non-founding membership",
          );
        }
        await client.query("COMMIT");
        return membership;
      }

      if (options.profile) {
        await client.query("UPDATE customers SET preferred_name = $2, updated_at = NOW() WHERE id = $1", [customerId, options.profile.name]);
      }
      const campaign = await client.query(
        `SELECT capacity, allocated_count, active
           FROM membership_campaign_state
          WHERE campaign_key = 'FOUNDING_1000'
          FOR UPDATE`,
      );
      const campaignRow = campaign.rows[0];
      const hasFoundingSlot =
        campaign.rowCount === 1 &&
        campaignRow.active === true &&
        Number(campaignRow.allocated_count) <
          Math.min(Number(campaignRow.capacity), 1000);
      if (options.requireFounding && !hasFoundingSlot) {
        throw new MembershipServiceError(
          campaign.rowCount && !campaignRow.active
            ? "CAMPAIGN_CLOSED"
            : "CAMPAIGN_FULL",
          campaign.rowCount && !campaignRow.active
            ? "Founding campaign is closed"
            : "Founding membership capacity is full",
        );
      }

      await client.query(
        `INSERT INTO membership_organization_sequences (organization_id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (organization_id) DO NOTHING`,
        [organizationId],
      );
      const sequenceResult = await client.query(
        `SELECT next_number
           FROM membership_organization_sequences
          WHERE organization_id = $1
          FOR UPDATE`,
        [organizationId],
      );
      const membershipNumber = Number(sequenceResult.rows[0].next_number);
      const tier: MembershipTier = hasFoundingSlot
        ? "FOUNDING_1000"
        : "REGISTERED_MEMBER";
      const foundingNumber = hasFoundingSlot
        ? Number(campaignRow.allocated_count) + 1
        : null;
      const reason = options.reason;

      const inserted = await client.query(
        `INSERT INTO customer_memberships (
            customer_id,
            organization_id,
            tier_key,
            membership_number,
            founding_number,
            status,
            status_reason,
            enrolled_at,
            last_status_changed_at
          ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW(), NOW())
          RETURNING *`,
        [
          customerId,
          organizationId,
          tier,
          membershipNumber,
          foundingNumber,
          reason,
        ],
      );

      await client.query(
        `UPDATE membership_organization_sequences
            SET next_number = $2
          WHERE organization_id = $1`,
        [organizationId, membershipNumber + 1],
      );

      if (foundingNumber !== null) {
        await client.query(
          `UPDATE membership_campaign_state
              SET allocated_count = $1,
                  updated_at = NOW()
            WHERE campaign_key = 'FOUNDING_1000'`,
          [foundingNumber],
        );
        await client.query(
          `INSERT INTO membership_campaign_allocations (
              campaign_key,
              membership_id,
              customer_id,
              organization_id,
              membership_number
            ) VALUES ('FOUNDING_1000', $1, $2, $3, $4)`,
          [inserted.rows[0].id, customerId, organizationId, foundingNumber],
        );
      }

      await client.query(
        `INSERT INTO membership_status_history (
            membership_id,
            from_status,
            to_status,
            changed_by,
            reason,
            metadata
          ) VALUES ($1, NULL, 'ACTIVE', $2, $3, $4)`,
        [
          inserted.rows[0].id,
          options.actorId ?? customerId,
          reason,
          JSON.stringify({
            source: options.source,
            ...(options.profile ? { enrollment_profile: { ward: options.profile.ward, language: options.profile.language }, membership_consent: { accepted: true, policy_version: options.profile.policy_version, accepted_at: new Date().toISOString() } } : {}),
            ...(foundingNumber === null ? {} : { founding_number: foundingNumber }),
          }),
        ],
      );

      await client.query("COMMIT");
      return serializeMembership(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new MembershipServiceError(
          "MEMBERSHIP_CONFLICT",
          "Membership could not be allocated because an identity or sequence already exists",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async enrollCustomer(
    customerId: string,
    input: { source?: string; reason?: string; storeId?: string; profile?: EnrollmentProfile } = {},
  ): Promise<CustomerMembershipRow> {
    return this.createMembership(customerId, {
      source: input.source ?? "CUSTOMER_SELF_SERVICE",
      reason: input.reason ?? "Customer requested free registration",
      requireFounding: false,
      storeId: input.storeId,
      profile: input.profile,
    });
  }

  async grantFoundingMembership(
    customerId: string,
    actorId?: string,
    reason = "Founding 1000 allocation",
  ): Promise<CustomerMembershipRow> {
    return this.createMembership(customerId, {
      source: "SYSTEM_FOUNDING_ALLOCATION",
      reason,
      requireFounding: true,
      actorId,
    });
  }

  async updateMembershipStatus(
    membershipId: string,
    status: MembershipStatus,
    actorId: string,
    reason: string,
    auditContext: MembershipAuditContext,
    organizationIds?: string[],
    storeIds?: string[],
  ): Promise<CustomerMembershipRow> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT m.*
           FROM customer_memberships m
           JOIN customers c ON c.id = m.customer_id
          WHERE m.id = $1
            AND ($2::uuid[] IS NULL OR m.organization_id = ANY($2::uuid[]))
            AND ($3::uuid[] IS NULL OR c.home_store_id = ANY($3::uuid[]))
          FOR UPDATE OF m, c`,
        [membershipId, organizationIds ?? null, storeIds ?? null],
      );
      if (!current.rowCount) {
        throw new MembershipServiceError(
          "MEMBERSHIP_NOT_FOUND",
          "Membership not found",
        );
      }

      const row = current.rows[0];
      const previous = String(row.status) as MembershipStatus;
      if (
        previous === "CANCELLED" &&
        status !== "CANCELLED"
      ) {
        throw new MembershipServiceError(
          "INVALID_STATUS_TRANSITION",
          "Cancelled memberships cannot be reactivated",
        );
      }
      if (previous === status && row.status_reason === reason) {
        await client.query("COMMIT");
        return serializeMembership(row);
      }

      const updated = await client.query(
        `UPDATE customer_memberships
            SET status = $1::varchar,
                status_reason = $2,
                last_status_changed_at = NOW(),
                suspended_at = CASE
                  WHEN $1::varchar = 'SUSPENDED' THEN NOW()
                  WHEN $1::varchar = 'ACTIVE' THEN NULL
                  ELSE suspended_at
                END,
                cancelled_at = CASE
                  WHEN $1::varchar = 'CANCELLED' THEN NOW()
                  ELSE cancelled_at
                END,
                updated_at = NOW()
          WHERE id = $3
          RETURNING *`,
        [status, reason, membershipId],
      );

      await client.query(
        `INSERT INTO membership_status_history (
            membership_id,
            from_status,
            to_status,
            changed_by,
            reason,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          membershipId,
          previous,
          status,
          actorId,
          reason,
          JSON.stringify({ actor_id: actorId }),
        ],
      );

      await client.query(
        `INSERT INTO audit_events (
            event_type,
            entity_type,
            entity_id,
            actor_id,
            actor_role,
            actor_capabilities,
            actor_scope_type,
            actor_scope_store_ids,
            changes,
            ip_address,
            user_agent,
            correlation_id,
            feature_flags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          "MEMBERSHIP_STATUS_CHANGED",
          "customer_membership",
          membershipId,
          actorId,
          auditContext.actorRole,
          JSON.stringify(auditContext.actorCapabilities),
          auditContext.actorScopeType,
          auditContext.actorScopeStoreIds,
          JSON.stringify({
            before: { status: previous },
            after: { status, reason },
          }),
          auditContext.ipAddress ?? null,
          auditContext.userAgent ?? null,
          auditContext.correlationId ?? `membership:${membershipId}`,
          JSON.stringify({ membership: true }),
        ],
      );

      await client.query("COMMIT");
      return serializeMembership(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
