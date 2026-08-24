import { query } from "../../database/connection.js";
import { LoyaltyMvpService } from "../loyaltyMvpService.js";

const ORG = "22000000-0000-4000-8000-000000000001";
const STORE = "22000000-0000-4000-8000-000000000002";
const CUSTOMER = "22000000-0000-4000-8000-000000000003";
const PROGRAM = "22000000-0000-4000-8000-000000000004";
const SALE = "22000000-0000-4000-8000-000000000005";
const ORDER = "22000000-0000-4000-8000-000000000006";

describe("Nepal loyalty MVP lifecycle", () => {
  const service = new LoyaltyMvpService();

  beforeAll(async () => {
    await query(
      `INSERT INTO organizations(id, organization_name, country_code, default_currency_code, default_locale, default_timezone, tax_regime)
      VALUES ($1,'Loyalty Test Nepal','NP','NPR','en-NP','Asia/Kathmandu','VAT') ON CONFLICT (id) DO NOTHING`,
      [ORG],
    );
    await query(
      `INSERT INTO stores(id,name_en,address_en,phone,status,organization_id,country_code,currency_code,locale,timezone)
      VALUES ($1,'Loyalty Test Store','Kathmandu','9800000000','PUBLISHED',$2,'NP','NPR','en-NP','Asia/Kathmandu') ON CONFLICT (id) DO NOTHING`,
      [STORE, ORG],
    );
    await query(
      `INSERT INTO customers(id,phone_normalized,phone_hash,phone_masked,home_store_id,status,verification_status)
      VALUES ($1,'9800000022','loyalty-mvp-hash','98XXXXXX22',$2,'ACTIVE','VERIFIED') ON CONFLICT (id) DO UPDATE SET home_store_id=$2, verification_status='VERIFIED'`,
      [CUSTOMER, STORE],
    );
    await query(
      `INSERT INTO loyalty_programs(id,program_id,organization_id,store_id,name,is_active,enable_tiers,earn_npr_per_point,redemption_min_points,redemption_max_points,rule_version)
      VALUES ($1,'LOYALTY-MVP-TEST',$2,$3,'Test Nepal Rewards',true,false,100,10,5000,1)
      ON CONFLICT (program_id) DO UPDATE SET organization_id=$2, store_id=$3, is_active=true`,
      [PROGRAM, ORG, STORE],
    );
  });

  beforeEach(async () => {
    await query(`DELETE FROM loyalty_ledger WHERE customer_id=$1`, [CUSTOMER]);
    await query(`DELETE FROM customer_loyalty_accounts WHERE customer_id=$1`, [
      CUSTOMER,
    ]);
    await query(`DELETE FROM sales WHERE id=$1`, [SALE]);
    await query(`DELETE FROM web_orders WHERE id=$1`, [ORDER]);
  });

  it("enrolls once and exposes only the authenticated customer's DTO", async () => {
    const first = await service.enroll(CUSTOMER);
    const second = await service.enroll(CUSTOMER);
    expect(first).toMatchObject({
      enrolled: true,
      market: "NP",
      currency: "NPR",
    });
    expect(second).toMatchObject({ enrolled: true });
    const count = await query(
      `SELECT COUNT(*)::int count FROM customer_loyalty_accounts WHERE customer_id=$1 AND program_id=$2`,
      [CUSTOMER, PROGRAM],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("earns from the authoritative completed POS total exactly once and reverses on void", async () => {
    await service.enroll(CUSTOMER);
    await query(
      `INSERT INTO sales(id,sale_number,customer_id,store_id,sale_status,total_amount,currency,created_by)
      VALUES ($1,'LOYALTY-MVP-SALE',$2,$3,'DRAFT',1250,'NPR','test')`,
      [SALE, CUSTOMER, STORE],
    );
    await query(
      `UPDATE sales SET sale_status='COMPLETED', updated_by='test-cashier' WHERE id=$1`,
      [SALE],
    );
    await query(
      `UPDATE sales SET sale_status='COMPLETED', updated_by='replay' WHERE id=$1`,
      [SALE],
    );
    let summary: any = await service.getCustomerSummary(CUSTOMER);
    expect(summary.account.current_points).toBe(12);
    expect(summary.history).toHaveLength(1);
    expect(summary.history[0]).toMatchObject({
      points_signed: 12,
      source_type: "POS_SALE",
      rule_version: 1,
    });
    await query(
      `UPDATE sales SET sale_status='VOIDED', updated_by='test-manager', void_reason='Test void' WHERE id=$1`,
      [SALE],
    );
    summary = await service.getCustomerSummary(CUSTOMER);
    expect(summary.account.current_points).toBe(0);
    expect(
      summary.history.map((entry: any) => entry.points_signed).sort(),
    ).toEqual([-12, 12]);
  });

  it("reports a clean reconciliation for a consistent account ledger", async () => {
    await service.enroll(CUSTOMER);
    await expect(service.reconcile()).resolves.toMatchObject({
      negative_accounts: 0,
      balance_mismatches: 0,
      duplicate_keys: 0,
    });
  });

  it("earns only when a COD order is delivered and compensates a cancellation", async () => {
    await service.enroll(CUSTOMER);
    await query(
      `INSERT INTO web_orders(id,order_number,customer_id,store_id,status,subtotal,total_amount,currency,payment_method)
      VALUES ($1,'LOYALTY-MVP-COD',$2,$3,'CONFIRMED',2099,2099,'NPR','COD')`,
      [ORDER, CUSTOMER, STORE],
    );
    expect(
      ((await service.getCustomerSummary(CUSTOMER)) as any).account
        .current_points,
    ).toBe(0);
    await query(`UPDATE web_orders SET status='DELIVERED' WHERE id=$1`, [
      ORDER,
    ]);
    expect(
      ((await service.getCustomerSummary(CUSTOMER)) as any).account
        .current_points,
    ).toBe(20);
    await query(`UPDATE web_orders SET status='CANCELLED' WHERE id=$1`, [
      ORDER,
    ]);
    const summary: any = await service.getCustomerSummary(CUSTOMER);
    expect(summary.account.current_points).toBe(0);
    expect(
      summary.history.map((entry: any) => entry.source_type).sort(),
    ).toEqual(["CANCELLED", "COD_ORDER"]);
  });
});
