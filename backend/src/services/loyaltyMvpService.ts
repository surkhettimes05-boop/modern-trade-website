import { getPool } from "../database/connection.js";

type StaffActor = {
  id: string;
  roleKey?: string;
  capabilities?: string[];
  scopeType?: string;
  scopeOrganizationId?: string;
  scopeStoreIds?: string[];
  storeId?: string;
};

export class LoyaltyMvpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class LoyaltyMvpService {
  async enroll(customerId: string) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const customer = await client.query(
        `SELECT id, home_store_id, verification_status, status FROM customers WHERE id = $1 FOR UPDATE`,
        [customerId],
      );
      if (!customer.rowCount || customer.rows[0].status !== "ACTIVE")
        throw new LoyaltyMvpError(
          "CUSTOMER_NOT_FOUND",
          "Active customer not found",
        );
      if (customer.rows[0].verification_status !== "VERIFIED")
        throw new LoyaltyMvpError(
          "OTP_REQUIRED",
          "OTP verification is required before enrollment",
        );
      if (!customer.rows[0].home_store_id)
        throw new LoyaltyMvpError(
          "STORE_REQUIRED",
          "Choose a Nepal home store before enrollment",
        );
      const result = await client.query(
        `SELECT (loyalty_mvp_account($1, $2)).*`,
        [customerId, customer.rows[0].home_store_id],
      );
      if (!result.rows[0]?.id)
        throw new LoyaltyMvpError(
          "PROGRAM_UNAVAILABLE",
          "No active Nepal loyalty program is available",
        );
      await client.query("COMMIT");
      return this.getCustomerSummary(customerId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCustomerSummary(customerId: string, limit = 50) {
    const account = await getPool().query(
      `SELECT a.id, a.account_id, a.current_points, a.earned_points, a.redeemed_points,
              a.status, a.enrolled_at, a.last_activity_at,
              p.name AS program_name, p.description, p.earn_npr_per_point,
              p.redemption_min_points, p.redemption_max_points, p.rule_version
       FROM customer_loyalty_accounts a
       JOIN loyalty_programs p ON p.id = a.program_id
       WHERE a.customer_id = $1 AND a.status = 'ACTIVE' AND p.is_active
       ORDER BY a.enrolled_at DESC LIMIT 1`,
      [customerId],
    );
    if (!account.rowCount)
      return { enrolled: false, market: "NP", currency: "NPR" };
    const history = await getPool().query(
      `SELECT id, points_signed, entry_type, effective_timestamp, source_type, source_id,
              source_amount, currency, balance_after, reason, reversal_reason,
              rule_version, calculation_metadata
       FROM loyalty_ledger WHERE account_id = $1 AND entry_status = 'POSTED'
       ORDER BY effective_timestamp DESC, created_at DESC LIMIT $2`,
      [account.rows[0].id, limit],
    );
    return {
      enrolled: true,
      market: "NP",
      currency: "NPR",
      account: account.rows[0],
      history: history.rows,
      explanation: `Earn 1 point for every NPR ${account.rows[0].earn_npr_per_point} on completed POS or delivered COD purchases.`,
    };
  }

  private assertStaff(
    actor: StaffActor,
    capability: string,
    storeId: string,
    organizationId: string,
  ) {
    const privileged =
      actor.roleKey === "platform_admin" ||
      actor.capabilities?.includes("system.manage");
    if (!privileged && !actor.capabilities?.includes(capability))
      throw new LoyaltyMvpError(
        "CAPABILITY_DENIED",
        `Missing capability: ${capability}`,
      );
    if (privileged || actor.scopeType === "GLOBAL") return;
    if (
      actor.scopeOrganizationId &&
      actor.scopeOrganizationId !== organizationId
    )
      throw new LoyaltyMvpError(
        "SCOPE_DENIED",
        "Organization is outside staff scope",
      );
    const stores =
      actor.scopeStoreIds || (actor.storeId ? [actor.storeId] : []);
    if (
      ["STORE", "OWN_REGISTER"].includes(String(actor.scopeType)) &&
      !stores.includes(storeId)
    )
      throw new LoyaltyMvpError("SCOPE_DENIED", "Store is outside staff scope");
  }

  async redeemSale(
    saleId: string,
    requestedPoints: number,
    idempotencyKey: string,
    actor: StaffActor,
  ) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const saleResult = await client.query(
        `SELECT s.*, st.organization_id FROM sales s JOIN stores st ON st.id = s.store_id WHERE s.id = $1 FOR UPDATE OF s`,
        [saleId],
      );
      if (!saleResult.rowCount)
        throw new LoyaltyMvpError("SALE_NOT_FOUND", "Sale not found");
      const sale = saleResult.rows[0];
      this.assertStaff(
        actor,
        "loyalty.redeem",
        sale.store_id,
        sale.organization_id,
      );
      if (sale.sale_status !== "COMPLETED" || !sale.customer_id)
        throw new LoyaltyMvpError(
          "SALE_INELIGIBLE",
          "Only a completed customer sale can redeem points",
        );
      const prior = await client.query(
        `SELECT * FROM loyalty_ledger WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      if (prior.rowCount) {
        await client.query("COMMIT");
        return prior.rows[0];
      }
      const accountResult = await client.query(
        `SELECT a.*, p.redemption_min_points, p.redemption_max_points, p.rule_version
         FROM customer_loyalty_accounts a JOIN loyalty_programs p ON p.id = a.program_id
         WHERE a.customer_id = $1 AND a.organization_id = $2 AND a.status = 'ACTIVE' AND p.is_active
         FOR UPDATE OF a`,
        [sale.customer_id, sale.organization_id],
      );
      if (!accountResult.rowCount)
        throw new LoyaltyMvpError(
          "ACCOUNT_NOT_FOUND",
          "Customer is not enrolled",
        );
      const account = accountResult.rows[0];
      const points = Math.trunc(requestedPoints);
      if (
        points < account.redemption_min_points ||
        points > account.redemption_max_points
      )
        throw new LoyaltyMvpError(
          "REDEMPTION_LIMIT",
          `Redemption must be ${account.redemption_min_points}-${account.redemption_max_points} points`,
        );
      if (points > account.current_points)
        throw new LoyaltyMvpError("INSUFFICIENT_POINTS", "Insufficient points");
      if (points > Number(sale.total_amount))
        throw new LoyaltyMvpError(
          "SALE_LIMIT",
          "Points cannot exceed the authoritative sale total",
        );
      const entry = await client.query(
        `INSERT INTO loyalty_ledger(customer_id, account_id, program_id, organization_id, points_signed,
          entry_type, entry_status, effective_timestamp, source_type, source_id, location_id, rule_version,
          idempotency_key, actor, reason, source_amount, currency, balance_after, calculation_metadata)
         VALUES ($1,$2,$3,$4,$5,'REDEEM','POSTED',now(),'POS_SALE',$6,$7,$8,$9,$10,
          'Points redeemed against completed POS sale',$11,'NPR',$12,$13) RETURNING *`,
        [
          sale.customer_id,
          account.id,
          account.program_id,
          account.organization_id,
          -points,
          sale.id,
          sale.store_id,
          account.rule_version,
          idempotencyKey,
          actor.id,
          sale.total_amount,
          account.current_points - points,
          JSON.stringify({
            sale_number: sale.sale_number,
            requested_points: points,
            authoritative_sale_total: sale.total_amount,
          }),
        ],
      );
      await client.query(
        `UPDATE customer_loyalty_accounts SET current_points = current_points - $1,
         redeemed_points = redeemed_points + $1, last_activity_at = now() WHERE id = $2`,
        [points, account.id],
      );
      await client.query(
        `UPDATE sales SET points_redeemed = points_redeemed + $1 WHERE id = $2`,
        [points, sale.id],
      );
      await client.query(
        `INSERT INTO audit_events(event_type, entity_type, entity_id, actor_id, actor_role,
          actor_capabilities, actor_scope_type, actor_scope_store_ids, changes, correlation_id, feature_flags)
         VALUES ('LOYALTY_REDEEM','loyalty_ledger',$1,$2,$3,$4,$5,$6,$7,$8,'{"loyalty_mvp":true}')`,
        [
          entry.rows[0].id,
          actor.id,
          actor.roleKey,
          JSON.stringify(actor.capabilities || []),
          actor.scopeType,
          actor.scopeStoreIds || [],
          JSON.stringify({ sale_id: sale.id, points }),
          idempotencyKey,
        ],
      );
      await client.query("COMMIT");
      return entry.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcile() {
    const result = await getPool().query(
      `WITH sums AS (
         SELECT a.id, a.account_id, a.current_points, COALESCE(SUM(l.points_signed) FILTER (WHERE l.entry_status='POSTED'),0)::int ledger_points
         FROM customer_loyalty_accounts a LEFT JOIN loyalty_ledger l ON l.account_id=a.id GROUP BY a.id
       )
       SELECT
         COUNT(*) FILTER (WHERE current_points < 0)::int AS negative_accounts,
         COUNT(*) FILTER (WHERE current_points <> ledger_points)::int AS balance_mismatches,
         (SELECT COUNT(*)::int FROM loyalty_ledger WHERE account_id IS NULL AND entry_status='POSTED') AS orphan_entries,
         (SELECT COUNT(*)::int FROM (SELECT idempotency_key FROM loyalty_ledger WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*)>1) d) AS duplicate_keys,
         jsonb_agg(jsonb_build_object('account_id',account_id,'cached',current_points,'ledger',ledger_points))
           FILTER (WHERE current_points < 0 OR current_points <> ledger_points) AS exceptions
       FROM sums`,
    );
    return { reconciled_at: new Date().toISOString(), ...result.rows[0] };
  }
}

export const loyaltyMvpService = new LoyaltyMvpService();
